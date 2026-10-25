import { createHmac } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env, requireEnv } from "@/lib/env";

export const SESSION_COOKIE = "rulecard_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function secretKey(): Uint8Array {
  return new TextEncoder().encode(requireEnv("SESSION_SECRET"));
}

export interface Session {
  userId: string;
}

/** A short digest of the current passcode. Tokens carry it, so changing APP_PASSCODE signs every session out. */
export function passcodeVersion(): string {
  return createHmac("sha256", requireEnv("SESSION_SECRET"))
    .update(env("APP_PASSCODE") ?? "")
    .digest("hex")
    .slice(0, 16);
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ pv: passcodeVersion() })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
    if (payload.pv !== passcodeVersion()) return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/** The token from an `Authorization: Bearer ...` header, used by the browser extension. */
export function bearerToken(headers: Headers): string | null {
  const value = headers.get("authorization");
  if (!value) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(value.trim());
  return match ? match[1] : null;
}
