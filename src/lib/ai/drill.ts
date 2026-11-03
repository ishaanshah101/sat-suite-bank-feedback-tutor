import { generateText, Output } from "ai";
import type { Rule } from "@/content/rules";
import type { QuestionRow } from "@/db/schema";
import { parseNumber, parseSprEntry } from "@/lib/questions/spr";
import { HttpError } from "@/lib/api";
import { DRILL_CHECK_INSTRUCTIONS, drillInstructions } from "./prompts";
import { abortAfter, isNoOutputError, retryOnNoOutput, withFailover, type FailoverResult, type TaskKind } from "./providers";
import { DrillCheckSchema, DrillOutputSchema, LETTERS, type Drill, type DrillCheck } from "./schemas";

/** Structural checks: the drill must be answerable in its own format. */
export function normalizeDrill(raw: Drill, rule: Rule): Drill {
  const drill: Drill = { ...raw, rule_id: rule.id, solution: (raw.solution ?? []).map((s) => s.trim()).filter(Boolean) };
  if (!drill.stem.trim()) throw new Error("The drill question was incomplete.");
  if (rule.section !== "math") drill.format = "mcq";
  if (drill.format === "spr") {
    const accepted = [...new Set((drill.accepted_answers ?? []).map((a) => a.trim()).filter((a) => parseSprEntry(a).ok))];
    if (!accepted.length) throw new Error("The grid-in drill had no answer a student could enter.");
    return { ...drill, accepted_answers: accepted, correct: null, choices: { A: "", B: "", C: "", D: "" }, why_wrong: { A: "", B: "", C: "", D: "" } };
  }
  if (LETTERS.some((l) => !drill.choices[l]?.trim()) || !drill.correct) throw new Error("The drill question was incomplete.");
  return { ...drill, accepted_answers: [] };
}

/** Does an independent solve agree with the drill's answer? Grid-ins compare values, allowing a long decimal for a fraction. */
export function checkAgrees(drill: Drill, check: DrillCheck): boolean {
  if (drill.format === "spr") {
    const value = check.answer_value?.trim().replace(/\u2212/g, "-");
    if (!value) return false;
    return drill.accepted_answers.some((a) => sameNumber(a, value));
  }
  return check.answer_letter === drill.correct;
}

function sameNumber(a: string, b: string): boolean {
  const x = parseNumber(a);
  const y = parseNumber(b);
  if (!x || !y) return false;
  if (x.value.num * y.value.den === y.value.num * x.value.den) return true;
  const dx = Number(x.value.num) / Number(x.value.den);
  const dy = Number(y.value.num) / Number(y.value.den);
  // Relative tolerance with a small floor, so tiny values are not matched loosely.
  return Math.abs(dx - dy) <= 1e-4 * Math.max(Math.abs(dx), 1e-2);
}

// Math drills are written and solved again; the route's maxDuration is 120 s, so the whole loop stops well before.
const TOTAL_BUDGET_MS = 100_000;
const RETRY_UNTIL_MS = 45_000;

/** A per-call limit that also respects what is left of the whole drill's budget. */
function budgetSignal(perCallMs: number, start: number): AbortSignal {
  return AbortSignal.any([abortAfter(perCallMs), AbortSignal.timeout(Math.max(1000, TOTAL_BUDGET_MS - (Date.now() - start)))]);
}

function describeDrill(drill: Drill): string {
  const lines: string[] = [];
  if (drill.passage) lines.push(drill.passage);
  if (drill.figure) lines.push(`Figure: ${drill.figure}`);
  lines.push(drill.stem);
  if (drill.format === "mcq") lines.push(LETTERS.map((l) => `${l}. ${drill.choices[l]}`).join("\n"));
  else lines.push("(Student-produced response: enter a number.)");
  return lines.join("\n\n");
}

async function writeDrill(kind: TaskKind, rule: Rule, question: QuestionRow, start: number) {
  return withFailover(kind, async (provider) => {
    try {
      // `.output` is where an off-schema reply throws, so it stays inside the retry.
      const raw = await retryOnNoOutput(
        async () =>
          (
            await generateText({
              model: provider.model(kind),
              instructions: drillInstructions(rule, question),
              messages: [{ role: "user", content: `Write one new question that tests ${rule.id} (${rule.name}).` }],
              output: Output.object({ schema: DrillOutputSchema, name: "drill_question" }),
              providerOptions: provider.providerOptions(kind),
              maxOutputTokens: kind === "math" ? 14000 : 6000,
              maxRetries: 1,
              abortSignal: budgetSignal(kind === "math" ? 50_000 : 25_000, start),
            })
          ).output as Drill,
      );
      return normalizeDrill(raw, rule);
    } catch (error) {
      if (isNoOutputError(error)) throw new HttpError(502, "The model did not return a complete drill. Try again.", "no_output");
      throw error;
    }
  });
}

async function solveIndependently(drill: Drill, start: number): Promise<DrillCheck> {
  const { result } = await withFailover("math", async (provider) => {
    try {
      return await retryOnNoOutput(
        async () =>
          (
            await generateText({
              model: provider.model("math"),
              instructions: DRILL_CHECK_INSTRUCTIONS,
              messages: [{ role: "user", content: describeDrill(drill) }],
              output: Output.object({ schema: DrillCheckSchema, name: "drill_check" }),
              providerOptions: provider.providerOptions("math"),
              maxOutputTokens: 10000,
              maxRetries: 1,
              abortSignal: budgetSignal(40_000, start),
            })
          ).output as DrillCheck,
      );
    } catch (error) {
      if (isNoOutputError(error)) throw new HttpError(502, "Could not double-check that question. Try again.", "unverified");
      throw error;
    }
  });
  return result;
}

/**
 * Write one practice question on the rule. Math drills are solved again from scratch by a separate call
 * and only returned when that solve agrees with the drill's answer. One rewrite is allowed, and only
 * while enough of the time budget is left for it.
 */
export async function generateDrill(rule: Rule, question: QuestionRow): Promise<FailoverResult<Drill>> {
  const start = Date.now();
  if (rule.section !== "math") return writeDrill("drill", rule, question, start);
  for (let attempt = 0; ; attempt++) {
    const written = await writeDrill("math", rule, question, start);
    const check = await solveIndependently(written.result, start);
    if (checkAgrees(written.result, check)) return written;
    console.warn("[drill] verification disagreed", { rule: rule.id, attempt, expected: written.result.correct ?? written.result.accepted_answers, got: check });
    if (attempt > 0 || Date.now() - start >= RETRY_UNTIL_MS) break;
  }
  throw new HttpError(502, "Could not double-check that question. Try again.", "unverified");
}
