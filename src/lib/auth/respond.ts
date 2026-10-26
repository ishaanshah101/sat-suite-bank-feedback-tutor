import "server-only";
import { cookies } from "next/headers";
import { ZodError } from "zod";
import { HttpError, json, readJson } from "@/lib/api";
import type { AuthResult } from "./accounts";
import { sessionCookieOptions, SESSION_COOKIE } from "./token";

/** Shared shape for the sign-in and sign-up endpoints: the extension uses the token, the web app the cookie. */
export async function authEndpoint(request: Request, run: (body: Record<string, unknown>) => Promise<AuthResult>): Promise<Response> {
  try {
    if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) throw new HttpError(415, "Send JSON");
    const body = await readJson<Record<string, unknown>>(request, 16 * 1024);
    if (!body || typeof body !== "object") throw new HttpError(400, "Body must be a JSON object");
    const result = await run(body);
    if (!result.ok) return json({ error: result.error, code: result.code }, { status: result.status });
    const response = json({ token: result.token, tokenType: "Bearer", expiresIn: result.expiresIn, user: result.user });
    if (!/^(chrome|moz|safari-web)-extension:/i.test(request.headers.get("origin") ?? "")) {
      (await cookies()).set(SESSION_COOKIE, result.token, sessionCookieOptions());
    }
    return response;
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError) return json({ error: "Invalid request" }, { status: 400 });
    console.error("[auth]", error);
    return json({ error: "Something went wrong" }, { status: 500 });
  }
}
