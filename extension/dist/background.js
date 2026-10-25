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

// extension/src/background.ts
var openOnClick = () => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => void 0);
};
chrome.runtime.onInstalled.addListener(openOnClick);
chrome.runtime.onStartup.addListener(openOnClick);
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "capture") return;
  const windowId = tab?.windowId;
  if (windowId === void 0) return;
  void chrome.sidePanel.open({ windowId }).catch(() => void 0);
  void (async () => {
    let pending;
    try {
      const raw = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
      pending = { image: await downscale(raw), at: Date.now(), tabTitle: tab?.title ?? null };
    } catch (error) {
      pending = { error: error instanceof Error ? error.message : String(error), at: Date.now() };
    }
    await chrome.storage.session.set({ pendingCapture: pending });
  })();
});
