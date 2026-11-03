/// <reference lib="webworker" />
import { extractTextItems, getDocumentProxy } from "unpdf";
import { MAX_PDF_PAGES, pagesFromTextItems, parsePdfPages } from "@/lib/questions/pdf-parse";

export interface PdfWorkerRequest {
  buffer: ArrayBuffer;
}

export interface PdfWorkerResponse {
  ok: boolean;
  totalPages?: number;
  result?: ReturnType<typeof parsePdfPages>;
  error?: string;
}

self.onmessage = async (event: MessageEvent<PdfWorkerRequest>) => {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(event.data.buffer));
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`This PDF has ${pdf.numPages} pages; the limit is ${MAX_PDF_PAGES}. Export fewer questions and try again.`);
    const { totalPages, items } = await extractTextItems(pdf);
    const result = parsePdfPages(pagesFromTextItems(items));
    const response: PdfWorkerResponse = { ok: true, totalPages, result };
    self.postMessage(response);
  } catch (error) {
    const response: PdfWorkerResponse = { ok: false, error: error instanceof Error ? error.message : String(error) };
    self.postMessage(response);
  }
};
