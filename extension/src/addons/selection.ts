// Side-panel half of "Explain this question with Rulecard" (selection-bg.ts is the background
// half), plus the text-to-image renderer that the Paste panel (paste.ts) shares.
//
// The text is drawn as a clean black-on-white PNG (same idea as textcapture.ts) and goes through
// the host's existing processImage(image) -> /api/extract, so the server needs no change. Line
// breaks are kept. Answer choices written inline ("... A) x B) y C) z D) w", common in PDF
// selections) or as a lone letter above the choice text are put on their own lines.
//
// Hook in (side panel boot, once):
//   const selection = createSelectionCapture({ processImage, rerender: render, describe });
//   void selection.start();   // watches for new selections, then takes one saved before the panel opened
//   renderInCapture slot: selection.render()   (progress or a friendly notice, null when idle)
// Lower-level pieces: consumePendingSelection(), watchSelections(cb), checkQuestionText(),
// questionTextToImage(text, meta).
// Storage: reads and clears chrome.storage.session "rc.addons.pendingSelection.v1" (written by
// selection-bg.ts). Permissions: none beyond "storage".

import { h, spinner } from "./dom";
import { PENDING_SELECTION_KEY, type PendingSelection } from "./selection-bg";
import { wrapText } from "./textcapture";
import { LETTERS, type Letter } from "./types";

export type { PendingSelection } from "./selection-bg";

/** Shorter selections are ignored with a friendly message. */
export const MIN_QUESTION_CHARS = 40;
export const MAX_QUESTION_CHARS = 6000;
/** A saved selection older than this was never picked up (the panel didn't open). Drop it. */
export const PENDING_MAX_AGE_MS = 10 * 60_000;
export const IMAGE_WIDTH = 1100;
const MAX_IMAGE_HEIGHT = 6000;

// ---------------------------------------------------------------- text clean-up

const CIRCLED: Record<string, string> = {
  "\u24B6": "(A)", "\u24B7": "(B)", "\u24B8": "(C)", "\u24B9": "(D)",
  "\u24D0": "(A)", "\u24D1": "(B)", "\u24D2": "(C)", "\u24D3": "(D)",
};

/**
 * Tidy copied text without changing its words or punctuation (punctuation is often the point of
 * an SAT question): unify line endings, drop zero-width characters and soft hyphens, turn odd
 * spaces into plain ones, trim each line, keep at most one blank line in a row. Circled choice
 * letters from PDFs become "(A)".
 */
export function normalizeQuestionText(raw: string): string {
  return (raw ?? "")
    .replace(/\r\n?|[\f\v\u2028\u2029]/g, "\n")
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[\t\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/[\u24B6-\u24B9\u24D0-\u24D3]/g, (c) => CIRCLED[c] ?? c)
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    // Screen-reader labels some sites copy along with the letter: "(Choice A)" then "A" becomes "A".
    .replace(/^\(?(?:Choice|Option) ([A-D])\)?:?\n+\1$/gm, "$1")
    .replace(/^\(?(?:Choice|Option) ([A-D])\)?:?$/gm, "$1")
    .trim();
}

export type TextCheck = { ok: true; text: string } | { ok: false; message: string };

/** Normalize, then refuse text too short to be a question (about 40 characters). */
export function checkQuestionText(raw: string, from: "selection" | "paste" = "selection"): TextCheck {
  const text = normalizeQuestionText(raw);
  const n = text.replace(/\s+/g, " ").length;
  if (n === 0) {
    return { ok: false, message: from === "paste" ? "Paste a question first." : "No text came through. Select the question on the page, then try again." };
  }
  if (n < MIN_QUESTION_CHARS) {
    const verb = from === "paste" ? "Paste" : "Select";
    return {
      ok: false,
      message: `That's only ${n} character${n === 1 ? "" : "s"}, which is too short to be a question. ${verb} the whole question, including any answer choices, then try again.`,
    };
  }
  return { ok: true, text: text.length > MAX_QUESTION_CHARS ? text.slice(0, MAX_QUESTION_CHARS) : text };
}

// ---------------------------------------------------------------- answer-choice detection

export interface ChoiceLine {
  letter: Letter;
  text: string;
}

export interface SplitQuestion {
  /** Passage and question, line breaks kept. */
  body: string;
  /** A to D in order, or empty when no full set was found (grid-in, partial selection, prose). */
  choices: ChoiceLine[];
  /** Anything after the last choice, such as "Correct Answer: B" or a rationale. */
  after: string;
}

interface Marker {
  letter: Letter;
  start: number;
  end: number;
  lineStart: boolean;
  style: "paren" | "close" | "dot" | "alone";
}

// "(A)", "A)" or "A." after whitespace and before whitespace; or a letter alone on its line
// (optionally "Choice A"), as on Question Bank pages and many quiz sites.
const MARKER_RE = /(?<![^\s])(?:\(([A-D])\)|([A-D])([.)]))(?=\s|$)|(?<=^|\n)(?:Choice\s+)?([A-D])(?=\n|$)/g;
// Question Bank exports print these after the choices. They stay in the image, but never inside choice D.
const TRAILER_RE = /(^|\s)(?:Correct Answer:|Rationale(?=\s|$)|Question Difficulty:)/;

function findMarkers(text: string): Marker[] {
  const out: Marker[] = [];
  for (const m of text.matchAll(MARKER_RE)) {
    const letter = (m[1] ?? m[2] ?? m[4]) as Letter | undefined;
    if (!letter || m.index === undefined) continue;
    const style = m[1] ? "paren" : m[2] ? (m[3] === ")" ? "close" : "dot") : "alone";
    out.push({ letter, start: m.index, end: m.index + m[0].length, lineStart: m.index === 0 || text[m.index - 1] === "\n", style });
  }
  return out;
}

/** The last D, the last C before it, and so on back to A. */
function lastRun(markers: Marker[]): Marker[] | null {
  const run: Marker[] = [];
  let want = LETTERS.length - 1;
  for (let i = markers.length - 1; i >= 0 && want >= 0; i--) {
    const m = markers[i]!;
    if (m.letter === LETTERS[want]) {
      run.unshift(m);
      want--;
    }
  }
  return want < 0 ? run : null;
}

/** Prefer choices that start lines; otherwise one consistent inline style, safest first. */
function findChoiceRun(text: string): Marker[] | null {
  const all = findMarkers(text);
  const atLineStart = lastRun(all.filter((m) => m.lineStart));
  if (atLineStart) return atLineStart;
  for (const style of ["close", "paren", "dot"] as const) {
    const run = lastRun(all.filter((m) => m.style === style));
    if (run) return run;
  }
  return null;
}

const lineEnd = (text: string, from: number) => {
  const i = text.indexOf("\n", from);
  return i < 0 ? text.length : i;
};
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();

/** Split question text into body, choices A to D (each on its own line) and trailing text. */
export function splitQuestion(raw: string): SplitQuestion {
  const text = normalizeQuestionText(raw);
  const trailer = TRAILER_RE.exec(text);
  const cut = trailer ? trailer.index + (trailer[1]?.length ?? 0) : text.length;
  const main = text.slice(0, cut);
  const run = findChoiceRun(main);
  if (!run) return { body: text, choices: [], after: "" };

  const choices: ChoiceLine[] = [];
  let afterStart = main.length;
  run.forEach((m, k) => {
    const next = run[k + 1];
    let end: number;
    if (next) end = next.start;
    else if (main.slice(m.end, lineEnd(main, m.end)).trim()) end = lineEnd(main, m.end);
    else {
      // The last letter stands alone: its text is the next non-empty line.
      let p = lineEnd(main, m.end) + 1;
      while (p < main.length && main[p] === "\n") p++;
      end = p >= main.length ? main.length : lineEnd(main, p);
    }
    if (!next) afterStart = end;
    choices.push({ letter: m.letter, text: oneLine(main.slice(m.end, end)) });
  });
  const after = [main.slice(afterStart).trim(), text.slice(cut).trim()].filter(Boolean).join("\n");
  return { body: main.slice(0, run[0]!.start).trim(), choices, after };
}

// ---------------------------------------------------------------- layout (pure)

export type Measure = (text: string, font: string) => number;

export interface LaidLine {
  text: string;
  x: number;
  /** Top of the glyphs (textBaseline "top"). */
  y: number;
  font: string;
  color: string;
}

export interface QuestionLayout {
  width: number;
  height: number;
  lines: LaidLine[];
}

interface Style {
  font: string;
  size: number;
  color: string;
  lineHeight: number;
}

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const HEADER: Style = { font: `600 18px ${SANS}`, size: 18, color: "#4b5563", lineHeight: 26 };
const BODY: Style = { font: `22px ${SERIF}`, size: 22, color: "#111827", lineHeight: 34 };
const CHOICE: Style = { font: `21px ${SERIF}`, size: 21, color: "#111827", lineHeight: 31 };
const AFTER: Style = { font: `20px ${SANS}`, size: 20, color: "#374151", lineHeight: 30 };

export const LAYOUT = {
  pad: 40,
  choiceIndent: 12,
  /** Space between "A)" and the choice text. Wrapped choice lines hang under the text. */
  labelGap: 14,
  gapAfterHeader: 22,
  gapBeforeChoices: 20,
  gapBetweenChoices: 10,
  gapBeforeAfter: 24,
} as const;

/** Where every line goes. The measure function is injected so this runs without a canvas. */
export function layoutQuestion(q: SplitQuestion, header: string | null, measure: Measure, width = IMAGE_WIDTH): QuestionLayout {
  const { pad } = LAYOUT;
  const inner = width - pad * 2;
  const lines: LaidLine[] = [];
  let y = pad;
  let first = true;
  const gap = (px: number) => {
    if (!first) y += px;
    first = false;
  };
  const place = (text: string, style: Style, x: number) => {
    if (text) lines.push({ text, x, y: y + (style.lineHeight - style.size) / 2, font: style.font, color: style.color });
    y += style.lineHeight;
  };
  const block = (text: string, style: Style, before: number) => {
    gap(before);
    for (const line of wrapText(text, inner, (s) => measure(s, style.font))) place(line, style, pad);
  };

  if (header) block(header, HEADER, 0);
  if (q.body) block(q.body, BODY, LAYOUT.gapAfterHeader);
  if (q.choices.length) {
    const labelWidth = Math.max(...q.choices.map((c) => measure(`${c.letter})`, CHOICE.font))) + LAYOUT.labelGap;
    const x0 = pad + LAYOUT.choiceIndent;
    const textWidth = inner - LAYOUT.choiceIndent - labelWidth;
    q.choices.forEach((c, i) => {
      gap(i === 0 ? LAYOUT.gapBeforeChoices : LAYOUT.gapBetweenChoices);
      // The label sits on the first text line; wrapped lines hang under the text, not the label.
      lines.push({ text: `${c.letter})`, x: x0, y: y + (CHOICE.lineHeight - CHOICE.size) / 2, font: CHOICE.font, color: CHOICE.color });
      for (const line of wrapText(c.text, textWidth, (s) => measure(s, CHOICE.font))) place(line, CHOICE, x0 + labelWidth);
    });
  }
  if (q.after) block(q.after, AFTER, LAYOUT.gapBeforeAfter);
  return { width, height: Math.ceil(y + pad), lines };
}

export interface QuestionImageMeta {
  /** Page the text came from. Its site name goes in a small header line. */
  url?: string | null;
  title?: string | null;
}

/** "khanacademy.org", "a local file", or null. */
export function sourceLabel(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol === "file:") return "a local file";
    return u.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function imageHeader(meta: QuestionImageMeta): string | null {
  const where = sourceLabel(meta.url);
  if (!where) return null;
  // Only the site name. The tab title can be an email subject or a document name, so it never leaves the device.
  return `Selected from ${where}`;
}

// ---------------------------------------------------------------- rendering

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(bin)}`;
}

/** Render question text to a PNG data URL (OffscreenCanvas, works in the side panel). */
export async function questionTextToImage(text: string, meta: QuestionImageMeta = {}, width = IMAGE_WIDTH): Promise<string> {
  const probe = new OffscreenCanvas(10, 10).getContext("2d");
  if (!probe) throw new Error("Canvas not available");
  let font = "";
  const measure: Measure = (s, f) => {
    if (f !== font) probe.font = font = f;
    return probe.measureText(s).width;
  };
  const layout = layoutQuestion(splitQuestion(text), imageHeader(meta), measure, width);
  const height = Math.min(layout.height, MAX_IMAGE_HEIGHT);
  const canvas = new OffscreenCanvas(layout.width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, layout.width, height);
  ctx.textBaseline = "top";
  for (const line of layout.lines) {
    if (line.y >= height) break;
    ctx.font = line.font;
    ctx.fillStyle = line.color;
    ctx.fillText(line.text, line.x, line.y);
  }
  return blobToDataUrl(await canvas.convertToBlob({ type: "image/png" }));
}

// ---------------------------------------------------------------- pending selection (storage)

export function isPendingSelection(value: unknown): value is PendingSelection {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return typeof o.text === "string" && typeof o.at === "number";
}

export function isFreshSelection(sel: Pick<PendingSelection, "at">, now: number): boolean {
  return now - sel.at <= PENDING_MAX_AGE_MS && sel.at - now <= 60_000;
}

const forWindow = (sel: PendingSelection, windowId: number | null | undefined) =>
  windowId == null || sel.windowId == null || sel.windowId === windowId;

// consumePendingSelection and watchSelections can both see one value; deliver it once.
const delivered = new Set<string>();
function claim(sel: PendingSelection): boolean {
  const id = `${sel.at}|${sel.text.length}|${sel.text.slice(0, 64)}`;
  if (delivered.has(id)) return false;
  delivered.add(id);
  return true;
}

const sessionArea = () => (typeof chrome !== "undefined" ? chrome.storage?.session : undefined);

export interface SelectionOptions {
  /** This panel's window (chrome.windows.getCurrent). A selection made in another window is left for that window's panel. */
  windowId?: number | null;
  now?: number;
}

/** Read and clear the selection the background saved. Null when there is none, it's stale, or it was already handled. */
export async function consumePendingSelection(opts: SelectionOptions = {}): Promise<PendingSelection | null> {
  const area = sessionArea();
  if (!area) return null;
  const value: unknown = (await area.get(PENDING_SELECTION_KEY))[PENDING_SELECTION_KEY];
  if (value === undefined) return null;
  if (isPendingSelection(value) && !forWindow(value, opts.windowId)) return null;
  await area.remove(PENDING_SELECTION_KEY);
  if (!isPendingSelection(value) || !isFreshSelection(value, opts.now ?? Date.now()) || !claim(value)) return null;
  return value;
}

/** Call cb for each selection saved while the panel is open. Returns an unsubscribe function. */
export function watchSelections(cb: (sel: PendingSelection) => void, opts: Pick<SelectionOptions, "windowId"> = {}): () => void {
  if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return () => undefined;
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: chrome.storage.AreaName) => {
    if (area !== "session") return;
    const value: unknown = changes[PENDING_SELECTION_KEY]?.newValue;
    if (!isPendingSelection(value) || !forWindow(value, opts.windowId)) return;
    void sessionArea()?.remove(PENDING_SELECTION_KEY);
    if (isFreshSelection(value, Date.now()) && claim(value)) cb(value);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

async function currentWindowId(): Promise<number | null> {
  try {
    const win = await chrome.windows.getCurrent();
    return typeof win.id === "number" ? win.id : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- controller + banner

/** What the selection and paste flows need from the side panel. */
export interface CaptureHost {
  /** sidepanel.ts processImage(image): POST /api/extract and set the question. */
  processImage(image: string): Promise<void>;
  /** Re-render the side panel (sidepanel.ts render / ctx.rerender). */
  rerender(): void;
  /** Turn an error into a sentence (sidepanel.ts describe). */
  describe?(error: unknown): string;
}

export function describeError(host: Pick<CaptureHost, "describe">, error: unknown): string {
  if (host.describe) return host.describe(error);
  return error instanceof Error && error.message ? error.message : "Something went wrong. Try again.";
}

export type SelectionStatus =
  | { kind: "idle" }
  | { kind: "working"; from: string | null }
  | { kind: "notice"; tone: "warn" | "danger"; text: string };

export function renderSelectionStatus(status: SelectionStatus, dismiss: () => void): HTMLElement | null {
  if (status.kind === "idle") return null;
  if (status.kind === "working") {
    return h("div", { class: "banner accent rc-selection", role: "status" }, spinner(),
      h("span", { text: status.from ? `Reading the text you selected on ${status.from}...` : "Reading the text you selected..." }));
  }
  return h("div", { class: `banner ${status.tone} rc-selection`, role: "alert" },
    h("span", { text: status.text }),
    h("button", { class: "btn link small", text: "Dismiss", onclick: dismiss }));
}

/** Watches for selections and sends each one through processImage, one at a time. */
export function createSelectionCapture(host: CaptureHost) {
  let status: SelectionStatus = { kind: "idle" };
  let unwatch: (() => void) | null = null;
  let queue: Promise<void> = Promise.resolve();
  const set = (next: SelectionStatus) => {
    status = next;
    host.rerender();
  };

  async function run(sel: Pick<PendingSelection, "text" | "url" | "title">): Promise<void> {
    const check = checkQuestionText(sel.text, "selection");
    if (!check.ok) return set({ kind: "notice", tone: "warn", text: check.message });
    set({ kind: "working", from: sourceLabel(sel.url) });
    try {
      const image = await questionTextToImage(check.text, { url: sel.url, title: sel.title });
      await host.processImage(image);
      set({ kind: "idle" });
    } catch (error) {
      set({ kind: "notice", tone: "danger", text: describeError(host, error) });
    }
  }
  const explain = (sel: Pick<PendingSelection, "text" | "url" | "title">): Promise<void> => (queue = queue.then(() => run(sel)));

  return {
    /** Start listening, then take a selection saved before the panel opened. */
    async start(): Promise<void> {
      if (unwatch) return;
      const windowId = await currentWindowId();
      unwatch = watchSelections((sel) => void explain(sel), { windowId });
      const first = await consumePendingSelection({ windowId });
      if (first) await explain(first);
    },
    stop(): void {
      unwatch?.();
      unwatch = null;
    },
    /** Explain text directly (same checks and rendering as a right-click selection). */
    explain,
    status: () => status,
    render: (): HTMLElement | null => renderSelectionStatus(status, () => set({ kind: "idle" })),
  };
}
