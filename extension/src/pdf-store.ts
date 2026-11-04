// Keeps the opened Question Bank PDF for the rest of this browser session, so closing and reopening the
// side panel does not mean picking the file again. chrome.storage.session lives in memory only: it is
// gone when the browser closes, is never synced, and content scripts cannot read it. Sign-out clears it.
import type { LoadedPdf } from "./pdf";

const KEY = "rc.pdf.v1";
/** chrome.storage.session holds 10 MB in total; leave room for everything else in it. */
const MAX_STORED_BYTES = 6 * 1024 * 1024;

interface StoredPdf {
  pdf: LoadedPdf;
  /** Base64 of the PDF, or null when it was too big to keep (Math pages then need the file again). */
  data: string | null;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(data: string): ArrayBuffer {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function storePdf(pdf: LoadedPdf, buffer: ArrayBuffer): Promise<void> {
  const data = buffer.byteLength <= MAX_STORED_BYTES ? toBase64(buffer) : null;
  const value: StoredPdf = { pdf, data };
  try {
    await chrome.storage.session.set({ [KEY]: value });
  } catch {
    // Over the session quota: keep the question list, drop the bytes.
    await chrome.storage.session.set({ [KEY]: { pdf, data: null } satisfies StoredPdf });
  }
}

export async function loadStoredPdf(): Promise<{ pdf: LoadedPdf; bytes: ArrayBuffer | null } | null> {
  const got = (await chrome.storage.session.get(KEY)) as Record<string, StoredPdf | undefined>;
  const stored = got[KEY];
  if (!stored?.pdf || !Array.isArray(stored.pdf.questions)) return null;
  return { pdf: stored.pdf, bytes: typeof stored.data === "string" ? fromBase64(stored.data) : null };
}

export async function clearStoredPdf(): Promise<void> {
  await chrome.storage.session.remove(KEY);
}
