import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { env } from "@/lib/env";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

type Holder = { db?: Db; kind?: "postgres" | "pglite"; init?: Promise<Db> };
const holder: Holder = ((globalThis as unknown as { __rulecardDb?: Holder }).__rulecardDb ??= {});

async function createPglite(url: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const target = url.replace(/^pglite:\/\//, "");
  const client = target === "memory" || target === "" ? new PGlite() : new PGlite(path.resolve(/* turbopackIgnore: true */ process.cwd(), target));
  const db = drizzle({ client, schema }) as unknown as Db;
  const exists = await db.execute(sql`select to_regclass('public.questions') as t`);
  const row = (exists as unknown as { rows?: Array<{ t: string | null }> }).rows?.[0] ?? (exists as unknown as Array<{ t: string | null }>)[0];
  const migrations = row?.t ? ["0004_accounts.sql"] : ["0001_init.sql", "0004_accounts.sql"];
  for (const file of migrations) {
    await client.exec(fs.readFileSync(path.join(process.cwd(), "src", "db", "migrations", file), "utf8"));
  }
  holder.kind = "pglite";
  return db;
}

async function createPostgres(url: string): Promise<Db> {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const postgres = (await import("postgres")).default;
  const client = postgres(url, {
    max: 1,
    prepare: false,
    ssl: "require",
    connect_timeout: 15,
    idle_timeout: 20,
  });
  holder.kind = "postgres";
  return drizzle({ client, schema }) as unknown as Db;
}

export function dbKind(): "postgres" | "pglite" | "unconfigured" {
  const url = env("DATABASE_URL");
  if (!url) return "unconfigured";
  return url.startsWith("pglite://") ? "pglite" : "postgres";
}

export async function getDb(): Promise<Db> {
  if (holder.db) return holder.db;
  if (!holder.init) {
    const url = env("DATABASE_URL");
    if (!url) throw new Error("DATABASE_URL is not set");
    holder.init = (url.startsWith("pglite://") ? createPglite(url) : createPostgres(url)).then((db) => {
      holder.db = db;
      return db;
    });
    holder.init.catch((error) => {
      console.error("[db] connection setup failed:", describeDbError(error).message);
      holder.init = undefined;
    });
  }
  return holder.init;
}

export interface DbPing {
  ok: boolean;
  ms: number;
  error?: string;
  paused?: boolean;
}

/** Flatten an error and its `cause` chain into one line (Drizzle wraps driver errors). */
export function describeDbError(error: unknown): { code?: string; message: string } {
  const parts: string[] = [];
  let code: string | undefined;
  let current: unknown = error;
  for (let depth = 0; current && depth < 6; depth++) {
    const message = (current instanceof Error ? current.message : String(current)).replace(/\s+/g, " ").trim();
    const currentCode = (current as { code?: string })?.code;
    if (currentCode && !code) code = String(currentCode);
    parts.push(currentCode ? `${currentCode}: ${message}` : message);
    current = (current as { cause?: unknown })?.cause;
  }
  return { code, message: parts.join(" <- ") };
}

export async function pingDb(): Promise<DbPing> {
  const started = Date.now();
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return { ok: true, ms: Date.now() - started };
  } catch (error) {
    const { code, message } = describeDbError(error);
    console.error("[db] ping failed:", message);
    const paused = /ENOTFOUND|ECONNREFUSED|timeout|Tenant or user not found|paused/i.test(message);
    return { ok: false, ms: Date.now() - started, error: code ? `${code}: ${message}` : message, paused };
  }
}

export { schema };
