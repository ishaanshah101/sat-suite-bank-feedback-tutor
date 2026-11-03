import { cookies } from "next/headers";
import { HttpError, json, withApi } from "@/lib/api";
import { resolveHandoff, safeNextPath } from "@/lib/auth/handoff";
import { bearerToken, createHandoffCode, HANDOFF_SECONDS, SESSION_COOKIE, verifySessionToken } from "@/lib/auth/token";
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

/**
 * Opening `/api/auth/handoff?code=...&next=/history` leads to the confirmation page, where one click signs this
 * browser in (a link alone never signs anyone in: that would let a stranger's link plant their account here).
 * A browser already signed in as the same account goes straight to `next`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get("next"));
  const code = url.searchParams.get("code") ?? "";
  const handoff = await resolveHandoff(code);
  if (!handoff) return redirectTo(url, "/signin");
  const store = await cookies();
  const current = store.get(SESSION_COOKIE)?.value;
  if (current) {
    const existing = await verifySessionToken(current);
    if (existing && (await getUser(existing.userId))) {
      return redirectTo(url, existing.userId === handoff.userId ? next : "/account?handoff=mismatch");
    }
  }
  return redirectTo(url, `/handoff?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`);
}
