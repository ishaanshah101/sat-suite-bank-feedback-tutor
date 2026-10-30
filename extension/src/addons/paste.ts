// "Paste a question" panel for the side panel. Paste question text (from a PDF, a quiz site, an
// email) and press "Explain pasted text", or drop, choose or paste a screenshot (PNG or JPEG).
// Text is drawn to a clean PNG by questionTextToImage (selection.ts). A screenshot is read as a
// data URL and scaled down so its long edge is at most 1600 px. Either way the image goes to the
// host's processImage(image) -> /api/extract, the same path as a capture.
//
// Hook in (side panel boot, once):
//   const paste = createPastePanel({ processImage, rerender: render, describe });
//   renderInCapture slot: paste.render()   (a "Paste a question" button that opens the panel)
// The textarea has a stable id (PASTE_TEXTAREA_ID) so render() keeps the draft and the caret.
// Pure helpers (tested): normalizePastedText, questionSignals, looksLikeQuestion, scaleToFit,
// isAcceptedImage, checkImageFile.
// Storage: none (the draft stays in memory). Permissions: none.

import { h, spinner } from "./dom";
import {
  blobToDataUrl,
  checkQuestionText,
  describeError,
  MIN_QUESTION_CHARS,
  normalizeQuestionText,
  questionTextToImage,
  splitQuestion,
  type CaptureHost,
} from "./selection";

export const PASTE_MAX_EDGE = 1600;
export const PASTE_MAX_BYTES = 20 * 1024 * 1024;
export const PASTE_TEXTAREA_ID = "rc-paste-text";
export const ACCEPTED_IMAGE_TYPES: readonly string[] = ["image/png", "image/jpeg"];

// ---------------------------------------------------------------- pure helpers

// Bullets some sites put in front of each answer choice.
const BULLET_RE = /^[ \t]*[\u2022\u25E6\u25AA\u25AB\u2023\u25CF\u25CB\u25A0\u25A1][ \t]*/gm;

/** Everything normalizeQuestionText does (line endings, odd spaces, blank lines), plus leading bullets. */
export function normalizePastedText(raw: string): string {
  return normalizeQuestionText((raw ?? "").replace(BULLET_RE, ""));
}

export interface QuestionSignals {
  /** Length, with each run of whitespace counted once. */
  chars: number;
  /** A full A to D set of answer choices. */
  choices: boolean;
  /** A question mark or a typical SAT prompt ("Which choice...", "most logically completes"). */
  prompt: boolean;
  /** A fill-in blank like "______". */
  blank: boolean;
  /** A number next to =, <, > and the like: probably math. */
  math: boolean;
}

const PROMPT_RE =
  /\?|\b(?:which choice|which of the following|which (?:quotation|finding|statement|word|option)|what is|what are|what was|how many|how much|according to|based on the|most logically|most nearly|best (?:describes|states|supports|completes|illustrates|explains)|conforms to the conventions|completes the text|main (?:idea|purpose)|solve for|value of)\b/i;
const BLANK_RE = /_{3,}|\[\s*blank\s*\]/i;
const MATH_RE = /\d\s*[=<>\u2264\u2265]|[=<>\u2264\u2265]\s*-?\d|\b[a-z]\s*=\s*[a-z\d(]/i;

export function questionSignals(raw: string): QuestionSignals {
  const text = normalizePastedText(raw);
  return {
    chars: text.replace(/\s+/g, " ").length,
    choices: splitQuestion(text).choices.length === 4,
    prompt: PROMPT_RE.test(text),
    blank: BLANK_RE.test(text),
    math: MATH_RE.test(text),
  };
}

/** Rough check before sending: long enough, plus answer choices, a prompt, a blank, or math. */
export function looksLikeQuestion(raw: string): boolean {
  const s = questionSignals(raw);
  return s.chars >= MIN_QUESTION_CHARS && (s.choices || s.prompt || s.blank || s.math);
}

export interface FitSize {
  width: number;
  height: number;
  /** 1 when no scaling was needed. */
  scale: number;
}

/** Scale w x h down (never up) so the long edge is at most max. Rounded, at least 1 px. Bad sizes give 0 x 0. */
export function scaleToFit(w: number, h: number, max: number): FitSize {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return { width: 0, height: 0, scale: 0 };
  const scale = max > 0 ? Math.min(1, max / Math.max(w, h)) : 1;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale };
}

/** PNG or JPEG, by MIME type, or by file name when the type is missing. */
export function isAcceptedImage(file: { type?: string; name?: string }): boolean {
  const type = (file.type ?? "").toLowerCase();
  if (type) return ACCEPTED_IMAGE_TYPES.includes(type) || type === "image/jpg" || type === "image/pjpeg";
  return /\.(?:png|jpe?g)$/i.test(file.name ?? "");
}

/** A friendly reason the file can't be used, or null when it's fine. */
export function checkImageFile(file: { type?: string; name?: string; size: number }): string | null {
  if (!isAcceptedImage(file)) return "That file isn't a PNG or JPEG. Use a screenshot saved as PNG or JPEG.";
  if (file.size <= 0) return "That file is empty. Choose another screenshot.";
  if (file.size > PASTE_MAX_BYTES) return "That file is over 20 MB. Use a smaller screenshot.";
  return null;
}

// ---------------------------------------------------------------- image reading (canvas)

/** Read a PNG or JPEG as a data URL, scaled down so its long edge is at most `max` px. */
export async function imageFileToDataUrl(file: Blob, max = PASTE_MAX_EDGE): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file couldn't be opened as an image. Try a PNG or JPEG screenshot.");
  }
  try {
    const fit = scaleToFit(bitmap.width, bitmap.height, max);
    if (!fit.width) throw new Error("That image is empty. Choose another screenshot.");
    const type = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
    // Small enough already: send the original bytes.
    if (fit.scale === 1 && file.type === type) return await blobToDataUrl(file);
    const canvas = new OffscreenCanvas(fit.width, fit.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff"; // transparent areas become white, not black
    ctx.fillRect(0, 0, fit.width, fit.height);
    ctx.drawImage(bitmap, 0, 0, fit.width, fit.height);
    return await blobToDataUrl(await canvas.convertToBlob({ type, quality: 0.92 }));
  } finally {
    bitmap.close();
  }
}

// ---------------------------------------------------------------- rendering

export type PasteStatus =
  | { kind: "idle" }
  | { kind: "working"; what: "text" | "image" }
  | { kind: "confirm"; text: string }
  | { kind: "notice"; tone: "warn" | "danger"; text: string };

export interface PasteView {
  open: boolean;
  draft: string;
  status: PasteStatus;
}

export interface PasteActions {
  toggle(): void;
  draft(text: string): void;
  explainText(): void;
  explainAnyway(): void;
  dismiss(): void;
  files(files: ArrayLike<File> | null | undefined): void;
}

function renderPasteStatus(status: PasteStatus, act: PasteActions): HTMLElement | null {
  switch (status.kind) {
    case "idle":
      return null;
    case "working":
      return h("div", { class: "banner accent rc-paste-status", role: "status" }, spinner(),
        h("span", { text: status.what === "image" ? "Reading your screenshot..." : "Reading your pasted text..." }));
    case "confirm":
      return h("div", { class: "banner warn rc-paste-status", role: "alert" },
        h("span", { text: "This doesn't look like a test question. Rulecard works best with the passage, the question and all four answer choices." }),
        h("div", { class: "row rc-wrap" },
          h("button", { class: "btn small primary", text: "Explain anyway", onclick: act.explainAnyway }),
          h("button", { class: "btn small link", text: "Edit the text", onclick: act.dismiss })));
    case "notice":
      return h("div", { class: `banner ${status.tone} rc-paste-status`, role: "alert" },
        h("span", { text: status.text }),
        h("button", { class: "btn link small", text: "Dismiss", onclick: act.dismiss }));
  }
}

export function renderPastePanel(view: PasteView, act: PasteActions): HTMLElement {
  if (!view.open) {
    return h("div", { class: "rc-paste rc-paste-closed" },
      h("button", { class: "btn small", text: "Paste a question", title: "Paste question text or a screenshot", "aria-expanded": "false", onclick: act.toggle }),
      renderPasteStatus(view.status, act));
  }
  const busy = view.status.kind === "working";
  const hover = (e: Event) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement | null)?.classList.add("rc-paste-drop-over");
  };
  const leave = (e: Event) => {
    const el = e.currentTarget as HTMLElement | null;
    const to = (e as DragEvent).relatedTarget as Node | null;
    if (el && to && el.contains(to)) return;
    el?.classList.remove("rc-paste-drop-over");
  };
  return h("section", { class: "card rc-paste", "aria-label": "Paste a question" },
    h("div", { class: "row between" },
      h("strong", { text: "Paste a question" }),
      h("button", { class: "btn link small", text: "Close", "aria-expanded": "true", onclick: act.toggle })),
    h("textarea", {
      id: PASTE_TEXTAREA_ID,
      class: "input rc-paste-text",
      rows: "7",
      placeholder: "Paste the passage, the question and the answer choices.",
      "aria-label": "Question text",
      value: view.draft,
      disabled: busy,
      oninput: (e: Event) => act.draft((e.target as HTMLTextAreaElement).value),
      onkeydown: (e: Event) => {
        const k = e as KeyboardEvent;
        if (k.key === "Enter" && (k.metaKey || k.ctrlKey)) {
          k.preventDefault();
          act.explainText();
        }
      },
      onpaste: (e: Event) => {
        // A screenshot on the clipboard (and no text): explain the image.
        const data = (e as ClipboardEvent).clipboardData;
        if (!data || data.getData("text/plain").trim()) return;
        const files = Array.from(data.files);
        if (files.some((f) => isAcceptedImage(f))) {
          e.preventDefault();
          act.files(files);
        }
      },
    }),
    h("div", { class: "row rc-wrap" },
      h("button", { class: "btn primary small", text: "Explain pasted text", disabled: busy, onclick: act.explainText }),
      h("span", { class: "small muted", text: "Include all four answer choices." })),
    h("div", {
      class: "rc-paste-drop",
      ondragenter: hover,
      ondragover: hover,
      ondragleave: leave,
      ondrop: (e: Event) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement | null)?.classList.remove("rc-paste-drop-over");
        if (!busy) act.files((e as DragEvent).dataTransfer?.files);
      },
    },
      h("span", { class: "small", text: "Or drop a screenshot here (PNG or JPEG)." }),
      h("label", { class: "btn small rc-paste-pick" },
        h("span", { text: "Choose a file" }),
        // No id on purpose: render() copies values of inputs with ids, and a file input can't take one.
        h("input", {
          type: "file",
          accept: "image/png,image/jpeg",
          class: "rc-visually-hidden",
          disabled: busy,
          onchange: (e: Event) => {
            const input = e.target as HTMLInputElement;
            const files = input.files ? Array.from(input.files) : [];
            input.value = "";
            act.files(files);
          },
        }))),
    renderPasteStatus(view.status, act));
}

// ---------------------------------------------------------------- controller

export function createPastePanel(host: CaptureHost) {
  let open = false;
  let draft = "";
  let status: PasteStatus = { kind: "idle" };
  const set = (next: PasteStatus) => {
    status = next;
    host.rerender();
  };

  /** The textarea is the source of truth while it's on screen. */
  const liveDraft = (): string => {
    const el = typeof document !== "undefined" ? document.getElementById(PASTE_TEXTAREA_ID) : null;
    if (el && "value" in el) draft = String((el as HTMLTextAreaElement).value);
    return draft;
  };

  async function send(what: "text" | "image", make: () => Promise<string>): Promise<void> {
    if (status.kind === "working") return;
    set({ kind: "working", what });
    try {
      await host.processImage(await make());
      // The question is on screen now. Closing the panel also clears the textarea.
      draft = "";
      open = false;
      set({ kind: "idle" });
    } catch (error) {
      set({ kind: "notice", tone: "danger", text: describeError(host, error) });
    }
  }

  function explainText(force = false): Promise<void> {
    if (status.kind === "working") return Promise.resolve();
    const check = checkQuestionText(normalizePastedText(liveDraft()), "paste");
    if (!check.ok) {
      set({ kind: "notice", tone: "warn", text: check.message });
      return Promise.resolve();
    }
    if (!force && !looksLikeQuestion(check.text)) {
      set({ kind: "confirm", text: check.text });
      return Promise.resolve();
    }
    const text = check.text;
    return send("text", () => questionTextToImage(text));
  }

  function explainFiles(files: ArrayLike<File> | null | undefined): Promise<void> {
    if (status.kind === "working") return Promise.resolve();
    const list = files ? Array.from(files) : [];
    const file = list.find((f) => isAcceptedImage(f)) ?? list[0];
    if (!file) return Promise.resolve();
    const problem = checkImageFile(file);
    if (problem) {
      set({ kind: "notice", tone: "warn", text: problem });
      return Promise.resolve();
    }
    return send("image", () => imageFileToDataUrl(file));
  }

  const actions: PasteActions = {
    toggle: () => {
      liveDraft();
      open = !open;
      if (!open && status.kind !== "working") status = { kind: "idle" };
      host.rerender();
      if (open && typeof document !== "undefined") document.getElementById(PASTE_TEXTAREA_ID)?.focus();
    },
    draft: (text) => {
      draft = text;
    },
    explainText: () => void explainText(),
    explainAnyway: () => {
      if (status.kind !== "confirm") return;
      const text = status.text;
      void send("text", () => questionTextToImage(text));
    },
    dismiss: () => set({ kind: "idle" }),
    files: (files) => void explainFiles(files),
  };

  return {
    render: (): HTMLElement => renderPastePanel({ open, draft, status }, actions),
    open: (): void => {
      if (!open) actions.toggle();
    },
    close: (): void => {
      if (open) actions.toggle();
    },
    isOpen: () => open,
    status: () => status,
    /** Explain the current draft. force skips the "doesn't look like a question" check. */
    explainText,
    explainFiles,
  };
}
