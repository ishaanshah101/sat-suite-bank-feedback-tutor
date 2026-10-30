"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn, signUp } from "@/lib/auth/accounts";
import { clientIp } from "@/lib/auth/limit";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/token";

export interface AuthFormState {
  error?: string;
  email?: string;
}

export async function authenticate(_prev: AuthFormState | null, formData: FormData): Promise<AuthFormState> {
  const mode = formData.get("mode") === "signup" ? "signup" : "signin";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const ip = clientIp(await headers());
  const result =
    mode === "signup"
      ? await signUp(ip, { email, password, passcode: String(formData.get("passcode") ?? "") })
      : await signIn(ip, { email, password });
  if (!result.ok) return { error: result.error, email };
  (await cookies()).set(SESSION_COOKIE, result.token, sessionCookieOptions());
  redirect("/");
}
