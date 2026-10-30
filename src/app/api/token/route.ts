import { signIn } from "@/lib/auth/accounts";
import { clientIp } from "@/lib/auth/limit";
import { authEndpoint } from "@/lib/auth/respond";

export const runtime = "nodejs";

/** Older name for /api/auth/signin, kept for extension builds that call it. */
export async function POST(request: Request) {
  return authEndpoint(request, (body) => signIn(clientIp(request.headers), { email: body.email, password: body.password }));
}
