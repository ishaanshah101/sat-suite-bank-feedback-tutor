import { NextResponse, type NextRequest } from "next/server";
import { bearerToken, SESSION_COOKIE, verifySessionToken } from "@/lib/auth/token";
import { env } from "@/lib/env";

/** API routes that need no session (sign in, create an account, sign out: it only clears the cookie, expired or not). */
const PUBLIC_API = new Set(["/api/token", "/api/auth/signin", "/api/auth/signup", "/api/auth/handoff/continue", "/api/logout", "/api/ping"]);
/** Pages anyone may open. Whole segments only: "/signin" and "/signin/x", never "/signin-help". */
const PUBLIC_PAGE = /^\/(signin|unlock|privacy|handoff)(\/|$)/;
export const isPublicPage = (pathname: string) => PUBLIC_PAGE.test(pathname);

/**
 * Page policy with a per-request script nonce. Next.js reads the nonce from this header on the request and
 * puts it on every script it emits, so no inline script without it can run (an XSS backstop). Styles stay
 * inline-friendly: Tailwind and React set style attributes, which a nonce cannot cover.
 */
function pageCsp(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/** Let the request through to a page, carrying a fresh nonce in and the matching policy out. */
function pageNext(request: NextRequest): NextResponse {
  const nonce = btoa(crypto.randomUUID());
  const csp = pageCsp(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", csp);
  return response;
}

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
  if (isApi && (PUBLIC_API.has(pathname) || pathname.startsWith("/api/cron/"))) return withCors(NextResponse.next());
  // Following a handoff link needs no session; asking for a code (POST) does.
  if (pathname === "/api/auth/handoff" && request.method === "GET") return NextResponse.next();
  if (!isApi && isPublicPage(pathname)) return pageNext(request);

  const token = (isApi ? bearerToken(request.headers) : null) ?? request.cookies.get(SESSION_COOKIE)?.value;
  if (token && (await verifySessionToken(token))) {
    return isApi ? withCors(NextResponse.next()) : pageNext(request);
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
  // Everything except static assets, so every page gets its nonce and every API route its auth check.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico$|icon\\.svg$|robots\\.txt$).*)"],
};
