import "server-only";
import { appVersion, env } from "@/lib/env";
import { dbKind, pingDb } from "@/db";
import { listProviderStatus } from "@/db/queries";
import { configuredProviders, cooldownUntil, isStubMode, providerOrder } from "@/lib/ai/providers";

export interface HealthReport {
  ok: boolean;
  version: string;
  time: string;
  db: { kind: string; ok: boolean; ms: number; error?: string; paused?: boolean; message: string };
  ai: {
    order: string[];
    configured: string[];
    live: string | null;
    stub: boolean;
    providers: Array<{
      name: string;
      configured: boolean;
      lastOkAt: Date | null;
      lastErrorAt: Date | null;
      lastError: string | null;
      cooldownUntil: Date | null;
    }>;
  };
  passcodeConfigured: boolean;
}

export async function healthReport(): Promise<HealthReport> {
  const db = await pingDb();
  let rows: Awaited<ReturnType<typeof listProviderStatus>> = [];
  if (db.ok) rows = await listProviderStatus().catch(() => []);
  const configured = configuredProviders();
  const providers = providerOrder().map((name) => {
    const row = rows.find((r) => r.provider === name);
    const cooled = cooldownUntil(name);
    return {
      name,
      configured: configured.includes(name),
      lastOkAt: row?.lastOkAt ?? null,
      lastErrorAt: row?.lastErrorAt ?? null,
      lastError: row?.lastError ?? null,
      cooldownUntil: cooled ? new Date(cooled) : row?.cooldownUntil && row.cooldownUntil.getTime() > Date.now() ? row.cooldownUntil : null,
    };
  });
  const live = providers.find((p) => p.configured && !p.cooldownUntil)?.name ?? (isStubMode() ? "stub" : null);
  return {
    ok: db.ok && (configured.length > 0 || isStubMode()),
    version: appVersion(),
    time: new Date().toISOString(),
    db: {
      kind: dbKind(),
      ...db,
      message: db.ok
        ? "Database reachable"
        : db.paused
          ? "Database unreachable. If the Supabase project is paused, open the Supabase dashboard and click Restore."
          : "Database error",
    },
    ai: { order: providerOrder(), configured, live, stub: isStubMode(), providers },
    passcodeConfigured: Boolean(env("APP_PASSCODE")),
  };
}
