// The Practice Test Helper's answer engine: find the one question on a screenshot and give its correct answer.
// Correctness first, so every question is solved twice, independently and differently (a quick worked solve,
// and a long careful think), and a third careful solve settles any disagreement.
import { generateText, Output } from "ai";
import { z } from "zod";
import { parseNumber } from "@/lib/questions/spr";
import { abortAfter, isNoOutputError, rateLimitWaitMs, retryOnNoOutput, withFailover, type TaskKind } from "./providers";
import { ChoicesOutputSchema, ExamSchema, FormatSchema, LetterSchema, LetterStyleSchema, SectionSchema } from "./schemas";

export const SolveOutputSchema = z.object({
  question_found: z.boolean(),
  exam: ExamSchema,
  section: SectionSchema,
  format: FormatSchema,
  letter_style: LetterStyleSchema,
  /** The question being asked, word for word (not the whole passage). */
  stem: z.string(),
  choices: ChoicesOutputSchema,
  /** Scratch work, written before the answer. */
  work: z.string(),
  /** By position: A is the first choice even when the screen prints F. Null for a grid-in. */
  correct_letter: LetterSchema.nullable(),
  /** Grid-in only: the exact value. Null for multiple choice. */
  correct_answer: z.string().nullable(),
  /** One to three short sentences: why that answer is right. */
  why: z.array(z.string()),
  confidence: z.number(),
});
export type SolveOutput = z.infer<typeof SolveOutputSchema>;

const SOLVE_READING = `What is on screen: a Digital SAT or ACT practice question. It may be the Bluebook practice-test screen (a passage on the left, the numbered question and its choices on the right, a timer and tool bar at the top), a My Practice review page, a Question Bank PDF, an ACT practice test, or a photo or screenshot of any of these. Ignore everything that is not the question: menus, toolbars, the timer, other apps and windows, chat panels.
- Find the one question the student is on: the numbered question with its choices (on an ACT page with several, the marked or highlighted one, else the first complete one).
- A choice the student selected, highlighted or crossed out is THEIR mark, not the answer. Ignore it. Only use an answer the page itself states ("Correct Answer: B", "The correct answer is A", an answer key line); if one is stated, that is the answer.
- If a calculator, reference sheet or another window covers part of the question, use what is visible and lower your confidence.
- exam: "act" for ACT material (ACT branding; English essays with NO CHANGE choices; Passage I/II; Science studies; choices alternating A-D and F-J), else "sat".
- section: SAT "rw" (Reading and Writing) or "math"; ACT "english", "math", "reading" or "science".
- format: "mcq" with answer choices; "spr" for an SAT Math student-produced response (an answer box, no choices; then every choice is an empty string).
- letter_style: "fghj" when the choices are printed F, G, H, J (K), otherwise "abcd". correct_letter is always by position: the first choice is A, the second B, and so on, even when the screen prints F G H J K.
- stem: the question being asked, word for word. choices: each choice's text without its letter, math in LaTeX inside \\( \\); E is an empty string unless there is a fifth choice.
- If no complete question is visible, set question_found to false and keep everything else short.`;

const SOLVE_METHOD = `How to answer:
- work: solve before you answer. Math: write the equations and arithmetic step by step, then check the result (plug it back in, or test it against every choice). Reading and Writing / English / Reading / Science: name the rule or the evidence in the text, then test every choice against it in a few words. End the work with the choice your result matches, as printed and by position (for example "-i is choice G, position B"). Plain text, no LaTeX, no line breaks inside the field.
- correct_letter (multiple choice, by position) or correct_answer (grid-in, the exact value: a fraction like 3/17, not a rounded decimal).
- why: one to three short plain sentences on why that answer is right, using the letters as printed. Math in LaTeX inside \\( \\); never $ for math. Each sentence on one line.
- confidence: 0 to 1, honest. Lower it when the question is hard, the screen is partly covered, or you are choosing between two close choices.
Getting the answer right is the only goal. Take the time you need.`;

export function solveInstructions(): string {
  return `You are the Rulecard Practice Test Helper. A student reviewing a Digital SAT or ACT practice test is stuck on one question and wants its correct answer. Produce structured output.

${SOLVE_READING}

${SOLVE_METHOD}`;
}

export interface SolveImage {
  mediaType: string;
  base64: string;
}

type UserContent = Array<{ type: "text"; text: string } | { type: "file"; mediaType: string; data: string }>;

function userContent(input: { image?: SolveImage; text?: string }, note?: string): UserContent {
  const content: UserContent = [];
  if (input.image) {
    content.push({ type: "file", mediaType: input.image.mediaType, data: input.image.base64 });
    content.push({ type: "text", text: "This is my screen. Answer the question on it." });
  } else {
    content.push({ type: "text", text: `This is the question on my screen. Answer it.\n\n${input.text ?? ""}` });
  }
  if (note) content.push({ type: "text", text: note });
  return content;
}

/** One solve. `kind` picks the effort: "capture" is a quick worked solve, "math" a long careful think. */
/** The whole careful solve must finish inside the route's 180 s limit, with room to send the answer. */
const SOLVE_BUDGET_MS = 165_000;

/**
 * One solve. A rate limit ("retry after N s" from the free AI Gateway) is waited out and the call made again,
 * as long as the wait still leaves time before `deadline`: this helper may be slow, but should not fail.
 */
export async function solveOnce(
  kind: TaskKind,
  input: { image?: SolveImage; text?: string },
  note?: string,
  deadline = Date.now() + SOLVE_BUDGET_MS,
): Promise<SolveOutput> {
  const careful = kind !== "capture";
  for (;;) {
    const timeLeft = deadline - Date.now();
    try {
      const { result } = await withFailover(kind, (provider) =>
        retryOnNoOutput(
          async () =>
            (
              await generateText({
                model: provider.model(kind),
                instructions: solveInstructions(),
                messages: [{ role: "user", content: userContent(input, note) }],
                output: Output.object({ schema: SolveOutputSchema, name: "solved_question" }),
                providerOptions: provider.providerOptions(kind),
                maxOutputTokens: careful ? 16000 : 6000,
                maxRetries: 1,
                abortSignal: abortAfter(Math.max(1_000, Math.min(careful ? 75_000 : 40_000, timeLeft))),
              })
            ).output as SolveOutput,
        ),
      );
      return result;
    } catch (error) {
      const wait = rateLimitWaitMs(error);
      // Wait at most 20 s at a time, and only if a typical solve (about 15 s) still fits afterwards.
      if (wait === null || Date.now() + Math.min(wait, 20_000) + 15_000 > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(wait, 20_000)));
    }
  }
}

/** A grid-in answer as the model wrote it, cleaned up: "x = 3/17", "\\(\\frac{3}{17}\\)" and "3/17" are all 3/17. */
export function cleanGridIn(raw: string | null): string {
  return (raw ?? "")
    .trim()
    .replace(/\\\(|\\\)/g, "")
    .replace(/\\d?frac\{([^}]*)\}\{([^}]*)\}/g, "$1/$2")
    .replace(/^[a-z]\s*=\s*/i, "")
    .replace(/\s+/g, "")
    .replace(/^\+/, "");
}

/** The answer as one comparable key: a letter by position, or a grid-in value as a reduced fraction. */
export function answerKey(output: Pick<SolveOutput, "format" | "correct_letter" | "correct_answer">): string | null {
  if (output.format === "mcq") return output.correct_letter ?? null;
  const raw = cleanGridIn(output.correct_answer);
  if (!raw) return null;
  const parsed = parseNumber(raw);
  return parsed ? `${parsed.value.num}/${parsed.value.den}` : `text:${raw.toLowerCase()}`;
}

/** Two answers agree when they name the same choice, or the same grid-in value (3/17 and 6/34 agree; .1764 and 3/17 do too). */
export function sameAnswer(a: SolveOutput, b: SolveOutput): boolean {
  if (a.format !== b.format) return false;
  const ka = answerKey(a);
  const kb = answerKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (a.format !== "spr") return false;
  // A grid-in decimal can be the truncated or rounded form of the fraction: compare values to 4 digits.
  const va = valueOf(a.correct_answer);
  const vb = valueOf(b.correct_answer);
  return va !== null && vb !== null && Math.abs(va - vb) < 5e-4 * Math.max(1, Math.abs(va));
}

function valueOf(raw: string | null): number | null {
  const parsed = raw ? parseNumber(cleanGridIn(raw)) : null;
  return parsed ? Number(parsed.value.num) / Number(parsed.value.den) : null;
}

/** The answer as printed on screen: F G H J K for an ACT "fghj" question, the value for a grid-in. */
export function displayAnswer(output: Pick<SolveOutput, "format" | "letter_style" | "correct_letter" | "correct_answer">): string {
  if (output.format === "spr") return output.correct_answer?.trim() || "?";
  const letter = output.correct_letter;
  if (!letter) return "?";
  return output.letter_style === "fghj" ? ({ A: "F", B: "G", C: "H", D: "J", E: "K" } as const)[letter] : letter;
}

/** The note for a tiebreak solve: what the first two found, so the third can find who slipped. */
export function tiebreakNote(first: SolveOutput, second: SolveOutput): string {
  const line = (o: SolveOutput, n: number) => `Solver ${n} answered ${displayAnswer(o)}. Their work: ${o.work.slice(0, 1200)}`;
  return `Two solvers disagreed on this question.\n${line(first, 1)}\n${line(second, 2)}\nSolve it again from scratch, carefully. Check each of their answers against the question, find the mistake, and give the answer that is actually right.`;
}

export type Agreement = "agreed" | "tiebreak" | "single";

export interface SolveResult {
  final: SolveOutput;
  agreement: Agreement;
  /** The quick solve, when it finished first: shown while the careful one is still checking. */
  first: SolveOutput | null;
}

export class NoQuestionError extends Error {
  constructor() {
    super("No complete SAT or ACT question is visible. Open the question so it and its choices are on screen, then try again.");
  }
}

const found = (o: SolveOutput | null): o is SolveOutput => Boolean(o && o.question_found && answerKey(o));

/**
 * Solve carefully: a quick worked solve and a long careful solve run at the same time. If they agree, done.
 * If not (or one failed), a third careful solve that sees both decides. `onFirst` fires when the quick one lands.
 */
export async function solveCarefully(
  input: { image?: SolveImage; text?: string },
  onFirst: (first: SolveOutput) => void = () => undefined,
): Promise<SolveResult> {
  const deadline = Date.now() + SOLVE_BUDGET_MS;
  const settle = <T>(p: Promise<T>) => p.then((v) => v, (error: unknown) => (isNoOutputError(error) ? null : Promise.reject(error)));
  const quickP = settle(solveOnce("capture", input, undefined, deadline)).then((quick) => {
    if (found(quick)) onFirst(quick);
    return quick;
  });
  const carefulP = settle(solveOnce("math", input, undefined, deadline));
  const [quickR, carefulR] = await Promise.allSettled([quickP, carefulP]);
  const quick = quickR.status === "fulfilled" ? quickR.value : null;
  const careful = carefulR.status === "fulfilled" ? carefulR.value : null;
  const sawNoQuestion = [quick, careful].some((o) => o !== null && !o.question_found);
  if (!found(quick) && !found(careful)) {
    if (sawNoQuestion) throw new NoQuestionError();
    throw quickR.status === "rejected" ? quickR.reason : carefulR.status === "rejected" ? carefulR.reason : new NoQuestionError();
  }
  if (found(quick) && found(careful) && sameAnswer(quick, careful)) return { final: careful, agreement: "agreed", first: quick };
  // They disagree, or only one finished: a third careful solve decides.
  const known = [quick, careful].filter(found);
  const note = known.length === 2 ? tiebreakNote(known[0], known[1]) : undefined;
  const third = await settle(solveOnce("math", input, note, deadline)).catch(() => null);
  if (found(third)) {
    if (known.length === 1 && !sameAnswer(third, known[0])) return { final: third, agreement: "tiebreak", first: found(quick) ? quick : null };
    return { final: third, agreement: known.length === 2 ? "tiebreak" : "agreed", first: found(quick) ? quick : null };
  }
  return { final: found(careful) ? careful : known[0], agreement: "single", first: found(quick) ? quick : null };
}
