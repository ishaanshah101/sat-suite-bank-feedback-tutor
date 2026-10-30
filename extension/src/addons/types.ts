// Shapes the add-ons share with the Rulecard side panel, in two layers:
//
//  1. Api* types: an exact copy of upstream extension 0.3.0 (extension/src/types.ts in
//     ishaanshah101/sat-suite-bank-feedback-tutor at 7cdf3fd). This is what the server sends now.
//  2. The add-on names from the 0.2.0 era (Question, RuleCard, ExplainResponse, DrillCheckResponse).
//     They keep compiling for existing add-on code; the 0.3.0 fields are added as optional. Where 0.3.0
//     can send null (grid-in: choices, correct_letter, correctLetter) the old field type is unchanged
//     and its comment says so. Run normalizeQuestion() on a 0.3.0 question before handing it to them.
//
// Hook-in: when merging into upstream, point the Api* names at the real types in extension/src/types.ts
// (ApiPick is upstream `Pick`, renamed so it doesn't shadow TypeScript's Pick<T, K>). Keep the helpers.
// See docs/UPSTREAM-0.3.0.md.

export type Letter = "A" | "B" | "C" | "D";
export const LETTERS: readonly Letter[] = ["A", "B", "C", "D"];

/** "rw" = Reading and Writing, "math" = Math. */
export type Section = "rw" | "math";
/** "mcq" = multiple choice, "spr" = student-produced response (grid-in, typed answer, no A to D). */
export type QuestionFormat = "mcq" | "spr";
/** Upstream `Pick`. "correct" = "I got it right, but explain". "spr" = typed a grid-in answer; the text goes separately as `response`. */
export type ApiPick = Letter | "correct" | "spr";

export type Diagnosis = "misread" | "rule_gap" | "careless" | "got_it_right" | "unknown";

export interface Choices {
  A: string;
  B: string;
  C: string;
  D: string;
}

export interface Settings {
  server: string;
  token: string | null;
  /** null allowed so upstream 0.3.0 `Settings` fits AddonContext as is. */
  email?: string | null;
}

// ---------------------------------------------------------------- upstream 0.3.0, exact

export interface ApiQuestion {
  id: string;
  qbId: string | null;
  section: Section;
  format: QuestionFormat;
  source: string;
  test: string | null;
  domain: string | null;
  skill: string | null;
  difficulty: string | null;
  stem: string;
  passage: string | null;
  /** Null for grid-in (student-produced response) questions. */
  choices: Choices | null;
  correct: Letter | null;
  /** Grid-in only: every accepted form of the answer, e.g. [".1764", ".1765", "3/17"]. */
  answers: string[] | null;
  /** A figure or table described in words (may contain math). */
  figure: string | null;
  answerSource: "official" | "model" | null;
  rationale: string | null;
}

export interface ApiRuleCard {
  rule_id: string;
  rule_statement: string;
  /** Null for grid-in. */
  correct_letter: Letter | null;
  /** Grid-in: the answer as text. */
  correct_answer: string | null;
  why_correct: string;
  why_pick_fails: string | null;
  eliminations: { letter: Letter; reason: string }[];
  /** Math: worked steps. Empty for Reading and Writing. */
  steps: string[];
  /** Math: a Desmos or backsolving shortcut. */
  shortcut: string | null;
  takeaway: string;
  diagnosis: Diagnosis;
  confidence: number;
  solved_by_model: boolean;
  suggested_rule: string | null;
}

/** POST /api/extract with {image, source: "capture" | "image" | "pdf"} or {text (20 to 20,000 chars), source: "paste"}. The server also sends provider and model. */
export interface ApiExtractResponse {
  question: ApiQuestion;
  provider: string;
  model: string;
}

/**
 * POST /api/explain with {questionId, picked: ApiPick, response?: string | null, reasoning?: string | null,
 * allowModelSolve?: boolean}. `response` is required when picked is "spr". Grid-in questions accept only
 * "spr" or "correct"; multiple choice rejects "spr" (400, code "invalid_response").
 */
export interface ApiExplainResponse {
  attemptId: string;
  card: ApiRuleCard;
  question: ApiQuestion;
  rule?: { id: string; name: string | null };
  /** The server's grade of the pick or typed answer. null when it could not grade. When true, diagnosis is "got_it_right". */
  isCorrect?: boolean | null;
}

/** POST /api/drill with {attemptId}. Grid-in drills have format "spr" and choices null. */
export interface ApiDrillResponse {
  drillId: string;
  ruleId: string;
  ruleName: string;
  format?: QuestionFormat;
  question: { passage: string | null; figure?: string | null; stem: string; choices: Choices | null };
}

/** POST /api/drill/check with {drillId, picked: Letter} or, for a grid-in drill, {drillId, response: string}. */
export interface ApiCheckResponse {
  correct: boolean;
  format?: QuestionFormat;
  /** Null for grid-in drills; read correctAnswer. */
  correctLetter: Letter | null;
  correctAnswer?: string | null;
  whyCorrect: string;
  fix: string | null;
  /** Math: worked solution steps. */
  solution?: string[];
}

// ---------------------------------------------------------------- add-on names (0.2.0 era, extended)

/** What /api/extract and /api/explain return as `question`, as the add-ons read it. */
export interface Question {
  id: string;
  qbId?: string | null;
  domain?: string | null;
  skill?: string | null;
  difficulty?: string | null;
  passage?: string | null;
  stem: string;
  /** Always four strings here. 0.3.0 sends null for grid-in; normalizeQuestion() fills in empty strings. */
  choices: Record<Letter, string>;
  correct?: Letter | null;
  answerSource?: "page" | "model" | string | null;
  // 0.3.0 additions, optional so 0.2.0 payloads still fit
  section?: Section | null;
  format?: QuestionFormat | null;
  source?: string | null;
  test?: string | null;
  answers?: string[] | null;
  figure?: string | null;
  rationale?: string | null;
}

/** What /api/explain returns as `card`. */
export interface RuleCard {
  diagnosis: Diagnosis;
  confidence: number;
  rule_id: string;
  rule_statement: string;
  /** 0.3.0 sends null for grid-in; read correct_answer there. */
  correct_letter: Letter;
  why_correct: string;
  why_pick_fails?: string | null;
  eliminations: { letter: Letter; reason: string }[];
  takeaway: string;
  solved_by_model?: boolean;
  suggested_rule?: string | null;
  // 0.3.0 additions
  correct_answer?: string | null;
  steps?: string[];
  shortcut?: string | null;
}

export interface ExplainResponse {
  attemptId: string;
  card: RuleCard;
  rule?: { id?: string; name?: string | null } | null;
  question: Question;
  /** 0.3.0: the server's grade. */
  isCorrect?: boolean | null;
}

export interface DrillCheckResponse {
  correct: boolean;
  /** 0.3.0 sends null for grid-in drills; read correctAnswer there. */
  correctLetter: Letter;
  whyCorrect: string;
  fix?: string | null;
  // 0.3.0 additions
  format?: QuestionFormat;
  correctAnswer?: string | null;
  solution?: string[];
}

/** The generic JSON request helper from extension/src/api.ts. */
export type RequestFn = <T = unknown>(
  settings: Settings,
  path: string,
  init?: { method?: string; body?: unknown; auth?: boolean },
) => Promise<T>;

/** Everything an addon panel needs from the host side panel. */
export interface AddonContext {
  settings: Settings;
  request: RequestFn;
  /** Re-render the whole side panel (sidepanel.ts `render`). */
  rerender: () => void;
  /** Open a web-app path signed in (sidepanel.ts `openWeb`). */
  openWeb: (path: string) => void | Promise<void>;
  /** Turn an error into a user-facing sentence (sidepanel.ts `describe`). */
  describe: (error: unknown) => string;
}

// ---------------------------------------------------------------- helpers

type LooseChoices = Partial<Record<Letter, string | null | undefined>> | null | undefined;

/** All four choices are present and non-empty. False for grid-in. */
export function hasChoices(c: LooseChoices): c is Record<Letter, string> {
  return !!c && LETTERS.every((l) => typeof c[l] === "string" && c[l]!.trim() !== "");
}

/** Always four strings: empty where a choice is missing (grid-in has none). */
export function choicesOf(c: LooseChoices): Record<Letter, string> {
  return { A: c?.A ?? "", B: c?.B ?? "", C: c?.C ?? "", D: c?.D ?? "" };
}

/** A 0.2.0 or 0.3.0 question in the add-on shape: choices filled in, format set. */
export function normalizeQuestion(q: Question | ApiQuestion): Question {
  return { ...q, choices: choicesOf(q.choices), format: q.format ?? (hasChoices(q.choices) ? "mcq" : "spr") };
}

/** Official Digital SAT Math taxonomy: 4 domains, 19 skills. */
export const MATH_DOMAINS = ["Algebra", "Advanced Math", "Problem-Solving and Data Analysis", "Geometry and Trigonometry"] as const;
export const MATH_SKILLS = [
  "Linear equations in one variable",
  "Linear functions",
  "Linear equations in two variables",
  "Systems of two linear equations in two variables",
  "Linear inequalities in one or two variables",
  "Nonlinear functions",
  "Nonlinear equations in one variable and systems of equations in two variables",
  "Equivalent expressions",
  "Ratios, rates, proportional relationships, and units",
  "Percentages",
  "One-variable data: Distributions and measures of center and spread",
  "Two-variable data: Models and scatterplots",
  "Probability and conditional probability",
  "Inference from sample statistics and margin of error",
  "Evaluating statistical claims: Observational studies and experiments",
  "Area and volume",
  "Lines, angles, and triangles",
  "Right triangles and trigonometry",
  "Circles",
] as const;

const fold = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const MATH_NAMES = new Set<string>([...MATH_DOMAINS, ...MATH_SKILLS].map(fold));

/** True when the domain or skill is a Math one (case and spacing ignored). */
export function isMathTaxonomy(domain: string | null | undefined, skill: string | null | undefined): boolean {
  return [domain, skill].some((x) => !!x && MATH_NAMES.has(fold(x)));
}
