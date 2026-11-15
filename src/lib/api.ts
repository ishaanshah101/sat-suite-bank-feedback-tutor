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

/** Map a thrown error to the status and JSON body the API answers with. Unknown errors are logged, never echoed. */
export function apiErrorPayload(error: unknown): { status: number; body: { error: string; code?: string; issues?: unknown } } {
  if (error instanceof UnauthorizedError) return { status: 401, body: { error: "Sign in again.", code: "unauthorized" } };
  if (error instanceof HttpError) return { status: error.status, body: { error: error.message, code: error.code } };
  if (error instanceof ZodError) return { status: 400, body: { error: "Invalid request", issues: error.issues } };
  if (error instanceof NoProviderError) return { status: 503, body: { error: error.message, code: "no_provider" } };
  if (error instanceof ExtractionError) return { status: 422, body: { error: error.message, code: "extraction_failed" } };
  if (error instanceof QuotaError) return { status: 429, body: { error: error.message, code: "daily_limit" } };
  if (error instanceof NeedsAnswerError) return { status: 409, body: { error: error.message, code: "needs_answer" } };
  if (error instanceof RateLimitError) return { status: error.status, body: { error: error.message, code: error.status === 429 ? "rate_limited" : "unavailable" } };
  const upstream = RetryError.isInstance(error) ? error.lastError : error;
  if (APICallError.isInstance(upstream)) {
    // Every provider refused. Say so with the status, never the provider's body (it can carry account details).
    console.error("[api] ai upstream", upstream.statusCode, upstream.message.slice(0, 400));
    const status = upstream.statusCode;
    const why = status === 429 || status === 402 ? "The AI service is over its limit right now." : "The AI service is unavailable right now.";
    return { status: 502, body: { error: `${why} Try again in a minute.${status ? ` (${status})` : ""}`, code: "ai_unavailable" } };
  }
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    console.error("[api] timed out", name);
    return { status: 504, body: { error: "The AI service took too long. Try again.", code: "timeout" } };
  }
  // Postgres puts the SQLSTATE on error.code (postgres.js and PGlite alike); say what kind of refusal it was, never the detail.
  const sqlState = (error as { code?: unknown })?.code;
  if (sqlState === "23514") return { status: 400, body: { error: "Invalid data", code: "constraint" } };
  if (sqlState === "23505") return { status: 409, body: { error: "Already exists", code: "conflict" } };
  console.error("[api]", error);
  return { status: 500, body: { error: "Something went wrong on the server. Try again in a moment.", code: "internal" } };
}

export async function withApi(handler: (session: Session) => Promise<Response>): Promise<Response> {
  try {
    const session = await requireSession();
    return await handler(session);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    const { status, body } = apiErrorPayload(error);
    return json(body, { status });
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
