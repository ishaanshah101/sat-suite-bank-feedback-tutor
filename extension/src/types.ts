export type Letter = "A" | "B" | "C" | "D";
export type Pick = Letter | "correct" | "spr";
export type Section = "rw" | "math";
export type QuestionFormat = "mcq" | "spr";
export const LETTERS: Letter[] = ["A", "B", "C", "D"];

export interface Choices {
  A: string;
  B: string;
  C: string;
  D: string;
}

export interface Question {
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
  /** Grid-in only: every accepted form of the answer. */
  answers: string[] | null;
  /** A figure or table described in words (may contain math). */
  figure: string | null;
  answerSource: "official" | "model" | null;
  rationale: string | null;
}

export interface RuleCard {
  rule_id: string;
  rule_statement: string;
  /** 1 to 3 rule bullets: the point of the card. Missing on cards saved before 0.7.0. */
  key_rules?: string[];
  /** "explained" cards only: the question explained simply. */
  simple_explanation?: string | null;
  /** "translated": the official rationale turned into rules. "explained": no official explanation, so a simple one. */
  mode?: "translated" | "explained";
  correct_letter: Letter | null;
  correct_answer: string | null;
  why_correct: string;
  why_pick_fails: string | null;
  eliminations: { letter: Letter; reason: string }[];
  steps: string[];
  shortcut: string | null;
  takeaway: string;
  diagnosis: "misread" | "rule_gap" | "careless" | "got_it_right" | "unknown";
  confidence: number;
  solved_by_model: boolean;
  suggested_rule: string | null;
}

export interface ExtractResponse {
  question: Question;
  provider: string;
  model: string;
}

export interface ExplainResponse {
  attemptId: string;
  card: RuleCard;
  question: Question;
  rule?: { id: string; name: string | null };
  isCorrect?: boolean | null;
}

export interface DrillResponse {
  drillId: string;
  ruleId: string;
  ruleName: string;
  format?: QuestionFormat;
  question: { passage: string | null; figure?: string | null; stem: string; choices: Choices | null };
}

export interface CheckResponse {
  correct: boolean;
  format?: QuestionFormat;
  correctLetter: Letter | null;
  correctAnswer?: string | null;
  whyCorrect: string;
  fix: string | null;
  solution?: string[];
}

export interface Health {
  ok: boolean;
  version: string;
  db: { ok: boolean; message?: string };
  ai: { live: string | null; configured: string[]; stub: boolean };
}

export interface Settings {
  server: string;
  token: string | null;
  email?: string | null;
  /** The account's id, so local study data can be tied to one student. */
  userId?: string | null;
}

export interface RecentAttempt {
  id: string;
  createdAt: string;
  result: "right" | "missed" | "unknown";
  section?: Section;
  format?: QuestionFormat;
  response?: string | null;
  ruleId: string | null;
  ruleName: string | null;
  skill: string | null;
  stem: string;
}

export interface Me {
  user: { id: string; email: string } | null;
  ai: { used: number; limit: number | null };
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export interface PendingCapture {
  image?: string;
  error?: string;
  at: number;
  tabTitle?: string | null;
}
