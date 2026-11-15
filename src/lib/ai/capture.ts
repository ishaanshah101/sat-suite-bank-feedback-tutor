// One call per capture: the model reads the question off the screenshot (or page text) AND writes its card,
// streamed, card first. Two calls in a row (extract, then explain) took about 12 seconds; this is one call,
// and the answer and the first bullets show while the rest is still being written.
import { z } from "zod";
import { examsOf, RULES, type Rule } from "@/content/rules";
import { allPlaybooksForPrompt } from "@/content/playbook";
import { ACT_ENGLISH_SKILLS, ACT_MATH_SKILLS, ACT_READING_SKILLS, ACT_SCIENCE_SKILLS, MATH_SKILLS, RW_SKILLS, SECTION_LABEL } from "@/lib/questions/taxonomy";
import { BULLET_COUNT, READING_RULES, TUTOR_VOICE } from "./prompts";
import { ChoicesOutputSchema, ExamSchema, FormatSchema, LetterSchema, LetterStyleSchema, MAX_KEY_RULES, SectionSchema, type ExtractionOutput, type RuleCard } from "./schemas";

/**
 * What the model returns, in the order it writes it: classification and answer, then the card the student
 * reads (streamed to the panel as it arrives), then the transcription that is stored for history.
 * Every field is required, for strict structured output.
 */
export const CaptureOutputSchema = z.object({
  question_found: z.boolean(),
  exam: ExamSchema,
  section: SectionSchema,
  format: FormatSchema,
  letter_style: LetterStyleSchema,
  /** True only when the page shows the correct answer (an answer key line, "The correct answer is", a marked choice). */
  answer_shown: z.boolean(),
  /** By position: A is the first choice even when the screen prints F. Null for a grid-in. */
  correct_letter: LetterSchema.nullable(),
  /** Grid-in only: the exact value. Null for multiple choice. */
  correct_answer: z.string().nullable(),
  key_rules: z.array(z.string()),
  rule_id: z.string(),
  rule_statement: z.string(),
  eliminations: z.array(z.object({ letter: LetterSchema, reason: z.string() })),
  why_correct: z.string(),
  steps: z.array(z.string()),
  shortcut: z.string().nullable(),
  takeaway: z.string(),
  confidence: z.number(),
  suggested_rule: z.string().nullable(),
  qb_id: z.string().nullable(),
  test: z.string().nullable(),
  domain: z.string().nullable(),
  skill: z.string().nullable(),
  difficulty: z.string().nullable(),
  passage: z.string().nullable(),
  stem: z.string(),
  figure: z.string().nullable(),
  choices: ChoicesOutputSchema,
  accepted_answers: z.array(z.string()),
  notes: z.string().nullable(),
});
export type CaptureOutput = z.infer<typeof CaptureOutputSchema>;

/** The fields the panel shows while the card is still being written. */
export const PARTIAL_FIELDS = ["exam", "section", "format", "letter_style", "answer_shown", "correct_letter", "correct_answer", "key_rules"] as const;

const ruleTags = (rule: Rule): string => {
  const tags: string[] = [];
  const exams = examsOf(rule);
  if (exams.includes("sat") && (rule.section === "rw" || rule.section === "math")) tags.push(`SAT ${SECTION_LABEL[rule.section]}`);
  if (exams.includes("act")) tags.push(rule.section === "rw" ? "ACT English/Reading" : `ACT ${SECTION_LABEL[rule.section]}`);
  return tags.join(", ");
};

/** The whole rule library, one compact line per rule: id, where it applies, name, rule, and its best tips. */
export function compactRuleLibrary(rules: Rule[] = RULES): string {
  return rules
    .map((r) => {
      const tips = (r.tips ?? []).slice(0, 1);
      const extra = [r.shortcut ? `Shortcut: ${r.shortcut}` : "", tips.length ? `Tips: ${tips.join(" | ")}` : ""].filter(Boolean).join(" ");
      return `${r.id} [${ruleTags(r)}; ${r.skill}] ${r.name}: ${r.statement}${extra ? ` ${extra}` : ""}`;
    })
    .join("\n");
}

const MATH_NOTATION = `Write every expression, equation, or number with an operation in LaTeX inside \\( and \\), for example \\(2x + 3 = 11\\) or \\(\\frac{3}{17}\\). Never use $ for math; $ means money only.`;

let cached: string | null = null;

/**
 * The capture instructions. Built once per server instance and identical for every call, so the model
 * provider can cache this long prefix; only the screenshot changes between calls.
 */
export function captureInstructions(): string {
  if (cached) return cached;
  cached = `You are Rulecard, a tutor for the Digital SAT and the ACT. A student captured one practice question from their screen and wants it explained the simple way: the right answer, then the real rules that get it right, in plain words. Produce structured output, writing the fields in this order.

1. Read and answer
- question_found: false if no complete question is visible (then explain in notes and keep everything else short).
- exam, section, format, letter_style: see "Reading the question" below.
- answer_shown: true only when the page shows the correct answer. Then copy it into correct_letter (multiple choice, by position A to E) or correct_answer (grid-in). Otherwise solve the question carefully and check your answer before writing it: the student will trust it. For a grid-in give the exact value (a fraction like 3/17, not a rounded decimal).

2. The card (the student reads this first)
- key_rules: ${BULLET_COUNT} The first bullet states the real rule in general terms, the way a good cheat sheet says it (use the rule library and playbooks below, not the official rationale's wording). The next bullets apply it to this exact question so the student sees why it picks the answer: quote the deciding words or numbers, and for Math give the fastest route (backsolving, plugging in, a calculator move, a shortcut) when there is one. Each bullet is one plain sentence of at most 25 words. If an official rationale is on the screen, use it only to check facts.
- rule_id: the one rule from the library below that this question tests. It must fit the test and section: an SAT question cites a rule tagged for its SAT section; an ACT question cites a rule tagged for its ACT section (ACT-only rules start with AEN, AMA, ARD, ASC; shared SAT rules are tagged for the ACT too). If nothing fits, use the section's general rule (GEN-03 for SAT Reading and Writing, MTH-02 for SAT Math, AEN-00, AMA-00, ARD-00 or ASC-00 for the ACT) and put a short name for the missing rule in suggested_rule (otherwise null).
- rule_statement: that rule in one sentence, applied to this question.
- eliminations: multiple choice only (empty for a grid-in): one entry for EVERY wrong choice, by position letter. The student taps the letter they picked and sees only this, so each reason is one or two plain sentences, at most 35 words: name the trap that makes the choice tempting and the rule it breaks, then say in a few words why the correct answer works instead. Use the letters as printed on screen inside the text.
- why_correct: at most two sentences.
- steps: Math only, the worked solution in 2 to 6 short steps; otherwise empty.
- shortcut: Math only, the fastest reliable route in one or two sentences, or null.
- takeaway: one line the student could remember mid-test.
- confidence: 0 to 1 (lower when you solved it yourself and it was hard, or the rule fit is loose).

3. The transcription (stored for the student's history; write it last and keep it faithful)
- qb_id, test, domain, skill, difficulty, passage, stem, figure, choices, accepted_answers, notes.
- skill: for the SAT, the official skill name if shown, else your best match from: ${[...RW_SKILLS, ...MATH_SKILLS].join("; ")}. For the ACT, one of: English: ${ACT_ENGLISH_SKILLS.join("; ")}. Math: ${ACT_MATH_SKILLS.join("; ")}. Reading: ${ACT_READING_SKILLS.join("; ")}. Science: ${ACT_SCIENCE_SKILLS.join("; ")}.

Reading the question
${READING_RULES}

${TUTOR_VOICE}
${MATH_NOTATION}
At most ${MAX_KEY_RULES} bullets. Every wrong choice on these tests is built from a specific, common error; when you say why a choice is wrong, name that error.

Playbooks (fastest routes, traps and word lists, by test, section and skill):
${allPlaybooksForPrompt()}

Rule library (id [where it applies; skill] name: rule. Shortcut. Tips):
${compactRuleLibrary()}`;
  return cached;
}

/** The capture's question fields, in the shape the extractor's normalizer takes. */
export function captureToExtraction(output: CaptureOutput): ExtractionOutput {
  return {
    question_found: output.question_found,
    exam: output.exam,
    section: output.section,
    format: output.format,
    letter_style: output.letter_style,
    qb_id: output.qb_id,
    test: output.test,
    domain: output.domain,
    skill: output.skill,
    difficulty: output.difficulty,
    passage: output.passage,
    stem: output.stem,
    figure: output.figure,
    choices: output.choices,
    visible_answer_panel: output.answer_shown,
    correct: output.answer_shown && output.format === "mcq" ? output.correct_letter : null,
    accepted_answers: output.answer_shown && output.format === "spr" ? output.accepted_answers.length ? output.accepted_answers : output.correct_answer ? [output.correct_answer] : [] : [],
    rationale: null,
    notes: output.notes,
  };
}

/** The capture's card fields as a rule card (the sanitizer fixes rule fit, letters and bullets afterwards). */
export function captureToCard(output: CaptureOutput): RuleCard {
  return {
    rule_id: output.rule_id,
    rule_statement: output.rule_statement,
    key_rules: output.key_rules,
    simple_explanation: null,
    mode: "quick",
    correct_letter: output.format === "mcq" ? output.correct_letter : null,
    correct_answer: output.format === "spr" ? output.correct_answer : null,
    why_correct: output.why_correct,
    why_pick_fails: null,
    eliminations: output.eliminations,
    steps: output.steps,
    shortcut: output.shortcut,
    takeaway: output.takeaway,
    diagnosis: "unknown",
    confidence: output.confidence,
    solved_by_model: !output.answer_shown,
    suggested_rule: output.suggested_rule,
  };
}
