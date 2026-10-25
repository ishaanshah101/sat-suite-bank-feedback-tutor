import "server-only";
import { env, ownerUserId } from "@/lib/env";
import { passcodeMatches } from "./passcode";
import { createSessionToken, SESSION_MAX_AGE_SECONDS } from "./token";
import { clearUnlockAttempts, countUnlockAttempts, recordUnlockAttempt } from "@/db/queries";

export const UNLOCK_WINDOW_MS = 15 * 60 * 1000;
export const UNLOCK_MAX_ATTEMPTS = 5;

export type UnlockResult =
  | { ok: true; token: string; expiresIn: number }
  | { ok: false; status: 401 | 429 | 500 | 503; error: string };

export function clientIp(headers: Headers): string {
  return (headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || headers.get("x-real-ip") || "unknown";
}

/**
 * Passcode check shared by the unlock page and the extension token endpoint.
 * Every try is recorded before it is counted, so parallel tries cannot slip past the limit,
 * and the check refuses (rather than skipping the limit) when the database is unavailable.
 * A correct passcode clears the counter for that address.
 */
export async function attemptUnlock(ip: string, passcode: string): Promise<UnlockResult> {
  const expected = env("APP_PASSCODE");
  if (!expected) return { ok: false, status: 500, error: "The server has no APP_PASSCODE set." };

  let recent: number;
  try {
    await recordUnlockAttempt(ip);
    recent = await countUnlockAttempts(ip, new Date(Date.now() - UNLOCK_WINDOW_MS));
  } catch (error) {
    console.error("[unlock] attempt limit unavailable", error);
    return { ok: false, status: 503, error: "Cannot check the passcode right now (database unavailable). Try again in a minute." };
  }
  if (recent > UNLOCK_MAX_ATTEMPTS) {
    return { ok: false, status: 429, error: "Too many tries. Wait 15 minutes and try again." };
  }
  if (!passcode || !passcodeMatches(passcode, expected)) {
    return { ok: false, status: 401, error: "That passcode is not right." };
  }
  await clearUnlockAttempts(ip).catch(() => undefined);
  return { ok: true, token: await createSessionToken(ownerUserId()), expiresIn: SESSION_MAX_AGE_SECONDS };
}
