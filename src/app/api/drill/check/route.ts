import { z } from "zod";
import { HttpError, json, readJson, withApi } from "@/lib/api";
import { DrillSchema, LetterSchema } from "@/lib/ai/schemas";
import { answerDrill, getDrill } from "@/db/queries";

export const runtime = "nodejs";

const Body = z.object({ drillId: z.string().uuid(), picked: LetterSchema });

export async function POST(request: Request) {
  return withApi(async (session) => {
    const body = Body.parse(await readJson(request));
    const row = await getDrill(session.userId, body.drillId);
    if (!row) throw new HttpError(404, "Drill not found");
    const drill = DrillSchema.parse(row.question);
    const correct = body.picked === drill.correct;
    await answerDrill(row.id, body.picked, correct);
    return json({
      correct,
      correctLetter: drill.correct,
      whyCorrect: drill.why_correct,
      fix: correct ? null : drill.why_wrong[body.picked],
    });
  });
}
