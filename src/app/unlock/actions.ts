"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { env, ownerUserId } from "@/lib/env";
import { passcodeMatches } from "@/lib/auth/passcode";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/token";
import { countUnlockAttempts, recordUnlockAttempt } from "@/db/queries";

export interface UnlockState {
  error?: string;
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function unlock(_prev: UnlockState | null, formData: FormData): Promise<UnlockState> {
  const passcode = String(formData.get("passcode") ?? "");
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";

  let recent = 0;
  try {
    recent = await countUnlockAttempts(ip, new Date(Date.now() - WINDOW_MS));
  } catch (error) {
    console.error("[unlock] rate limit lookup failed", error);
  }
  if (recent >= MAX_ATTEMPTS) {
    return { error: "Too many tries. Wait 15 minutes and try again." };
  }

  const expected = env("APP_PASSCODE");
  if (!expected) return { error: "The server has no APP_PASSCODE set." };

  if (!passcode || !passcodeMatches(passcode, expected)) {
    try {
      await recordUnlockAttempt(ip);
    } catch (error) {
      console.error("[unlock] could not record attempt", error);
    }
    return { error: "That passcode is not right." };
  }

  const token = await createSessionToken(ownerUserId());
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());
  redirect("/");
}
