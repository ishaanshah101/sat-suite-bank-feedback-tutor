import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUser, isSessionRevoked } from "@/db/queries";
import { bearerToken, issuedBefore, SESSION_COOKIE, verifySessionToken, type Session } from "./token";

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

/**
 * Call at the top of every Server Action and Route Handler. The proxy alone is not enough: it also checks the account
 * still exists and that the token is not older than the account (a deleted account's id can be claimed again).
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  const user = await getUser(session.userId);
  // The account must exist, must not predate the token (id reuse), and must not have signed out everywhere since.
  if (!user || issuedBefore(session, user.createdAt) || issuedBefore(session, user.sessionsValidFrom, 1500)) throw new UnauthorizedError();
  if (session.jti && (await isSessionRevoked(session.jti))) throw new UnauthorizedError();
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
