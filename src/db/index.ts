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
  if (!row?.t) {
    const migration = fs.readFileSync(path.join(process.cwd(), "src", "db", "migrations", "0001_init.sql"), "utf8");
    await client.exec(migration);
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
    holder.init.catch(() => {
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

export async function pingDb(): Promise<DbPing> {
  const started = Date.now();
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return { ok: true, ms: Date.now() - started };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const paused = /ENOTFOUND|ECONNREFUSED|timeout|Tenant or user not found|paused/i.test(message);
    return { ok: false, ms: Date.now() - started, error: message, paused };
  }
}

export { schema };
