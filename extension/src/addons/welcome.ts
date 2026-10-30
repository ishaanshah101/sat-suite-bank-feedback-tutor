// extension/src/welcome.ts → dist/welcome.js. Small onboarding page opened on first install.
const isMac = navigator.platform.toLowerCase().includes("mac");
for (const el of document.querySelectorAll<HTMLElement>("[data-shortcut]")) el.textContent = isMac ? "⌥ Option + ⇧ Shift + R" : "Alt + Shift + R";
document.getElementById("open-qb")?.addEventListener("click", () => {
  void chrome.tabs.create({ url: "https://satsuitequestionbank.collegeboard.org/digital/search" });
});
document.getElementById("shortcuts")?.addEventListener("click", () => {
  void chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});
// Look the window up before any click: sidePanel.open must run inside the click, with no await before it.
let windowId: number | undefined;
void chrome.windows.getCurrent().then((win) => { windowId = win.id; });
document.getElementById("open-panel")?.addEventListener("click", () => {
  if (windowId !== undefined) void chrome.sidePanel.open({ windowId }).catch(() => undefined);
});
