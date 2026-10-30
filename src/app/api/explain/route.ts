import { z } from "zod";
import { HttpError, json, readJson, withApi } from "@/lib/api";
import { generateRuleCard, hasKnownAnswer, NeedsAnswerError, usableModelAnswer } from "@/lib/ai/explain";
import { isPickCorrect } from "@/lib/ai/prompts";
import { PickSchema } from "@/lib/ai/schemas";
import { createAttempt, deleteAttempt, finishAttempt, getQuestion, setModelAnswer, setModelGridInAnswer } from "@/db/queries";
import { getRule } from "@/content/rules";
import { chargeAiQuota } from "@/lib/ai/quota";
import { parseSprEntry } from "@/lib/questions/spr";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  questionId: z.string().uuid(),
  picked: PickSchema,
  /** Grid-in: what the student typed. Required when picked is "spr". */
  response: z.string().max(20).nullable().optional(),
  reasoning: z.string().max(2000).nullable().optional(),
  allowModelSolve: z.boolean().optional(),
});

export async function POST(request: Request) {
  return withApi(async (session) => {
    const body = Body.parse(await readJson(request));
    const question = await getQuestion(session.userId, body.questionId);
    if (!question) throw new HttpError(404, "Question not found");
    const gridIn = question.format === "spr";
    if (gridIn && body.picked !== "spr" && body.picked !== "correct") throw new HttpError(400, "This question has no answer choices. Type your answer.", "invalid_response");
    if (!gridIn && body.picked === "spr") throw new HttpError(400, "Pick a letter for this question.", "invalid_response");
    let response: string | null = null;
    if (body.picked === "spr") {
      const entry = parseSprEntry(body.response ?? "");
      if (!entry.ok) throw new HttpError(400, entry.error, "invalid_response");
      response = entry.text;
    }
    const reasoning = body.reasoning?.trim() || null;
    if (!hasKnownAnswer(question) && !body.allowModelSolve) throw new NeedsAnswerError();
    await chargeAiQuota(session.userId, "explain");
    const attempt = await createAttempt(session.userId, { questionId: question.id, picked: body.picked, response, reasoning });
    try {
      const graded = isPickCorrect(question, body.picked, response);
      const { result: card, provider, model } = await generateRuleCard({
        question,
        picked: body.picked,
        response,
        reasoning,
        allowModelSolve: body.allowModelSolve ?? false,
        gotItRight: graded,
      });
      // A model-solved answer is kept (flagged) so later attempts and the history can use it.
      if (gridIn && !question.answers?.length) {
        const solved = usableModelAnswer(card);
        if (solved) await setModelGridInAnswer(question.id, solved);
      } else if (!gridIn && !question.correct && card.correct_letter) {
        await setModelAnswer(question.id, card.correct_letter);
      }
      const updated = (await getQuestion(session.userId, question.id)) ?? question;
      const isCorrect = graded ?? isPickCorrect(updated, body.picked, response);
      if (isCorrect === true && card.diagnosis !== "got_it_right") {
        card.diagnosis = "got_it_right";
        card.why_pick_fails = null;
      }
      await finishAttempt(attempt.id, { explanation: card, ruleId: card.rule_id, provider, model, isCorrect });
      const rule = getRule(card.rule_id);
      return json({ attemptId: attempt.id, card, question: updated, rule: { id: card.rule_id, name: rule?.name ?? null }, isCorrect, provider, model });
    } catch (error) {
      await deleteAttempt(attempt.id).catch(() => undefined);
      throw error;
    }
  });
}
