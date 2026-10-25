export type Letter = "A" | "B" | "C" | "D";
export type Pick = Letter | "correct";
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
  source: string;
  test: string | null;
  domain: string | null;
  skill: string | null;
  difficulty: string | null;
  stem: string;
  passage: string | null;
  choices: Choices;
  correct: Letter | null;
  answerSource: "official" | "model" | null;
  rationale: string | null;
}

export interface RuleCard {
  rule_id: string;
  rule_statement: string;
  correct_letter: Letter;
  why_correct: string;
  why_pick_fails: string | null;
  eliminations: { letter: Letter; reason: string }[];
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
}

export interface DrillResponse {
  drillId: string;
  ruleId: string;
  ruleName: string;
  question: { passage: string | null; stem: string; choices: Choices };
}

export interface CheckResponse {
  correct: boolean;
  correctLetter: Letter;
  whyCorrect: string;
  fix: string | null;
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
