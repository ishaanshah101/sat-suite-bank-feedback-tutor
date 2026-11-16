import { beforeAll, describe, expect, it } from "vitest";
import { captureInstructions, captureToCard, captureToExtraction, compactRuleLibrary, type CaptureOutput } from "@/lib/ai/capture";
import { classify, normalizeExtraction } from "@/lib/ai/extract";
import { fallbackRule, sanitizeRuleCard } from "@/lib/ai/explain";
import { getRule, ruleFits, rulesForExamSection, RULES } from "@/content/rules";
import { playbookForPrompt } from "@/content/playbook";
import { choiceLetters, displayLetter } from "@/lib/ai/schemas";
import { ACT_SKILLS, normalizeSkill } from "@/lib/questions/taxonomy";
import type { QuestionRow } from "@/db/schema";

beforeAll(() => {
  process.env.DATABASE_URL = "pglite://memory";
});

const output: CaptureOutput = {
  question_found: true,
  exam: "act",
  section: "math",
  format: "mcq",
  letter_style: "fghj",
  answer_shown: false,
  work: "23 = 4*5 + 3, so i^23 = i^3 = -i.",
  correct_letter: "E",
  correct_answer: null,
  key_rules: ["The powers of i repeat every 4: i, -1, -i, 1.", "Divide the exponent by 4: 23 leaves 3, so \\(i^{23} = -i\\)."],
  rule_id: "AMA-01",
  rule_statement: "Reduce the exponent mod 4.",
  eliminations: [
    { letter: "A", reason: "a" },
    { letter: "B", reason: "b" },
  ],
  why_correct: "w",
  steps: ["23 = 4(5) + 3", "i^3 = -i"],
  shortcut: null,
  takeaway: "Mod 4.",
  confidence: 0.9,
  suggested_rule: null,
  qb_id: "deadbeef",
  test: "ACT Math",
  domain: null,
  skill: "Number and Quantity",
  difficulty: null,
  passage: null,
  stem: "What is \\(i^{23}\\)?",
  figure: null,
  choices: { A: "1", B: "i", C: "-1", D: "0", E: "-i" },
  accepted_answers: [],
  notes: null,
};

describe("one-call capture", () => {
  it("builds one cacheable prompt that carries every rule and both tests", () => {
    const text = captureInstructions();
    expect(captureInstructions()).toBe(text);
    expect(text).toMatch(/Digital SAT and the ACT/);
    expect(text).toMatch(/as many bullet points as this question needs/);
    const library = compactRuleLibrary();
    for (const id of ["BND-01", "LE1-01", "AEN-01", "AMA-01", "ARD-01", "ASC-01"]) expect(library).toContain(`${id} [`);
    expect(library).toMatch(/BND-01 \[SAT Reading and Writing, ACT English\/Reading;/);
    // Small enough to stay fast: the whole prompt is well under 200k characters.
    expect(text.length).toBeLessThan(200_000);
  });

  it("turns a capture into a stored ACT question: five choices, F-K letters, no SAT id, answer not official", () => {
    const q = normalizeExtraction(captureToExtraction(output));
    expect(q).toMatchObject({ exam: "act", section: "math", letter_style: "fghj", qb_id: null, correct: null, skill: "Number and Quantity", domain: "ACT Math" });
    expect(q.choices?.E).toBe("-i");
    const card = captureToCard(output);
    expect(card).toMatchObject({ mode: "quick", correct_letter: "E", solved_by_model: true, diagnosis: "unknown" });
  });

  it("a shown answer is official", () => {
    const q = normalizeExtraction(captureToExtraction({ ...output, answer_shown: true }));
    expect(q.correct).toBe("E");
  });
});

describe("ACT support", () => {
  it("classifies ACT sections and skills without touching SAT labels", () => {
    expect(classify({ exam: "act", section: "english", skill: "Usage" })).toMatchObject({ exam: "act", section: "english", skill: "Usage", domain: "ACT English" });
    expect(classify({ exam: "act", section: "rw" })).toMatchObject({ exam: "act", section: "english" });
    expect(classify({ exam: "sat", section: "rw", skill: "Boundaries" })).toMatchObject({ exam: "sat", section: "rw", skill: "Boundaries" });
    expect(normalizeSkill("Functions")).toBeNull();
    expect(normalizeSkill("Functions", "act")).toBe("Functions");
  });

  it("every ACT skill has rules and a playbook entry", () => {
    for (const skill of ACT_SKILLS) expect(RULES.some((r) => r.skill === skill), skill).toBe(true);
    expect(playbookForPrompt("science", "Interpretation of Data", "act")).toMatch(/Playbook for Interpretation of Data/);
    expect(playbookForPrompt("math", null, "act")).toMatch(/ACT Math/);
  });

  it("shares SAT grammar and math rules with the ACT, never the other way", () => {
    const english = rulesForExamSection("act", "english").map((r) => r.id);
    expect(english).toContain("BND-01");
    expect(english).toContain("AEN-01");
    expect(rulesForExamSection("sat", "rw").map((r) => r.id)).not.toContain("AEN-01");
    expect(ruleFits(getRule("LE1-01")!, "act", "math")).toBe(true);
    expect(ruleFits(getRule("AMA-01")!, "sat", "math")).toBe(false);
    expect(fallbackRule("act", "science").id).toBe("ASC-00");
    expect(fallbackRule("sat", "math").id).toBe("MTH-02");
  });

  it("letters: five choices only when E exists, F G H J K when printed so", () => {
    expect(choiceLetters({ E: "" })).toEqual(["A", "B", "C", "D"]);
    expect(choiceLetters({ E: "x" })).toEqual(["A", "B", "C", "D", "E"]);
    expect(["A", "B", "C", "D", "E"].map((l) => displayLetter(l as "A", "fghj")).join("")).toBe("FGHJK");
    expect(displayLetter("C", null)).toBe("C");
  });

  it("sanitizes an ACT card: ACT rules allowed, SAT-only rules replaced, a reason for all five choices", () => {
    const question = {
      id: "q", userId: "u", qbId: null, exam: "act", letterStyle: "fghj", section: "math", format: "mcq", source: "capture", test: "ACT Math", domain: "ACT Math", skill: "Number and Quantity", difficulty: null,
      stem: "s", passage: null, choices: { A: "1", B: "i", C: "-1", D: "0", E: "-i" }, correct: null, answers: null, figure: null, answerSource: null, rationale: null, raw: null, createdAt: new Date(), updatedAt: null,
    } as QuestionRow;
    const card = sanitizeRuleCard(captureToCard(output), question, "none", null, "quick");
    expect(card.rule_id).toBe("AMA-01");
    expect(card.eliminations.map((e) => e.letter).sort()).toEqual(["A", "B", "C", "D"]);
    const satOnly = sanitizeRuleCard({ ...captureToCard(output), rule_id: "ARV-01" }, question, "none", null, "quick");
    expect(satOnly.rule_id).toBe("AMA-00");
    const rw = sanitizeRuleCard({ ...captureToCard(output), rule_id: "BND-01" }, { ...question, section: "english", choices: { A: "a", B: "b", C: "c", D: "d" } } as QuestionRow, "none", null, "quick");
    expect(rw.rule_id).toBe("BND-01");
  });

  it("spots a reply stuck repeating itself, and only that", async () => {
    const { isRunaway } = await import("@/lib/ai/capture");
    expect(isRunaway({ key_rules: ["The standard form is " + "\n".repeat(40)] })).toBe(true);
    expect(isRunaway({ work: "=".repeat(200) })).toBe(true);
    expect(isRunaway({ key_rules: ["The standard form is " + "\n \n".repeat(20)] })).toBe(true);
    expect(isRunaway({ key_rules: ["x " + "\\n ".repeat(80)] })).toBe(true);
    expect(isRunaway({ stem: "A table:\n1 | 2\n3 | 4\n5 | 6", key_rules: ["\\(x^2 + y^2 = 25\\), so the radius is 5."] })).toBe(false);
    expect(isRunaway({ key_rules: ["Line one.\n\nLine two."], work: "23 = 4*5 + 3, so i^23 = -i." })).toBe(false);
    expect(isRunaway(output)).toBe(false);
  });
});
