import { SignJWT, jwtVerify } from "jose";
import { requireEnv } from "@/lib/env";

export const SESSION_COOKIE = "rulecard_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function secretKey(): Uint8Array {
  return new TextEncoder().encode(requireEnv("SESSION_SECRET"));
}

export interface Session {
  userId: string;
}

/** Marks tokens issued to accounts. Tokens from the old single-passcode gate lack it and stop working. */
const TOKEN_KIND = "account";

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ kind: TOKEN_KIND })
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
    if (payload.kind !== TOKEN_KIND) return null;
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

const HANDOFF_KIND = "handoff";
export const HANDOFF_SECONDS = 60;

/** A one-minute code that opens the web app as the same account (the extension holds a bearer token, the site needs a cookie). */
export async function createHandoffCode(userId: string): Promise<string> {
  return new SignJWT({ kind: HANDOFF_KIND })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${HANDOFF_SECONDS}s`)
    .sign(secretKey());
}

export async function verifyHandoffCode(code: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(code, secretKey(), { algorithms: ["HS256"] });
    if (payload.kind !== HANDOFF_KIND || typeof payload.sub !== "string" || !payload.sub) return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}
