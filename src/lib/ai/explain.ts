import { generateText, Output } from "ai";
import { GENERAL_RULES, RULES, getRule, rulesForSkill } from "@/content/rules";
import { HttpError } from "@/lib/api";
import type { QuestionRow } from "@/db/schema";
import { normalizeSkill } from "@/lib/questions/taxonomy";
import { explainInstructions, explainUserMessage } from "./prompts";
import { abortAfter, isNoOutputError, withFailover, type FailoverResult } from "./providers";
import { LETTERS, RuleCardSchema, type Pick, type RuleCard } from "./schemas";

export class NeedsAnswerError extends Error {
  constructor() {
    super("The correct answer is not known for this question.");
    this.name = "NeedsAnswerError";
  }
}

/** Keep the model honest: the cited rule must exist, and official answers win over the model's. */
export function sanitizeRuleCard(card: RuleCard, question: QuestionRow, picked: Pick): RuleCard {
  const next: RuleCard = { ...card, rule_id: card.rule_id.trim().toUpperCase() };
  if (!getRule(next.rule_id)) {
    // The prompt promised the closest GEN rule as the fallback; do not pin the miss on an unrelated skill rule.
    const fallback = getRule("GEN-03")!;
    next.suggested_rule = next.suggested_rule ?? card.rule_id;
    next.rule_id = fallback.id;
    next.rule_statement = fallback.statement;
    next.confidence = Math.min(Number.isFinite(next.confidence) ? next.confidence : 0.5, 0.4);
  }
  if (question.correct) {
    next.correct_letter = question.correct;
    // An answer worked out by the model earlier stays flagged so the warning survives re-attempts.
    next.solved_by_model = question.answerSource === "model";
  } else {
    next.solved_by_model = true;
  }
  const gotItRight = picked === "correct" || picked === next.correct_letter;
  if (gotItRight) {
    next.diagnosis = "got_it_right";
    next.why_pick_fails = null;
  } else if (next.diagnosis === "got_it_right") {
    next.diagnosis = "unknown";
  }
  const exclude = new Set<string>([next.correct_letter, ...(picked === "correct" ? [] : [picked])]);
  const seen = new Set<string>();
  next.eliminations = next.eliminations.filter((e) => {
    if (exclude.has(e.letter) || seen.has(e.letter)) return false;
    seen.add(e.letter);
    return true;
  });
  for (const letter of LETTERS) {
    if (!exclude.has(letter) && !seen.has(letter)) {
      next.eliminations.push({ letter, reason: "Does not satisfy the rule above." });
    }
  }
  next.confidence = Math.max(0, Math.min(1, Number.isFinite(next.confidence) ? next.confidence : 0.5));
  return next;
}

export async function generateRuleCard(input: {
  question: QuestionRow;
  picked: Pick;
  reasoning: string | null;
  allowModelSolve: boolean;
}): Promise<FailoverResult<RuleCard>> {
  const { question, picked, reasoning, allowModelSolve } = input;
  if (!question.correct && !allowModelSolve) throw new NeedsAnswerError();
  const skill = normalizeSkill(question.skill);
  const slice = skill ? [...rulesForSkill(skill), ...GENERAL_RULES] : RULES;
  const result = await withFailover("explain", async (provider) => {
    try {
      const res = await generateText({
        model: provider.model("explain"),
        instructions: explainInstructions(slice, !question.correct),
        messages: [{ role: "user", content: explainUserMessage(question, picked, reasoning) }],
        output: Output.object({ schema: RuleCardSchema, name: "rule_card" }),
        providerOptions: provider.providerOptions("explain"),
        maxOutputTokens: 6000,
        abortSignal: abortAfter(75_000),
      });
      return res.output;
    } catch (error) {
      if (isNoOutputError(error)) throw new HttpError(502, "The model did not return a complete rule card. Try Explain again.", "no_output");
      throw error;
    }
  });
  return { ...result, result: sanitizeRuleCard(result.result, question, picked) };
}
