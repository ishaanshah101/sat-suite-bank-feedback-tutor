import { signIn } from "@/lib/auth/accounts";
import { clientIp } from "@/lib/auth/limit";
import { authEndpoint } from "@/lib/auth/respond";

export const runtime = "nodejs";

/** `{ email, password }` -> `{ token }`. Also sets the session cookie for web requests. */
export async function POST(request: Request) {
  return authEndpoint(request, (body) => signIn(clientIp(request.headers), { email: body.email, password: body.password }));
}
