"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/token";
import { attemptUnlock, clientIp } from "@/lib/auth/unlock";

export interface UnlockState {
  error?: string;
}

export async function unlock(_prev: UnlockState | null, formData: FormData): Promise<UnlockState> {
  const passcode = String(formData.get("passcode") ?? "");
  const result = await attemptUnlock(clientIp(await headers()), passcode);
  if (!result.ok) return { error: result.error };
  (await cookies()).set(SESSION_COOKIE, result.token, sessionCookieOptions());
  redirect("/");
}
