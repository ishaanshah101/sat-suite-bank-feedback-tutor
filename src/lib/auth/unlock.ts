import "server-only";
import { env, ownerUserId } from "@/lib/env";
import { passcodeMatches } from "./passcode";
import { createSessionToken, SESSION_MAX_AGE_SECONDS } from "./token";
import { countUnlockAttempts, recordUnlockAttempt } from "@/db/queries";

export const UNLOCK_WINDOW_MS = 15 * 60 * 1000;
export const UNLOCK_MAX_ATTEMPTS = 5;

export type UnlockResult =
  | { ok: true; token: string; expiresIn: number }
  | { ok: false; status: 401 | 429 | 500; error: string };

export function clientIp(headers: Headers): string {
  return (headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || headers.get("x-real-ip") || "unknown";
}

/** Rate-limited passcode check shared by the unlock page and the extension token endpoint. */
export async function attemptUnlock(ip: string, passcode: string): Promise<UnlockResult> {
  let recent = 0;
  try {
    recent = await countUnlockAttempts(ip, new Date(Date.now() - UNLOCK_WINDOW_MS));
  } catch (error) {
    console.error("[unlock] rate limit lookup failed", error);
  }
  if (recent >= UNLOCK_MAX_ATTEMPTS) {
    return { ok: false, status: 429, error: "Too many tries. Wait 15 minutes and try again." };
  }

  const expected = env("APP_PASSCODE");
  if (!expected) return { ok: false, status: 500, error: "The server has no APP_PASSCODE set." };

  if (!passcode || !passcodeMatches(passcode, expected)) {
    try {
      await recordUnlockAttempt(ip);
    } catch (error) {
      console.error("[unlock] could not record attempt", error);
    }
    return { ok: false, status: 401, error: "That passcode is not right." };
  }

  return { ok: true, token: await createSessionToken(ownerUserId()), expiresIn: SESSION_MAX_AGE_SECONDS };
}
