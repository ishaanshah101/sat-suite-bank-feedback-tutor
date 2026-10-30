import { generateText, Output } from "ai";
import { generalRules, getRule, rulesForSection, rulesForSkill } from "@/content/rules";
import { HttpError } from "@/lib/api";
import type { QuestionRow } from "@/db/schema";
import { normalizeSkill } from "@/lib/questions/taxonomy";
import { displayAnswer, parseNumber } from "@/lib/questions/spr";
import { explainInstructions, explainUserMessage, isGridIn, isMath } from "./prompts";
import { abortAfter, isNoOutputError, retryOnNoOutput, withFailover, type FailoverResult } from "./providers";
import { LETTERS, RuleCardOutputSchema, type Pick, type RuleCard } from "./schemas";

export class NeedsAnswerError extends Error {
  constructor() {
    super("The correct answer is not known for this question.");
    this.name = "NeedsAnswerError";
  }
}

/** Whether the official (or earlier model) answer for this question is known. */
export function hasKnownAnswer(question: QuestionRow): boolean {
  return isGridIn(question) ? Boolean(question.answers?.length) : Boolean(question.correct);
}

/** Keep the model honest: the cited rule must exist in the right section, and official answers win over the model's. */
export function sanitizeRuleCard(card: RuleCard, question: QuestionRow, picked: Pick, gotItRight: boolean | null): RuleCard {
  const section = isMath(question) ? "math" : "rw";
  const next: RuleCard = { ...card, rule_id: card.rule_id.trim().toUpperCase(), steps: [...(card.steps ?? [])], eliminations: [...(card.eliminations ?? [])] };
  const cited = getRule(next.rule_id);
  if (!cited || cited.section !== section) {
    // The prompt promised the closest general rule as the fallback; do not pin the miss on an unrelated skill.
    const fallback = getRule(section === "math" ? "MTH-02" : "GEN-03")!;
    next.suggested_rule = next.suggested_rule ?? card.rule_id;
    next.rule_id = fallback.id;
    next.rule_statement = fallback.statement;
    next.confidence = Math.min(Number.isFinite(next.confidence) ? next.confidence : 0.5, 0.4);
  }

  if (isGridIn(question)) {
    next.correct_letter = null;
    next.eliminations = [];
    const official = displayAnswer(question.answers ?? []);
    if (official) {
      next.correct_answer = official;
      next.solved_by_model = question.answerSource === "model";
    } else {
      next.correct_answer = next.correct_answer?.trim() || null;
      next.solved_by_model = true;
    }
  } else {
    next.correct_answer = null;
    if (question.correct) {
      next.correct_letter = question.correct;
      // An answer worked out by the model earlier stays flagged so the warning survives re-attempts.
      next.solved_by_model = question.answerSource === "model";
    } else {
      next.solved_by_model = true;
    }
    const exclude = new Set<string>([...(next.correct_letter ? [next.correct_letter] : []), ...(picked === "correct" || picked === "spr" ? [] : [picked])]);
    const seen = new Set<string>();
    next.eliminations = next.eliminations.filter((e) => {
      if (exclude.has(e.letter) || seen.has(e.letter)) return false;
      seen.add(e.letter);
      return true;
    });
    for (const letter of LETTERS) {
      if (!exclude.has(letter) && !seen.has(letter)) next.eliminations.push({ letter, reason: "Does not satisfy the rule above." });
    }
  }

  if (!isMath(question)) {
    next.steps = [];
    next.shortcut = null;
  } else {
    next.steps = next.steps.map((s) => s.trim()).filter(Boolean).slice(0, 8);
    next.shortcut = next.shortcut?.trim() || null;
  }

  const right = picked === "correct" || gotItRight === true || (!isGridIn(question) && picked === next.correct_letter);
  if (right) {
    next.diagnosis = "got_it_right";
    next.why_pick_fails = null;
  } else if (next.diagnosis === "got_it_right") {
    next.diagnosis = "unknown";
  }
  next.confidence = Math.max(0, Math.min(1, Number.isFinite(next.confidence) ? next.confidence : 0.5));
  return next;
}

/** A model-solved grid-in answer is only usable when it is a number. */
export function usableModelAnswer(card: RuleCard): string | null {
  const value = card.correct_answer?.trim();
  return value && parseNumber(value) ? value : null;
}

export async function generateRuleCard(input: {
  question: QuestionRow;
  picked: Pick;
  response: string | null;
  reasoning: string | null;
  allowModelSolve: boolean;
  /** Grading of the student's answer when the answer is known (grid-ins are graded by code, not the model). */
  gotItRight: boolean | null;
}): Promise<FailoverResult<RuleCard>> {
  const { question, picked, response, reasoning, allowModelSolve, gotItRight } = input;
  const known = hasKnownAnswer(question);
  if (!known && !allowModelSolve) throw new NeedsAnswerError();
  const math = isMath(question);
  const section = math ? "math" : "rw";
  const skill = normalizeSkill(question.skill);
  const fromSkill = skill ? rulesForSkill(skill).filter((r) => r.section === section) : [];
  const slice = fromSkill.length ? [...fromSkill, ...generalRules(section)] : rulesForSection(section);
  const kind = math ? "math" : "explain";
  const result = await withFailover(kind, async (provider) => {
    try {
      const res = await retryOnNoOutput(() =>
        generateText({
          model: provider.model(kind),
          instructions: explainInstructions(slice, !known, question),
          messages: [{ role: "user", content: explainUserMessage(question, picked, response, reasoning) }],
          output: Output.object({ schema: RuleCardOutputSchema, name: "rule_card" }),
          providerOptions: provider.providerOptions(kind),
          maxOutputTokens: math ? 14000 : 6000,
          abortSignal: abortAfter(math ? 80_000 : 40_000),
        }),
      );
      return res.output;
    } catch (error) {
      if (isNoOutputError(error)) throw new HttpError(502, "The model did not return a complete rule card. Try Explain again.", "no_output");
      throw error;
    }
  });
  return { ...result, result: sanitizeRuleCard(result.result as RuleCard, question, picked, gotItRight) };
}
