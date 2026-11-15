import { z } from "zod";

/** E is the fifth choice of older ACT Math questions. */
export const LetterSchema = z.enum(["A", "B", "C", "D", "E"]);
export type Letter = z.infer<typeof LetterSchema>;
/** The four choices every multiple-choice question has (drills always have exactly these). */
export const FourLetterSchema = z.enum(["A", "B", "C", "D"]);
export type FourLetter = z.infer<typeof FourLetterSchema>;
export const LETTERS: FourLetter[] = ["A", "B", "C", "D"];
export const ALL_LETTERS: Letter[] = ["A", "B", "C", "D", "E"];
/** The choice letters this question actually has: A to D, plus E on a five-choice question. */
export function choiceLetters(choices: { E?: string | null } | null | undefined): Letter[] {
  return choices?.E?.trim() ? ALL_LETTERS : LETTERS;
}
/** The letter printed on screen: ACT even-numbered questions use F G H J K for A B C D E. */
export function displayLetter(letter: Letter, style: "abcd" | "fghj" | null | undefined): string {
  return style === "fghj" ? ({ A: "F", B: "G", C: "H", D: "J", E: "K" } as const)[letter] : letter;
}

export const ExamSchema = z.enum(["sat", "act"]);
export const LetterStyleSchema = z.enum(["abcd", "fghj"]);
export const SectionSchema = z.enum(["rw", "math", "english", "reading", "science"]);
export const FormatSchema = z.enum(["mcq", "spr"]);

export const ChoicesSchema = z.object({ A: z.string(), B: z.string(), C: z.string(), D: z.string() });
export type Choices = z.infer<typeof ChoicesSchema>;

/** Field caps for a stored question (one PDF page or screenshot never needs more). */
export const QUESTION_LIMITS = { stem: 4000, passage: 20000, choice: 2000, rationale: 20000, label: 200, figure: 6000 } as const;

const ChoicesInputSchema = z.object({
  A: z.string().max(QUESTION_LIMITS.choice),
  B: z.string().max(QUESTION_LIMITS.choice),
  C: z.string().max(QUESTION_LIMITS.choice),
  D: z.string().max(QUESTION_LIMITS.choice),
  /** Five-choice questions only (older ACT Math). */
  E: z.string().max(QUESTION_LIMITS.choice).optional(),
});

/** A question as stored. Shared by the extractors, the PDF parser and the questions API. */
export const ParsedQuestionSchema = z
  .object({
    qb_id: z.string().regex(/^[0-9a-f]{8}$/).nullable(),
    exam: ExamSchema.default("sat"),
    section: SectionSchema.default("rw"),
    /** The letters printed on screen; null means A B C D. */
    letter_style: LetterStyleSchema.nullable().default(null),
    /** mcq = four choices; spr = student-produced response (Math grid-in), no choices. */
    format: FormatSchema.default("mcq"),
    test: z.string().max(QUESTION_LIMITS.label).nullable(),
    domain: z.string().max(QUESTION_LIMITS.label).nullable(),
    skill: z.string().max(QUESTION_LIMITS.label).nullable(),
    difficulty: z.enum(["Easy", "Medium", "Hard"]).nullable(),
    passage: z.string().max(QUESTION_LIMITS.passage).nullable(),
    stem: z.string().min(1).max(QUESTION_LIMITS.stem),
    choices: ChoicesInputSchema.nullable(),
    correct: LetterSchema.nullable(),
    /** Grid-in only: every accepted form of the official answer. */
    answers: z.array(z.string().min(1).max(20)).max(12).nullable().default(null),
    figure: z.string().max(QUESTION_LIMITS.figure).nullable().default(null),
    rationale: z.string().max(QUESTION_LIMITS.rationale).nullable(),
  })
  .superRefine((q, ctx) => {
    if (q.format === "mcq" && !q.choices) ctx.addIssue({ code: "custom", path: ["choices"], message: "A multiple-choice question needs its four choices." });
  })
  // A grid-in has no choices, whatever the caller sent; an empty fifth choice is no choice.
  .transform((q): typeof q => {
    if (q.format === "spr") return { ...q, choices: null };
    if (q.choices && !q.choices.E?.trim()) {
      return { ...q, choices: { A: q.choices.A, B: q.choices.B, C: q.choices.C, D: q.choices.D }, correct: q.correct === "E" ? null : q.correct };
    }
    return q;
  });
export type ParsedQuestion = z.infer<typeof ParsedQuestionSchema>;
/** What callers may pass in: the Math fields are optional and default to a Reading and Writing multiple-choice question. */
export type ParsedQuestionInput = z.input<typeof ParsedQuestionSchema>;

/** Model-facing extraction output. No string constraints so strict JSON schema modes accept it. */
/** Model-facing choices: E is an empty string unless the question has a fifth choice (older ACT Math). */
export const ChoicesOutputSchema = z.object({ A: z.string(), B: z.string(), C: z.string(), D: z.string(), E: z.string() });

export const ExtractionOutputSchema = z.object({
  question_found: z.boolean(),
  exam: ExamSchema,
  section: SectionSchema,
  format: FormatSchema,
  letter_style: LetterStyleSchema,
  qb_id: z.string().nullable(),
  test: z.string().nullable(),
  domain: z.string().nullable(),
  skill: z.string().nullable(),
  difficulty: z.string().nullable(),
  passage: z.string().nullable(),
  stem: z.string(),
  figure: z.string().nullable(),
  choices: ChoicesOutputSchema,
  visible_answer_panel: z.boolean(),
  correct: LetterSchema.nullable(),
  accepted_answers: z.array(z.string()),
  rationale: z.string().nullable(),
  notes: z.string().nullable(),
});
export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>;

const DiagnosisSchema = z.enum(["misread", "rule_gap", "careless", "got_it_right", "unknown"]);

/**
 * The two things a card does, decided by code from the question, never by the model:
 * - "translated": the PDF carries the official answer and College Board's rationale. The card turns that
 *   long rationale into the 1 to 3 rules the student needs, and nothing else.
 * - "explained": no official explanation (or no answer at all). The card explains the question simply,
 *   then gives the same 1 to 3 rules.
 * - "quick": a captured question explained before the student says what they picked. The card is the
 *   answer and 2 to 3 bullets on why it is right; every wrong choice gets its reason up front, so the
 *   student's pick can be answered later without another model call.
 */
export const CardModeSchema = z.enum(["translated", "explained", "quick"]);
export type CardMode = z.infer<typeof CardModeSchema>;
/** At most this many bullets on a card. The model writes as many as the question needs, up to this. */
export const MAX_KEY_RULES = 6;

/** What the model returns for a rule card (every field required, for strict structured output). */
export const RuleCardOutputSchema = z.object({
  rule_id: z.string(),
  rule_statement: z.string(),
  /** The heart of the card: 1 to 3 short rules, one per bullet, that get this question (and ones like it) right. */
  key_rules: z.array(z.string()),
  /** "explained" mode only: the question explained simply in a few plain sentences. Null when translating. */
  simple_explanation: z.string().nullable(),
  /** Multiple choice: the correct letter. Null for a grid-in question. */
  correct_letter: LetterSchema.nullable(),
  /** Grid-in: the correct value as a student would enter it. Null for multiple choice. */
  correct_answer: z.string().nullable(),
  why_correct: z.string(),
  why_pick_fails: z.string().nullable(),
  eliminations: z.array(z.object({ letter: LetterSchema, reason: z.string() })),
  /** Math: the worked solution, one short step per entry. Empty for Reading and Writing. */
  steps: z.array(z.string()),
  /** Math: the fastest reliable route (Desmos, backsolving, a pattern). Null when there is none. */
  shortcut: z.string().nullable(),
  takeaway: z.string(),
  diagnosis: DiagnosisSchema,
  confidence: z.number(),
  solved_by_model: z.boolean(),
  suggested_rule: z.string().nullable(),
});

/** A stored rule card. Cards saved before Math support lack the newer fields, so they default. */
export const RuleCardSchema = RuleCardOutputSchema.extend({
  key_rules: z.array(z.string()).default([]),
  simple_explanation: z.string().nullable().default(null),
  /** Set by the server. Cards saved before the two modes existed read as "explained". */
  mode: CardModeSchema.default("explained"),
  correct_letter: LetterSchema.nullable().default(null),
  correct_answer: z.string().nullable().default(null),
  steps: z.array(z.string()).default([]),
  shortcut: z.string().nullable().default(null),
});
export type RuleCard = z.infer<typeof RuleCardSchema>;

/** What the model returns for a Test me drill. */
export const DrillOutputSchema = z.object({
  rule_id: z.string(),
  format: FormatSchema,
  passage: z.string().nullable(),
  figure: z.string().nullable(),
  stem: z.string(),
  /** Empty strings for a grid-in drill. */
  choices: ChoicesSchema,
  correct: FourLetterSchema.nullable(),
  /** Grid-in: every accepted form of the answer (for example ["3/4", ".75"]); empty for multiple choice. */
  accepted_answers: z.array(z.string()),
  why_correct: z.string(),
  /** One sentence per wrong letter (and "Correct." for the right one); empty strings for a grid-in drill. */
  why_wrong: z.object({ A: z.string(), B: z.string(), C: z.string(), D: z.string() }),
  /** Math: the worked solution, one step per entry. */
  solution: z.array(z.string()),
});

/** A stored drill. Drills saved before Math support are multiple choice. */
export const DrillSchema = DrillOutputSchema.extend({
  format: FormatSchema.default("mcq"),
  figure: z.string().nullable().default(null),
  accepted_answers: z.array(z.string()).default([]),
  solution: z.array(z.string()).default([]),
});
export type Drill = z.infer<typeof DrillSchema>;

/** An independent solve of a generated Math drill, used to verify its answer before showing it. */
export const DrillCheckSchema = z.object({
  work: z.string(),
  answer_letter: LetterSchema.nullable(),
  answer_value: z.string().nullable(),
});
export type DrillCheck = z.infer<typeof DrillCheckSchema>;

/**
 * A letter, "correct" (got it right, explain anyway), "spr" (a typed grid-in answer in `response`), or
 * "none" (explain first; the student may say what they picked afterwards).
 */
export const PickSchema = z.union([LetterSchema, z.literal("correct"), z.literal("spr"), z.literal("none")]);
export type Pick = z.infer<typeof PickSchema>;
