// Service-worker add-ons. Call installBackgroundAddons(...) from extension/src/background.ts.
//
//  • Right-click "Capture this question with Rulecard" on Question Bank pages. A context-menu
//    click grants activeTab, so this also fixes the "click the toolbar icon first" friction.
//  • Toolbar badge with the number of rules due for review (alarms, every 30 min + on change).
//  • Optional daily reminder notification (only if the user turned it on in settings).
//  • Welcome/onboarding tab on first install.
//  • Right-click "Explain this question with Rulecard" on selected text on any site (selection-bg.ts).

import { readLog } from "./log";
import { readPrefs } from "./prefs";
import { QB_HOSTS } from "./qbtext";
import { installSelectionCapture } from "./selection-bg";
import { dueRules, readSrs } from "./srs";
import { dayKey } from "./stats";
import { KEYS } from "./store";

const MENU_ID = "rulecard-capture";
const BADGE_ALARM = "rulecard-badge";
const REMINDER_ALARM = "rulecard-reminder";
const QB_URL = "https://satsuitequestionbank.collegeboard.org/digital/search";

export interface BackgroundHost {
  /**
   * The body of the existing chrome.commands "capture" handler in background.ts, pulled
   * out into a function: open the side panel, captureVisibleTab, downscale, write
   * pendingCapture to chrome.storage.session.
   */
  captureTab(tab: chrome.tabs.Tab): void;
}

export async function refreshBadge(): Promise<void> {
  const due = dueRules(await readSrs(), Date.now()).length;
  await chrome.action.setBadgeBackgroundColor({ color: "#2f5bea" });
  await chrome.action.setBadgeText({ text: due ? String(Math.min(due, 99)) : "" });
  await chrome.action.setTitle({ title: due ? `Rulecard · ${due} rule${due === 1 ? "" : "s"} due for review` : "Open Rulecard" });
}

/** Next time the clock hits `hour`:00 local time. */
export function nextAt(hour: number, now = Date.now()): number {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

async function scheduleReminder(): Promise<void> {
  const prefs = await readPrefs();
  await chrome.alarms.clear(REMINDER_ALARM);
  if (prefs.reminders) chrome.alarms.create(REMINDER_ALARM, { when: nextAt(prefs.reminderHour), periodInMinutes: 24 * 60 });
}

async function maybeRemind(): Promise<void> {
  const prefs = await readPrefs();
  if (!prefs.reminders || !chrome.notifications) return;
  const today = dayKey(Date.now());
  const log = await readLog();
  const doneToday = log.filter((e) => dayKey(e.at) === today).length;
  const due = dueRules(await readSrs(), Date.now()).length;
  if (doneToday >= prefs.dailyGoal) return;
  const message =
    due > 0
      ? `${due} rule${due === 1 ? "" : "s"} due for review, plus ${Math.max(0, prefs.dailyGoal - doneToday)} questions to hit today's goal.`
      : doneToday === 0
        ? "You haven't practiced today. Even 3 questions keeps the streak alive."
        : `${prefs.dailyGoal - doneToday} more to hit today's goal.`;
  chrome.notifications.create(REMINDER_ALARM, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: "Rulecard",
    message,
    priority: 0,
  });
}

export function installBackgroundAddons(host: BackgroundHost): void {
  chrome.runtime.onInstalled.addListener((details) => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: MENU_ID,
        title: "Capture this question with Rulecard",
        contexts: ["page", "selection", "image", "frame"],
        documentUrlPatterns: QB_HOSTS.map((host) => `https://${host}/*`),
      });
    });
    chrome.alarms.create(BADGE_ALARM, { periodInMinutes: 30 });
    void refreshBadge();
    void scheduleReminder();
    if (details.reason === "install") void chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  });

  chrome.runtime.onStartup.addListener(() => {
    void refreshBadge();
    void scheduleReminder();
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_ID && tab) host.captureTab(tab);
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === BADGE_ALARM) void refreshBadge();
    if (alarm.name === REMINDER_ALARM) void maybeRemind();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[KEYS.srs]) void refreshBadge();
    if (changes[KEYS.prefs]) void scheduleReminder();
  });

  // "notifications" is optional: chrome.notifications only exists once it's granted.
  let clickHooked = false;
  const hookNotificationClick = () => {
    if (clickHooked || !chrome.notifications) return;
    clickHooked = true;
    chrome.notifications.onClicked.addListener((id) => {
      if (id !== REMINDER_ALARM) return;
      chrome.notifications.clear(id);
      void chrome.tabs.create({ url: QB_URL });
    });
  };
  hookNotificationClick();
  chrome.permissions.onAdded.addListener(() => hookNotificationClick());

  // Registered after the onInstalled above, so its menu item lands after our removeAll().
  installSelectionCapture();
}
