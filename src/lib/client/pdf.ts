"use client";

import type { PdfParseResult } from "@/lib/questions/pdf-parse";
import type { PdfWorkerResponse } from "@/workers/pdf.worker";
import { downscaleCanvas } from "./image";

export async function parsePdfFile(file: File): Promise<{ result: PdfParseResult; totalPages: number }> {
  const buffer = await file.arrayBuffer();
  try {
    return await parseInWorker(buffer.slice(0));
  } catch (error) {
    console.warn("[pdf] worker failed, parsing on the main thread:", error instanceof Error ? error.message : error);
    return parseOnMainThread(buffer);
  }
}

function parseInWorker(buffer: ArrayBuffer): Promise<{ result: PdfParseResult; totalPages: number }> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("../../workers/pdf.worker.ts", import.meta.url), { type: "module" });
    } catch (error) {
      reject(error);
      return;
    }
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("PDF parsing timed out"));
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
      reject(new Error(event.message || "PDF worker error"));
    };
    worker.postMessage({ buffer }, [buffer]);
  });
}

async function parseOnMainThread(buffer: ArrayBuffer): Promise<{ result: PdfParseResult; totalPages: number }> {
  const [{ extractTextItems, getDocumentProxy }, { parsePdfPages }] = await Promise.all([import("unpdf"), import("@/lib/questions/pdf-parse")]);
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, items } = await extractTextItems(pdf);
  const pages = items.map((pageItems, index) => ({
    page: index + 1,
    items: pageItems.map((it) => ({ str: it.str, x: it.x, y: it.y, width: it.width, height: it.height })),
  }));
  return { result: parsePdfPages(pages), totalPages };
}

/** Rasterize one PDF page to a downscaled data URL for the vision extractor. */
export async function renderPdfPage(file: File, pageNumber: number): Promise<string> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 2.5 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas not available");
  await page.render({ canvasContext: context, viewport, canvas }).promise;
  return downscaleCanvas(canvas);
}

/**
 * Rasterize a question's pages (at most two) stacked top to bottom into one data URL, so a Math
 * question that runs onto a second page reaches the vision extractor whole, answer panel included.
 */
export async function renderPdfPages(file: File, pageNumbers: number[]): Promise<string> {
  const pages = [...new Set(pageNumbers)].filter((n) => n > 0).slice(0, 2);
  if (pages.length <= 1) return renderPdfPage(file, pages[0] ?? 1);
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const canvases: HTMLCanvasElement[] = [];
  for (const n of pages) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas not available");
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    canvases.push(canvas);
  }
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
