import { z } from "zod";
import { HttpError, json, readJson, withApi } from "@/lib/api";
import { isPickCorrect } from "@/lib/ai/prompts";
import { LetterSchema, RuleCardSchema, type RuleCard } from "@/lib/ai/schemas";
import { getAttempt, recordAttemptPick } from "@/db/queries";
import { parseSprEntry } from "@/lib/questions/spr";

export const runtime = "nodejs";

const Body = z.object({
  attemptId: z.string().uuid(),
  /** The letter they picked, "spr" with `response` for a grid-in, or "correct" when they got it right. */
  picked: z.union([LetterSchema, z.literal("spr"), z.literal("correct")]),
  response: z.string().max(20).nullable().optional(),
});

/**
 * "Which did you pick?" on a quick card. No model call: the card already holds a reason for every wrong
 * choice, so this grades the pick, saves it on the attempt, and returns why it fails.
 */
export async function POST(request: Request) {
  return withApi(async (session) => {
    const body = Body.parse(await readJson(request));
    const row = await getAttempt(session.userId, body.attemptId);
    if (!row) throw new HttpError(404, "Card not found");
    const { attempt, question } = row;
    const parsed = RuleCardSchema.safeParse(attempt.explanation);
    if (!parsed.success) throw new HttpError(409, "This card is not finished yet. Try again in a moment.", "not_ready");
    const card = parsed.data;
    if (card.mode !== "quick") throw new HttpError(409, "This card already has your answer.", "already_picked");

    const gridIn = question.format === "spr";
    if (gridIn && body.picked !== "spr" && body.picked !== "correct") throw new HttpError(400, "This question has no answer choices. Type your answer.", "invalid_response");
    if (!gridIn && body.picked === "spr") throw new HttpError(400, "Pick a letter for this question.", "invalid_response");
    let response: string | null = null;
    if (body.picked === "spr") {
      const entry = parseSprEntry(body.response ?? "");
      if (!entry.ok) throw new HttpError(400, entry.error, "invalid_response");
      response = entry.text;
    }

    // The question's answer (official, or the model's saved with the card) grades it; the card's letter is the last resort.
    let isCorrect = isPickCorrect(question, body.picked, response);
    if (isCorrect === null && !gridIn && card.correct_letter && body.picked !== "correct") isCorrect = body.picked === card.correct_letter;
    if (isCorrect === null && body.picked === "correct") isCorrect = true;

    const reason = !gridIn && body.picked !== "correct" && body.picked !== "spr" ? card.eliminations.find((e) => e.letter === body.picked)?.reason ?? null : null;
    const next: RuleCard = {
      ...card,
      why_pick_fails: isCorrect === false ? reason : null,
      diagnosis: isCorrect === true ? "got_it_right" : "unknown",
    };
    await recordAttemptPick(session.userId, attempt.id, { picked: body.picked, response, isCorrect, explanation: next });
    return json({ attemptId: attempt.id, card: next, picked: body.picked, response, isCorrect });
  });
}
