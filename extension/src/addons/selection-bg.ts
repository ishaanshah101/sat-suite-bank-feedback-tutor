// "Explain this question with Rulecard": a right-click item for selected text on any site
// (Khan Academy, PDFs open in Chrome, practice sites, anywhere). This is the service-worker half;
// selection.ts is the side-panel half.
//
// Flow: the click opens the side panel straight away. chrome.sidePanel.open() only works inside
// the click's user gesture, so nothing is awaited before it. Then we save
// { text, url, title, at, windowId } to chrome.storage.session under PENDING_SELECTION_KEY, and
// the panel picks it up with consumePendingSelection() / watchSelections() (selection.ts).
//
// Hook in: call installSelectionCapture() once, at the top level of extension/src/background.ts,
// next to installBackgroundAddons(...). It registers its own onInstalled and onClicked listeners
// and ignores clicks on other menu items.
// Permissions: "contextMenus" (the background add-on already needs it) and "sidePanel".
// "scripting" is optional but recommended (qbtext.ts already asks for it): with it we re-read the
// selection from the page so line breaks survive, because Chrome's selectionText turns them into
// spaces. The menu click grants activeTab, so no new host permissions are needed. Chrome's PDF
// viewer can't be scripted, so PDFs keep selectionText and selection.ts rebuilds the choice lines.

export const SELECTION_MENU_ID = "rulecard-explain-selection";
export const SELECTION_MENU_TITLE = "Explain this question with Rulecard";
/** chrome.storage.session key shared with selection.ts. */
export const PENDING_SELECTION_KEY = "rc.addons.pendingSelection.v1";
/** Longer selections are cut here. A whole web page is not a question. */
export const SELECTION_MAX_CHARS = 6000;
const PAGE_READ_TIMEOUT_MS = 1500;

export interface PendingSelection {
  text: string;
  /** Page the text was selected on (the PDF's own URL for PDFs). */
  url: string | null;
  title: string | null;
  at: number;
  /** Window whose side panel should take it, so a panel open in another window ignores it. */
  windowId?: number | null;
}

const squash = (s: string) => s.replace(/\s+/g, "");

/**
 * Chrome's menu selectionText loses line breaks. The page's own getSelection() keeps them, so we
 * use it when it is the same selection (same characters once whitespace is ignored).
 */
export function pickSelectionText(menuText: string | null | undefined, pageText: string | null | undefined): string {
  const menu = (menuText ?? "").trim();
  const page = (pageText ?? "").trim();
  if (!page) return menu;
  if (!menu) return page;
  const a = squash(menu);
  const b = squash(page);
  const n = Math.min(a.length, b.length, 200);
  return a.slice(0, n) === b.slice(0, n) && b.length >= a.length * 0.9 ? page : menu;
}

/** The value written to chrome.storage.session for one menu click. */
export function pendingFromClick(
  text: string,
  info: { pageUrl?: string; frameUrl?: string },
  tab: { url?: string; title?: string; windowId?: number } | undefined,
  now: number,
): PendingSelection {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  return {
    text: clean.length > SELECTION_MAX_CHARS ? clean.slice(0, SELECTION_MAX_CHARS) : clean,
    url: info.pageUrl || tab?.url || info.frameUrl || null,
    title: tab?.title?.trim() || null,
    at: now,
    windowId: typeof tab?.windowId === "number" && tab.windowId >= 0 ? tab.windowId : null,
  };
}

/** Runs inside the page (serialized by chrome.scripting), so it must not use anything from this module. */
function selectionInPage(): string {
  const text = getSelection()?.toString() ?? "";
  if (text.trim()) return text;
  // Text selected inside a text box is not part of getSelection().
  const el = document.activeElement;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0);
  }
  return "";
}

async function readPageSelection(tabId: number, frameId: number | undefined): Promise<string> {
  if (typeof chrome.scripting?.executeScript !== "function") return "";
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), PAGE_READ_TIMEOUT_MS));
  try {
    const results = await Promise.race([
      chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId ?? 0] }, func: selectionInPage }),
      timeout,
    ]);
    const value: unknown = results?.[0]?.result;
    return typeof value === "string" ? value : "";
  } catch {
    return ""; // Chrome's PDF viewer, chrome:// pages, the Web Store, or no "scripting" permission
  }
}

async function saveSelection(info: chrome.contextMenus.OnClickData, tab: chrome.tabs.Tab | undefined, at: number): Promise<void> {
  const fromPage = tab?.id !== undefined && tab.id >= 0 ? await readPageSelection(tab.id, info.frameId) : "";
  const pending = pendingFromClick(pickSelectionText(info.selectionText, fromPage), info, tab, at);
  await chrome.storage.session.set({ [PENDING_SELECTION_KEY]: pending }).catch(() => undefined);
}

/**
 * (Re)create the menu item. Safe to call more than once. The create runs in a callback, so it
 * always lands after a contextMenus.removeAll() made by another onInstalled listener
 * (background.ts does one), whichever listener was registered first.
 */
export function createSelectionMenu(): void {
  chrome.contextMenus.remove(SELECTION_MENU_ID, () => {
    void chrome.runtime.lastError; // it didn't exist yet: fine
    chrome.contextMenus.create(
      { id: SELECTION_MENU_ID, title: SELECTION_MENU_TITLE, contexts: ["selection"] },
      () => void chrome.runtime.lastError,
    );
  });
}

export function installSelectionCapture(): void {
  chrome.runtime.onInstalled.addListener(() => createSelectionMenu());
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== SELECTION_MENU_ID) return;
    const at = Date.now();
    // First, and with no await before it: sidePanel.open() needs the click's user gesture.
    if (tab && tab.windowId >= 0) void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);
    void saveSelection(info, tab, at);
  });
}
