import "server-only";
import { and, desc, eq, gt, lt, sql } from "drizzle-orm";
import { getDb } from "./index";
import {
  aiUsage,
  attempts,
  chatMessages,
  drills,
  providerStatus,
  questions,
  unlockAttempts,
  users,
  type AiUseKind,
  type AttemptRow,
  type DrillRow,
  type Letter,
  type QuestionRow,
  type UserRow,
} from "./schema";
import type { ParsedQuestion } from "@/lib/ai/schemas";

export async function upsertQuestion(userId: string, parsed: ParsedQuestion, source: QuestionRow["source"]): Promise<QuestionRow> {
  const db = await getDb();
  const values = {
    qbId: parsed.qb_id,
    source,
    test: parsed.test,
    domain: parsed.domain,
    skill: parsed.skill,
    difficulty: parsed.difficulty,
    stem: parsed.stem,
    passage: parsed.passage,
    choices: parsed.choices,
    correct: parsed.correct,
    answerSource: parsed.correct ? ("official" as const) : null,
    rationale: parsed.rationale,
    raw: parsed as unknown as Record<string, unknown>,
    updatedAt: new Date(),
  };
  if (parsed.qb_id) {
    // Re-capture of a known question: one statement, and official answer data already stored is kept.
    const [row] = await db
      .insert(questions)
      .values({ ...values, userId })
      .onConflictDoUpdate({
        target: [questions.userId, questions.qbId],
        targetWhere: sql`qb_id is not null`,
        set: {
          source: values.source,
          stem: values.stem,
          passage: values.passage,
          choices: values.choices,
          raw: values.raw,
          updatedAt: values.updatedAt,
          correct: sql`coalesce(excluded.correct, ${questions.correct})`,
          answerSource: sql`case when excluded.correct is not null then 'official' else ${questions.answerSource} end`,
          rationale: sql`coalesce(excluded.rationale, ${questions.rationale})`,
          domain: sql`coalesce(excluded.domain, ${questions.domain})`,
          skill: sql`coalesce(excluded.skill, ${questions.skill})`,
          difficulty: sql`coalesce(excluded.difficulty, ${questions.difficulty})`,
          test: sql`coalesce(excluded.test, ${questions.test})`,
        },
      })
      .returning();
    return row;
  }
  const [row] = await db
    .insert(questions)
    .values({ ...values, userId })
    .returning();
  return row;
}

export async function getQuestion(userId: string, id: string): Promise<QuestionRow | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(questions)
    .where(and(eq(questions.id, id), eq(questions.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function setModelAnswer(id: string, correct: Letter): Promise<void> {
  const db = await getDb();
  await db
    .update(questions)
    .set({ correct, answerSource: "model", updatedAt: new Date() })
    .where(and(eq(questions.id, id), sql`${questions.correct} is null`));
}

export async function createAttempt(userId: string, input: { questionId: string; picked: Letter | "correct"; reasoning: string | null }): Promise<AttemptRow> {
  const db = await getDb();
  const [row] = await db
    .insert(attempts)
    .values({ userId, questionId: input.questionId, picked: input.picked, reasoning: input.reasoning })
    .returning();
  return row;
}

export async function finishAttempt(id: string, input: { explanation: Record<string, unknown>; ruleId: string; provider: string; model: string }): Promise<void> {
  const db = await getDb();
  await db
    .update(attempts)
    .set({ explanation: input.explanation, ruleId: input.ruleId, provider: input.provider, model: input.model, updatedAt: new Date() })
    .where(eq(attempts.id, id));
}

export async function deleteAttempt(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(attempts).where(eq(attempts.id, id));
}

export interface AttemptWithQuestion {
  attempt: AttemptRow;
  question: QuestionRow;
}

export async function getAttempt(userId: string, id: string): Promise<AttemptWithQuestion | null> {
  const db = await getDb();
  const rows = await db
    .select({ attempt: attempts, question: questions })
    .from(attempts)
    .innerJoin(questions, eq(questions.id, attempts.questionId))
    .where(and(eq(attempts.id, id), eq(attempts.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listAttempts(userId: string, limit = 200): Promise<AttemptWithQuestion[]> {
  const db = await getDb();
  return db
    .select({ attempt: attempts, question: questions })
    .from(attempts)
    .innerJoin(questions, eq(questions.id, attempts.questionId))
    .where(eq(attempts.userId, userId))
    .orderBy(desc(attempts.createdAt))
    .limit(limit);
}

export async function addChatMessage(userId: string, attemptId: string, role: "user" | "assistant", content: string): Promise<void> {
  if (!content.trim()) return;
  const db = await getDb();
  await db.insert(chatMessages).values({ userId, attemptId, role, content });
}

export async function listChatMessages(attemptId: string) {
  const db = await getDb();
  return db.select().from(chatMessages).where(eq(chatMessages.attemptId, attemptId)).orderBy(chatMessages.createdAt);
}

export async function createDrill(userId: string, input: { attemptId: string | null; ruleId: string; question: Record<string, unknown> }): Promise<DrillRow> {
  const db = await getDb();
  const [row] = await db
    .insert(drills)
    .values({ userId, attemptId: input.attemptId, ruleId: input.ruleId, question: input.question })
    .returning();
  return row;
}

export async function getDrill(userId: string, id: string): Promise<DrillRow | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(drills)
    .where(and(eq(drills.id, id), eq(drills.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Records the first answer only; a second click on a drill that already has one changes nothing. */
export async function answerDrill(id: string, picked: Letter, correct: boolean): Promise<void> {
  const db = await getDb();
  await db
    .update(drills)
    .set({ picked, correct, updatedAt: new Date() })
    .where(and(eq(drills.id, id), sql`${drills.picked} is null`));
}

export interface RuleStat {
  ruleId: string;
  attemptMisses: number;
  drillMisses: number;
  misses: number;
  lastMissedAt: Date | null;
}

export async function getRuleStats(userId: string): Promise<RuleStat[]> {
  const db = await getDb();
  const result = await db.execute(sql`
    select rule_id, attempt_misses, drill_misses, misses, last_missed_at
    from public.rule_stats
    where user_id = ${userId}::uuid
    order by misses desc, last_missed_at desc
  `);
  const rows = ((result as unknown as { rows?: unknown[] }).rows ?? (result as unknown as unknown[])) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    ruleId: String(r.rule_id),
    attemptMisses: Number(r.attempt_misses ?? 0),
    drillMisses: Number(r.drill_misses ?? 0),
    misses: Number(r.misses ?? 0),
    lastMissedAt: r.last_missed_at ? new Date(String(r.last_missed_at)) : null,
  }));
}

export async function listProviderStatus() {
  const db = await getDb();
  return db.select().from(providerStatus);
}

export async function recordProviderOk(provider: string): Promise<void> {
  const db = await getDb();
  const now = new Date();
  await db
    .insert(providerStatus)
    .values({ provider, lastOkAt: now, cooldownUntil: null, updatedAt: now })
    .onConflictDoUpdate({ target: providerStatus.provider, set: { lastOkAt: now, cooldownUntil: null, updatedAt: now } });
}

export async function recordProviderError(provider: string, message: string, cooldownUntil: Date | null): Promise<void> {
  const db = await getDb();
  const now = new Date();
  const lastError = message.slice(0, 500);
  await db
    .insert(providerStatus)
    .values({ provider, lastErrorAt: now, lastError, cooldownUntil, updatedAt: now })
    .onConflictDoUpdate({ target: providerStatus.provider, set: { lastErrorAt: now, lastError, cooldownUntil, updatedAt: now } });
}

export async function countUnlockAttempts(ip: string, since: Date): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(unlockAttempts)
    .where(and(eq(unlockAttempts.ip, ip), gt(unlockAttempts.createdAt, since)));
  return Number(rows[0]?.n ?? 0);
}

export async function recordUnlockAttempt(ip: string): Promise<void> {
  const db = await getDb();
  await db.insert(unlockAttempts).values({ ip });
}

export async function clearUnlockAttempts(ip: string): Promise<void> {
  const db = await getDb();
  await db.delete(unlockAttempts).where(eq(unlockAttempts.ip, ip));
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}

export async function getUser(id: string): Promise<UserRow | null> {
  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Insert a user; returns null when the email (or the id) is already taken. */
export async function insertUser(input: { id?: string; email: string; passwordHash: string }): Promise<UserRow | null> {
  const db = await getDb();
  const rows = await db.insert(users).values(input).onConflictDoNothing().returning();
  return rows[0] ?? null;
}

/** Remove an account and everything it saved. Attempts, chat and drills cascade from questions and attempts. */
export async function deleteUserAndData(userId: string): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(drills).where(eq(drills.userId, userId));
    await tx.delete(chatMessages).where(eq(chatMessages.userId, userId));
    await tx.delete(attempts).where(eq(attempts.userId, userId));
    await tx.delete(questions).where(eq(questions.userId, userId));
    await tx.delete(aiUsage).where(eq(aiUsage.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));
  });
}

export async function recordAiUse(userId: string, kind: AiUseKind): Promise<void> {
  const db = await getDb();
  await db.insert(aiUsage).values({ userId, kind });
}

export async function countAiUse(userId: string, since: Date): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), gt(aiUsage.createdAt, since)));
  return Number(rows[0]?.n ?? 0);
}

/** Drop rate-limit and usage rows older than any window that reads them (sign-in: 1 hour, AI: 24 hours). */
export async function pruneCounters(): Promise<{ attempts: number; usage: number }> {
  const db = await getDb();
  const day = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const a = await db.delete(unlockAttempts).where(lt(unlockAttempts.createdAt, day)).returning({ id: unlockAttempts.id });
  const u = await db.delete(aiUsage).where(lt(aiUsage.createdAt, day)).returning({ id: aiUsage.id });
  return { attempts: a.length, usage: u.length };
}
