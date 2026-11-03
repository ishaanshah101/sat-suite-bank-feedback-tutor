import { cookies } from "next/headers";
import { revokeSession } from "@/db/queries";
import { getSession } from "@/lib/auth/session";
import { bearerToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/token";

export const runtime = "nodejs";

/**
 * Sign out. The token in the request (cookie or bearer) is revoked on the server, so a copy of it kept
 * anywhere else stops working too; then the cookie is cleared. Works with an expired or missing token as well.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (session?.jti) {
    const expiresAt = new Date((session.expiresAt ?? Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS) * 1000);
    await revokeSession(session.jti, session.userId, expiresAt).catch((error) => console.error("[logout] revoke failed", error));
  }
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  // The extension sends a bearer token and wants JSON; the account page posts a form and wants the sign-in page.
  if (bearerToken(request.headers)) {
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  }
  return Response.redirect(new URL("/signin", request.url), 303);
}
