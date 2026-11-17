import { generateText } from "ai";
import { z } from "zod";
import { json, readJson, withApi } from "@/lib/api";
import { abortAfter, withFailover } from "@/lib/ai/providers";
import { chargeAiQuota } from "@/lib/ai/quota";

export const runtime = "nodejs";
export const maxDuration = 60;

const Text = (max: number) => z.string().max(max);

const Body = z.object({
  question: z
    .object({
      exam: z.enum(["sat", "act"]),
      section: Text(20),
      stem: Text(4000),
      choices: z.record(z.string(), Text(1000)).optional(),
      answer: Text(40),
      why: z.array(Text(600)).max(6).optional(),
    })
    .nullable(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: Text(2000) }))
    .min(1)
    .max(16),
});

function instructions(question: z.infer<typeof Body>["question"]): string {
  const about = question
    ? `The question the student is looking at (${question.exam === "act" ? "ACT" : "SAT"} ${question.section}):
${question.stem}
${Object.entries(question.choices ?? {})
  .filter(([, t]) => t.trim())
  .map(([k, t]) => `${k}) ${t}`)
  .join("\n")}
Correct answer (checked by two independent solves): ${question.answer}
${(question.why ?? []).map((w) => `- ${w}`).join("\n")}`
    : "No question has been captured yet.";
  return `You are the Rulecard Practice Test Helper, a calm SAT and ACT tutor in a small side panel. Answer the student's follow-up about the question below in plain words: short (2 to 5 sentences unless they ask for more), the rule first, then how it applies. Use the letters as printed on screen. Math in LaTeX inside \\( and \\); never $ for math.
You only help with SAT and ACT practice: if asked about anything else, say in one line that you only help with SAT and ACT questions.

${about}`;
}

/** POST /api/solve/chat {question, messages}: one follow-up turn about the question the helper just solved. */
export async function POST(request: Request) {
  return withApi(async (session) => {
    const body = Body.parse(await readJson(request, 200_000));
    const total = body.messages.reduce((n, m) => n + m.text.length, 0);
    if (total > 12_000) return json({ error: "This conversation is too long. Capture the question again to start fresh.", code: "too_long" }, { status: 413 });
    await chargeAiQuota(session.userId, "chat");
    const { result } = await withFailover("chat", async (provider) =>
      (
        await generateText({
          model: provider.model("chat"),
          instructions: instructions(body.question),
          messages: body.messages.map((m) => ({ role: m.role, content: m.text })),
          providerOptions: provider.providerOptions("chat"),
          maxOutputTokens: 2000,
          maxRetries: 1,
          abortSignal: abortAfter(40_000),
        })
      ).text,
    );
    return json({ reply: result.trim() });
  });
}
