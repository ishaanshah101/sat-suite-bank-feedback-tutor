import { json, withApi } from "@/lib/api";
import { listAttempts } from "@/db/queries";
import { getRule } from "@/content/rules";

export const runtime = "nodejs";

function resultOf(isCorrect: boolean | null, picked: string, correct: string | null): "right" | "missed" | "unknown" {
  if (isCorrect !== null) return isCorrect ? "right" : "missed";
  if (picked === "correct") return "right";
  if (picked === "spr" || !correct) return "unknown";
  return picked === correct ? "right" : "missed";
}

/** The signed-in account's most recent reviews, newest first. Used by the extension's Recent list. */
export async function GET(request: Request) {
  return withApi(async (session) => {
    const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit")) || 10, 1), 50);
    const rows = await listAttempts(session.userId, limit);
    return json({
      attempts: rows.map(({ attempt, question }) => ({
        id: attempt.id,
        createdAt: attempt.createdAt,
        picked: attempt.picked,
        correct: question.correct,
        section: question.section,
        format: question.format,
        response: attempt.response,
        result: resultOf(attempt.isCorrect, attempt.picked, question.correct),
        ruleId: attempt.ruleId,
        ruleName: attempt.ruleId ? (getRule(attempt.ruleId)?.name ?? null) : null,
        skill: question.skill,
        stem: question.stem.slice(0, 160),
      })),
    });
  });
}
