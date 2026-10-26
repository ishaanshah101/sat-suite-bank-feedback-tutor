import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/token";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return Response.redirect(new URL("/signin", request.url), 303);
}
