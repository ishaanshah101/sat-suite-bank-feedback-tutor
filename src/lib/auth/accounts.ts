import "server-only";
import { z } from "zod";
import { env, ownerUserId } from "@/lib/env";
import { findUserByEmail, getUser, insertUser } from "@/db/queries";
import { passcodeMatches } from "./passcode";
import { dummyPasswordHash, hashPassword, verifyPassword } from "./password";
import { clearAttempts, RateLimitError, takeAttempt } from "./limit";
import { createSessionToken, SESSION_MAX_AGE_SECONDS } from "./token";

export const SIGNIN_WINDOW_MS = 15 * 60 * 1000;
export const SIGNIN_MAX_ATTEMPTS = 10;
export const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
/** New accounts per network address per hour. Generous because a whole school can share one address. */
export function signupMaxPerHour(): number {
  const parsed = Number(env("SIGNUP_LIMIT_PER_HOUR"));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 20;
}
export const PASSWORD_MIN = 8;

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "Enter a valid email address." }).max(254));
export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN, { message: `Use at least ${PASSWORD_MIN} characters for the password.` })
  .max(200, { message: "That password is too long." });

export type AuthResult =
  | { ok: true; token: string; expiresIn: number; user: { id: string; email: string } }
  | { ok: false; status: 400 | 401 | 403 | 409 | 429 | 503; code: string; error: string };

function fail(status: 400 | 401 | 403 | 409 | 429 | 503, code: string, error: string): AuthResult {
  return { ok: false, status, code, error };
}

async function issue(user: { id: string; email: string }): Promise<AuthResult> {
  return { ok: true, token: await createSessionToken(user.id), expiresIn: SESSION_MAX_AGE_SECONDS, user: { id: user.id, email: user.email } };
}

function limited(error: unknown): AuthResult {
  if (error instanceof RateLimitError) return fail(error.status, error.status === 429 ? "rate_limited" : "unavailable", error.message);
  throw error;
}

export async function signIn(ip: string, input: { email: unknown; password: unknown }): Promise<AuthResult> {
  const email = EmailSchema.safeParse(input.email);
  const password = typeof input.password === "string" ? input.password : "";
  if (!email.success || !password) return fail(400, "invalid", "Enter your email and password.");
  const key = `signin:${ip}`;
  try {
    await takeAttempt(key, SIGNIN_MAX_ATTEMPTS, SIGNIN_WINDOW_MS, "Too many tries. Wait 15 minutes and try again.");
  } catch (error) {
    return limited(error);
  }
  const user = await findUserByEmail(email.data);
  const matches = await verifyPassword(password, user?.passwordHash ?? (await dummyPasswordHash()));
  if (!user || !matches) return fail(401, "bad_credentials", "That email and password do not match an account.");
  await clearAttempts(key);
  return issue(user);
}

/**
 * Create an account. The old app passcode, if given and right, makes this account the owner of the history
 * saved before accounts existed (the rows that carry OWNER_USER_ID). Only one account can claim it.
 */
export async function signUp(ip: string, input: { email: unknown; password: unknown; passcode?: unknown }): Promise<AuthResult> {
  const email = EmailSchema.safeParse(input.email);
  if (!email.success) return fail(400, "invalid_email", email.error.issues[0]?.message ?? "Enter a valid email address.");
  const password = PasswordSchema.safeParse(input.password);
  if (!password.success) return fail(400, "weak_password", password.error.issues[0]?.message ?? "Choose a longer password.");
  const passcode = typeof input.passcode === "string" ? input.passcode.trim() : "";

  try {
    await takeAttempt(`signup:${ip}`, signupMaxPerHour(), SIGNUP_WINDOW_MS, "Too many new accounts from this network. Try again in an hour.");
  } catch (error) {
    return limited(error);
  }

  let id: string | undefined;
  if (passcode) {
    const expected = env("APP_PASSCODE");
    if (!expected || !passcodeMatches(passcode, expected)) return fail(403, "bad_passcode", "That old passcode is not right. Leave it empty to start fresh.");
    if (await getUser(ownerUserId())) return fail(409, "owner_claimed", "The original history already belongs to an account. Leave the passcode empty.");
    id = ownerUserId();
  }

  if (await findUserByEmail(email.data)) return fail(409, "email_taken", "An account with that email already exists. Sign in instead.");
  const user = await insertUser({ id, email: email.data, passwordHash: await hashPassword(password.data) });
  if (!user) return fail(409, "email_taken", "An account with that email already exists. Sign in instead.");
  return issue(user);
}
