import { z } from "zod";
import { json, readJson, withApi } from "@/lib/api";
import { ParsedQuestionSchema } from "@/lib/ai/schemas";
import { upsertQuestion } from "@/db/queries";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ questions: z.array(ParsedQuestionSchema).min(1).max(500) });

/** Bulk import from the browser-side PDF parser. */
export async function POST(request: Request) {
  return withApi(async (session) => {
    const body = Body.parse(await readJson(request, 16 * 1024 * 1024));
    const rows = [];
    for (const parsed of body.questions) {
      rows.push(await upsertQuestion(session.userId, parsed, "pdf"));
    }
    return json({ questions: rows });
  });
}
