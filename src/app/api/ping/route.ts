import { pingDb } from "@/db";
import { appVersion } from "@/lib/env";
import { configuredProviders, isStubMode } from "@/lib/ai/providers";

export const runtime = "nodejs";

/** Public liveness probe: no details beyond booleans, so uptime checks can run without signing in. */
export async function GET() {
  const db = await pingDb();
  return Response.json(
    { ok: db.ok, db: db.ok, ai: configuredProviders().length > 0 || isStubMode(), version: appVersion(), time: new Date().toISOString() },
    { status: db.ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
