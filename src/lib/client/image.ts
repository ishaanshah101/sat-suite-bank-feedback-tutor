"use client";

export const MAX_LONG_EDGE = 1568;
const PNG_BUDGET_CHARS = 3_500_000;

/** Downscale to the model's sweet spot and encode as PNG (JPEG 0.92 if the PNG is too large). */
export function downscaleCanvas(source: HTMLCanvasElement | HTMLVideoElement | ImageBitmap, maxEdge = MAX_LONG_EDGE): string {
  const width = "videoWidth" in source ? source.videoWidth : source.width;
  const height = "videoHeight" in source ? source.videoHeight : source.height;
  if (!width || !height) throw new Error("Nothing to capture yet. Try again in a second.");
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas not available");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const png = canvas.toDataURL("image/png");
  if (png.length <= PNG_BUDGET_CHARS) return png;
  return canvas.toDataURL("image/jpeg", 0.92);
}

export async function fileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    return downscaleCanvas(bitmap);
  } finally {
    bitmap.close();
  }
}
