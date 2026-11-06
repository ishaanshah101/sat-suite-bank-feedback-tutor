import { generateText, Output } from "ai";
import { generalRules, getRule, rulesForSection, rulesForSkill } from "@/content/rules";
import { HttpError } from "@/lib/api";
import type { QuestionRow } from "@/db/schema";
import { normalizeSkill } from "@/lib/questions/taxonomy";
import { displayAnswer, parseNumber } from "@/lib/questions/spr";
import { cardModeFor, explainInstructions, explainUserMessage, isGridIn, isMath } from "./prompts";
import { abortAfter, isNoOutputError, retryOnNoOutput, withFailover, type FailoverResult } from "./providers";
import { LETTERS, MAX_KEY_RULES, RuleCardOutputSchema, type CardMode, type Pick, type RuleCard } from "./schemas";

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
/** The card's job: "quick" when nothing was picked yet, otherwise decided by what the question carries. */
export function cardModeForPick(question: QuestionRow, picked: Pick): CardMode {
  return picked === "none" ? "quick" : cardModeFor(question);
}

export function sanitizeRuleCard(card: RuleCard, question: QuestionRow, picked: Pick, gotItRight: boolean | null, mode: CardMode = cardModeForPick(question, picked)): RuleCard {
  const section = isMath(question) ? "math" : "rw";
  const next: RuleCard = { ...card, mode, rule_id: card.rule_id.trim().toUpperCase(), steps: [...(card.steps ?? [])], eliminations: [...(card.eliminations ?? [])] };
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
    const exclude = new Set<string>([...(next.correct_letter ? [next.correct_letter] : []), ...(picked === "correct" || picked === "spr" || picked === "none" ? [] : [picked])]);
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

  // The bullets are the card: 1 to 3 distinct, non-empty rules. A model that sent none falls back to the rule statement.
  const seenRules = new Set<string>();
  next.key_rules = (Array.isArray(card.key_rules) ? card.key_rules : [])
    .map((r) => (typeof r === "string" ? r.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s*/, "").replace(/\s+/g, " ").trim() : ""))
    .filter((r) => {
      const key = r.toLowerCase();
      if (!r || seenRules.has(key)) return false;
      seenRules.add(key);
      return true;
    })
    .map((r) => (r.length > 320 ? `${r.slice(0, 317).trimEnd()}...` : r))
    .slice(0, MAX_KEY_RULES);
  if (!next.key_rules.length) next.key_rules = [next.rule_statement];
  // Translating (and the quick card) never adds an explanation of its own; explaining always has one.
  next.simple_explanation = mode === "explained" ? card.simple_explanation?.trim() || next.why_correct : null;
  // Nothing picked yet: no pick to fault, no reasoning to diagnose. The pick route fills these in later.
  if (picked === "none") {
    next.why_pick_fails = null;
    next.diagnosis = "unknown";
    next.confidence = Math.max(0, Math.min(1, Number.isFinite(next.confidence) ? next.confidence : 0.5));
    return next;
  }

  // "I got it right" is only right once an answer is known: the route grades it, and null means nobody knows yet.
  const right = gotItRight === true || (gotItRight !== false && !isGridIn(question) && picked === next.correct_letter);
  if (right) {
    next.diagnosis = "got_it_right";
    next.why_pick_fails = null;
  } else if (next.diagnosis === "got_it_right") {
    next.diagnosis = "unknown";
  }
  next.confidence = Math.max(0, Math.min(1, Number.isFinite(next.confidence) ? next.confidence : 0.5));
  return next;
}

/**
 * A model-solved grid-in answer is only usable when it is a number, and not a decimal of four or more
 * places: that is almost always a rounded value, and a stored answer must be exact.
 */
export function usableModelAnswer(card: RuleCard): string | null {
  const value = card.correct_answer?.trim();
  if (!value || !parseNumber(value)) return null;
  const places = /\.(\d+)$/.exec(value)?.[1].length ?? 0;
  return places >= 4 ? null : value;
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
  const mode = cardModeForPick(question, picked);
  const result = await withFailover(kind, async (provider) => {
    try {
      // `.output` is where an off-schema reply throws, so it stays inside the retry.
      return await retryOnNoOutput(
        async () =>
          (
            await generateText({
              model: provider.model(kind),
              instructions: explainInstructions(slice, !known, question, mode),
              messages: [{ role: "user", content: explainUserMessage(question, picked, response, reasoning) }],
              output: Output.object({ schema: RuleCardOutputSchema, name: "rule_card" }),
              providerOptions: provider.providerOptions(kind),
              maxOutputTokens: math ? 14000 : 6000,
              maxRetries: 1,
              abortSignal: abortAfter(math ? 80_000 : 40_000),
            })
          ).output as RuleCard,
      );
    } catch (error) {
      if (isNoOutputError(error)) throw new HttpError(502, "The model did not return a complete rule card. Try Explain again.", "no_output");
      throw error;
    }
  });
  return { ...result, result: sanitizeRuleCard(result.result, question, picked, gotItRight, mode) };
}
