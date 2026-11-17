import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModel } from "ai";
import type { ProviderHandle, TaskKind } from "./providers";

/** Deterministic model used by tests and local runs without API keys (RULECARD_STUB_AI=1). */
const STUB_EXTRACTION = {
  question_found: true,
  exam: "sat",
  section: "rw",
  format: "mcq",
  letter_style: "abcd",
  qb_id: "0badf00d",
  test: "SAT Reading and Writing",
  domain: "Standard English Conventions",
  skill: "Boundaries",
  difficulty: "Medium",
  passage: "The study ended in 2019 _____ the results were published a year later.",
  stem: "Which choice completes the text so that it conforms to the conventions of Standard English?",
  choices: { A: "2019, the", B: "2019; the", C: "2019 the", D: "2019, and the", E: "" },
  figure: null,
  visible_answer_panel: true,
  correct: "B",
  accepted_answers: [],
  rationale: "Choice B is the best answer. The semicolon correctly joins two independent clauses.",
  notes: null,
};

/** Used when the extraction input mentions "SAT Math": a grid-in with several accepted forms. */
const STUB_MATH_EXTRACTION = {
  question_found: true,
  exam: "sat",
  section: "math",
  format: "spr",
  letter_style: "abcd",
  qb_id: "5eedf00d",
  test: "SAT Math",
  domain: "Algebra",
  skill: "Linear equations in one variable",
  difficulty: "Medium",
  passage: "\\(17x - 2 = 1\\)",
  stem: "What value of \\(x\\) is the solution to the given equation?",
  figure: null,
  choices: { A: "", B: "", C: "", D: "", E: "" },
  visible_answer_panel: true,
  correct: null,
  accepted_answers: [".1764", ".1765", "3/17"],
  rationale: "The correct answer is 3/17. Adding 2 to both sides gives 17x = 3, so x = 3/17.",
  notes: null,
};

const STUB_CARD = {
  rule_id: "BND-01",
  rule_statement: "Two complete sentences can be joined only by a period, a semicolon, a comma plus a FANBOYS word, a colon, or a dash.",
  key_rules: [
    "Two complete sentences need a period, a semicolon, or a comma plus and/but/so between them.",
    "A comma alone between two complete sentences is always wrong (a comma splice).",
  ],
  simple_explanation: "Both sides of the blank are full sentences, so the blank needs a strong join. Only the semicolon is one.",
  correct_letter: "B",
  correct_answer: null,
  steps: [],
  shortcut: null,
  why_correct: "Both halves are complete sentences, and a semicolon is one of the legal joins.",
  why_pick_fails: "A comma alone between two complete sentences is a comma splice.",
  eliminations: [
    { letter: "C", reason: "Nothing between two sentences makes a run-on." },
    { letter: "D", reason: "A comma plus 'and' is legal, but 'and the' leaves the second clause without a subject here." },
  ],
  takeaway: "Two sentences, one comma: never.",
  diagnosis: "rule_gap",
  confidence: 0.95,
  solved_by_model: false,
  suggested_rule: null,
};

/** The capture card: no pick yet, so every wrong choice carries its reason. */
const STUB_QUICK_CARD = {
  ...STUB_CARD,
  key_rules: [
    "Two complete sentences need a period, a semicolon, or a comma plus and/but/so between them.",
    "Both sides of the blank are complete sentences, so only the semicolon in B joins them correctly.",
  ],
  simple_explanation: null,
  why_pick_fails: null,
  eliminations: [
    { letter: "A", reason: "A comma alone between two complete sentences is a comma splice. B's semicolon is a legal join." },
    { letter: "C", reason: "Nothing between two complete sentences is a run-on. B's semicolon fixes it." },
    { letter: "D", reason: "'and the' leaves the second clause without a subject. B keeps two full sentences joined by a semicolon." },
  ],
  diagnosis: "unknown",
};

const STUB_MATH_CARD = {
  rule_id: "LE1-01",
  rule_statement: "Undo the operations in order: add 2 to both sides, then divide by 17.",
  key_rules: ["Undo the last operation first: add back what was subtracted, then divide by the coefficient."],
  simple_explanation: "Get x alone: add 2 to both sides, then divide by 17.",
  correct_letter: null,
  correct_answer: "3/17",
  why_correct: "Adding 2 to both sides gives \\(17x = 3\\), and dividing by 17 gives \\(x = \\frac{3}{17}\\).",
  why_pick_fails: "Subtracting 2 instead of adding it gives \\(17x = -1\\), a sign slip.",
  eliminations: [],
  steps: ["Add 2 to both sides: \\(17x = 3\\).", "Divide both sides by 17: \\(x = \\frac{3}{17}\\).", "Enter 3/17 (or .1764 or .1765)."],
  shortcut: "Graph \\(y = 17x - 2\\) and \\(y = 1\\) in Desmos and read the x-value where they cross.",
  takeaway: "Undo the subtraction before you divide.",
  diagnosis: "careless",
  confidence: 0.9,
  solved_by_model: false,
  suggested_rule: null,
};

const STUB_MATH_DRILL = {
  rule_id: "LE1-01",
  format: "spr",
  passage: "\\(2x + 3 = 15\\)",
  figure: null,
  stem: "What value of \\(x\\) is the solution to the given equation?",
  choices: { A: "", B: "", C: "", D: "" },
  correct: null,
  accepted_answers: ["6"],
  why_correct: "Subtract 3, then divide by 2 (LE1-01).",
  why_wrong: { A: "", B: "", C: "", D: "" },
  solution: ["Subtract 3 from both sides: \\(2x = 12\\).", "Divide by 2: \\(x = 6\\)."],
};

const STUB_MATH_CHECK = { work: "2x = 12, so x = 6.", answer_letter: null, answer_value: "6" };

const STUB_DRILL = {
  rule_id: "BND-01",
  format: "mcq",
  figure: null,
  accepted_answers: [],
  solution: [],
  passage: "The museum closed for repairs in March _____ it reopened with a new wing in October.",
  stem: "Which choice completes the text so that it conforms to the conventions of Standard English?",
  choices: { A: "March, it", B: "March it", C: "March; it", D: "March, so it" },
  correct: "C",
  why_correct: "A semicolon legally joins the two complete sentences.",
  why_wrong: {
    A: "A comma alone between two complete sentences is a comma splice.",
    B: "No punctuation between two complete sentences is a run-on.",
    C: "Correct.",
    D: "'so' changes the meaning to cause and effect, which the sentence does not support.",
  },
};

/** One-call capture replies: SAT Reading and Writing (default), SAT Math grid-in, or ACT English. */
const STUB_CAPTURE_RW = {
  question_found: true,
  exam: "sat",
  section: "rw",
  format: "mcq",
  letter_style: "abcd",
  answer_shown: true,
  work: "shown",
  correct_letter: "B",
  correct_answer: null,
  key_rules: STUB_QUICK_CARD.key_rules,
  rule_id: "BND-01",
  rule_statement: STUB_CARD.rule_statement,
  eliminations: STUB_QUICK_CARD.eliminations,
  why_correct: STUB_CARD.why_correct,
  steps: [],
  shortcut: null,
  takeaway: STUB_CARD.takeaway,
  confidence: 0.95,
  suggested_rule: null,
  qb_id: STUB_EXTRACTION.qb_id,
  test: STUB_EXTRACTION.test,
  domain: STUB_EXTRACTION.domain,
  skill: STUB_EXTRACTION.skill,
  difficulty: STUB_EXTRACTION.difficulty,
  passage: STUB_EXTRACTION.passage,
  stem: STUB_EXTRACTION.stem,
  figure: null,
  choices: STUB_EXTRACTION.choices,
  accepted_answers: [],
  notes: null,
};

const STUB_CAPTURE_MATH = {
  ...STUB_CAPTURE_RW,
  section: "math",
  format: "spr",
  correct_letter: null,
  correct_answer: "3/17",
  key_rules: ["To solve for \\(x\\), undo the last operation first: add back what was subtracted, then divide by the coefficient.", "Add 2 to both sides: \\(17x = 3\\), so \\(x = \\frac{3}{17}\\)."],
  rule_id: "LE1-01",
  rule_statement: STUB_MATH_CARD.rule_statement,
  eliminations: [],
  why_correct: STUB_MATH_CARD.why_correct,
  steps: STUB_MATH_CARD.steps,
  shortcut: STUB_MATH_CARD.shortcut,
  qb_id: STUB_MATH_EXTRACTION.qb_id,
  test: STUB_MATH_EXTRACTION.test,
  domain: STUB_MATH_EXTRACTION.domain,
  skill: STUB_MATH_EXTRACTION.skill,
  difficulty: STUB_MATH_EXTRACTION.difficulty,
  passage: STUB_MATH_EXTRACTION.passage,
  stem: STUB_MATH_EXTRACTION.stem,
  choices: { A: "", B: "", C: "", D: "", E: "" },
  accepted_answers: STUB_MATH_EXTRACTION.accepted_answers,
};

const STUB_CAPTURE_ACT = {
  ...STUB_CAPTURE_RW,
  exam: "act",
  section: "english",
  letter_style: "fghj",
  answer_shown: false,
  work: "Both halves are complete clauses, so the join needs a semicolon: H.",
  correct_letter: "C",
  key_rules: ["Two complete sentences need a period, a semicolon, or a comma plus and/but/so between them.", "Both halves are complete, so H's semicolon is the clean join; F's comma alone is a comma splice."],
  eliminations: [
    { letter: "A", reason: "NO CHANGE keeps a comma splice: a comma alone cannot join two sentences. H's semicolon can." },
    { letter: "B", reason: "No punctuation at all makes a run-on. H fixes it with a semicolon." },
    { letter: "D", reason: "'and the' adds a second join on top of the break. H keeps one clean join." },
  ],
  qb_id: null,
  test: "ACT English",
  domain: null,
  skill: "Sentence Structure and Formation",
  difficulty: null,
  passage: "The bridge reopened in March[[, commuters]] returned within a week.",
  stem: "Which choice is best? (The first choice is NO CHANGE.)",
  choices: { A: "NO CHANGE", B: "March commuters", C: "March; commuters", D: "March, and the commuters", E: "" },
};

const STUB_SOLVE = {
  question_found: true,
  exam: "sat",
  section: "rw",
  format: "mcq",
  letter_style: "abcd",
  stem: "Which choice completes the text so that it conforms to the conventions of Standard English?",
  choices: { A: "2019,", B: "2019;", C: "2019", D: "2019, and", E: "" },
  work: "Both halves are complete sentences, so they need a semicolon: B.",
  correct_letter: "B",
  correct_answer: null,
  why: ["Both halves are complete sentences, so a semicolon joins them."],
  confidence: 0.92,
};

const STUB_SOLVE_MATH = {
  ...STUB_SOLVE,
  section: "math",
  format: "spr",
  stem: "If \\(17x - 2 = 1\\), what is the value of \\(x\\)?",
  choices: { A: "", B: "", C: "", D: "", E: "" },
  work: "17x = 3, so x = 3/17.",
  correct_letter: null,
  correct_answer: "3/17",
  why: ["Add 2 to both sides: \\(17x = 3\\), so \\(x = \\frac{3}{17}\\)."],
};

/** The Practice Test Helper's solves. "STUB_DISAGREE" in the input makes the quick and careful solves disagree. */
function solveJson(kind: TaskKind, userText: string): string {
  if (/SAT Math/.test(userText)) return JSON.stringify(kind === "capture" ? { ...STUB_SOLVE_MATH, correct_answer: "6/34" } : STUB_SOLVE_MATH);
  if (/STUB_DISAGREE/.test(userText) && kind === "capture") return JSON.stringify({ ...STUB_SOLVE, correct_letter: "A", why: ["A comma joins them."] });
  if (/STUB_DISAGREE/.test(userText) && !/Two solvers disagreed/.test(userText)) return JSON.stringify({ ...STUB_SOLVE, correct_letter: "C" });
  if (/STUB_NO_QUESTION/.test(userText)) return JSON.stringify({ ...STUB_SOLVE, question_found: false, correct_letter: null });
  return JSON.stringify(STUB_SOLVE);
}

/** Pick the stub reply from the task and from what the prompt asks for (Math or Reading and Writing). */
function jsonFor(kind: TaskKind, prompt: string, userText: string): string {
  if (/Practice Test Helper/.test(prompt) && kind !== "chat") return solveJson(kind, userText);
  if (kind === "capture") return JSON.stringify(/SAT Math/.test(userText) ? STUB_CAPTURE_MATH : /ACT (English|Math|Reading|Science)/.test(userText) ? STUB_CAPTURE_ACT : STUB_CAPTURE_RW);
  if (kind === "extract") return JSON.stringify(/SAT Math/.test(userText) ? STUB_MATH_EXTRACTION : STUB_EXTRACTION);
  if (kind === "drill") return JSON.stringify(STUB_DRILL);
  if (kind === "math") {
    if (/checking a Digital SAT Math practice question/.test(prompt)) return JSON.stringify(STUB_MATH_CHECK);
    if (/fresh practice question for the Digital SAT Math/.test(prompt)) return JSON.stringify(STUB_MATH_DRILL);
    return JSON.stringify(STUB_MATH_CARD);
  }
  return JSON.stringify(/QUICK EXPLANATION/.test(prompt) ? STUB_QUICK_CARD : STUB_CARD);
}

function promptText(options: unknown): string {
  try {
    return JSON.stringify((options as { prompt?: unknown }).prompt ?? "");
  } catch {
    return "";
  }
}

/** Only what the user sent (the instructions mention both sections, so they must not steer the stub). */
function userText(options: unknown): string {
  const prompt = (options as { prompt?: Array<{ role: string; content: unknown }> }).prompt ?? [];
  try {
    return JSON.stringify(prompt.filter((m) => m.role === "user").map((m) => m.content));
  } catch {
    return "";
  }
}

function mockModel(kind: TaskKind): LanguageModel {
  const chatText = (prompt: string) =>
    /Digital SAT Math section/.test(prompt)
      ? "Stub tutor reply: add 2 to both sides first, so \\(17x = 3\\)."
      : "Stub tutor reply: the semicolon joins two complete sentences.";
  const textFor = (options: unknown) => {
    const prompt = promptText(options);
    return kind === "chat" ? chatText(prompt) : jsonFor(kind, prompt, userText(options));
  };
  return new MockLanguageModelV4({
    doGenerate: async (options) => ({
      content: [{ type: "text", text: textFor(options) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 20, text: 20, reasoning: undefined },
      },
      warnings: [],
    }),
    doStream: async (options) => ({
      stream: new ReadableStream({
        async start(controller) {
          const text = textFor(options);
          // RULECARD_STUB_STREAM_MS slows the stream down (per 80-character piece), so a test can act while a card is still being written.
          const pause = Number(process.env.RULECARD_STUB_STREAM_MS) || 0;
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id: "t1" });
          for (let i = 0; i < text.length; i += 80) {
            controller.enqueue({ type: "text-delta", id: "t1", delta: text.slice(i, i + 80) });
            if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
          }
          controller.enqueue({ type: "text-end", id: "t1" });
          controller.enqueue({
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
              outputTokens: { total: 20, text: 20, reasoning: undefined },
            },
          });
          controller.close();
        },
      }),
    }),
  }) as unknown as LanguageModel;
}

export function stubProvider(): ProviderHandle {
  return {
    name: "stub" as unknown as ProviderHandle["name"],
    model: (kind) => mockModel(kind),
    modelId: (kind) => `stub-${kind}`,
    providerOptions: () => ({}),
  };
}
