import { beforeAll, describe, expect, it } from "vitest";
import { cardModeForPick, sanitizeRuleCard } from "@/lib/ai/explain";
import { explainInstructions, isPickCorrect, pickDescription } from "@/lib/ai/prompts";
import { getRule } from "@/content/rules";
import type { QuestionRow } from "@/db/schema";
import { PickSchema, type RuleCard } from "@/lib/ai/schemas";
import { classifyCaptureError, HELP, isRestrictedUrl } from "../../extension/src/capture";

beforeAll(() => {
  process.env.DATABASE_URL = "pglite://memory";
});

const USER = "4b8ef6a2-5d4f-4f38-9a83-0e5c3b6d2a11";

const question: QuestionRow = {
  id: "q1",
  userId: "u1",
  qbId: "960dec02",
  section: "rw",
  format: "mcq",
  source: "capture",
  test: null,
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
  rationale: "Choice B is the best answer because it uses a semicolon.",
  raw: null,
  createdAt: new Date(),
  updatedAt: null,
};

const card: RuleCard = {
  rule_id: "BND-01",
  rule_statement: "Two complete sentences need a strong join.",
  key_rules: ["- A semicolon joins two complete sentences.", "Both sides are complete, so B's semicolon is the only clean join.", "Third.", "Fourth is too many."],
  simple_explanation: "should be dropped",
  mode: "explained",
  correct_letter: "B",
  correct_answer: null,
  why_correct: "w",
  why_pick_fails: "should be dropped",
  eliminations: [
    { letter: "A", reason: "Comma splice." },
    { letter: "C", reason: "Run-on." },
  ],
  steps: [],
  shortcut: null,
  takeaway: "t",
  diagnosis: "rule_gap",
  confidence: 0.9,
  solved_by_model: false,
  suggested_rule: null,
};

describe("quick card (capture first, pick later)", () => {
  it("accepts 'none' as a pick and never grades it", () => {
    expect(PickSchema.parse("none")).toBe("none");
    expect(isPickCorrect(question, "none", null)).toBeNull();
    expect(pickDescription("none", null)).toMatch(/has not said what they picked/);
  });

  it("uses the quick mode only when nothing was picked", () => {
    expect(cardModeForPick(question, "none")).toBe("quick");
    expect(cardModeForPick(question, "A")).toBe("translated");
  });

  it("asks for 2 to 3 cheat-sheet bullets and a reason for every wrong choice", () => {
    const text = explainInstructions([getRule("BND-01")!], false, question, "quick");
    expect(text).toMatch(/QUICK EXPLANATION/);
    expect(text).toMatch(/2 or 3 bullet points/);
    expect(text).toMatch(/one entry for EVERY wrong choice/);
    expect(text).toMatch(/why_pick_fails: always null/);
    expect(text).toMatch(/diagnosis: always unknown/);
    expect(text).not.toMatch(/TRANSLATES College Board/);
  });

  it("sanitizes a quick card: at most 3 bullets, no pick verdict, every wrong letter explained", () => {
    const out = sanitizeRuleCard(card, question, "none", null);
    expect(out.mode).toBe("quick");
    expect(out.key_rules).toEqual(["A semicolon joins two complete sentences.", "Both sides are complete, so B's semicolon is the only clean join.", "Third."]);
    expect(out.simple_explanation).toBeNull();
    expect(out.why_pick_fails).toBeNull();
    expect(out.diagnosis).toBe("unknown");
    expect(out.eliminations.map((e) => e.letter).sort()).toEqual(["A", "C", "D"]);
    expect(out.eliminations.find((e) => e.letter === "A")?.reason).toBe("Comma splice.");
  });

  it("stores 'none', then the real pick, and leaves an unpicked card out of the miss counts", async () => {
    const q = await import("@/db/queries");
    const row = await q.upsertQuestion(USER, { qb_id: "abcdef12", passage: "p", stem: "s", choices: { A: "a", B: "b", C: "c", D: "d" }, correct: "B", test: null, domain: null, skill: null, difficulty: null, rationale: null }, "capture");
    const attempt = await q.createAttempt(USER, { questionId: row.id, picked: "none", reasoning: null });
    await q.finishAttempt(USER, attempt.id, { explanation: { ...card, mode: "quick" }, ruleId: "BND-01", provider: "stub", model: "m", isCorrect: null });
    expect((await q.getRuleStats(USER)).find((s) => s.ruleId === "BND-01")).toBeUndefined();
    await q.recordAttemptPick(USER, attempt.id, { picked: "A", response: null, isCorrect: false, explanation: { ...card, mode: "quick", why_pick_fails: "Comma splice." } });
    const saved = await q.getAttempt(USER, attempt.id);
    expect(saved?.attempt).toMatchObject({ picked: "A", isCorrect: false });
    expect((await q.getRuleStats(USER)).find((s) => s.ruleId === "BND-01")).toMatchObject({ attemptMisses: 1 });
    // Another account cannot touch it.
    await q.recordAttemptPick("11111111-2222-4333-8444-555555555555", attempt.id, { picked: "B", response: null, isCorrect: true, explanation: {} });
    expect((await q.getAttempt(USER, attempt.id))?.attempt.picked).toBe("A");
  });
});

describe("capture errors say what to do", () => {
  const opts = { fileAccess: false, allSites: false, ownId: "lhkjgpalkmpbpholdakoejpkhghplidi" };

  it("never tries Chrome's own pages or the Web Store", () => {
    expect(isRestrictedUrl("chrome://extensions")).toBe(true);
    expect(isRestrictedUrl("https://chromewebstore.google.com/detail/x")).toBe(true);
    expect(isRestrictedUrl("https://satsuitequestionbank.collegeboard.org/")).toBe(false);
    expect(classifyCaptureError("Cannot access contents of url \"chrome://version/\".", undefined, opts).fix).toBeNull();
  });

  it("a PDF on the computer needs file access", () => {
    const e = classifyCaptureError("Cannot access contents of url \"file:///Users/me/qb.pdf\".", "file:///Users/me/qb.pdf", opts);
    expect(e.fix).toBe("fileAccess");
    expect(e.message).toBe(HELP.fileAccess);
  });

  it("another extension's PDF viewer needs the toolbar icon", () => {
    const url = "chrome-extension://efaidnbmnnnibpcajpcglclefindmkaj/viewer.html";
    expect(classifyCaptureError("Cannot access contents of url", url, { ...opts, allSites: true }).fix).toBe("toolbar");
  });

  it("a normal page without a grant offers the one-time Allow", () => {
    const e = classifyCaptureError("Either the '<all_urls>' or 'activeTab' permission is required.", undefined, opts);
    expect(e.fix).toBe("allSites");
    expect(classifyCaptureError("Either the '<all_urls>' or 'activeTab' permission is required.", undefined, { ...opts, allSites: true }).fix).toBe("toolbar");
  });
});
