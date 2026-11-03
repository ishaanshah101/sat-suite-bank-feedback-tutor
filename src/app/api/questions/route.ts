import { z } from "zod";
import { json, readJson, withApi } from "@/lib/api";
import { ParsedQuestionSchema } from "@/lib/ai/schemas";
import { upsertQuestion } from "@/db/queries";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ questions: z.array(z.unknown()).min(1).max(200) });

/** Bulk import from the browser-side PDF parser. A bad item names its index so the client can skip it. */
export async function POST(request: Request) {
  return withApi(async (session) => {
    const body = Body.parse(await readJson(request, 16 * 1024 * 1024));
    const rows = [];
    for (const [index, item] of body.questions.entries()) {
      const parsed = ParsedQuestionSchema.safeParse(item);
      if (!parsed.success) return json({ error: `Question ${index + 1} is invalid: ${parsed.error.issues[0]?.message ?? "bad shape"}`, index }, { status: 400 });
      try {
        rows.push(await upsertQuestion(session.userId, parsed.data, "pdf"));
      } catch (error) {
        console.error("[questions] import failed", index, error);
        return json({ error: `Question ${index + 1} could not be saved.`, index }, { status: 400 });
      }
    }
    return json({ questions: rows });
  });
}
