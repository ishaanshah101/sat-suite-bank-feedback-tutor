import { cookies } from "next/headers";
import { json, withApi } from "@/lib/api";
import { createHandoffCode, createSessionToken, HANDOFF_SECONDS, SESSION_COOKIE, sessionCookieOptions, verifyHandoffCode } from "@/lib/auth/token";
import { getUser } from "@/db/queries";

export const runtime = "nodejs";

/** Extension -> web app: POST (with the bearer token) returns a one-minute code for a link. */
export async function POST() {
  return withApi(async (session) => json({ code: await createHandoffCode(session.userId), expiresIn: HANDOFF_SECONDS }));
}

/** Opening `/api/auth/handoff?code=...&next=/history` signs this browser in and goes to `next` (same-site paths only). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const nextParam = url.searchParams.get("next") ?? "/";
  const next = /^\/(?![/\\])[\w\-/#?=&.%]*$/.test(nextParam) ? nextParam : "/";
  const session = await verifyHandoffCode(url.searchParams.get("code") ?? "");
  if (!session || !(await getUser(session.userId))) return Response.redirect(new URL("/signin", url), 303);
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(session.userId), sessionCookieOptions());
  return new Response(null, { status: 303, headers: { location: new URL(next, url).toString(), "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
