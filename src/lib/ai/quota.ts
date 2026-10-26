import "server-only";
import { env, ownerUserId } from "@/lib/env";
import { countAiUse, recordAiUse } from "@/db/queries";
import type { AiUseKind } from "@/db/schema";

export const DEFAULT_DAILY_AI_LIMIT = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export class QuotaError extends Error {
  constructor(public limit: number) {
    super(`You have used today's ${limit} AI requests. The limit resets over the next 24 hours.`);
    this.name = "QuotaError";
  }
}

export function dailyAiLimit(): number {
  const parsed = Number(env("DAILY_AI_LIMIT"));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_DAILY_AI_LIMIT;
}

/**
 * Count one AI call for this account and refuse once it passes the rolling 24-hour limit.
 * The owner account has no limit. Recorded before counting, so parallel calls cannot slip past.
 */
export async function chargeAiQuota(userId: string, kind: AiUseKind): Promise<void> {
  await recordAiUse(userId, kind);
  if (userId === ownerUserId()) return;
  const limit = dailyAiLimit();
  const used = await countAiUse(userId, new Date(Date.now() - DAY_MS));
  if (used > limit) throw new QuotaError(limit);
}

/** AI requests this account made in the last 24 hours. */
export async function aiUsedToday(userId: string): Promise<number> {
  return countAiUse(userId, new Date(Date.now() - DAY_MS));
}
