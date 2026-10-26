import { z } from "zod";
import { HttpError, json, readJson, withApi } from "@/lib/api";
import { generateRuleCard, NeedsAnswerError } from "@/lib/ai/explain";
import { PickSchema } from "@/lib/ai/schemas";
import { createAttempt, deleteAttempt, finishAttempt, getQuestion, setModelAnswer } from "@/db/queries";
import { getRule } from "@/content/rules";
import { chargeAiQuota } from "@/lib/ai/quota";

export const runtime = "nodejs";
export const maxDuration = 90;

const Body = z.object({
  questionId: z.string().uuid(),
  picked: PickSchema,
  reasoning: z.string().max(2000).nullable().optional(),
  allowModelSolve: z.boolean().optional(),
});

export async function POST(request: Request) {
  return withApi(async (session) => {
    const body = Body.parse(await readJson(request));
    const question = await getQuestion(session.userId, body.questionId);
    if (!question) throw new HttpError(404, "Question not found");
    const reasoning = body.reasoning?.trim() || null;
    if (!question.correct && !body.allowModelSolve) throw new NeedsAnswerError();
    await chargeAiQuota(session.userId, "explain");
    const attempt = await createAttempt(session.userId, { questionId: question.id, picked: body.picked, reasoning });
    try {
      const { result: card, provider, model } = await generateRuleCard({
        question,
        picked: body.picked,
        reasoning,
        allowModelSolve: body.allowModelSolve ?? false,
      });
      if (!question.correct) {
        await setModelAnswer(question.id, card.correct_letter);
      }
      await finishAttempt(attempt.id, { explanation: card, ruleId: card.rule_id, provider, model });
      const updated = (await getQuestion(session.userId, question.id)) ?? question;
      const rule = getRule(card.rule_id);
      return json({ attemptId: attempt.id, card, question: updated, rule: { id: card.rule_id, name: rule?.name ?? null }, provider, model });
    } catch (error) {
      await deleteAttempt(attempt.id).catch(() => undefined);
      throw error;
    }
  });
}
