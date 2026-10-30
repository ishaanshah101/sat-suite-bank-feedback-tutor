import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { DEFAULT_OWNER_USER_ID } from "@/lib/env";

export type Letter = "A" | "B" | "C" | "D";
export type Section = "rw" | "math";
export type QuestionFormat = "mcq" | "spr";
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
    section: text("section").$type<Section>().notNull().default("rw"),
    format: text("format").$type<QuestionFormat>().notNull().default("mcq"),
    source: text("source").$type<"capture" | "pdf" | "paste" | "image">().notNull(),
    test: text("test"),
    domain: text("domain"),
    skill: text("skill"),
    difficulty: text("difficulty"),
    stem: text("stem").notNull(),
    passage: text("passage"),
    /** Null for grid-in (student-produced response) questions. */
    choices: jsonb("choices").$type<Choices>(),
    correct: text("correct").$type<Letter>(),
    /** Grid-in only: every accepted form of the answer, for example [".1764", ".1765", "3/17"]. */
    answers: jsonb("answers").$type<string[]>(),
    /** A figure or table described in words by the extractor (math), so explanations can use it. */
    figure: text("figure"),
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
    picked: text("picked").$type<Letter | "correct" | "spr">().notNull(),
    /** Grid-in only: what the student typed. */
    response: text("response"),
    /** Graded at explain time; null for attempts saved before grading existed. */
    isCorrect: boolean("is_correct"),
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
    picked: text("picked").$type<Letter | "spr">(),
    response: text("response"),
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

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull(),
    kind: text("kind").$type<AiUseKind>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("ai_usage_user_created_idx").on(t.userId, t.createdAt)],
);

export type AiUseKind = "extract" | "explain" | "chat" | "drill";

export type QuestionRow = typeof questions.$inferSelect;
export type AttemptRow = typeof attempts.$inferSelect;
export type ChatMessageRow = typeof chatMessages.$inferSelect;
export type DrillRow = typeof drills.$inferSelect;
export type ProviderStatusRow = typeof providerStatus.$inferSelect;
export type UserRow = typeof users.$inferSelect;
