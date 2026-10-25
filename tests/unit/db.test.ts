import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL = "pglite://memory";
});

const USER = "68311219-1a38-469e-ab48-b3bf632be848";

describe("database layer on PGlite", () => {
  it("applies the schema, upserts by qb_id and computes rule stats", async () => {
    const { pingDb } = await import("@/db");
    expect((await pingDb()).ok).toBe(true);
    const q = await import("@/db/queries");
    const parsed = {
      qb_id: "960dec02",
      test: "SAT Reading and Writing",
      domain: "Standard English Conventions",
      skill: "Boundaries",
      difficulty: "Medium" as const,
      passage: "p",
      stem: "s",
      choices: { A: "a", B: "b", C: "c", D: "d" },
      correct: "B" as const,
      rationale: "Choice B is the best answer.",
    };
    const first = await q.upsertQuestion(USER, parsed, "pdf");
    const second = await q.upsertQuestion(USER, { ...parsed, correct: null, rationale: null }, "capture");
    expect(second.id).toBe(first.id);
    expect(second.correct).toBe("B");
    expect(second.rationale).toBe("Choice B is the best answer.");
    expect(second.source).toBe("capture");

    const attempt = await q.createAttempt(USER, { questionId: first.id, picked: "A", reasoning: "guessed" });
    await q.finishAttempt(attempt.id, { explanation: { rule_id: "BND-01" }, ruleId: "BND-01", provider: "stub", model: "m" });
    const right = await q.createAttempt(USER, { questionId: first.id, picked: "correct", reasoning: null });
    await q.finishAttempt(right.id, { explanation: {}, ruleId: "BND-01", provider: "stub", model: "m" });
    const drill = await q.createDrill(USER, { attemptId: attempt.id, ruleId: "BND-01", question: { stem: "x" } });
    await q.answerDrill(drill.id, "C", false);

    const stats = await q.getRuleStats(USER);
    expect(stats).toEqual([expect.objectContaining({ ruleId: "BND-01", attemptMisses: 1, drillMisses: 1, misses: 2 })]);

    const list = await q.listAttempts(USER);
    expect(list).toHaveLength(2);
    expect(list[0].question.id).toBe(first.id);

    await q.addChatMessage(USER, attempt.id, "user", "why?");
    await q.addChatMessage(USER, attempt.id, "assistant", "because");
    expect((await q.listChatMessages(attempt.id)).map((m) => m.role)).toEqual(["user", "assistant"]);

    await q.recordProviderError("openai", "429 quota", new Date(Date.now() + 1000));
    await q.recordProviderOk("openai");
    const status = await q.listProviderStatus();
    expect(status[0].provider).toBe("openai");
    expect(status[0].cooldownUntil).toBeNull();

    expect(await q.countUnlockAttempts("1.2.3.4", new Date(Date.now() - 1000))).toBe(0);
    await q.recordUnlockAttempt("1.2.3.4");
    expect(await q.countUnlockAttempts("1.2.3.4", new Date(Date.now() - 1000))).toBe(1);

    await q.deleteAttempt(attempt.id);
    expect((await q.listAttempts(USER)).length).toBe(1);
  });
});
