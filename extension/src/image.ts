export const MAX_LONG_EDGE = 1568;
const PNG_BUDGET_BYTES = 2_600_000;

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

/** Downscale a screenshot data URL to the model's sweet spot. Works in pages and in the service worker. */
export async function downscale(dataUrl: string, maxEdge = MAX_LONG_EDGE): Promise<string> {
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
