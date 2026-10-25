import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModel } from "ai";
import type { ProviderHandle, TaskKind } from "./providers";

/** Deterministic model used by tests and local runs without API keys (RULECARD_STUB_AI=1). */
const STUB_EXTRACTION = {
  question_found: true,
  qb_id: "0badf00d",
  test: "SAT Reading and Writing",
  domain: "Standard English Conventions",
  skill: "Boundaries",
  difficulty: "Medium",
  passage: "The study ended in 2019 _____ the results were published a year later.",
  stem: "Which choice completes the text so that it conforms to the conventions of Standard English?",
  choices: { A: "2019, the", B: "2019; the", C: "2019 the", D: "2019, and the" },
  visible_answer_panel: true,
  correct: "B",
  rationale: "Choice B is the best answer. The semicolon correctly joins two independent clauses.",
  notes: null,
};

const STUB_CARD = {
  rule_id: "BND-01",
  rule_statement: "Two complete sentences can be joined only by a period, a semicolon, a comma plus a FANBOYS word, a colon, or a dash.",
  correct_letter: "B",
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

const STUB_DRILL = {
  rule_id: "BND-01",
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

function jsonFor(kind: TaskKind): string {
  if (kind === "extract") return JSON.stringify(STUB_EXTRACTION);
  if (kind === "drill") return JSON.stringify(STUB_DRILL);
  return JSON.stringify(STUB_CARD);
}

function mockModel(kind: TaskKind): LanguageModel {
  const text = kind === "chat" ? "Stub tutor reply: the semicolon joins two complete sentences." : jsonFor(kind);
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 20, text: 20, reasoning: undefined },
      },
      warnings: [],
    }),
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
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
