import { downscale } from "./image";
import type { PendingCapture } from "./types";

const openOnClick = () => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
};
chrome.runtime.onInstalled.addListener(openOnClick);
chrome.runtime.onStartup.addListener(openOnClick);

/** Keyboard shortcut: grab the tab right away (activeTab is granted by the command), then show the panel. */
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "capture") return;
  const windowId = tab?.windowId;
  if (windowId === undefined) return;
  // sidePanel.open must be called inside the user gesture, before any await.
  void chrome.sidePanel.open({ windowId }).catch(() => undefined);
  void (async () => {
    let pending: PendingCapture;
    try {
      const raw = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
      pending = { image: await downscale(raw), at: Date.now(), tabTitle: tab?.title ?? null };
    } catch (error) {
      pending = { error: error instanceof Error ? error.message : String(error), at: Date.now() };
    }
    await chrome.storage.session.set({ pendingCapture: pending });
  })();
});
