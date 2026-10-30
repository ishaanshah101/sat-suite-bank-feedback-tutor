import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUser } from "@/db/queries";
import { bearerToken, SESSION_COOKIE, verifySessionToken, type Session } from "./token";

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

/** Session from the bearer header (browser extension) or the cookie (web app). A bearer header, when present, must be valid on its own. */
export async function getSession(): Promise<Session | null> {
  const bearer = bearerToken(await headers());
  if (bearer) return verifySessionToken(bearer);
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Call at the top of every Server Action and Route Handler. The proxy alone is not enough: it also checks the account still exists. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  if (!(await getUser(session.userId))) throw new UnauthorizedError();
  return session;
}

/** For server-rendered pages: like requireSession, but sends a signed-out visitor to the sign-in page. */
export async function requirePageSession(): Promise<Session> {
  try {
    return await requireSession();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/signin");
    throw error;
  }
}

export function unauthorizedResponse(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
}
