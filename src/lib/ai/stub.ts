import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModel } from "ai";
import type { ProviderHandle, TaskKind } from "./providers";

/** Deterministic model used by tests and local runs without API keys (RULECARD_STUB_AI=1). */
const STUB_EXTRACTION = {
  question_found: true,
  section: "rw",
  format: "mcq",
  qb_id: "0badf00d",
  test: "SAT Reading and Writing",
  domain: "Standard English Conventions",
  skill: "Boundaries",
  difficulty: "Medium",
  passage: "The study ended in 2019 _____ the results were published a year later.",
  stem: "Which choice completes the text so that it conforms to the conventions of Standard English?",
  choices: { A: "2019, the", B: "2019; the", C: "2019 the", D: "2019, and the" },
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
  section: "math",
  format: "spr",
  qb_id: "5eedf00d",
  test: "SAT Math",
  domain: "Algebra",
  skill: "Linear equations in one variable",
  difficulty: "Medium",
  passage: "\\(17x - 2 = 1\\)",
  stem: "What value of \\(x\\) is the solution to the given equation?",
  figure: null,
  choices: { A: "", B: "", C: "", D: "" },
  visible_answer_panel: true,
  correct: null,
  accepted_answers: [".1764", ".1765", "3/17"],
  rationale: "The correct answer is 3/17. Adding 2 to both sides gives 17x = 3, so x = 3/17.",
  notes: null,
};

const STUB_CARD = {
  rule_id: "BND-01",
  rule_statement: "Two complete sentences can be joined only by a period, a semicolon, a comma plus a FANBOYS word, a colon, or a dash.",
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

const STUB_MATH_CARD = {
  rule_id: "LE1-01",
  rule_statement: "Undo the operations in order: add 2 to both sides, then divide by 17.",
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

/** Pick the stub reply from the task and from what the prompt asks for (Math or Reading and Writing). */
function jsonFor(kind: TaskKind, prompt: string, userText: string): string {
  if (kind === "extract") return JSON.stringify(/SAT Math/.test(userText) ? STUB_MATH_EXTRACTION : STUB_EXTRACTION);
  if (kind === "drill") return JSON.stringify(STUB_DRILL);
  if (kind === "math") {
    if (/checking a Digital SAT Math practice question/.test(prompt)) return JSON.stringify(STUB_MATH_CHECK);
    if (/fresh practice question for the Digital SAT Math/.test(prompt)) return JSON.stringify(STUB_MATH_DRILL);
    return JSON.stringify(STUB_MATH_CARD);
  }
  return JSON.stringify(STUB_CARD);
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
        start(controller) {
          const text = textFor(options);
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id: "t1" });
          controller.enqueue({ type: "text-delta", id: "t1", delta: text });
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
