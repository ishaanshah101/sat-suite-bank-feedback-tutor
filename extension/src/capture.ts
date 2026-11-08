// "Capture this tab": a screenshot of the tab the student is looking at (a Question Bank PDF, a
// practice-test review page, anything with the question on screen).
//
// Chrome lets an extension screenshot a tab when it has activeTab for that tab (granted by clicking the
// Rulecard toolbar icon or pressing its shortcut there) or the optional "all sites" grant. A file on the
// computer also needs "Allow access to file URLs", and a PDF shown by another extension's viewer needs
// activeTab. When the screenshot is refused, CaptureBlocked says which of these to do.

/** What the student can do about a refused capture. */
export type CaptureFix = "allSites" | "fileAccess" | "toolbar" | "fileOrToolbar";

export class CaptureBlocked extends Error {
  constructor(
    message: string,
    public fix: CaptureFix | null,
  ) {
    super(message);
    this.name = "CaptureBlocked";
  }
}

export const ALL_SITES = "<all_urls>";

export const HELP = {
  noTab: "Click the tab with the question first, then press Capture.",
  allSites: "Chrome needs your OK once before Rulecard can see the tab you capture.",
  fileAccess: "This PDF is a file saved on your computer. Chrome blocks extensions from those until you switch one setting on, once.",
  toolbar: "Chrome won't let Rulecard see this page by itself. That happens when a PDF is open in another extension's viewer, like Adobe Acrobat.",
  fileOrToolbar: "Chrome wouldn't let Rulecard see this tab. It's usually one of two things:",
  restricted: "Chrome doesn't let any extension capture this page (Chrome's own pages and the Web Store). Open the question in a normal tab.",
} as const;

/** Numbered steps shown under each kind of refused capture. */
export const FIX_STEPS: Record<CaptureFix, string[]> = {
  allSites: ["Press \"Allow and capture\" below.", "In Chrome's box, click Allow. You only do this once."],
  fileAccess: [
    "Press \"Open Rulecard's settings\" below.",
    "Turn on \"Allow access to file URLs\".",
    "Come back to the PDF and press Capture this tab.",
  ],
  toolbar: [
    "Stay on the PDF's tab and click the Rulecard icon in Chrome's toolbar (top right; if you don't see it, click the puzzle piece, then Rulecard). That captures it.",
    "Or open the PDF in Chrome's own viewer instead, and the Capture button works by itself.",
    "(Chrome's own pages, like Settings, can't be captured at all.)",
  ],
  fileOrToolbar: [
    "A PDF saved on your computer: press \"Open Rulecard's settings\", turn on \"Allow access to file URLs\", then press Try again.",
    "A PDF in another extension's viewer (like Adobe Acrobat): click the Rulecard icon in Chrome's toolbar while you're on it. That captures it.",
    "(Chrome's own pages, like Settings, can't be captured at all.)",
  ],
};

/** Pages no extension may capture, whatever it is granted. */
export function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return false;
  return /^(chrome|edge|about|devtools|view-source):/i.test(url) || /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/i.test(url);
}

/** Map a refused captureVisibleTab to what the student should do. */
export function classifyCaptureError(message: string, url: string | undefined, opts: { fileAccess: boolean; allSites: boolean; ownId: string }): CaptureBlocked {
  const where = `${url ?? ""} ${message}`;
  if (isRestrictedUrl(url) || /chrome:\/\/|cannot be scripted|webstore/i.test(message)) return new CaptureBlocked(HELP.restricted, null);
  if (/file:\/\//i.test(where) && !opts.fileAccess) return new CaptureBlocked(HELP.fileAccess, "fileAccess");
  const other = /chrome-extension:\/\/([a-p]{32})/i.exec(where);
  if (other && other[1] !== opts.ownId) return new CaptureBlocked(HELP.toolbar, "toolbar");
  if (!opts.allSites) return new CaptureBlocked(HELP.allSites, "allSites");
  // Allowed on every site and still refused: a local file (when file access is off) or another extension's viewer.
  return opts.fileAccess ? new CaptureBlocked(HELP.toolbar, "toolbar") : new CaptureBlocked(HELP.fileOrToolbar, "fileOrToolbar");
}

/** The tab showing in this window (the side panel's own window). */
export async function activeTabIn(windowId: number | null): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query(windowId === null ? { active: true, currentWindow: true } : { active: true, windowId });
  return tab ?? null;
}

/** Screenshot the visible part of a tab as a PNG data URL, or throw CaptureBlocked with the fix. */
export async function captureTab(tab: chrome.tabs.Tab): Promise<string> {
  if (isRestrictedUrl(tab.url)) throw new CaptureBlocked(HELP.restricted, null);
  try {
    return await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const [fileAccess, allSites] = await Promise.all([
      chrome.extension.isAllowedFileSchemeAccess().catch(() => false),
      chrome.permissions.contains({ origins: [ALL_SITES] }).catch(() => false),
    ]);
    throw classifyCaptureError(message, tab.url, { fileAccess, allSites, ownId: chrome.runtime.id });
  }
}

/** Ask once for the optional "all sites" grant. Must run inside a click. */
export function requestAllSites(): Promise<boolean> {
  return chrome.permissions.request({ origins: [ALL_SITES] }).catch(() => false);
}

/** Open this extension's details page, where "Allow access to file URLs" is. */
export function openExtensionSettings(): Promise<unknown> {
  return chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
}
