// Optional "crop before sending": drag a box over the capture so only the question is sent.
// Smaller, cleaner images extract better and cost fewer vision tokens.

import { h } from "./dom";

export interface Rect { x: number; y: number; w: number; h: number }

/** Convert a drag between two points in DISPLAY pixels into a rect in NATURAL image pixels. */
export function toNaturalRect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  display: { w: number; h: number },
  natural: { w: number; h: number },
): Rect | null {
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  const x1 = clamp(Math.min(a.x, b.x), display.w), x2 = clamp(Math.max(a.x, b.x), display.w);
  const y1 = clamp(Math.min(a.y, b.y), display.h), y2 = clamp(Math.max(a.y, b.y), display.h);
  if (x2 - x1 < 8 || y2 - y1 < 8) return null; // treat tiny drags as a click
  const sx = natural.w / display.w, sy = natural.h / display.h;
  return { x: Math.round(x1 * sx), y: Math.round(y1 * sy), w: Math.round((x2 - x1) * sx), h: Math.round((y2 - y1) * sy) };
}

export async function cropDataUrl(dataUrl: string, r: Rect): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob, r.x, r.y, r.w, r.h);
  try {
    const canvas = new OffscreenCanvas(r.w, r.h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.drawImage(bitmap, 0, 0);
    const out = await canvas.convertToBlob({ type: "image/png" });
    const bytes = new Uint8Array(await out.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return `data:image/png;base64,${btoa(bin)}`;
  } finally {
    bitmap.close();
  }
}

/**
 * Renders the cropper card. Resolves via onDone with the (possibly cropped) data URL,
 * or null if the user cancels.
 */
export function renderCropper(dataUrl: string, onDone: (image: string | null) => void): HTMLElement {
  let start: { x: number; y: number } | null = null;
  let rect: Rect | null = null;
  const box = h("div", { class: "rc-crop-box", hidden: "" });
  const img = h("img", { src: dataUrl, alt: "Captured tab", draggable: "false" });
  const stage = h("div", { class: "rc-crop-stage" }, img, box);
  const sendSel = h("button", { class: "btn primary", disabled: true, text: "Send selection" });

  const point = (ev: PointerEvent) => {
    const r = img.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const paint = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    box.hidden = false;
    box.style.left = `${Math.min(a.x, b.x)}px`;
    box.style.top = `${Math.min(a.y, b.y)}px`;
    box.style.width = `${Math.abs(a.x - b.x)}px`;
    box.style.height = `${Math.abs(a.y - b.y)}px`;
  };
  stage.addEventListener("pointerdown", (ev) => {
    start = point(ev);
    stage.setPointerCapture(ev.pointerId);
  });
  stage.addEventListener("pointermove", (ev) => {
    if (start) paint(start, point(ev));
  });
  stage.addEventListener("pointerup", (ev) => {
    if (!start) return;
    const end = point(ev);
    rect = toNaturalRect(start, end, { w: img.clientWidth, h: img.clientHeight }, { w: img.naturalWidth, h: img.naturalHeight });
    start = null;
    if (!rect) box.hidden = true;
    sendSel.disabled = !rect;
  });
  sendSel.addEventListener("click", async () => {
    if (!rect) return;
    sendSel.disabled = true;
    try {
      onDone(await cropDataUrl(dataUrl, rect));
    } catch {
      onDone(dataUrl);
    }
  });

  return h(
    "div",
    { class: "card" },
    h("h2", { text: "Crop to the question" }),
    h("p", { class: "muted small", text: "Drag a box around the passage, question and choices (and the answer, if it's showing). Cropping makes the read more accurate." }),
    stage,
    h(
      "div",
      { class: "row" },
      sendSel,
      h("button", { class: "btn", text: "Send whole tab", onclick: () => onDone(dataUrl) }),
      h("button", { class: "btn link small", text: "Cancel", onclick: () => onDone(null) }),
    ),
  );
}
