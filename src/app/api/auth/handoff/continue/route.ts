import { cookies } from "next/headers";
import { getUser } from "@/db/queries";
import { resolveHandoff, safeNextPath } from "@/lib/auth/handoff";
import { takeAttempt } from "@/lib/auth/limit";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions, verifySessionToken } from "@/lib/auth/token";

export const runtime = "nodejs";

function redirectTo(url: URL, path: string): Response {
  return new Response(null, { status: 303, headers: { location: new URL(path, url).toString(), "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

/** The confirmation form on /handoff posts here. Same-origin posts only; each code works once. */
export async function POST(request: Request) {
  const url = new URL(request.url);
  // Browsers always send Origin on a form POST; anything but this site (or a missing header) is refused.
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin !== url.origin || (fetchSite && fetchSite !== "same-origin")) return redirectTo(url, "/signin");
  const form = await request.formData().catch(() => null);
  const code = typeof form?.get("code") === "string" ? (form.get("code") as string) : "";
  const next = safeNextPath(typeof form?.get("next") === "string" ? (form.get("next") as string) : null);
  const handoff = await resolveHandoff(code);
  if (!handoff) return redirectTo(url, "/signin");
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
