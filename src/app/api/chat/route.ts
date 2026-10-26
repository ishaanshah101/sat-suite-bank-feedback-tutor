import { convertToModelMessages, createUIMessageStreamResponse, streamText, toUIMessageStream, type UIMessage } from "ai";
import { z } from "zod";
import { HttpError, readJson, withApi } from "@/lib/api";
import { chatInstructions } from "@/lib/ai/prompts";
import { noteStreamError, noteStreamOk, pickProvider } from "@/lib/ai/providers";
import { RuleCardSchema, type Pick } from "@/lib/ai/schemas";
import { addChatMessage, getAttempt } from "@/db/queries";
import { chargeAiQuota } from "@/lib/ai/quota";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TEXT = 4000;

const MessageSchema = z.object({
  id: z.string().max(200).optional(),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(z.looseObject({ type: z.string(), text: z.string().max(MAX_TEXT).optional() })).min(1).max(20),
});

const Body = z.object({
  attemptId: z.string().uuid(),
  messages: z.array(MessageSchema).min(1).max(60),
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
    await chargeAiQuota(session.userId, "chat");
    const provider = await pickProvider();
    // Only text parts reach the model; the question context lives in instructions, never in messages.
    const safeMessages: UIMessage[] = body.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m, i) => ({
        id: m.id ?? `m-${i}`,
        role: m.role as "user" | "assistant",
        parts: m.parts.filter((p): p is { type: "text"; text: string } => p.type === "text" && typeof p.text === "string"),
      }));
    const last = safeMessages[safeMessages.length - 1];
    if (last?.role === "user") {
      const text = textOf(last).slice(0, MAX_TEXT);
      if (text) await addChatMessage(session.userId, attempt.id, "user", text);
    }
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
    // Keep reading the model even if the browser disconnects, so onEnd runs and the reply is saved.
    void result.consumeStream({ onError: (error) => console.error("[chat] drain", error) });
    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream }),
      headers: { "cache-control": "no-store" },
    });
  });
}
