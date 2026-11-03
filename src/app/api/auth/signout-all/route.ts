import { cookies } from "next/headers";
import { invalidateAllSessions } from "@/db/queries";
import { withApi } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/auth/token";

export const runtime = "nodejs";

/** Sign out of all devices: every token signed before now (web and extension, this browser included) is refused. */
export async function POST(request: Request) {
  return withApi(async (session) => {
    await invalidateAllSessions(session.userId);
    const store = await cookies();
    store.delete(SESSION_COOKIE);
    return Response.redirect(new URL("/signin", request.url), 303);
  });
}
