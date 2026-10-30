import { z } from "zod";

export const LetterSchema = z.enum(["A", "B", "C", "D"]);
export type Letter = z.infer<typeof LetterSchema>;
export const LETTERS: Letter[] = ["A", "B", "C", "D"];

export const SectionSchema = z.enum(["rw", "math"]);
export const FormatSchema = z.enum(["mcq", "spr"]);

export const ChoicesSchema = z.object({ A: z.string(), B: z.string(), C: z.string(), D: z.string() });
export type Choices = z.infer<typeof ChoicesSchema>;

/** A question as stored. Shared by the extractors, the PDF parser and the questions API. */
export const ParsedQuestionSchema = z.object({
  qb_id: z.string().regex(/^[0-9a-f]{8}$/).nullable(),
  section: SectionSchema.default("rw"),
  /** mcq = four choices; spr = student-produced response (Math grid-in), no choices. */
  format: FormatSchema.default("mcq"),
  test: z.string().nullable(),
  domain: z.string().nullable(),
  skill: z.string().nullable(),
  difficulty: z.enum(["Easy", "Medium", "Hard"]).nullable(),
  passage: z.string().nullable(),
  stem: z.string().min(1),
  choices: ChoicesSchema.nullable(),
  correct: LetterSchema.nullable(),
  /** Grid-in only: every accepted form of the official answer. */
  answers: z.array(z.string().min(1).max(20)).max(12).nullable().default(null),
  figure: z.string().max(6000).nullable().default(null),
  rationale: z.string().nullable(),
});
export type ParsedQuestion = z.infer<typeof ParsedQuestionSchema>;
/** What callers may pass in: the Math fields are optional and default to a Reading and Writing multiple-choice question. */
export type ParsedQuestionInput = z.input<typeof ParsedQuestionSchema>;

/** Model-facing extraction output. No string constraints so strict JSON schema modes accept it. */
export const ExtractionOutputSchema = z.object({
  question_found: z.boolean(),
  section: SectionSchema,
  format: FormatSchema,
  qb_id: z.string().nullable(),
  test: z.string().nullable(),
  domain: z.string().nullable(),
  skill: z.string().nullable(),
  difficulty: z.string().nullable(),
  passage: z.string().nullable(),
  stem: z.string(),
  figure: z.string().nullable(),
  choices: ChoicesSchema,
  visible_answer_panel: z.boolean(),
  correct: LetterSchema.nullable(),
  accepted_answers: z.array(z.string()),
  rationale: z.string().nullable(),
  notes: z.string().nullable(),
});
export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>;

const DiagnosisSchema = z.enum(["misread", "rule_gap", "careless", "got_it_right", "unknown"]);

/** What the model returns for a rule card (every field required, for strict structured output). */
export const RuleCardOutputSchema = z.object({
  rule_id: z.string(),
  rule_statement: z.string(),
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
  correct: LetterSchema.nullable(),
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

/** A letter, "correct" (got it right, explain anyway), or "spr" (a typed grid-in answer in `response`). */
export const PickSchema = z.union([LetterSchema, z.literal("correct"), z.literal("spr")]);
export type Pick = z.infer<typeof PickSchema>;
