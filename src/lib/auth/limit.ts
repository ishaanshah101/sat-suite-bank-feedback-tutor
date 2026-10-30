import "server-only";
import { clearUnlockAttempts, countUnlockAttempts, recordUnlockAttempt } from "@/db/queries";

export function clientIp(headers: Headers): string {
  return (headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || headers.get("x-real-ip") || "unknown";
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
 * The try is recorded before it is counted, so parallel tries cannot slip past the limit, and the check
 * refuses (rather than skipping the limit) when the database is unavailable.
 */
export async function takeAttempt(key: string, max: number, windowMs: number, tooMany: string): Promise<void> {
  let recent: number;
  try {
    await recordUnlockAttempt(key);
    recent = await countUnlockAttempts(key, new Date(Date.now() - windowMs));
  } catch (error) {
    console.error("[limit] attempt limit unavailable", error);
    throw new RateLimitError(503, "Cannot sign in right now (database unavailable). Try again in a minute.");
  }
  if (recent > max) throw new RateLimitError(429, tooMany);
}

export async function clearAttempts(key: string): Promise<void> {
  await clearUnlockAttempts(key).catch(() => undefined);
}
