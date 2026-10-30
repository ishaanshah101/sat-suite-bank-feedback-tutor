import { describe, expect, it } from "vitest";
import { checkAgrees, normalizeDrill } from "@/lib/ai/drill";
import { normalizeExtraction } from "@/lib/ai/extract";
import { getRule } from "@/content/rules";
import type { Drill, ExtractionOutput } from "@/lib/ai/schemas";

const rule = getRule("LE1-01")!;
const empty = { A: "", B: "", C: "", D: "" };

const sprDrill: Drill = {
  rule_id: "x",
  format: "spr",
  passage: "\\(2x + 3 = 15\\)",
  figure: null,
  stem: "What is \\(x\\)?",
  choices: { A: "junk", B: "", C: "", D: "" },
  correct: "A",
  accepted_answers: ["6", "six", "6.000001"],
  why_correct: "w",
  why_wrong: { A: "x", B: "", C: "", D: "" },
  solution: [" Subtract 3. ", ""],
};

describe("math drills", () => {
  it("normalizes a grid-in drill to enterable answers only", () => {
    const d = normalizeDrill(sprDrill, rule);
    expect(d.rule_id).toBe("LE1-01");
    expect(d.correct).toBeNull();
    expect(d.choices).toEqual(empty);
    expect(d.accepted_answers).toEqual(["6"]);
    expect(d.solution).toEqual(["Subtract 3."]);
  });

  it("rejects drills a student could not answer", () => {
    expect(() => normalizeDrill({ ...sprDrill, accepted_answers: ["about six"] }, rule)).toThrow();
    expect(() => normalizeDrill({ ...sprDrill, format: "mcq", choices: { A: "1", B: "2", C: "", D: "4" } }, rule)).toThrow();
    expect(() => normalizeDrill({ ...sprDrill, format: "mcq", choices: { A: "1", B: "2", C: "3", D: "4" }, correct: null }, rule)).toThrow();
  });

  it("forces Reading and Writing drills to multiple choice", () => {
    const rw = getRule("BND-01")!;
    const d = normalizeDrill({ ...sprDrill, format: "spr", choices: { A: "a", B: "b", C: "c", D: "d" }, correct: "C" }, rw);
    expect(d.format).toBe("mcq");
    expect(d.accepted_answers).toEqual([]);
  });

  it("only accepts a drill when the independent solve agrees", () => {
    const d = normalizeDrill(sprDrill, rule);
    expect(checkAgrees(d, { work: "", answer_letter: null, answer_value: "6" })).toBe(true);
    expect(checkAgrees(d, { work: "", answer_letter: null, answer_value: "12/2" })).toBe(true);
    expect(checkAgrees(d, { work: "", answer_letter: null, answer_value: "7" })).toBe(false);
    expect(checkAgrees(d, { work: "", answer_letter: null, answer_value: null })).toBe(false);
    const frac = normalizeDrill({ ...sprDrill, accepted_answers: ["3/17", ".1764", ".1765"] }, rule);
    expect(checkAgrees(frac, { work: "", answer_letter: null, answer_value: "0.176470588" })).toBe(true);
    const mcq = normalizeDrill({ ...sprDrill, format: "mcq", choices: { A: "1", B: "2", C: "3", D: "6" }, correct: "D" }, rule);
    expect(checkAgrees(mcq, { work: "", answer_letter: "D", answer_value: "6" })).toBe(true);
    expect(checkAgrees(mcq, { work: "", answer_letter: "C", answer_value: "3" })).toBe(false);
  });
});

const base: ExtractionOutput = {
  question_found: true,
  section: "math",
  format: "spr",
  qb_id: "5EEDF00D",
  test: null,
  domain: null,
  skill: "Linear equations in one variable",
  difficulty: "medium",
  passage: " \\(17x - 2 = 1\\) ",
  stem: "What value of \\(x\\) is the solution?",
  figure: "  ",
  choices: empty,
  visible_answer_panel: true,
  correct: "B",
  accepted_answers: [".1764, .1765", "3/17", "3/17"],
  rationale: null,
  notes: null,
};

describe("math extraction", () => {
  it("normalizes a grid-in with its accepted answers", () => {
    const q = normalizeExtraction(base);
    expect(q).toMatchObject({ qb_id: "5eedf00d", section: "math", format: "spr", test: "SAT Math", domain: "Algebra", difficulty: "Medium", choices: null, correct: null, figure: null });
    expect(q.answers).toEqual([".1764", ".1765", "3/17"]);
    expect(q.passage).toBe("\\(17x - 2 = 1\\)");
  });

  it("drops answers when the answer panel was not visible", () => {
    expect(normalizeExtraction({ ...base, visible_answer_panel: false }).answers).toBeNull();
  });

  it("treats a Math question with four choices as multiple choice and keeps the figure", () => {
    const q = normalizeExtraction({ ...base, format: "mcq", choices: { A: "1", B: "2", C: "3", D: "4" }, figure: "Line through (0, 2) and (4, 0)" });
    expect(q).toMatchObject({ format: "mcq", correct: "B", answers: null, figure: "Line through (0, 2) and (4, 0)" });
  });

  it("infers Math from the skill when the model says rw, and never makes R&W a grid-in", () => {
    expect(normalizeExtraction({ ...base, section: "rw" }).section).toBe("math");
    const rw = { ...base, section: "rw" as const, skill: "Boundaries", format: "spr" as const };
    expect(() => normalizeExtraction(rw)).toThrow();
    const ok = normalizeExtraction({ ...rw, choices: { A: "a", B: "b", C: "c", D: "d" } });
    expect(ok).toMatchObject({ section: "rw", format: "mcq", test: "SAT Reading and Writing" });
  });
});
