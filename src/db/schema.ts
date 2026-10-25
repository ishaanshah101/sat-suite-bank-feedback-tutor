import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { DEFAULT_OWNER_USER_ID } from "@/lib/env";

export type Letter = "A" | "B" | "C" | "D";
export type Choices = Record<Letter, string>;

const base = {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().default(DEFAULT_OWNER_USER_ID),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }),
};

export const questions = pgTable(
  "questions",
  {
    ...base,
    qbId: text("qb_id"),
    source: text("source").$type<"capture" | "pdf" | "paste" | "image">().notNull(),
    test: text("test"),
    domain: text("domain"),
    skill: text("skill"),
    difficulty: text("difficulty"),
    stem: text("stem").notNull(),
    passage: text("passage"),
    choices: jsonb("choices").$type<Choices>().notNull(),
    correct: text("correct").$type<Letter>(),
    answerSource: text("answer_source").$type<"official" | "model">(),
    rationale: text("rationale"),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
  },
  (t) => [index("questions_user_created_idx").on(t.userId, t.createdAt)],
);

export const attempts = pgTable(
  "attempts",
  {
    ...base,
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    picked: text("picked").$type<Letter | "correct">().notNull(),
    reasoning: text("reasoning"),
    explanation: jsonb("explanation").$type<Record<string, unknown>>(),
    ruleId: text("rule_id"),
    provider: text("provider"),
    model: text("model"),
  },
  (t) => [index("attempts_user_created_idx").on(t.userId, t.createdAt), index("attempts_question_idx").on(t.questionId)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    ...base,
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: text("content").notNull(),
  },
  (t) => [index("chat_messages_attempt_idx").on(t.attemptId, t.createdAt)],
);

export const drills = pgTable(
  "drills",
  {
    ...base,
    attemptId: uuid("attempt_id").references(() => attempts.id, { onDelete: "cascade" }),
    ruleId: text("rule_id").notNull(),
    question: jsonb("question").$type<Record<string, unknown>>().notNull(),
    picked: text("picked").$type<Letter>(),
    correct: boolean("correct"),
  },
  (t) => [index("drills_user_rule_idx").on(t.userId, t.ruleId), index("drills_attempt_idx").on(t.attemptId)],
);

export const providerStatus = pgTable("provider_status", {
  provider: text("provider").primaryKey(),
  lastOkAt: timestamp("last_ok_at", { withTimezone: true, mode: "date" }),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true, mode: "date" }),
  lastError: text("last_error"),
  cooldownUntil: timestamp("cooldown_until", { withTimezone: true, mode: "date" }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const unlockAttempts = pgTable("unlock_attempts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ip: text("ip").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export type QuestionRow = typeof questions.$inferSelect;
export type AttemptRow = typeof attempts.$inferSelect;
export type ChatMessageRow = typeof chatMessages.$inferSelect;
export type DrillRow = typeof drills.$inferSelect;
export type ProviderStatusRow = typeof providerStatus.$inferSelect;
