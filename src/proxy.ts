import { NextResponse, type NextRequest } from "next/server";
import { bearerToken, SESSION_COOKIE, verifySessionToken } from "@/lib/auth/token";

/** API routes that need no session (sign in, create an account). */
const PUBLIC_API = new Set(["/api/token", "/api/auth/signin", "/api/auth/signup"]);

/** Browser extension pages; the bearer token is the real protection, this only lets the browser read the response. */
const EXTENSION_ORIGIN = /^(chrome|moz|safari-web)-extension:\/\/[a-z0-9-]+$/i;

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
  const origin = request.headers.get("origin");
  const extensionOrigin = isApi && origin && EXTENSION_ORIGIN.test(origin) ? origin : null;
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
  matcher: ["/((?!signin|unlock|privacy|api/cron|api/ping|_next/|favicon\\.ico|icon\\.svg|robots\\.txt).*)"],
};
