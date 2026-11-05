import { installBackgroundAddons } from "./addons/background";

// The toolbar icon opens the side panel. Questions come only from a Question Bank PDF opened there.
const openOnClick = () => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
};
chrome.runtime.onInstalled.addListener(openOnClick);
chrome.runtime.onStartup.addListener(openOnClick);

installBackgroundAddons();
