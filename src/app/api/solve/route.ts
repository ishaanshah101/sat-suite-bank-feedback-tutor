import { z } from "zod";
import { apiErrorPayload, HttpError, readJson, withApi } from "@/lib/api";
import { parseDataUrl } from "@/lib/ai/extract";
import { availableProviders } from "@/lib/ai/providers";
import { chargeAiQuota } from "@/lib/ai/quota";
import { displayAnswer, NoQuestionError, solveCarefully, type SolveOutput } from "@/lib/ai/solve";

export const runtime = "nodejs";
// A quick solve and a careful solve run side by side; a disagreement adds one more careful solve.
export const maxDuration = 180;

const Body = z.union([
  z.object({ image: z.string().min(32).max(8_000_000) }),
  z.object({ text: z.string().min(20).max(20_000) }),
]);

/** What the helper shows for a solve: the answer as printed, and enough of the question to chat about it. */
function view(o: SolveOutput) {
  return {
    answer: displayAnswer(o),
    letter: o.correct_letter,
    value: o.correct_answer,
    exam: o.exam,
    section: o.section,
    format: o.format,
    letterStyle: o.letter_style,
    stem: o.stem,
    choices: o.choices,
    why: o.why.filter((w) => typeof w === "string" && w.trim()).slice(0, 4),
    confidence: Math.max(0, Math.min(1, Number(o.confidence) || 0)),
  };
}

type Event =
  | { type: "status"; text: string }
  | { type: "first"; result: ReturnType<typeof view> }
  | { type: "done"; result: ReturnType<typeof view>; agreement: "agreed" | "tiebreak" | "single"; ms: number }
  | { type: "error"; error: string; code?: string; status: number };

/**
 * POST /api/solve {image | text}: the Practice Test Helper. Finds the question on the screenshot and answers it,
 * carefully: a quick solve and a careful solve run at once, and a third careful solve settles any disagreement.
 * Streamed as newline-delimited JSON: "first" when the quick answer is in (shown as still checking), then "done".
 */
export async function POST(request: Request) {
  return withApi(async (session) => {
    const body = Body.parse(await readJson(request, 10 * 1024 * 1024));
    const image = "image" in body ? parseDataUrl(body.image) : undefined;
    if ((await availableProviders()).length === 0) throw new HttpError(503, "No AI provider is configured.", "no_provider");
    await chargeAiQuota(session.userId, "explain");
    const started = Date.now();
    const input = image ? { image } : { text: (body as { text: string }).text };

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: Event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        try {
          send({ type: "status", text: "Reading the question" });
          const result = await solveCarefully(input, (first) => {
            send({ type: "first", result: view(first) });
            send({ type: "status", text: "Double-checking" });
          });
          const ms = Date.now() - started;
          console.info(`[solve] ${ms} ms ${result.final.exam}/${result.final.section} ${result.agreement}`);
          send({ type: "done", result: view(result.final), agreement: result.agreement, ms });
        } catch (error) {
          const { status, body: payload } =
            error instanceof NoQuestionError ? { status: 422, body: { error: error.message, code: "no_question" } } : apiErrorPayload(error);
          send({ type: "error", error: payload.error, code: payload.code, status });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
  });
}
