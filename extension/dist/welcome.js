// extension/src/addons/welcome.ts
document.getElementById("open-qb")?.addEventListener("click", () => {
  void chrome.tabs.create({ url: "https://satsuitequestionbank.collegeboard.org/digital/search" });
});
var windowId;
void chrome.windows.getCurrent().then((win) => {
  windowId = win.id;
});
document.getElementById("open-panel")?.addEventListener("click", () => {
  if (windowId !== void 0) void chrome.sidePanel.open({ windowId }).catch(() => void 0);
});
