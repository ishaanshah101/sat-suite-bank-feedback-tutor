import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { answerKey, cleanGridIn, displayAnswer, sameAnswer, solveCarefully, type SolveOutput } from "@/lib/ai/solve";

const base: SolveOutput = {
  question_found: true,
  exam: "sat",
  section: "math",
  format: "mcq",
  letter_style: "abcd",
  stem: "What is x?",
  choices: { A: "1", B: "2", C: "3", D: "4", E: "" },
  work: "",
  correct_letter: "B",
  correct_answer: null,
  why: [],
  confidence: 0.9,
};
const grid = (value: string): SolveOutput => ({ ...base, format: "spr", correct_letter: null, correct_answer: value });

describe("comparing two solves", () => {
  it("multiple choice agrees only on the same position letter", () => {
    expect(sameAnswer(base, { ...base })).toBe(true);
    expect(sameAnswer(base, { ...base, correct_letter: "C" })).toBe(false);
    expect(sameAnswer(base, { ...base, correct_letter: null })).toBe(false);
  });

  it("grid-ins agree on the same value in any form", () => {
    expect(sameAnswer(grid("3/17"), grid("6/34"))).toBe(true);
    expect(sameAnswer(grid("x = 3/17"), grid("\\(\\frac{3}{17}\\)"))).toBe(true);
    expect(sameAnswer(grid(".1764"), grid("3/17"))).toBe(true);
    expect(sameAnswer(grid("2.5"), grid("5/2"))).toBe(true);
    expect(sameAnswer(grid("-4"), grid("4"))).toBe(false);
    expect(sameAnswer(grid("3/17"), grid("3/16"))).toBe(false);
  });

  it("a grid-in never agrees with a multiple-choice answer", () => {
    expect(sameAnswer(base, grid("2"))).toBe(false);
  });

  it("answer keys and printed letters", () => {
    expect(answerKey(grid("6/34"))).toBe("3/17");
    expect(cleanGridIn(" y = +12 ")).toBe("12");
    expect(displayAnswer({ ...base, letter_style: "fghj", correct_letter: "B" })).toBe("G");
    expect(displayAnswer({ ...base, letter_style: "fghj", correct_letter: "E" })).toBe("K");
    expect(displayAnswer(grid("3/17"))).toBe("3/17");
  });
});

describe("solveCarefully with the stub model", () => {
  const saved = process.env.RULECARD_STUB_AI;
  beforeAll(() => {
    process.env.RULECARD_STUB_AI = "1";
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.RULECARD_STUB_AI;
    else process.env.RULECARD_STUB_AI = saved;
  });

  it("two solves that agree: one answer, shown early, marked agreed", async () => {
    const firsts: SolveOutput[] = [];
    const r = await solveCarefully({ text: "Reading and Writing question: which choice completes the text?" }, (f) => firsts.push(f));
    expect(r.agreement).toBe("agreed");
    expect(r.final.correct_letter).toBe("B");
    expect(firsts).toHaveLength(1);
  });

  it("grid-in solves that write the same value differently still agree", async () => {
    const r = await solveCarefully({ text: "SAT Math grid-in: if 17x - 2 = 1, what is x?" });
    expect(r.agreement).toBe("agreed");
    expect(r.final.correct_answer).toBe("3/17");
  });

  it("two solves that disagree: a third careful solve decides", async () => {
    const r = await solveCarefully({ text: "STUB_DISAGREE: which choice completes the text?" });
    expect(r.agreement).toBe("tiebreak");
    expect(r.final.correct_letter).toBe("B");
    expect(r.first?.correct_letter).toBe("A");
  });

  it("no question on screen: a clear error", async () => {
    await expect(solveCarefully({ text: "STUB_NO_QUESTION: a desktop with no question on it" })).rejects.toThrow(/No complete SAT or ACT question/);
  });
});

describe("rateLimitWaitMs", () => {
  const limited = (message: string) => Object.assign(new Error(message), { statusCode: 429 });
  it("reads the gateway's retry-after hint", async () => {
    const { rateLimitWaitMs } = await import("@/lib/ai/providers");
    expect(rateLimitWaitMs(limited("Rate limit exceeded for google/gemini-2.5-flash. Retry after 9s."))).toBe(9_000);
    expect(rateLimitWaitMs(limited("Too many requests"))).toBe(10_000);
  });
  it("ignores errors that are not rate limits", async () => {
    const { rateLimitWaitMs } = await import("@/lib/ai/providers");
    expect(rateLimitWaitMs(Object.assign(new Error("Server error"), { statusCode: 500 }))).toBeNull();
    expect(rateLimitWaitMs(new Error("fetch failed"))).toBeNull();
  });
  it("treats server errors and dropped connections as worth one more try", async () => {
    const { isTransientError } = await import("@/lib/ai/providers");
    expect(isTransientError(Object.assign(new Error("Bad gateway"), { statusCode: 502 }))).toBe(true);
    expect(isTransientError(new Error("fetch failed"))).toBe(true);
    expect(isTransientError(Object.assign(new Error("Unauthorized"), { statusCode: 401 }))).toBe(false);
    expect(isTransientError(Object.assign(new Error("Slow down"), { statusCode: 429 }))).toBe(false);
  });
});
