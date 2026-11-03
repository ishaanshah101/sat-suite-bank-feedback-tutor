import { NextResponse, type NextRequest } from "next/server";
import { bearerToken, SESSION_COOKIE, verifySessionToken } from "@/lib/auth/token";
import { env } from "@/lib/env";

/** API routes that need no session (sign in, create an account, sign out: it only clears the cookie, expired or not). */
const PUBLIC_API = new Set(["/api/token", "/api/auth/signin", "/api/auth/signup", "/api/logout"]);

/** Browser extension pages; the bearer token is the real protection, this only lets the browser read the response. */
const EXTENSION_ORIGIN = /^(chrome|moz|safari-web)-extension:\/\/([a-z0-9-]+)$/i;

/** With EXTENSION_IDS set (comma-separated extension ids), only those extensions get CORS headers; otherwise any extension does. */
function allowedExtensionOrigin(origin: string | null): string | null {
  const match = origin ? EXTENSION_ORIGIN.exec(origin) : null;
  if (!match) return null;
  const ids = env("EXTENSION_IDS");
  if (!ids) return origin;
  const allowed = ids.split(",").map((id) => id.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(match[2].toLowerCase()) ? origin : null;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const extensionOrigin = isApi ? allowedExtensionOrigin(request.headers.get("origin")) : null;
  const withCors = (response: NextResponse) => {
    if (extensionOrigin) {
      for (const [key, value] of Object.entries(corsHeaders(extensionOrigin))) response.headers.set(key, value);
    }
    return response;
  };

  if (extensionOrigin && request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders(extensionOrigin) });
  }
  if (isApi && PUBLIC_API.has(pathname)) return withCors(NextResponse.next());
  // Following a handoff link needs no session; asking for a code (POST) does.
  if (pathname === "/api/auth/handoff" && request.method === "GET") return NextResponse.next();

  const token = (isApi ? bearerToken(request.headers) : null) ?? request.cookies.get(SESSION_COOKIE)?.value;
  if (token && (await verifySessionToken(token))) {
    return withCors(NextResponse.next());
  }
  if (isApi) {
    return withCors(NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } }));
  }
  const url = request.nextUrl.clone();
  url.pathname = "/signin";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Whole segments only: "/signin" and "/signin/x" are public, "/signin-help" is not.
  matcher: ["/((?!signin(?:/|$)|unlock(?:/|$)|privacy(?:/|$)|api/cron(?:/|$)|api/ping(?:/|$)|_next/|favicon\\.ico$|icon\\.svg$|robots\\.txt$).*)"],
};
