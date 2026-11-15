export type Letter = "A" | "B" | "C" | "D";
/** E is the fifth choice of older ACT Math questions. */
export type ChoiceLetter = Letter | "E";
export type Pick = ChoiceLetter | "correct" | "spr" | "none";
export type Section = "rw" | "math";
/** Every section a captured question can be in: SAT rw/math, ACT english/math/reading/science. */
export type QuestionSection = Section | "english" | "reading" | "science";
export type Exam = "sat" | "act";
/** "fghj": the question's choices are printed F G H J (K), ACT even-numbered questions. */
export type LetterStyle = "abcd" | "fghj";
export type QuestionFormat = "mcq" | "spr";
export const LETTERS: Letter[] = ["A", "B", "C", "D"];

export interface Choices {
  A: string;
  B: string;
  C: string;
  D: string;
  /** Five-choice questions only (older ACT Math). */
  E?: string;
}

export interface Question {
  id: string;
  qbId: string | null;
  /** Missing on questions saved before the ACT was added: the SAT. */
  exam?: Exam;
  section: QuestionSection;
  letterStyle?: LetterStyle | null;
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
  correct: ChoiceLetter | null;
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
  /** "quick": a captured question, explained before the student says what they picked (the extension's card).
   *  "translated" / "explained": the web app's pick-first cards. */
  mode?: "translated" | "explained" | "quick";
  correct_letter: ChoiceLetter | null;
  correct_answer: string | null;
  why_correct: string;
  why_pick_fails: string | null;
  eliminations: { letter: ChoiceLetter; reason: string }[];
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

/** POST /api/explain/pick: the student's pick on a quick card, graded, with the card's reason it fails. */
export interface PickResponse {
  attemptId: string;
  card: RuleCard;
  picked: ChoiceLetter | "spr" | "correct";
  response: string | null;
  isCorrect: boolean | null;
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
