import { z } from "zod";
import { HttpError, json, readJson, withApi } from "@/lib/api";
import { DrillSchema, LetterSchema } from "@/lib/ai/schemas";
import { answerDrill, getDrill } from "@/db/queries";
import { displayAnswer, isSprCorrect, parseSprEntry } from "@/lib/questions/spr";

export const runtime = "nodejs";

const Body = z.union([
  z.object({ drillId: z.string().uuid(), picked: LetterSchema }),
  z.object({ drillId: z.string().uuid(), response: z.string().max(20) }),
]);

export async function POST(request: Request) {
  return withApi(async (session) => {
    const body = Body.parse(await readJson(request));
    const row = await getDrill(session.userId, body.drillId);
    if (!row) throw new HttpError(404, "Drill not found");
    const drill = DrillSchema.parse(row.question);
    const base = { format: drill.format, whyCorrect: drill.why_correct, solution: drill.solution };

    if (drill.format === "spr") {
      if (!("response" in body)) throw new HttpError(400, "Type your answer.", "invalid_response");
      const entry = parseSprEntry(body.response);
      if (!entry.ok) throw new HttpError(400, entry.error, "invalid_response");
      const correct = isSprCorrect(entry.text, drill.accepted_answers);
      await answerDrill(row.id, "spr", correct, entry.text);
      return json({ ...base, correct, correctLetter: null, correctAnswer: displayAnswer(drill.accepted_answers), fix: null });
    }

    if (!("picked" in body)) throw new HttpError(400, "Pick a letter.", "invalid_response");
    const correct = body.picked === drill.correct;
    await answerDrill(row.id, body.picked, correct);
    return json({
      ...base,
      correct,
      correctLetter: drill.correct,
      correctAnswer: null,
      fix: correct ? null : drill.why_wrong[body.picked] || null,
    });
  });
}
