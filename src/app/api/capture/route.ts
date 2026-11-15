import { Output, streamText } from "ai";
import { z } from "zod";
import { apiErrorPayload, readJson, withApi } from "@/lib/api";
import { captureInstructions, captureToCard, captureToExtraction, CaptureOutputSchema, PARTIAL_FIELDS, type CaptureOutput } from "@/lib/ai/capture";
import { hasKnownAnswer, sanitizeRuleCard, usableModelAnswer } from "@/lib/ai/explain";
import { ExtractionError, normalizeExtraction, parseDataUrl } from "@/lib/ai/extract";
import { abortAfter, isNoOutputError, noteStreamError, noteStreamOk, pickProvider } from "@/lib/ai/providers";
import { chargeAiQuota } from "@/lib/ai/quota";
import { createAttempt, deleteAttempt, finishAttempt, getQuestion, setModelAnswer, setModelGridInAnswer, upsertQuestion } from "@/db/queries";
import { getRule } from "@/content/rules";
import { createGateway } from "ai";

// TEMPORARY speed bench, preview deployments only: pick a model and thinking budget per request.
type Bench = { model: string; thinking: number | null; work?: boolean };
const WORK_NOTE = `

Scratch work (the "work" field, written right after answer_shown and before the answer): solve the question there first, the way a strong student writes on scratch paper: only the equations, numbers and checks, at most about 60 words, then check your result against the choices before you write correct_letter or correct_answer. If answer_shown is true, write "shown". For Reading and Writing, one short line naming the deciding words. Write work in plain text: no LaTeX and no backslashes.`;
const { question_found, exam, section, format, letter_style, answer_shown, ...restShape } = CaptureOutputSchema.shape;
const WorkSchema = z.object({ question_found, exam, section, format, letter_style, answer_shown, work: z.string(), ...restShape });
function benchOf(request: Request): Bench | null {
  if (process.env.VERCEL_ENV !== "preview") return null;
  const raw = request.headers.get("x-rulecard-bench");
  if (!raw) return null;
  try {
    const b = JSON.parse(raw) as Bench;
    return typeof b.model === "string" ? b : null;
  } catch {
    return null;
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.union([
  z.object({ image: z.string().min(32).max(6_000_000), source: z.enum(["capture", "image"]).default("capture") }),
  z.object({ text: z.string().min(20).max(20_000), source: z.literal("paste").default("paste") }),
]);

type Event =
  | { type: "partial"; card: Partial<Pick<CaptureOutput, (typeof PARTIAL_FIELDS)[number]>> }
  | { type: "done"; attemptId: string; card: unknown; question: unknown; rule: { id: string; name: string | null }; provider: string; model: string; ms: number }
  | { type: "error"; error: string; code?: string; status: number };

/**
 * POST /api/capture {image | text}: read the question and write its card in ONE model call, streamed as
 * newline-delimited JSON. "partial" events carry the answer and the bullets as they are written; "done"
 * carries the saved attempt (for "Which did you pick?"), the stored question and the final card.
 */
export async function POST(request: Request) {
  return withApi(async (session) => {
    const bench = benchOf(request);
    const body = Body.parse(await readJson(request));
    // Fail fast on a bad image before charging anything.
    if ("image" in body) parseDataUrl(body.image);
    const provider = await pickProvider();
    await chargeAiQuota(session.userId, "explain");
    const started = Date.now();
    const content: Array<{ type: "text"; text: string } | { type: "file"; mediaType: string; data: string }> = [];
    if ("image" in body) {
      const { mediaType, base64 } = parseDataUrl(body.image);
      content.push({ type: "file", mediaType, data: base64 });
      content.push({ type: "text", text: "Here is the question on my screen. Explain it." });
    } else {
      content.push({ type: "text", text: `Here is the text of the question on my screen. Explain it.\n\n${body.text}` });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: Event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        try {
          const result = streamText({
            model: bench ? createGateway()(bench.model) : provider.model("capture"),
            instructions: bench?.work ? captureInstructions() + WORK_NOTE : captureInstructions(),
            messages: [{ role: "user", content }],
            output: Output.object({ schema: (bench?.work ? WorkSchema : CaptureOutputSchema) as typeof CaptureOutputSchema, name: "captured_card" }),
            providerOptions: bench ? (bench.thinking === null ? {} : { google: { thinkingConfig: { thinkingBudget: bench.thinking } } }) : provider.providerOptions("capture"),
            maxOutputTokens: 9000,
            maxRetries: 1,
            abortSignal: abortAfter(55_000),
          });
          // Send the card fields as they grow; skip repeats, and stop once the transcription starts.
          let last = "";
          const marks: Record<string, number> = {};
          for await (const partial of result.partialOutputStream) {
            const at = Date.now() - started;
            marks.first ??= at;
            if (partial.correct_letter || partial.correct_answer) marks.answer ??= at;
            if (partial.rule_id) marks.bullets ??= at;
            if (partial.stem) marks.transcribe ??= at;
            const card: Record<string, unknown> = {};
            for (const key of PARTIAL_FIELDS) if (partial[key] !== undefined) card[key] = partial[key];
            const serialized = JSON.stringify(card);
            if (serialized !== last) {
              last = serialized;
              send({ type: "partial", card });
            }
          }
          let output: CaptureOutput;
          try {
            output = (await result.output) as CaptureOutput;
          } catch (error) {
            if (isNoOutputError(error)) {
              if (bench) console.error("[bench] no output", String((error as { text?: string }).text ?? "").slice(0, 3000), String((error as { cause?: unknown }).cause ?? "").slice(0, 600));
              throw new ExtractionError("The model could not read a complete question. Try again, with the whole question on screen.");
            }
            throw error;
          }
          noteStreamOk(provider);

          const parsed = normalizeExtraction(captureToExtraction(output), "text" in body ? body.text : undefined);
          const question = await upsertQuestion(session.userId, parsed, body.source);
          const attempt = await createAttempt(session.userId, { questionId: question.id, picked: "none", reasoning: null });
          try {
            const raw = captureToCard(output);
            // An official answer already stored for this question (same Question ID) wins over the model's.
            const card = sanitizeRuleCard(raw, question, "none", null, "quick");
            const gridIn = question.format === "spr";
            const modelGridIn = gridIn && !question.answers?.length ? usableModelAnswer(card) : null;
            const modelLetter = !gridIn && !question.correct ? card.correct_letter : null;
            await finishAttempt(session.userId, attempt.id, { explanation: card, ruleId: card.rule_id, provider: provider.name, model: provider.modelId("capture"), isCorrect: null });
            if (!hasKnownAnswer(question)) {
              if (modelGridIn) await setModelGridInAnswer(session.userId, question.id, modelGridIn);
              else if (modelLetter) await setModelAnswer(session.userId, question.id, modelLetter);
            }
            const updated = (await getQuestion(session.userId, question.id)) ?? question;
            const rule = getRule(card.rule_id);
            const ms = Date.now() - started;
            console.info(`[capture] ${ms} ms ${question.exam}/${question.section} ${card.rule_id}`);
            const benchInfo = bench ? { marks, usage: await result.usage, meta: await result.providerMetadata, work: (output as { work?: string }).work, outputChars: JSON.stringify(output).length } : undefined;
            send({ type: "done", attemptId: attempt.id, card, question: updated, rule: { id: card.rule_id, name: rule?.name ?? null }, provider: provider.name, model: provider.modelId("capture"), ms, ...(benchInfo ? { bench: benchInfo } : {}) } as Event);
          } catch (error) {
            await deleteAttempt(session.userId, attempt.id).catch(() => undefined);
            throw error;
          }
        } catch (error) {
          noteStreamError(provider, error);
          const { status, body: payload } = apiErrorPayload(error);
          send({ type: "error", error: payload.error, code: payload.code, status });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
  });
}
