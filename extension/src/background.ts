import { installBackgroundAddons } from "./addons/background";

// The toolbar icon (and its keyboard shortcut) opens the side panel. Clicking it also gives Rulecard
// permission for that one tab (activeTab), so when the panel is already open the click means
// "capture this tab": the panel hears about it and captures. A panel the click just opened shows the
// Capture button instead.
const useOwnClickHandler = () => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => undefined);
};
chrome.runtime.onInstalled.addListener(useOwnClickHandler);
chrome.runtime.onStartup.addListener(useOwnClickHandler);

chrome.action.onClicked.addListener((tab) => {
  const windowId = tab.windowId;
  // open() only works inside the click, so it goes first. On an open panel it does nothing.
  void chrome.sidePanel.open({ windowId }).catch(() => undefined);
  void chrome.runtime.sendMessage({ type: "rc-toolbar-click", windowId, tabId: tab.id }).catch(() => undefined);
});

installBackgroundAddons();
