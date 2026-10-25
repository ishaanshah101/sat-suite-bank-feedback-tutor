import { convertToModelMessages, createUIMessageStreamResponse, streamText, toUIMessageStream, type UIMessage } from "ai";
import { z } from "zod";
import { HttpError, readJson, withApi } from "@/lib/api";
import { chatInstructions } from "@/lib/ai/prompts";
import { noteStreamError, noteStreamOk, pickProvider } from "@/lib/ai/providers";
import { RuleCardSchema, type Pick } from "@/lib/ai/schemas";
import { addChatMessage, getAttempt } from "@/db/queries";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  attemptId: z.string().uuid(),
  messages: z.array(z.custom<UIMessage>((m) => typeof m === "object" && m !== null && "role" in m && "parts" in m)).min(1).max(60),
});

function textOf(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

export async function POST(request: Request) {
  return withApi(async (session) => {
    const body = Body.parse(await readJson(request));
    const data = await getAttempt(session.userId, body.attemptId);
    if (!data) throw new HttpError(404, "Attempt not found");
    const { attempt, question } = data;
    const card = RuleCardSchema.safeParse(attempt.explanation);
    const last = body.messages[body.messages.length - 1];
    if (last.role === "user") {
      await addChatMessage(session.userId, attempt.id, "user", textOf(last));
    }
    const provider = await pickProvider();
    // Only text parts reach the model; the question context lives in instructions, never in messages.
    const safeMessages = body.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ ...m, parts: m.parts.filter((p) => p.type === "text") }));
    const result = streamText({
      model: provider.model("chat"),
      instructions: chatInstructions(question, attempt.picked as Pick, attempt.reasoning, card.success ? card.data : null),
      messages: await convertToModelMessages(safeMessages),
      providerOptions: provider.providerOptions("chat"),
      maxOutputTokens: 1500,
      onEnd: async ({ text }) => {
        noteStreamOk(provider);
        await addChatMessage(session.userId, attempt.id, "assistant", text).catch(() => undefined);
      },
      onError: ({ error }) => {
        noteStreamError(provider, error);
        console.error("[chat]", error);
      },
    });
    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream }),
      headers: { "cache-control": "no-store" },
    });
  });
}
