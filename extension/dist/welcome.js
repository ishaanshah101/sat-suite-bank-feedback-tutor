// extension/src/addons/welcome.ts
var isMac = navigator.platform.toLowerCase().includes("mac");
for (const el of document.querySelectorAll("[data-shortcut]")) el.textContent = isMac ? "\u2325 Option + \u21E7 Shift + R" : "Alt + Shift + R";
document.getElementById("open-qb")?.addEventListener("click", () => {
  void chrome.tabs.create({ url: "https://satsuitequestionbank.collegeboard.org/digital/search" });
});
document.getElementById("shortcuts")?.addEventListener("click", () => {
  void chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});
var windowId;
void chrome.windows.getCurrent().then((win) => {
  windowId = win.id;
});
document.getElementById("open-panel")?.addEventListener("click", () => {
  if (windowId !== void 0) void chrome.sidePanel.open({ windowId }).catch(() => void 0);
});
