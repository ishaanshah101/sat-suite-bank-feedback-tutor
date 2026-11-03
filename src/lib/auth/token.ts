import { SignJWT, jwtVerify } from "jose";
import { requireEnv } from "@/lib/env";

export const SESSION_COOKIE = "rulecard_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const SESSION_SECRET_MIN = 32;

function secretKey(): Uint8Array {
  const secret = requireEnv("SESSION_SECRET");
  if (secret.length < SESSION_SECRET_MIN) throw new Error(`SESSION_SECRET must be at least ${SESSION_SECRET_MIN} characters`);
  return new TextEncoder().encode(secret);
}

export interface Session {
  userId: string;
  /** Unix seconds the token was signed; lets a session be refused when its account was created later (id reuse). */
  issuedAt?: number;
  /** Unique id of this token, so signing out can revoke exactly this one. Tokens from before 0.6.1 have none. */
  jti?: string;
  /** Unix seconds the token expires; a revocation row only needs to live that long. */
  expiresAt?: number;
}

/** Marks tokens issued to accounts. Tokens from the old single-passcode gate lack it and stop working. */
const TOKEN_KIND = "account";

/**
 * `notBefore` is the account's creation time from the database clock: the token is never dated before it,
 * so a sign-up's first request cannot fail the "issued before the account" check if this clock runs behind.
 */
export async function createSessionToken(userId: string, notBefore?: Date): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const iat = notBefore ? Math.max(now, Math.floor(notBefore.getTime() / 1000)) : now;
  return new SignJWT({ kind: TOKEN_KIND })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setJti(crypto.randomUUID())
    .setIssuedAt(iat)
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
    if (payload.kind !== TOKEN_KIND) return null;
    if (typeof payload.iat !== "number") return null;
    return {
      userId: payload.sub,
      issuedAt: payload.iat,
      jti: typeof payload.jti === "string" && payload.jti ? payload.jti : undefined,
      expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
    };
  } catch {
    return null;
  }
}

/** True when the token was signed before the account existed: a token kept from a deleted account whose id was reclaimed. */
/**
 * True when the token was signed before `at`. A token without iat never passes. The slack covers iat's
 * whole-second rounding (1.5 s is enough when `at` came from this server's clock) or database clock skew (5 s).
 */
export function issuedBefore(session: Session, at: Date, slackMs = 5000): boolean {
  if (session.issuedAt === undefined) return true;
  return session.issuedAt * 1000 < at.getTime() - slackMs;
}

export function issuedBeforeAccount(session: Session, createdAt: Date): boolean {
  return issuedBefore(session, createdAt);
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

export interface Handoff {
  userId: string;
  /** Random id so each code can be redeemed once. */
  jti: string;
}

/** A one-minute code that opens the web app as the same account (the extension holds a bearer token, the site needs a cookie). */
export async function createHandoffCode(userId: string): Promise<string> {
  return new SignJWT({ kind: HANDOFF_KIND })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${HANDOFF_SECONDS}s`)
    .sign(secretKey());
}

export async function verifyHandoffCode(code: string): Promise<Handoff | null> {
  try {
    const { payload } = await jwtVerify(code, secretKey(), { algorithms: ["HS256"] });
    if (payload.kind !== HANDOFF_KIND || typeof payload.sub !== "string" || !payload.sub) return null;
    if (typeof payload.jti !== "string" || !payload.jti) return null;
    return { userId: payload.sub, jti: payload.jti };
  } catch {
    return null;
  }
}
