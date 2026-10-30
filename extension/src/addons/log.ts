// Local attempt log. The server's /api/attempts only returns {id,result,ruleName,skill,stem},
// which is not enough for stats, spaced review, export or notes. So every time /api/explain
// succeeds we keep a compact copy of the card on-device. Nothing here is sent anywhere.
//
// Math (upstream 0.3.0) adds optional fields, so entries saved before 0.3.0 stay valid and read as
// Reading and Writing multiple choice:
//   section  "rw" | "math"   read it with sectionOf(e), which also handles older entries
//   format   "mcq" | "spr"   "spr" = grid-in (student-produced response); check with isGridIn(e)
//   typed    grid-in: what the student typed (null when they chose "I got it right")
//   accepted grid-in: every accepted form of the answer, the card's own answer first
//   figure, steps, shortcut  Math: the figure in words, the worked steps, the Desmos/backsolve tip
// A grid-in entry still has the old fields with their old types: choices are four empty strings,
// `picked` is "correct" (there is no letter to keep) and `correct` is the placeholder "A".
// Don't show picked or correct for grid-in; use answerText(e) and responseText(e).
//
// Hook-in: index.ts afterExplain() calls entryFromExplain(data, picked, extras), then recordAttempt().
// With 0.3.0, pass the raw pick ("spr" included) and the typed answer as extras.typed
// (sidepanel.ts explain() has it as `response`). See docs/UPSTREAM-0.3.0.md.

import type { ApiExplainResponse, ApiPick, Diagnosis, ExplainResponse, Letter, QuestionFormat, Section } from "./types";
import { choicesOf, hasChoices, isMathTaxonomy } from "./types";
import { KEYS, kv } from "./store";

/** How sure the student said they were BEFORE seeing the explanation. */
export type SelfConfidence = "sure" | "unsure" | "guess";

export const MAX_ENTRIES = 1500;
const STEM_MAX = 500;
const PASSAGE_MAX = 1200;
const FIGURE_MAX = 800;
const STEP_MAX = 300;
const STEPS_MAX = 8;
/** The server accepts at most 20 characters for a grid-in response. */
const TYPED_MAX = 20;
/** `correct` on a grid-in entry. The type needs a letter; nothing should display it. */
const NO_LETTER: Letter = "A";

export interface DrillRecord {
  at: number;
  correct: boolean;
  /** true when the drill was launched from the Review queue */
  review?: boolean;
}

export interface LogEntry {
  attemptId: string;
  at: number;
  ruleId: string;
  ruleName: string | null;
  ruleStatement: string;
  takeaway: string;
  whyCorrect: string;
  whyPickFails: string | null;
  diagnosis: Diagnosis;
  confidence: number;
  /** Grid-in: always "correct" (no letter). The typed answer is in `typed`. */
  picked: Letter | "correct";
  /** Grid-in: placeholder "A". The answers are in `accepted`. */
  correct: Letter;
  result: "right" | "missed";
  qbId: string | null;
  domain: string | null;
  skill: string | null;
  difficulty: string | null;
  stem: string;
  passage: string | null;
  /** Always four strings. Empty strings for grid-in. */
  choices: Record<Letter, string>;
  solvedByModel: boolean;
  /** Seconds since the previous capture, from the pacing timer (null if timer off). */
  seconds: number | null;
  note: string;
  starred: boolean;
  drills: DrillRecord[];
  /** Optional so older saved entries stay valid. */
  selfConfidence?: SelfConfidence | null;
  // Math (0.3.0). All optional so older saved entries stay valid.
  /** "rw" or "math". Missing on older entries; read it with sectionOf(e). */
  section?: Section | null;
  /** "mcq" or "spr" (grid-in). Missing on older entries, which are all multiple choice. */
  format?: QuestionFormat | null;
  /** Grid-in: what the student typed. null when they chose "I got it right". */
  typed?: string | null;
  /** Grid-in: every accepted form of the answer, e.g. ["3/17", ".1764", ".1765"]. */
  accepted?: string[];
  /** Math: a figure or table described in words. */
  figure?: string | null;
  /** Math: the card's worked steps. */
  steps?: string[];
  /** Math: the Desmos or backsolving shortcut. */
  shortcut?: string | null;
}

/** Extra facts the side panel knows that the /api/explain response doesn't carry. */
export interface ExplainExtras {
  seconds?: number | null;
  now?: number;
  selfConfidence?: SelfConfidence | null;
  /** Grid-in: the typed answer (what sidepanel.ts sent to /api/explain as `response`). */
  typed?: string | null;
}

const clip = (s: string | null | undefined, n: number) => (s ? (s.length > n ? `${s.slice(0, n - 1)}…` : s) : null);

function uniq(xs: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const x of xs) {
    const t = typeof x === "string" ? x.trim() : "";
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Grid-in (student-produced response): show the typed and accepted answers, no choice list. */
export function isGridIn(e: Pick<LogEntry, "format">): boolean {
  return e.format === "spr";
}

/** Four non-empty choices to show. False for grid-in and for any entry with an empty choice. */
export function hasChoiceList(e: Pick<LogEntry, "format" | "choices">): boolean {
  return !isGridIn(e) && hasChoices(e.choices);
}

/** "math" or "rw". Older entries have no section: a Math domain or skill means "math", anything else "rw". */
export function sectionOf(e: Pick<LogEntry, "section" | "domain" | "skill">): Section {
  if (e.section === "math" || e.section === "rw") return e.section;
  return isMathTaxonomy(e.domain, e.skill) ? "math" : "rw";
}

/** The answer as text: the letter, or the first accepted grid-in answer ("?" if the server had none). */
export function answerText(e: Pick<LogEntry, "format" | "correct" | "accepted">): string {
  if (!isGridIn(e)) return e.correct;
  return e.accepted?.[0] ?? "?";
}

/** Other accepted forms of a grid-in answer (everything after the first). Empty for multiple choice. */
export function otherAnswers(e: Pick<LogEntry, "format" | "accepted">): string[] {
  return isGridIn(e) ? (e.accepted ?? []).slice(1) : [];
}

/** What the student answered: the letter or the typed grid-in answer. null when they chose "I got it right". */
export function responseText(e: Pick<LogEntry, "format" | "picked" | "typed">): string | null {
  if (isGridIn(e)) return e.typed ?? null;
  return e.picked === "correct" ? null : e.picked;
}

/**
 * Build a log entry from a successful /api/explain. Takes the 0.2.0 or the 0.3.0 response as is.
 * `picked` is what was sent: a letter, "correct", or (0.3.0 grid-in) "spr" with extras.typed.
 * The result follows the server's isCorrect when it sends one, else the old rule
 * (picked "correct", picked the card's letter, or diagnosis "got_it_right").
 */
export function entryFromExplain(data: ExplainResponse | ApiExplainResponse, picked: ApiPick, extras: ExplainExtras = {}): LogEntry {
  const { card, question } = data;
  const gridIn = question.format === "spr" || picked === "spr";
  const letter: Letter | null = picked === "correct" || picked === "spr" ? null : picked;
  const graded = typeof data.isCorrect === "boolean" ? data.isCorrect : null;
  const right = graded ?? (picked === "correct" || (letter !== null && letter === card.correct_letter) || card.diagnosis === "got_it_right");
  const domain = question.domain ?? null;
  const skill = question.skill ?? null;
  const steps = uniq(card.steps ?? []).slice(0, STEPS_MAX).map((s) => clip(s, STEP_MAX) ?? "");
  const entry: LogEntry = {
    attemptId: data.attemptId,
    at: extras.now ?? Date.now(),
    ruleId: card.rule_id,
    ruleName: data.rule?.name ?? null,
    ruleStatement: card.rule_statement,
    takeaway: card.takeaway,
    whyCorrect: card.why_correct,
    whyPickFails: card.why_pick_fails ?? null,
    diagnosis: card.diagnosis,
    confidence: card.confidence,
    picked: letter ?? "correct",
    correct: gridIn ? NO_LETTER : card.correct_letter ?? question.correct ?? NO_LETTER,
    result: right ? "right" : "missed",
    qbId: question.qbId ?? null,
    domain,
    skill,
    difficulty: question.difficulty ?? null,
    stem: clip(question.stem, STEM_MAX) ?? "",
    passage: clip(question.passage, PASSAGE_MAX),
    choices: gridIn ? choicesOf(null) : choicesOf(question.choices),
    solvedByModel: Boolean(card.solved_by_model),
    seconds: extras.seconds ?? null,
    note: "",
    starred: false,
    drills: [],
    selfConfidence: extras.selfConfidence ?? null,
    section: sectionOf({ section: question.section, domain, skill }),
    format: gridIn ? "spr" : "mcq",
  };
  if (gridIn) {
    entry.typed = picked === "spr" ? extras.typed?.trim().slice(0, TYPED_MAX) || null : null;
    entry.accepted = uniq([card.correct_answer, ...(question.answers ?? [])]);
  }
  if (question.figure) entry.figure = clip(question.figure, FIGURE_MAX);
  if (steps.length) entry.steps = steps;
  if (card.shortcut) entry.shortcut = clip(card.shortcut, STEP_MAX);
  return entry;
}

/** Every write to the log goes through this queue, so two saves close together can't drop each other's change. */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

export async function readLog(): Promise<LogEntry[]> {
  const raw = await kv().get<unknown>(KEYS.log);
  if (!Array.isArray(raw)) return [];
  // Drop anything malformed (a bad restore file, an old bug), so one broken entry can't break the panel.
  return raw.flatMap((e) => {
    const ok = sanitizeEntry(e);
    return ok ? [ok] : [];
  });
}

async function writeLog(entries: LogEntry[]): Promise<void> {
  // newest first, capped
  entries.sort((a, b) => b.at - a.at);
  await kv().set(KEYS.log, entries.slice(0, MAX_ENTRIES));
}

/** Insert or replace by attemptId. */
export function recordAttempt(entry: LogEntry): Promise<LogEntry[]> {
  return serial(async () => {
  const entries = (await readLog()).filter((e) => e.attemptId !== entry.attemptId);
  entries.push(entry);
  await writeLog(entries);
  return entries;
  });
}

export function updateEntry(attemptId: string, patch: Partial<Pick<LogEntry, "note" | "starred">>): Promise<LogEntry | null> {
  return serial(async () => {
  const entries = await readLog();
  const hit = entries.find((e) => e.attemptId === attemptId);
  if (!hit) return null;
  Object.assign(hit, patch);
  await writeLog(entries);
  return hit;
  });
}

export function recordDrill(attemptId: string, correct: boolean, review = false, now = Date.now()): Promise<void> {
  return serial(async () => {
  const entries = await readLog();
  const hit = entries.find((e) => e.attemptId === attemptId);
  if (!hit) return;
  hit.drills.push({ at: now, correct, review });
  await writeLog(entries);
  });
}

export function clearLog(): Promise<void> {
  return serial(() => kv().remove(KEYS.log));
}

const isStrings = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");
const isStr = (x: unknown): x is string => typeof x === "string";
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const LETTER_SET = new Set(["A", "B", "C", "D"]);

/**
 * A safe copy of a stored or imported entry, or null when the required fields are missing or the wrong
 * type. Drill records that aren't {at: number, correct: boolean} are dropped.
 */
export function sanitizeEntry(x: unknown): LogEntry | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const e = x as Record<string, unknown>;
  if (!isStr(e.attemptId) || !e.attemptId || !isNum(e.at) || !isStr(e.ruleId) || !isStr(e.stem)) return null;
  if (!isStr(e.correct) || !LETTER_SET.has(e.correct)) return null;
  if (e.picked !== "correct" && !(isStr(e.picked) && LETTER_SET.has(e.picked))) return null;
  if (e.result !== "right" && e.result !== "missed") return null;
  const drills = Array.isArray(e.drills)
    ? e.drills.filter((d): d is DrillRecord => !!d && typeof d === "object" && isNum((d as DrillRecord).at) && typeof (d as DrillRecord).correct === "boolean")
    : [];
  const text = (v: unknown, fallback = "") => (isStr(v) ? v : fallback);
  const entry = repairEntry({
    ...(e as unknown as LogEntry),
    drills,
    ruleName: isStr(e.ruleName) ? e.ruleName : null,
    ruleStatement: text(e.ruleStatement),
    takeaway: text(e.takeaway),
    whyCorrect: text(e.whyCorrect),
    whyPickFails: isStr(e.whyPickFails) ? e.whyPickFails : null,
    confidence: isNum(e.confidence) ? e.confidence : 0,
    note: text(e.note),
  });
  if (!entry.diagnosis || !["misread", "rule_gap", "careless", "got_it_right", "unknown"].includes(entry.diagnosis)) entry.diagnosis = "unknown";
  return entry;
}

/** Fill defaults and drop malformed optional fields, so an imported entry from any version reads safely. */
export function repairEntry(e: LogEntry): LogEntry {
  const out: LogEntry = {
    ...e,
    choices: choicesOf(e.choices && typeof e.choices === "object" ? e.choices : null),
    drills: Array.isArray(e.drills) ? e.drills : [],
    note: e.note ?? "",
    starred: Boolean(e.starred),
  };
  if (out.section !== undefined && out.section !== null && out.section !== "rw" && out.section !== "math") delete out.section;
  if (out.format !== undefined && out.format !== null && out.format !== "mcq" && out.format !== "spr") delete out.format;
  if (out.typed !== undefined && out.typed !== null && typeof out.typed !== "string") delete out.typed;
  if (out.accepted !== undefined && !isStrings(out.accepted)) delete out.accepted;
  if (out.steps !== undefined && !isStrings(out.steps)) delete out.steps;
  return out;
}

/** Merge an imported backup (from exportBackup) without duplicating attempts. */
export function importEntries(incoming: unknown[]): Promise<number> {
  return serial(async () => {
    const entries = await readLog();
    const seen = new Set(entries.map((e) => e.attemptId));
    let added = 0;
    for (const raw of Array.isArray(incoming) ? incoming : []) {
      const e = sanitizeEntry(raw);
      if (!e || seen.has(e.attemptId)) continue;
      entries.push(e);
      seen.add(e.attemptId);
      added++;
    }
    await writeLog(entries);
    return added;
  });
}
