// "Text capture": on Question Bank pages, read the question straight from the page text and
// render it as a crisp, compact image for the existing /api/extract endpoint. No server change.
//
// Why: (1) no screenshot, so no "click the toolbar icon first" (host permissions already cover
// the Question Bank, and chrome.scripting doesn't need activeTab there); (2) the whole passage
// is included even when it's scrolled off-screen; (3) clean black-on-white text is a far
// easier read for the vision model than a busy screenshot, and a smaller image.
// Falls back to the normal screenshot whenever the page has a figure/table/math or the parse
// is incomplete.

import type { ParsedQB } from "./qbtext";
import { LETTERS } from "./types";

export function canTextCapture(parsed: ParsedQB | null | undefined, media: number): parsed is ParsedQB {
  return Boolean(parsed && parsed.qbId && parsed.stem && LETTERS.every((l) => parsed.choices[l]) && media === 0);
}

export interface Block {
  text: string;
  font: string;
  color: string;
  gapBefore: number;
  lineHeight: number;
  indent?: number;
}

/** Greedy word wrap with an injected text measurer (so it's testable without a canvas). */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); continue; }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth || !line) {
        // a single word longer than the line: hard-break it
        if (!line && measure(candidate) > maxWidth) {
          let chunk = "";
          for (const ch of word) {
            if (measure(chunk + ch) > maxWidth && chunk) { out.push(chunk); chunk = ""; }
            chunk += ch;
          }
          line = chunk;
        } else line = candidate;
      } else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

export function blocksFor(p: ParsedQB): Block[] {
  const meta = [p.domain, p.skill, p.difficulty].filter(Boolean).join(" · ");
  const blocks: Block[] = [
    { text: `Question ID ${p.qbId}${meta ? `   ·   ${meta}` : ""}`, font: `600 18px ${SANS}`, color: "#4b5563", gapBefore: 0, lineHeight: 26 },
  ];
  if (p.passage) blocks.push({ text: p.passage, font: `22px ${SERIF}`, color: "#111827", gapBefore: 22, lineHeight: 34 });
  blocks.push({ text: p.stem ?? "", font: `600 21px ${SANS}`, color: "#111827", gapBefore: 22, lineHeight: 31 });
  for (const l of LETTERS) blocks.push({ text: `${l}.  ${p.choices[l] ?? ""}`, font: `21px ${SERIF}`, color: "#111827", gapBefore: l === "A" ? 18 : 10, lineHeight: 31, indent: 12 });
  if (p.correct) blocks.push({ text: `Correct Answer: ${p.correct}`, font: `700 21px ${SANS}`, color: "#166534", gapBefore: 24, lineHeight: 30 });
  return blocks;
}

/** Render the parsed question to a PNG data URL (OffscreenCanvas; works in the side panel). */
export async function renderQuestionImage(p: ParsedQB, width = 1100): Promise<string> {
  const pad = 40;
  const measureCanvas = new OffscreenCanvas(10, 10);
  const mctx = measureCanvas.getContext("2d");
  if (!mctx) throw new Error("Canvas not available");
  const blocks = blocksFor(p);
  const laid = blocks.map((b) => {
    mctx.font = b.font;
    const lines = wrapText(b.text, width - pad * 2 - (b.indent ?? 0), (s) => mctx.measureText(s).width);
    return { b, lines };
  });
  const height = Math.ceil(pad * 2 + laid.reduce((h, { b, lines }) => h + b.gapBefore + lines.length * b.lineHeight, 0));
  const canvas = new OffscreenCanvas(width, Math.min(height, 6000));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "top";
  let y = pad;
  for (const { b, lines } of laid) {
    y += b.gapBefore;
    ctx.font = b.font;
    ctx.fillStyle = b.color;
    for (const line of lines) {
      ctx.fillText(line, pad + (b.indent ?? 0), y + (b.lineHeight - parseInt(b.font.match(/(\d+)px/)?.[1] ?? "20", 10)) / 2);
      y += b.lineHeight;
    }
  }
  const blob = await canvas.convertToBlob({ type: "image/png" });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return `data:image/png;base64,${btoa(bin)}`;
}
