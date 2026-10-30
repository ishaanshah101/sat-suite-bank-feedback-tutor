import { describe, expect, it } from "vitest";
import { hasKnownAnswer, sanitizeRuleCard, usableModelAnswer } from "@/lib/ai/explain";
import { isPickCorrect } from "@/lib/ai/prompts";
import type { QuestionRow } from "@/db/schema";
import { RuleCardSchema, type RuleCard } from "@/lib/ai/schemas";

const question: QuestionRow = {
  id: "q1",
  userId: "u1",
  qbId: "960dec02",
  section: "rw",
  format: "mcq",
  source: "paste",
  test: "SAT Reading and Writing",
  domain: "Standard English Conventions",
  skill: "Boundaries",
  difficulty: "Medium",
  stem: "Which choice completes the text?",
  passage: "x _____ y",
  choices: { A: "a", B: "b", C: "c", D: "d" },
  correct: "B",
  answers: null,
  figure: null,
  answerSource: "official",
  rationale: null,
  raw: null,
  createdAt: new Date(),
  updatedAt: null,
};

const card: RuleCard = {
  rule_id: "bnd-01",
  rule_statement: "s",
  correct_letter: "C",
  correct_answer: null,
  why_correct: "w",
  why_pick_fails: "f",
  eliminations: [{ letter: "B", reason: "r" }],
  steps: ["should be dropped for R&W"],
  shortcut: "should be dropped for R&W",
  takeaway: "t",
  diagnosis: "rule_gap",
  confidence: 1.7,
  solved_by_model: true,
  suggested_rule: null,
};

const gridIn: QuestionRow = {
  ...question,
  qbId: "5eedf00d",
  section: "math",
  format: "spr",
  test: "SAT Math",
  domain: "Algebra",
  skill: "Linear equations in one variable",
  stem: "What value of \\(x\\) is the solution?",
  passage: "\\(17x - 2 = 1\\)",
  choices: null,
  correct: null,
  answers: [".1764", ".1765", "3/17"],
};

const mathCard: RuleCard = {
  ...card,
  rule_id: "LE1-01",
  correct_letter: "A",
  correct_answer: "0.18",
  eliminations: [{ letter: "B", reason: "r" }],
  steps: [" Add 2: \\(17x = 3\\) ", "", "Divide by 17."],
  shortcut: " Graph it in Desmos. ",
  diagnosis: "careless",
  confidence: 0.8,
};

describe("sanitizeRuleCard (Reading and Writing)", () => {
  it("normalizes the id, trusts the official answer, fills eliminations and drops Math-only fields", () => {
    const out = sanitizeRuleCard(card, question, "A", false);
    expect(out.rule_id).toBe("BND-01");
    expect(out.correct_letter).toBe("B");
    expect(out.correct_answer).toBeNull();
    expect(out.solved_by_model).toBe(false);
    expect(out.confidence).toBe(1);
    expect(out.eliminations.map((e) => e.letter).sort()).toEqual(["C", "D"]);
    expect(out.diagnosis).toBe("rule_gap");
    expect(out.steps).toEqual([]);
    expect(out.shortcut).toBeNull();
  });

  it("falls back to the general rule when the id is unknown or from the other section", () => {
    const out = sanitizeRuleCard({ ...card, rule_id: "ZZZ-99", confidence: 0.9 }, question, "A", false);
    expect(out.rule_id).toBe("GEN-03");
    expect(out.suggested_rule).toBe("ZZZ-99");
    expect(out.confidence).toBeLessThanOrEqual(0.4);
    expect(sanitizeRuleCard({ ...card, rule_id: "LE1-01" }, question, "A", false).rule_id).toBe("GEN-03");
  });

  it("flags the answer as model-derived when the question has no official answer", () => {
    const out = sanitizeRuleCard({ ...card, solved_by_model: false }, { ...question, correct: null, answerSource: null }, "A", null);
    expect(out.solved_by_model).toBe(true);
    expect(sanitizeRuleCard({ ...card, solved_by_model: true }, question, "A", false).solved_by_model).toBe(false);
    expect(sanitizeRuleCard({ ...card, solved_by_model: false }, { ...question, answerSource: "model" }, "A", false).solved_by_model).toBe(true);
  });

  it("marks a correct pick as got_it_right and drops why_pick_fails", () => {
    const out = sanitizeRuleCard(card, question, "B", true);
    expect(out.diagnosis).toBe("got_it_right");
    expect(out.why_pick_fails).toBeNull();
    const right = sanitizeRuleCard(card, question, "correct", true);
    expect(right.diagnosis).toBe("got_it_right");
    expect(right.eliminations.map((e) => e.letter).sort()).toEqual(["A", "C", "D"]);
  });

  it("keeps the model's answer when no official answer exists", () => {
    const out = sanitizeRuleCard(card, { ...question, correct: null }, "A", null);
    expect(out.correct_letter).toBe("C");
    expect(out.solved_by_model).toBe(true);
  });
});

describe("sanitizeRuleCard (Math grid-in)", () => {
  it("uses the official accepted answer, drops letters and eliminations, cleans steps", () => {
    const out = sanitizeRuleCard(mathCard, gridIn, "spr", false);
    expect(out.correct_letter).toBeNull();
    expect(out.correct_answer).toBe("3/17");
    expect(out.eliminations).toEqual([]);
    expect(out.steps).toEqual(["Add 2: \\(17x = 3\\)", "Divide by 17."]);
    expect(out.shortcut).toBe("Graph it in Desmos.");
    expect(out.solved_by_model).toBe(false);
    expect(out.diagnosis).toBe("careless");
  });

  it("uses the code's grading, not the model's opinion, for got_it_right", () => {
    const out = sanitizeRuleCard(mathCard, gridIn, "spr", true);
    expect(out.diagnosis).toBe("got_it_right");
    expect(out.why_pick_fails).toBeNull();
  });

  it("falls back to a Math general rule when a Reading and Writing rule is cited", () => {
    expect(sanitizeRuleCard({ ...mathCard, rule_id: "BND-01" }, gridIn, "spr", false).rule_id).toBe("MTH-02");
  });

  it("keeps a model-solved grid-in answer flagged and only stores numbers", () => {
    const unknown = { ...gridIn, answers: null, answerSource: null };
    const out = sanitizeRuleCard({ ...mathCard, correct_answer: " 3/17 " }, unknown, "spr", null);
    expect(out.correct_answer).toBe("3/17");
    expect(out.solved_by_model).toBe(true);
    expect(usableModelAnswer(out)).toBe("3/17");
    expect(usableModelAnswer({ ...out, correct_answer: "about 0.18" })).toBeNull();
    expect(hasKnownAnswer(unknown)).toBe(false);
    expect(hasKnownAnswer(gridIn)).toBe(true);
  });
});

describe("grading", () => {
  it("grades letters and grid-ins", () => {
    expect(isPickCorrect(question, "B", null)).toBe(true);
    expect(isPickCorrect(question, "A", null)).toBe(false);
    expect(isPickCorrect({ ...question, correct: null }, "A", null)).toBeNull();
    expect(isPickCorrect(gridIn, "spr", ".1765")).toBe(true);
    expect(isPickCorrect(gridIn, "spr", "0.176")).toBe(true);
    expect(isPickCorrect(gridIn, "spr", ".18")).toBe(false);
    expect(isPickCorrect(gridIn, "correct", null)).toBe(true);
    expect(isPickCorrect({ ...gridIn, answers: null }, "spr", "3/17")).toBeNull();
  });

  it("reads cards stored before Math support with defaults", () => {
    const old = { ...card, correct_letter: "B" } as Record<string, unknown>;
    delete old.correct_answer;
    delete old.steps;
    delete old.shortcut;
    const parsed = RuleCardSchema.parse(old);
    expect(parsed.steps).toEqual([]);
    expect(parsed.shortcut).toBeNull();
    expect(parsed.correct_answer).toBeNull();
  });
});
