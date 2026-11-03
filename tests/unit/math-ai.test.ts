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

  it("compares grid-in values with a relative tolerance that has a small floor", () => {
    const tiny = normalizeDrill({ ...sprDrill, accepted_answers: ["0.001"] }, rule);
    expect(checkAgrees(tiny, { work: "", answer_letter: null, answer_value: "0.001" })).toBe(true);
    expect(checkAgrees(tiny, { work: "", answer_letter: null, answer_value: "1/1000" })).toBe(true);
    expect(checkAgrees(tiny, { work: "", answer_letter: null, answer_value: "0.0011" })).toBe(false);
    const big = normalizeDrill({ ...sprDrill, accepted_answers: ["1000"] }, rule);
    expect(checkAgrees(big, { work: "", answer_letter: null, answer_value: "1000.05" })).toBe(true);
    expect(checkAgrees(big, { work: "", answer_letter: null, answer_value: "1001" })).toBe(false);
    const negative = normalizeDrill({ ...sprDrill, accepted_answers: ["-6"] }, rule);
    for (const dash of ["\u2212", "\u2013", "\u2014", "\u2012"]) {
      expect(checkAgrees(negative, { work: "", answer_letter: null, answer_value: `${dash}6` })).toBe(true);
    }
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

  it("only trusts answers from pasted text that really shows an answer line", () => {
    const text = "Question ID 5eedf00d. 17x - 2 = 1. What value of x is the solution?";
    expect(normalizeExtraction(base, text).answers).toBeNull();
    expect(normalizeExtraction(base, `${text}\nCorrect Answer: 3/17`).answers).toEqual([".1764", ".1765", "3/17"]);
    expect(normalizeExtraction(base, `${text}\ncorrect answer: 3/17`).answers).toEqual([".1764", ".1765", "3/17"]);
    const mcq = { ...base, format: "mcq" as const, choices: { A: "1", B: "2", C: "3", D: "4" } };
    expect(normalizeExtraction(mcq, text).correct).toBeNull();
    expect(normalizeExtraction(mcq, `${text} Correct Answer: B`).correct).toBe("B");
    // Screenshots keep the model's own flag.
    expect(normalizeExtraction(mcq).correct).toBe("B");
  });

  it("caps field lengths so the extractor cannot bypass the stored-question schema", () => {
    const q = normalizeExtraction({ ...base, stem: "x".repeat(5000), passage: "p".repeat(30000), figure: "f".repeat(7000), rationale: "r".repeat(30000), skill: null, domain: null, test: "t".repeat(300) });
    expect(q.stem).toHaveLength(4000);
    expect(q.passage).toHaveLength(20000);
    expect(q.figure).toHaveLength(6000);
    expect(q.rationale).toHaveLength(20000);
    expect(q.test).toHaveLength(200);
    const mcq = normalizeExtraction({ ...base, format: "mcq", choices: { A: "a".repeat(3000), B: "2", C: "3", D: "4" } });
    expect(mcq.choices?.A).toHaveLength(2000);
  });

  it("infers Math from the skill when the model says rw, and never makes R&W a grid-in", () => {
    expect(normalizeExtraction({ ...base, section: "rw" }).section).toBe("math");
    const rw = { ...base, section: "rw" as const, skill: "Boundaries", format: "spr" as const };
    expect(() => normalizeExtraction(rw)).toThrow();
    const ok = normalizeExtraction({ ...rw, choices: { A: "a", B: "b", C: "c", D: "d" } });
    expect(ok).toMatchObject({ section: "rw", format: "mcq", test: "SAT Reading and Writing" });
  });
});
