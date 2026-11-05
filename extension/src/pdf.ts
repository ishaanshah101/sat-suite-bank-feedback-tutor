// Read a SAT Suite Question Bank PDF export inside the side panel. Nothing leaves the device until the
// student picks a question: the PDF is parsed here with the same parser the web app uses, and only the
// chosen question is sent to the server. No tab access, no screenshots, no extra permissions.
import { extractTextItems, getDocumentProxy } from "unpdf";
import { MAX_PDF_PAGES, pagesFromTextItems, parsePdfPages, type ParsedPdfQuestion } from "../../src/lib/questions/pdf-parse";
import { downscale } from "./image";

/** A Question Bank export is a few MB at most; refuse anything far bigger before reading it. */
export const MAX_PDF_BYTES = 40 * 1024 * 1024;

export interface LoadedPdf {
  name: string;
  totalPages: number;
  questions: ParsedPdfQuestion[];
  warnings: string[];
}

/** Why a file cannot be a Question Bank export, or null when it might be. */
export function checkPdfFile(file: { name: string; type: string; size: number }): string | null {
  const looksPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!looksPdf) return "That is not a PDF. Export your questions from the SAT Suite Question Bank as a PDF, then open that file.";
  if (file.size === 0) return "That PDF is empty.";
  if (file.size > MAX_PDF_BYTES) return "That PDF is too large for a Question Bank export. Export fewer questions and try again.";
  return null;
}

/** pdf.js needs its own copy of the bytes: it detaches the buffer it is given. */
function bytesOf(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer.slice(0));
}

export async function parseQuestionBankPdf(name: string, buffer: ArrayBuffer): Promise<LoadedPdf> {
  const pdf = await getDocumentProxy(bytesOf(buffer));
  try {
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`This PDF has ${pdf.numPages} pages; the limit is ${MAX_PDF_PAGES}. Export fewer questions and try again.`);
    const { totalPages, items } = await extractTextItems(pdf);
    const result = parsePdfPages(pagesFromTextItems(items));
    return { name, totalPages, questions: result.questions, warnings: result.warnings };
  } finally {
    void pdf.cleanup().catch(() => undefined);
  }
}

/**
 * Math loses its fractions and exponents in the PDF text layer, so those pages are read as a picture.
 * So is a Reading and Writing question whose text came out incomplete. A question exported without its
 * answer key is complete text: it goes as text, and the card explains it simply.
 */
export function needsVision(q: ParsedPdfQuestion): boolean {
  if (q.needsVision || q.section === "math") return true;
  if (!q.stem) return true;
  return q.format !== "spr" && (!q.choices || (["A", "B", "C", "D"] as const).some((l) => !q.choices?.[l]));
}

/** The fields /api/questions accepts, without the parser's bookkeeping. */
export function importPayload(q: ParsedPdfQuestion) {
  return {
    qb_id: q.qb_id,
    section: q.section ?? "rw",
    format: q.format ?? "mcq",
    test: q.test,
    domain: q.domain,
    skill: q.skill,
    difficulty: q.difficulty,
    passage: q.passage,
    stem: q.stem,
    choices: q.choices,
    correct: q.correct,
    answers: q.answers ?? null,
    figure: q.figure ?? null,
    rationale: q.rationale,
  };
}

/** Longest canvas edge we rasterize; browsers cap canvases well before memory runs out. */
const MAX_CANVAS_EDGE = 4000;

/**
 * Draw a question's pages (at most two, stacked) to one image for the vision reader, so a Math question
 * that runs onto a second page arrives whole, answer and rationale included.
 */
export async function renderQuestionPages(buffer: ArrayBuffer, pageNumbers: number[]): Promise<string> {
  const pages = [...new Set(pageNumbers)].filter((n) => Number.isInteger(n) && n > 0).slice(0, 2);
  if (!pages.length) pages.push(1);
  const pdf = await getDocumentProxy(bytesOf(buffer));
  try {
    const canvases: HTMLCanvasElement[] = [];
    for (const n of pages) {
      if (n > pdf.numPages) continue;
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(pages.length > 1 ? 2 : 2.5, MAX_CANVAS_EDGE / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas not available");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      canvases.push(canvas);
    }
    if (!canvases.length) throw new Error("That page is not in this PDF.");
    const out = document.createElement("canvas");
    out.width = Math.max(...canvases.map((c) => c.width));
    out.height = canvases.reduce((sum, c) => sum + c.height, 0);
    const context = out.getContext("2d");
    if (!context) throw new Error("Canvas not available");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, out.width, out.height);
    let y = 0;
    for (const c of canvases) {
      context.drawImage(c, 0, y);
      y += c.height;
    }
    // Two pages are twice as tall, so allow a longer edge to keep equations legible.
    return downscale(out.toDataURL("image/png"), canvases.length > 1 ? 2400 : undefined);
  } finally {
    void pdf.cleanup().catch(() => undefined);
  }
}

/** A short label for the list: "22a41819 · Words in Context · Hard". */
export function questionLabel(q: ParsedPdfQuestion, index: number): string {
  const parts = [q.qb_id ?? `Question ${index + 1}`, q.skill ?? q.domain ?? null, q.difficulty ?? null].filter(Boolean);
  return parts.join(" · ");
}

/** Whether the export included the answer key for this question. */
export function hasAnswer(q: ParsedPdfQuestion): boolean {
  return q.format === "spr" ? Boolean(q.answers?.length) : Boolean(q.correct);
}

/** Questions whose id, skill or text contain every word typed in the filter box. */
export function filterQuestions(questions: ParsedPdfQuestion[], query: string): number[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const out: number[] = [];
  questions.forEach((q, i) => {
    const hay = [q.qb_id, q.skill, q.domain, q.difficulty, q.stem].filter(Boolean).join(" ").toLowerCase();
    if (words.every((w) => hay.includes(w))) out.push(i);
  });
  return out;
}
