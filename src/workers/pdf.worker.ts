/// <reference lib="webworker" />
import { extractTextItems, getDocumentProxy } from "unpdf";
import { parsePdfPages, type PageItems } from "@/lib/questions/pdf-parse";

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
    const { totalPages, items } = await extractTextItems(pdf);
    const pages: PageItems[] = items.map((pageItems, index) => ({
      page: index + 1,
      items: pageItems.map((it) => ({ str: it.str, x: it.x, y: it.y, width: it.width, height: it.height })),
    }));
    const result = parsePdfPages(pages);
    const response: PdfWorkerResponse = { ok: true, totalPages, result };
    self.postMessage(response);
  } catch (error) {
    const response: PdfWorkerResponse = { ok: false, error: error instanceof Error ? error.message : String(error) };
    self.postMessage(response);
  }
};
