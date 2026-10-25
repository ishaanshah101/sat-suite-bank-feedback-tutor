import { describe, expect, it } from "vitest";
import { sanitizeRuleCard } from "@/lib/ai/explain";
import type { QuestionRow } from "@/db/schema";
import type { RuleCard } from "@/lib/ai/schemas";

const question: QuestionRow = {
  id: "q1",
  userId: "u1",
  qbId: "960dec02",
  source: "paste",
  test: "SAT Reading and Writing",
  domain: "Standard English Conventions",
  skill: "Boundaries",
  difficulty: "Medium",
  stem: "Which choice completes the text?",
  passage: "x _____ y",
  choices: { A: "a", B: "b", C: "c", D: "d" },
  correct: "B",
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
  why_correct: "w",
  why_pick_fails: "f",
  eliminations: [{ letter: "B", reason: "r" }],
  takeaway: "t",
  diagnosis: "rule_gap",
  confidence: 1.7,
  solved_by_model: true,
  suggested_rule: null,
};

describe("sanitizeRuleCard", () => {
  it("normalizes the id, trusts the official answer and fills eliminations", () => {
    const out = sanitizeRuleCard(card, question, "A");
    expect(out.rule_id).toBe("BND-01");
    expect(out.correct_letter).toBe("B");
    expect(out.solved_by_model).toBe(false);
    expect(out.confidence).toBe(1);
    expect(out.eliminations.map((e) => e.letter).sort()).toEqual(["C", "D"]);
    expect(out.diagnosis).toBe("rule_gap");
  });

  it("falls back to the general rule the prompt promises when the id is unknown, with low confidence", () => {
    const out = sanitizeRuleCard({ ...card, rule_id: "ZZZ-99", confidence: 0.9 }, question, "A");
    expect(out.rule_id).toBe("GEN-03");
    expect(out.suggested_rule).toBe("ZZZ-99");
    expect(out.confidence).toBeLessThanOrEqual(0.4);
  });

  it("flags the answer as model-derived when the question has no official answer", () => {
    const out = sanitizeRuleCard({ ...card, solved_by_model: false }, { ...question, correct: null, answerSource: null }, "A");
    expect(out.solved_by_model).toBe(true);
    const official = sanitizeRuleCard({ ...card, solved_by_model: true }, question, "A");
    expect(official.solved_by_model).toBe(false);
    const earlier = sanitizeRuleCard({ ...card, solved_by_model: false }, { ...question, answerSource: "model" }, "A");
    expect(earlier.solved_by_model).toBe(true);
  });

  it("marks a correct pick as got_it_right and drops why_pick_fails", () => {
    const out = sanitizeRuleCard(card, question, "B");
    expect(out.diagnosis).toBe("got_it_right");
    expect(out.why_pick_fails).toBeNull();
    const right = sanitizeRuleCard(card, question, "correct");
    expect(right.diagnosis).toBe("got_it_right");
    expect(right.eliminations.map((e) => e.letter).sort()).toEqual(["A", "C", "D"]);
  });

  it("keeps the model's answer when no official answer exists", () => {
    const out = sanitizeRuleCard(card, { ...question, correct: null }, "A");
    expect(out.correct_letter).toBe("C");
    expect(out.solved_by_model).toBe(true);
  });
});
