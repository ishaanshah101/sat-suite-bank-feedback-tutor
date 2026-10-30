// extension/src/image.ts
var MAX_LONG_EDGE = 1568;
var PNG_BUDGET_BYTES = 26e5;
async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 32768;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}
async function downscale(dataUrl, maxEdge = MAX_LONG_EDGE) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas not available");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    let out = await canvas.convertToBlob({ type: "image/png" });
    if (out.size > PNG_BUDGET_BYTES) out = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
    return blobToDataUrl(out);
  } finally {
    bitmap.close();
  }
}

// extension/src/addons/types.ts
function choicesOf(c) {
  return { A: c?.A ?? "", B: c?.B ?? "", C: c?.C ?? "", D: c?.D ?? "" };
}
var MATH_DOMAINS = ["Algebra", "Advanced Math", "Problem-Solving and Data Analysis", "Geometry and Trigonometry"];
var MATH_SKILLS = [
  "Linear equations in one variable",
  "Linear functions",
  "Linear equations in two variables",
  "Systems of two linear equations in two variables",
  "Linear inequalities in one or two variables",
  "Nonlinear functions",
  "Nonlinear equations in one variable and systems of equations in two variables",
  "Equivalent expressions",
  "Ratios, rates, proportional relationships, and units",
  "Percentages",
  "One-variable data: Distributions and measures of center and spread",
  "Two-variable data: Models and scatterplots",
  "Probability and conditional probability",
  "Inference from sample statistics and margin of error",
  "Evaluating statistical claims: Observational studies and experiments",
  "Area and volume",
  "Lines, angles, and triangles",
  "Right triangles and trigonometry",
  "Circles"
];
var fold = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
var MATH_NAMES = new Set([...MATH_DOMAINS, ...MATH_SKILLS].map(fold));

// extension/src/addons/store.ts
var chromeKV = {
  async get(key) {
    const out = await chrome.storage.local.get(key);
    return out[key];
  },
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
  async remove(key) {
    await chrome.storage.local.remove(key);
  }
};
function memoryKV(seed = {}) {
  const data = structuredClone(seed);
  return {
    async get(key) {
      return structuredClone(data[key]);
    },
    async set(key, value) {
      data[key] = structuredClone(value);
    },
    async remove(key) {
      delete data[key];
    },
    dump: () => structuredClone(data)
  };
}
var current = null;
function kv() {
  if (!current) current = typeof chrome !== "undefined" && chrome?.storage?.local ? chromeKV : memoryKV();
  return current;
}
var KEYS = {
  log: "rc.addons.log.v1",
  srs: "rc.addons.srs.v1",
  prefs: "rc.addons.prefs.v1",
  timer: "rc.addons.timer.v1",
  sets: "rc.addons.sets.v1",
  /** achievements.ts: { [badgeId]: earnedAt } */
  badges: "rc.addons.badges.v1"
};

// extension/src/addons/log.ts
var queue = Promise.resolve();
async function readLog() {
  const raw = await kv().get(KEYS.log);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e) => {
    const ok = sanitizeEntry(e);
    return ok ? [ok] : [];
  });
}
var isStrings = (x) => Array.isArray(x) && x.every((s) => typeof s === "string");
var isStr = (x) => typeof x === "string";
var isNum = (x) => typeof x === "number" && Number.isFinite(x);
var LETTER_SET = /* @__PURE__ */ new Set(["A", "B", "C", "D"]);
function sanitizeEntry(x) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const e = x;
  if (!isStr(e.attemptId) || !e.attemptId || !isNum(e.at) || !isStr(e.ruleId) || !isStr(e.stem)) return null;
  if (!isStr(e.correct) || !LETTER_SET.has(e.correct)) return null;
  if (e.picked !== "correct" && !(isStr(e.picked) && LETTER_SET.has(e.picked))) return null;
  if (e.result !== "right" && e.result !== "missed") return null;
  const drills = Array.isArray(e.drills) ? e.drills.filter((d) => !!d && typeof d === "object" && isNum(d.at) && typeof d.correct === "boolean") : [];
  const text = (v, fallback = "") => isStr(v) ? v : fallback;
  const entry = repairEntry({
    ...e,
    drills,
    ruleName: isStr(e.ruleName) ? e.ruleName : null,
    ruleStatement: text(e.ruleStatement),
    takeaway: text(e.takeaway),
    whyCorrect: text(e.whyCorrect),
    whyPickFails: isStr(e.whyPickFails) ? e.whyPickFails : null,
    confidence: isNum(e.confidence) ? e.confidence : 0,
    note: text(e.note)
  });
  if (!entry.diagnosis || !["misread", "rule_gap", "careless", "got_it_right", "unknown"].includes(entry.diagnosis)) entry.diagnosis = "unknown";
  return entry;
}
function repairEntry(e) {
  const out = {
    ...e,
    choices: choicesOf(e.choices && typeof e.choices === "object" ? e.choices : null),
    drills: Array.isArray(e.drills) ? e.drills : [],
    note: e.note ?? "",
    starred: Boolean(e.starred)
  };
  if (out.section !== void 0 && out.section !== null && out.section !== "rw" && out.section !== "math") delete out.section;
  if (out.format !== void 0 && out.format !== null && out.format !== "mcq" && out.format !== "spr") delete out.format;
  if (out.typed !== void 0 && out.typed !== null && typeof out.typed !== "string") delete out.typed;
  if (out.accepted !== void 0 && !isStrings(out.accepted)) delete out.accepted;
  if (out.steps !== void 0 && !isStrings(out.steps)) delete out.steps;
  return out;
}

// extension/src/addons/prefs.ts
var DEFAULT_PREFS = {
  timer: true,
  cropBeforeSend: false,
  pageCheck: true,
  hotkeys: true,
  reminders: false,
  reminderHour: 19,
  dailyGoal: 10,
  autoSpeak: false,
  textCapture: true,
  strategies: true,
  askConfidence: true,
  testDate: null,
  zoom: 1,
  seenBefore: true,
  pastePanel: true,
  practice: true,
  plan: true,
  badges: true,
  qbQuiz: true,
  skillMap: true,
  wordBank: true,
  activity: true
};
async function readPrefs() {
  return { ...DEFAULT_PREFS, ...await kv().get(KEYS.prefs) ?? {} };
}

// extension/src/addons/qbtext.ts
function loose(phrase) {
  return phrase.split("").map((c) => c === " " ? "\\s*" : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*").join("");
}
var RE_QID = new RegExp(`${loose("Question ID")}\\s*:?\\s*((?:[0-9a-fA-F] ?){7}[0-9a-fA-F])(?![0-9A-Za-z])`, "i");
var RE_QID_ANY = new RegExp(`${loose("Question ID")}\\s*:?\\s*([A-Za-z0-9-]{6,})`, "i");
var RE_CORRECT = new RegExp(`${loose("Correct Answer")}\\s*:?\\s*\\(?([A-D])\\)?(?![A-Za-z])`, "i");
var RE_RATIONALE = new RegExp(`^\\s*${loose("Rationale")}\\s*$`, "im");
var RE_STOP = new RegExp(`^(${loose("Correct Answer")}|${loose("Rationale")}|${loose("Question Difficulty")})`, "i");
var RE_ANSWER_LABEL = new RegExp(`^${loose("Answer")}$`, "i");
var RE_QUESTION_LABEL = new RegExp(`^${loose("Question")}$`, "i");
var QB_HOSTS = ["satsuitequestionbank.collegeboard.org", "satsuiteeducatorquestionbank.collegeboard.org"];

// extension/src/addons/selection-bg.ts
var SELECTION_MENU_ID = "rulecard-explain-selection";
var SELECTION_MENU_TITLE = "Explain this question with Rulecard";
var PENDING_SELECTION_KEY = "rc.addons.pendingSelection.v1";
var SELECTION_MAX_CHARS = 6e3;
var PAGE_READ_TIMEOUT_MS = 1500;
var squash = (s) => s.replace(/\s+/g, "");
function pickSelectionText(menuText, pageText) {
  const menu = (menuText ?? "").trim();
  const page = (pageText ?? "").trim();
  if (!page) return menu;
  if (!menu) return page;
  const a = squash(menu);
  const b = squash(page);
  const n = Math.min(a.length, b.length, 200);
  return a.slice(0, n) === b.slice(0, n) && b.length >= a.length * 0.9 ? page : menu;
}
function pendingFromClick(text, info, tab, now) {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  return {
    text: clean.length > SELECTION_MAX_CHARS ? clean.slice(0, SELECTION_MAX_CHARS) : clean,
    url: info.pageUrl || tab?.url || info.frameUrl || null,
    title: tab?.title?.trim() || null,
    at: now,
    windowId: typeof tab?.windowId === "number" && tab.windowId >= 0 ? tab.windowId : null
  };
}
function selectionInPage() {
  const text = getSelection()?.toString() ?? "";
  if (text.trim()) return text;
  const el = document.activeElement;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0);
  }
  return "";
}
async function readPageSelection(tabId, frameId) {
  if (typeof chrome.scripting?.executeScript !== "function") return "";
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), PAGE_READ_TIMEOUT_MS));
  try {
    const results = await Promise.race([
      chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId ?? 0] }, func: selectionInPage }),
      timeout
    ]);
    const value = results?.[0]?.result;
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}
async function saveSelection(info, tab, at) {
  const fromPage = tab?.id !== void 0 && tab.id >= 0 ? await readPageSelection(tab.id, info.frameId) : "";
  const pending = pendingFromClick(pickSelectionText(info.selectionText, fromPage), info, tab, at);
  await chrome.storage.session.set({ [PENDING_SELECTION_KEY]: pending }).catch(() => void 0);
}
function createSelectionMenu() {
  chrome.contextMenus.remove(SELECTION_MENU_ID, () => {
    void chrome.runtime.lastError;
    chrome.contextMenus.create(
      { id: SELECTION_MENU_ID, title: SELECTION_MENU_TITLE, contexts: ["selection"] },
      () => void chrome.runtime.lastError
    );
  });
}
function installSelectionCapture() {
  chrome.runtime.onInstalled.addListener(() => createSelectionMenu());
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== SELECTION_MENU_ID) return;
    const at = Date.now();
    if (tab && tab.windowId >= 0) void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => void 0);
    void saveSelection(info, tab, at);
  });
}

// extension/src/addons/srs.ts
var INTERVAL_DAYS = [0, 1, 2, 4, 8, 16, 32];
var MAX_BOX = INTERVAL_DAYS.length - 1;
function dueRules(state, now) {
  return Object.values(state).filter((r) => r.due <= now).sort((a, b) => a.due - b.due || b.lapses - a.lapses || a.box - b.box);
}
async function readSrs() {
  return await kv().get(KEYS.srs) ?? {};
}

// extension/src/addons/stats.ts
function dayKey(ts) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// extension/src/addons/background.ts
var MENU_ID = "rulecard-capture";
var BADGE_ALARM = "rulecard-badge";
var REMINDER_ALARM = "rulecard-reminder";
var QB_URL = "https://satsuitequestionbank.collegeboard.org/digital/search";
async function refreshBadge() {
  const due = dueRules(await readSrs(), Date.now()).length;
  await chrome.action.setBadgeBackgroundColor({ color: "#2f5bea" });
  await chrome.action.setBadgeText({ text: due ? String(Math.min(due, 99)) : "" });
  await chrome.action.setTitle({ title: due ? `Rulecard \xB7 ${due} rule${due === 1 ? "" : "s"} due for review` : "Open Rulecard" });
}
function nextAt(hour, now = Date.now()) {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}
async function scheduleReminder() {
  const prefs = await readPrefs();
  await chrome.alarms.clear(REMINDER_ALARM);
  if (prefs.reminders) chrome.alarms.create(REMINDER_ALARM, { when: nextAt(prefs.reminderHour), periodInMinutes: 24 * 60 });
}
async function maybeRemind() {
  const prefs = await readPrefs();
  if (!prefs.reminders || !chrome.notifications) return;
  const today = dayKey(Date.now());
  const log = await readLog();
  const doneToday = log.filter((e) => dayKey(e.at) === today).length;
  const due = dueRules(await readSrs(), Date.now()).length;
  if (doneToday >= prefs.dailyGoal) return;
  const message = due > 0 ? `${due} rule${due === 1 ? "" : "s"} due for review, plus ${Math.max(0, prefs.dailyGoal - doneToday)} questions to hit today's goal.` : doneToday === 0 ? "You haven't practiced today. Even 3 questions keeps the streak alive." : `${prefs.dailyGoal - doneToday} more to hit today's goal.`;
  chrome.notifications.create(REMINDER_ALARM, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: "Rulecard",
    message,
    priority: 0
  });
}
function installBackgroundAddons(host) {
  chrome.runtime.onInstalled.addListener((details) => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: MENU_ID,
        title: "Capture this question with Rulecard",
        contexts: ["page", "selection", "image", "frame"],
        documentUrlPatterns: QB_HOSTS.map((host2) => `https://${host2}/*`)
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
  installSelectionCapture();
}

// extension/src/background.ts
var openOnClick = () => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => void 0);
};
chrome.runtime.onInstalled.addListener(openOnClick);
chrome.runtime.onStartup.addListener(openOnClick);
function captureTab(tab) {
  const windowId = tab.windowId;
  if (windowId === void 0) return;
  void chrome.sidePanel.open({ windowId }).catch(() => void 0);
  void (async () => {
    let pending;
    try {
      const raw = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
      pending = { image: await downscale(raw), at: Date.now(), tabTitle: tab.title ?? null };
    } catch (error) {
      pending = { error: error instanceof Error ? error.message : String(error), at: Date.now() };
    }
    await chrome.storage.session.set({ pendingCapture: pending });
  })();
}
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "capture" || !tab) return;
  captureTab(tab);
});
installBackgroundAddons({ captureTab });
