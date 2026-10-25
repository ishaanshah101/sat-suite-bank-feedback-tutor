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
