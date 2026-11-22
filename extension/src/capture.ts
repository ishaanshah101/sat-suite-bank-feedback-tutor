// "Capture this tab": a screenshot of the tab the student is looking at (a Question Bank PDF, a
// practice-test review page, anything with the question on screen), plus the page's own text so a
// question that runs off the screen is still read whole.
//
// Rulecard is allowed on every site from install, so the Capture button works on any web page with no
// toolbar click and no "Allow" box. Chrome still refuses a few pages: a file on the computer (until
// "Allow access to file URLs" is on), a PDF shown by another extension's viewer, and Chrome's own pages.
// For those, and for anything outside Chrome, "Capture a window or screen" (Chrome's own picker) sees
// whatever is on screen. When the screenshot is refused, CaptureBlocked says what to do.

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
  toolbar: "Chrome won't let Rulecard see this page by itself. That happens when a PDF is open in another extension's viewer, like Adobe Acrobat. Press \"Capture a window or screen\" instead: that sees anything on your screen.",
  fileOrToolbar: "Chrome wouldn't let Rulecard see this tab. It's usually one of two things:",
  restricted: "Chrome doesn't let any extension capture this page directly (Chrome's own pages and the Web Store). Press \"Capture a window or screen\" instead: that sees anything on your screen.",
  pickCancelled: "Nothing was picked. Press \"Capture a window or screen\" and choose the window or screen with the question.",
  pickFailed: "Chrome couldn't share that window or screen. Try again and pick it from the list.",
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
    "Press \"Capture a window or screen\" below and pick the Chrome window (or the whole screen) with the question.",
    "Or click the Rulecard icon in Chrome's toolbar while you're on this tab. That captures it too.",
  ],
  fileOrToolbar: [
    "Fastest: press \"Capture a window or screen\" below and pick the window with the question.",
    "A PDF saved on your computer: to make the Capture button work on it every time, press \"Open Rulecard's settings\" and turn on \"Allow access to file URLs\" (once).",
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

/** Tidy page text before it is sent: no blank-line runs, at most 15,000 characters. */
export function cleanPageText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 15_000);
}

/** Runs inside the page (serialized by chrome.scripting): the visible text of this frame. */
function pageTextInPage(): string {
  const body = document.body;
  if (!body) return "";
  return (body.innerText || body.textContent || "").slice(0, 30_000);
}

/**
 * The text of the page (and its frames), or null when Chrome won't let Rulecard read it (a PDF, a
 * restricted page). Never throws: the screenshot alone still works.
 */
export async function readPageText(tab: chrome.tabs.Tab): Promise<string | null> {
  if (tab.id === undefined || isRestrictedUrl(tab.url)) return null;
  try {
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: pageTextInPage });
    const text = cleanPageText(results.map((r) => (typeof r.result === "string" ? r.result : "")).filter(Boolean).join("\n\n"));
    return text.length >= 40 ? text : null;
  } catch {
    return null;
  }
}

/**
 * "Capture a window or screen": Chrome's own picker, which can see anything on screen (another app, a
 * PDF in Adobe's viewer, a local file). Returns one frame as a PNG data URL. Must run inside a click.
 */
export function captureWindowOrScreen(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.desktopCapture.chooseDesktopMedia(["screen", "window", "tab"], async (streamId) => {
      if (!streamId) return reject(new CaptureBlocked(HELP.pickCancelled, null));
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: streamId, maxWidth: 3840, maxHeight: 2400 } } as MediaTrackConstraints,
        });
        const video = document.createElement("video");
        video.muted = true;
        video.srcObject = stream;
        await video.play();
        // The first frame can arrive a moment after play() resolves.
        for (let i = 0; i < 20 && (!video.videoWidth || !video.videoHeight); i++) await new Promise((r) => setTimeout(r, 50));
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx || !canvas.width) throw new Error("no frame");
        ctx.drawImage(video, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        reject(new CaptureBlocked(HELP.pickFailed, null));
      } finally {
        stream?.getTracks().forEach((t) => t.stop());
      }
    });
  });
}

/** Ask once for the "all sites" grant (an older install may not have it yet). Must run inside a click. */
export function requestAllSites(): Promise<boolean> {
  return chrome.permissions.request({ origins: [ALL_SITES] }).catch(() => false);
}

/** Open this extension's details page, where "Allow access to file URLs" is. */
export function openExtensionSettings(): Promise<unknown> {
  return chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
}
