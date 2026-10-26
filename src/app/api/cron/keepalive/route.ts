import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { env } from "@/lib/env";
import { secretMatches } from "@/lib/auth/passcode";
import { pruneCounters } from "@/db/queries";

export const runtime = "nodejs";

/** Vercel cron hits this daily so the free Supabase project sees real traffic, and prunes old rate-limit rows. */
export async function GET(request: Request) {
  const expected = env("CRON_SECRET");
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!expected || !presented || !secretMatches(presented, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  try {
    const db = await getDb();
    const result = await db.execute(sql`select count(*)::int as n from public.provider_status`);
    const rows = ((result as unknown as { rows?: unknown[] }).rows ?? (result as unknown as unknown[])) as Array<{ n: number }>;
    const pruned = await pruneCounters();
    return Response.json({ ok: true, providerStatusRows: rows[0]?.n ?? 0, pruned, at: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
