import { APICallError, RetryError } from "ai";
import { ZodError } from "zod";
import { requireSession, UnauthorizedError, unauthorizedResponse } from "@/lib/auth/session";
import { RateLimitError } from "@/lib/auth/limit";
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
    if (error instanceof RateLimitError) return json({ error: error.message, code: error.status === 429 ? "rate_limited" : "unavailable" }, { status: error.status });
    const upstream = RetryError.isInstance(error) ? error.lastError : error;
    if (APICallError.isInstance(upstream)) {
      // Every provider refused. Say so with the status, never the provider's body (it can carry account details).
      console.error("[api] ai upstream", upstream.statusCode, upstream.message.slice(0, 400));
      const status = upstream.statusCode;
      const why = status === 429 || status === 402 ? "The AI service is over its limit right now." : "The AI service is unavailable right now.";
      return json({ error: `${why} Try again in a minute.${status ? ` (${status})` : ""}`, code: "ai_unavailable" }, { status: 502 });
    }
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      console.error("[api] timed out", name);
      return json({ error: "The AI service took too long. Try again.", code: "timeout" }, { status: 504 });
    }
    // Postgres puts the SQLSTATE on error.code (postgres.js and PGlite alike); say what kind of refusal it was, never the detail.
    const sqlState = (error as { code?: unknown })?.code;
    if (sqlState === "23514") return json({ error: "Invalid data", code: "constraint" }, { status: 400 });
    if (sqlState === "23505") return json({ error: "Already exists", code: "conflict" }, { status: 409 });
    // Unknown errors are logged in full but never echoed: upstream and database messages can carry internals.
    console.error("[api]", error);
    return json({ error: "Something went wrong on the server. Try again in a moment.", code: "internal" }, { status: 500 });
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
