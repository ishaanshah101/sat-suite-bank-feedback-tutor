import { cookies } from "next/headers";
import { HttpError, json, withApi } from "@/lib/api";
import { takeAttempt } from "@/lib/auth/limit";
import {
  bearerToken,
  createHandoffCode,
  createSessionToken,
  HANDOFF_SECONDS,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifyHandoffCode,
  verifySessionToken,
} from "@/lib/auth/token";
import { getUser } from "@/db/queries";

export const runtime = "nodejs";

/** Extension -> web app: POST (with the bearer token) returns a one-minute code for a link. Cookie sessions get no code. */
export async function POST(request: Request) {
  return withApi(async (session) => {
    if (!bearerToken(request.headers)) throw new HttpError(403, "Handoff codes are issued to the extension only", "bearer_only");
    return json({ code: await createHandoffCode(session.userId), expiresIn: HANDOFF_SECONDS });
  });
}

function redirectTo(url: URL, path: string): Response {
  return new Response(null, { status: 303, headers: { location: new URL(path, url).toString(), "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

/** Opening `/api/auth/handoff?code=...&next=/history` signs this browser in and goes to `next` (same-site paths only). Each code works once. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const nextParam = url.searchParams.get("next") ?? "/";
  const next = /^\/(?![/\\])[\w\-/#?=&.%]*$/.test(nextParam) ? nextParam : "/";
  const handoff = await verifyHandoffCode(url.searchParams.get("code") ?? "");
  if (!handoff || !(await getUser(handoff.userId))) return redirectTo(url, "/signin");
  // Already signed in as someone else: a link cannot swap this browser's account (login CSRF). Sign out first.
  const store = await cookies();
  const current = store.get(SESSION_COOKIE)?.value;
  if (current) {
    const existing = await verifySessionToken(current);
    if (existing && existing.userId !== handoff.userId && (await getUser(existing.userId))) return redirectTo(url, "/account?handoff=mismatch");
  }
  // The first redemption records the code's id; a replay is the second row and is refused.
  try {
    await takeAttempt(`handoff:${handoff.jti}`, 1, 2 * 60_000, "This link was already used.");
  } catch {
    return redirectTo(url, "/signin");
  }
  store.set(SESSION_COOKIE, await createSessionToken(handoff.userId), sessionCookieOptions());
  return redirectTo(url, next);
}
