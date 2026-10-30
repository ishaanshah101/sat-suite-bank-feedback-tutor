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
  return Math.abs(dx - dy) <= 1e-4 * Math.max(1, Math.abs(dx));
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

async function writeDrill(kind: TaskKind, rule: Rule, question: QuestionRow) {
  return withFailover(kind, async (provider) => {
    try {
      const res = await retryOnNoOutput(() =>
        generateText({
          model: provider.model(kind),
          instructions: drillInstructions(rule, question),
          messages: [{ role: "user", content: `Write one new question that tests ${rule.id} (${rule.name}).` }],
          output: Output.object({ schema: DrillOutputSchema, name: "drill_question" }),
          providerOptions: provider.providerOptions(kind),
          maxOutputTokens: kind === "math" ? 14000 : 6000,
          abortSignal: abortAfter(kind === "math" ? 50_000 : 25_000),
        }),
      );
      return normalizeDrill(res.output as Drill, rule);
    } catch (error) {
      if (isNoOutputError(error)) throw new HttpError(502, "The model did not return a complete drill. Try again.", "no_output");
      throw error;
    }
  });
}

async function solveIndependently(drill: Drill): Promise<DrillCheck> {
  const { result } = await withFailover("math", async (provider) => {
    const res = await retryOnNoOutput(() =>
      generateText({
        model: provider.model("math"),
        instructions: DRILL_CHECK_INSTRUCTIONS,
        messages: [{ role: "user", content: describeDrill(drill) }],
        output: Output.object({ schema: DrillCheckSchema, name: "drill_check" }),
        providerOptions: provider.providerOptions("math"),
        maxOutputTokens: 10000,
        abortSignal: abortAfter(40_000),
      }),
    );
    return res.output as DrillCheck;
  });
  return result;
}

/**
 * Write one practice question on the rule. Math drills are solved again from scratch by a separate call
 * and only returned when that solve agrees with the drill's answer (one rewrite is allowed).
 */
export async function generateDrill(rule: Rule, question: QuestionRow): Promise<FailoverResult<Drill>> {
  if (rule.section !== "math") return writeDrill("drill", rule, question);
  for (let attempt = 0; attempt < 2; attempt++) {
    const written = await writeDrill("math", rule, question);
    const check = await solveIndependently(written.result);
    if (checkAgrees(written.result, check)) return written;
    console.warn("[drill] verification disagreed", { rule: rule.id, attempt, expected: written.result.correct ?? written.result.accepted_answers, got: check });
  }
  throw new HttpError(502, "Could not double-check that question. Try again.", "unverified");
}
