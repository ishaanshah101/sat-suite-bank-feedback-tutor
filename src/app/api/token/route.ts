import { z, ZodError } from "zod";
import { HttpError, json, readJson } from "@/lib/api";
import { attemptUnlock, clientIp } from "@/lib/auth/unlock";

export const runtime = "nodejs";

const Body = z.object({ passcode: z.string().min(1).max(200) });

/** Exchange the passcode for a bearer token. Used by the browser extension; same rate limit as the unlock page. */
export async function POST(request: Request) {
  try {
    const body = Body.parse(await readJson(request, 64 * 1024));
    const result = await attemptUnlock(clientIp(request.headers), body.passcode);
    if (!result.ok) {
      return json({ error: result.error, code: result.status === 429 ? "rate_limited" : "bad_passcode" }, { status: result.status });
    }
    return json({ token: result.token, tokenType: "Bearer", expiresIn: result.expiresIn });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError) return json({ error: "Invalid request" }, { status: 400 });
    console.error("[token]", error);
    return json({ error: "Something went wrong" }, { status: 500 });
  }
}
