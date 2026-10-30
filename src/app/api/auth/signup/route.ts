import { signUp } from "@/lib/auth/accounts";
import { clientIp } from "@/lib/auth/limit";
import { authEndpoint } from "@/lib/auth/respond";

export const runtime = "nodejs";

/** `{ email, password, passcode? }` -> `{ token }`. The optional old passcode claims the history saved before accounts. */
export async function POST(request: Request) {
  return authEndpoint(request, (body) => signUp(clientIp(request.headers), { email: body.email, password: body.password, passcode: body.passcode }));
}
