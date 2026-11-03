import "server-only";
import { clearUnlockAttempts, countUnlockAttempts, deleteUnlockAttempt, recordUnlockAttempt } from "@/db/queries";
import { env } from "@/lib/env";

/**
 * The caller's address for rate limiting. On Vercel the platform rewrites these headers from the real
 * connection, so they can be trusted; elsewhere a client could forge x-forwarded-for, so set RULECARD_TRUST_PROXY=1
 * only behind a proxy that overwrites it, otherwise every caller shares one bucket.
 */
export function clientIp(headers: Headers): string {
  const trusted = env("VERCEL") === "1" || env("RULECARD_TRUST_PROXY") === "1";
  if (!trusted) return "untrusted-network";
  const vercel = headers.get("x-vercel-forwarded-for")?.split(",")[0].trim();
  return vercel || (headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || headers.get("x-real-ip") || "unknown";
}

export class RateLimitError extends Error {
  constructor(
    public status: 429 | 503,
    message: string,
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Count one try against `key` (an action plus the client address) and refuse past `max` in the window.
 * A caller already over the limit is refused before anything is written (so hammering adds no rows); near
 * the limit the try is recorded before it is counted, so parallel tries cannot slip past. The check refuses
 * (rather than skipping the limit) when the database is unavailable. Returns the recorded try's id so a
 * success can be forgiven with `forgiveAttempt`.
 */
export async function takeAttempt(key: string, max: number, windowMs: number, tooMany: string): Promise<string> {
  let id: string;
  let recent: number;
  try {
    const since = new Date(Date.now() - windowMs);
    if ((await countUnlockAttempts(key, since)) >= max) throw new RateLimitError(429, tooMany);
    id = await recordUnlockAttempt(key);
    recent = await countUnlockAttempts(key, since);
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    console.error("[limit] attempt limit unavailable", error);
    throw new RateLimitError(503, "Cannot sign in right now (database unavailable). Try again in a minute.");
  }
  if (recent > max) throw new RateLimitError(429, tooMany);
  return id;
}

/** A try that turned out fine (right password) should not use up the address's budget. */
export async function forgiveAttempt(id: string): Promise<void> {
  await deleteUnlockAttempt(id).catch(() => undefined);
}

export async function clearAttempts(key: string): Promise<void> {
  await clearUnlockAttempts(key).catch(() => undefined);
}
