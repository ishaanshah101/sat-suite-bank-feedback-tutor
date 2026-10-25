import { z } from "zod";

export const LetterSchema = z.enum(["A", "B", "C", "D"]);
export type Letter = z.infer<typeof LetterSchema>;
export const LETTERS: Letter[] = ["A", "B", "C", "D"];

export const ChoicesSchema = z.object({ A: z.string(), B: z.string(), C: z.string(), D: z.string() });
export type Choices = z.infer<typeof ChoicesSchema>;

/** A question as stored. Shared by the extractors, the PDF parser and the questions API. */
export const ParsedQuestionSchema = z.object({
  qb_id: z.string().regex(/^[0-9a-f]{8}$/).nullable(),
  test: z.string().nullable(),
  domain: z.string().nullable(),
  skill: z.string().nullable(),
  difficulty: z.enum(["Easy", "Medium", "Hard"]).nullable(),
  passage: z.string().nullable(),
  stem: z.string().min(1),
  choices: ChoicesSchema,
  correct: LetterSchema.nullable(),
  rationale: z.string().nullable(),
});
export type ParsedQuestion = z.infer<typeof ParsedQuestionSchema>;

/** Model-facing extraction output. No string constraints so strict JSON schema modes accept it. */
export const ExtractionOutputSchema = z.object({
  question_found: z.boolean(),
  qb_id: z.string().nullable(),
  test: z.string().nullable(),
  domain: z.string().nullable(),
  skill: z.string().nullable(),
  difficulty: z.string().nullable(),
  passage: z.string().nullable(),
  stem: z.string(),
  choices: ChoicesSchema,
  visible_answer_panel: z.boolean(),
  correct: LetterSchema.nullable(),
  rationale: z.string().nullable(),
  notes: z.string().nullable(),
});
export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>;

export const RuleCardSchema = z.object({
  rule_id: z.string(),
  rule_statement: z.string(),
  correct_letter: LetterSchema,
  why_correct: z.string(),
  why_pick_fails: z.string().nullable(),
  eliminations: z.array(z.object({ letter: LetterSchema, reason: z.string() })),
  takeaway: z.string(),
  diagnosis: z.enum(["misread", "rule_gap", "careless", "got_it_right", "unknown"]),
  confidence: z.number(),
  solved_by_model: z.boolean(),
  suggested_rule: z.string().nullable(),
});
export type RuleCard = z.infer<typeof RuleCardSchema>;

export const DrillSchema = z.object({
  rule_id: z.string(),
  passage: z.string().nullable(),
  stem: z.string(),
  choices: ChoicesSchema,
  correct: LetterSchema,
  why_correct: z.string(),
  why_wrong: z.object({ A: z.string(), B: z.string(), C: z.string(), D: z.string() }),
});
export type Drill = z.infer<typeof DrillSchema>;

export const PickSchema = z.union([LetterSchema, z.literal("correct")]);
export type Pick = z.infer<typeof PickSchema>;
