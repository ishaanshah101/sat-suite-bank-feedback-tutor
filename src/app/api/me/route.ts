import { json, withApi } from "@/lib/api";
import { getUser } from "@/db/queries";
import { aiUsedToday, dailyAiLimit } from "@/lib/ai/quota";
import { ownerUserId } from "@/lib/env";

export const runtime = "nodejs";

/** The signed-in account and how much of today's AI limit it has used. */
export async function GET() {
  return withApi(async (session) => {
    const user = await getUser(session.userId);
    const used = await aiUsedToday(session.userId);
    const unlimited = session.userId === ownerUserId();
    return json({ user: user ? { id: user.id, email: user.email } : null, ai: { used, limit: unlimited ? null : dailyAiLimit() } });
  });
}
