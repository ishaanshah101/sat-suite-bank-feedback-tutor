"use client";

import type { PdfParseResult } from "@/lib/questions/pdf-parse";
import type { PdfWorkerResponse } from "@/workers/pdf.worker";
import { downscaleCanvas } from "./image";

type PdfDocument = Awaited<ReturnType<(typeof import("unpdf"))["getDocumentProxy"]>>;
type PdfPage = Awaited<ReturnType<PdfDocument["getPage"]>>;

/** Longest canvas edge we rasterize; browsers cap canvases well before memory runs out. */
const MAX_CANVAS_EDGE = 4000;

/** The worker could not be constructed or its script failed to load. */
class WorkerUnavailable extends Error {}

export async function parsePdfFile(file: File): Promise<{ result: PdfParseResult; totalPages: number }> {
  try {
    return await parseInWorker(await file.arrayBuffer());
  } catch (error) {
    // Only a missing worker falls back; a timeout or a parse error (too many pages) surfaces as is.
    if (!(error instanceof WorkerUnavailable)) throw error;
    console.warn("[pdf] worker unavailable, parsing on the main thread:", error.message);
    return parseOnMainThread(await file.arrayBuffer());
  }
}

function parseInWorker(buffer: ArrayBuffer): Promise<{ result: PdfParseResult; totalPages: number }> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("../../workers/pdf.worker.ts", import.meta.url), { type: "module" });
    } catch (error) {
      reject(new WorkerUnavailable(error instanceof Error ? error.message : String(error)));
      return;
    }
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("PDF parsing timed out. Try a smaller export."));
    }, 120_000);
    worker.onmessage = (event: MessageEvent<PdfWorkerResponse>) => {
      if (typeof event.data?.ok !== "boolean") return; // ignore runtime chatter
      clearTimeout(timer);
      worker.terminate();
      if (event.data.ok && event.data.result) resolve({ result: event.data.result, totalPages: event.data.totalPages ?? 0 });
      else reject(new Error(event.data.error ?? "PDF parsing failed"));
    };
    worker.onerror = (event) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new WorkerUnavailable(event.message || "PDF worker failed to load"));
    };
    worker.postMessage({ buffer }, [buffer]);
  });
}

async function parseOnMainThread(buffer: ArrayBuffer): Promise<{ result: PdfParseResult; totalPages: number }> {
  const [{ extractTextItems, getDocumentProxy }, { MAX_PDF_PAGES, pagesFromTextItems, parsePdfPages }] = await Promise.all([
    import("unpdf"),
    import("@/lib/questions/pdf-parse"),
  ]);
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`This PDF has ${pdf.numPages} pages; the limit is ${MAX_PDF_PAGES}. Export fewer questions and try again.`);
  const { totalPages, items } = await extractTextItems(pdf);
  return { result: parsePdfPages(pagesFromTextItems(items)), totalPages };
}

/** One parsed document per file, so rendering several pages of an import does not re-read the PDF. */
const documents = new WeakMap<File, Promise<PdfDocument>>();

function documentFor(file: File): Promise<PdfDocument> {
  let doc = documents.get(file);
  if (!doc) {
    doc = (async () => {
      const { getDocumentProxy } = await import("unpdf");
      return getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    })();
    doc.catch(() => documents.delete(file));
    documents.set(file, doc);
  }
  return doc;
}

async function renderPageToCanvas(page: PdfPage, scale: number): Promise<HTMLCanvasElement> {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(scale, MAX_CANVAS_EDGE / Math.max(base.width, base.height)) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas not available");
  await page.render({ canvasContext: context, viewport, canvas }).promise;
  return canvas;
}

/** Rasterize one PDF page to a downscaled data URL for the vision extractor. */
export async function renderPdfPage(file: File, pageNumber: number): Promise<string> {
  const pdf = await documentFor(file);
  const canvas = await renderPageToCanvas(await pdf.getPage(pageNumber), 2.5);
  return downscaleCanvas(canvas);
}

/**
 * Rasterize a question's pages (at most two) stacked top to bottom into one data URL, so a Math
 * question that runs onto a second page reaches the vision extractor whole, answer panel included.
 */
export async function renderPdfPages(file: File, pageNumbers: number[]): Promise<string> {
  const pages = [...new Set(pageNumbers)].filter((n) => n > 0).slice(0, 2);
  if (pages.length <= 1) return renderPdfPage(file, pages[0] ?? 1);
  const pdf = await documentFor(file);
  const canvases: HTMLCanvasElement[] = [];
  for (const n of pages) canvases.push(await renderPageToCanvas(await pdf.getPage(n), 2));
  const stacked = document.createElement("canvas");
  stacked.width = Math.max(...canvases.map((c) => c.width));
  stacked.height = canvases.reduce((sum, c) => sum + c.height, 0);
  const context = stacked.getContext("2d");
  if (!context) throw new Error("Canvas not available");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, stacked.width, stacked.height);
  let y = 0;
  for (const c of canvases) {
    context.drawImage(c, 0, y);
    y += c.height;
  }
  // Two pages are twice as tall, so allow a longer edge to keep equations legible.
  return downscaleCanvas(stacked, 2400);
}
