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

  it("stores Math grid-ins, typed answers and grading, and counts misses from is_correct", async () => {
    const q = await import("@/db/queries");
    const grid = await q.upsertQuestion(
      USER,
      {
        qb_id: "5eedf00d",
        section: "math",
        format: "spr",
        test: "SAT Math",
        domain: "Algebra",
        skill: "Linear equations in one variable",
        difficulty: "Medium",
        passage: "\\(17x - 2 = 1\\)",
        stem: "What value of \\(x\\)?",
        choices: null,
        correct: null,
        answers: [".1764", ".1765", "3/17"],
        figure: null,
        rationale: null,
      },
      "capture",
    );
    expect(grid).toMatchObject({ section: "math", format: "spr", choices: null, answerSource: "official" });
    expect(grid.answers).toEqual([".1764", ".1765", "3/17"]);
    // A re-capture without the answer panel keeps the official answers.
    const again = await q.upsertQuestion(USER, { qb_id: "5eedf00d", section: "math", format: "spr", test: null, domain: null, skill: null, difficulty: null, passage: null, stem: "s", choices: null, correct: null, answers: null, figure: "a table", rationale: null }, "capture");
    expect(again.id).toBe(grid.id);
    expect(again.answers).toEqual([".1764", ".1765", "3/17"]);
    expect(again.figure).toBe("a table");

    const wrong = await q.createAttempt(USER, { questionId: grid.id, picked: "spr", response: ".18", reasoning: null });
    await q.finishAttempt(wrong.id, { explanation: {}, ruleId: "LE1-01", provider: "stub", model: "m", isCorrect: false });
    const right = await q.createAttempt(USER, { questionId: grid.id, picked: "spr", response: "3/17", reasoning: null });
    await q.finishAttempt(right.id, { explanation: {}, ruleId: "LE1-01", provider: "stub", model: "m", isCorrect: true });
    const stats = await q.getRuleStats(USER);
    expect(stats.find((s) => s.ruleId === "LE1-01")).toMatchObject({ attemptMisses: 1, misses: 1 });

    const drill = await q.createDrill(USER, { attemptId: wrong.id, ruleId: "LE1-01", question: { stem: "x" } });
    await q.answerDrill(drill.id, "spr", false, "7");
    expect(await q.getDrill(USER, drill.id)).toMatchObject({ picked: "spr", response: "7", correct: false });

    const unknown = await q.upsertQuestion(USER, { qb_id: null, section: "math", format: "spr", test: null, domain: null, skill: null, difficulty: null, passage: null, stem: "t", choices: null, correct: null, answers: null, figure: null, rationale: null }, "paste");
    await q.setModelGridInAnswer(unknown.id, "6");
    expect((await q.getQuestion(USER, unknown.id))).toMatchObject({ answers: ["6"], answerSource: "model" });
  });
});
