import { ZodError } from "zod";
import { requireSession, UnauthorizedError, unauthorizedResponse } from "@/lib/auth/session";
import type { Session } from "@/lib/auth/token";
import { NoProviderError } from "@/lib/ai/providers";
import { ExtractionError } from "@/lib/ai/extract";
import { NeedsAnswerError } from "@/lib/ai/explain";
import { QuotaError } from "@/lib/ai/quota";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, { ...init, headers: { "cache-control": "no-store", ...(init?.headers ?? {}) } });
}

export async function withApi(handler: (session: Session) => Promise<Response>): Promise<Response> {
  try {
    const session = await requireSession();
    return await handler(session);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    if (error instanceof HttpError) return json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof ZodError) return json({ error: "Invalid request", issues: error.issues }, { status: 400 });
    if (error instanceof NoProviderError) return json({ error: error.message, code: "no_provider" }, { status: 503 });
    if (error instanceof ExtractionError) return json({ error: error.message, code: "extraction_failed" }, { status: 422 });
    if (error instanceof QuotaError) return json({ error: error.message, code: "daily_limit" }, { status: 429 });
    if (error instanceof NeedsAnswerError) return json({ error: error.message, code: "needs_answer" }, { status: 409 });
    console.error("[api]", error);
    const message = error instanceof Error ? error.message : "Something went wrong";
    return json({ error: message }, { status: 500 });
  }
}

export async function readJson<T>(request: Request, maxBytes = 8 * 1024 * 1024): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new HttpError(413, "Request body too large");
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "Request body too large");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
}
