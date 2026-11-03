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
import { isSafeKey, KEYS, kv } from "./store";

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
/** The card's prose (rule statement, why right, why the pick fails, takeaway) as recorded from /api/explain. */
const CARD_TEXT_MAX = 1500;
/** The same fields, and the note, as accepted from storage or a backup. */
const TEXT_MAX = 2000;
const ID_MAX = 200;
const CHOICE_MAX = 500;
const ACCEPTED_MAX = 20;
const DRILLS_MAX = 500;
/** The whole log, serialized, stays under this (chrome.storage.local is 10 MB in all). */
export const LOG_BYTES_MAX = 4 * 1024 * 1024;
/** An entry dated before this, or more than a day ahead, is not a real attempt. */
const AT_MIN = Date.UTC(2020, 0, 1);
const AT_SLACK = 86_400_000;
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
    ruleStatement: clip(card.rule_statement, CARD_TEXT_MAX) ?? "",
    takeaway: clip(card.takeaway, CARD_TEXT_MAX) ?? "",
    whyCorrect: clip(card.why_correct, CARD_TEXT_MAX) ?? "",
    whyPickFails: clip(card.why_pick_fails, CARD_TEXT_MAX),
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

/** Newest first, capped by count and by size. The oldest entries go first when the log is too big. */
export function trimLog(entries: LogEntry[], maxBytes = LOG_BYTES_MAX): LogEntry[] {
  let keep = [...entries].sort((a, b) => b.at - a.at).slice(0, MAX_ENTRIES);
  // UTF-16 units, close enough to bytes for a budget.
  while (keep.length > 1 && JSON.stringify(keep).length > maxBytes) keep = keep.slice(0, Math.ceil(keep.length * 0.9));
  return keep;
}

/** Save the log and return what was kept. */
async function writeLog(entries: LogEntry[]): Promise<LogEntry[]> {
  const keep = trimLog(entries);
  await kv().set(KEYS.log, keep);
  return keep;
}

const isQuotaError = (error: unknown) => /quota/i.test(error instanceof Error ? error.message : String(error));

/** Insert or replace by attemptId. When storage is full, half the log (the oldest half) is dropped and the save retried once. */
export function recordAttempt(entry: LogEntry): Promise<LogEntry[]> {
  return serial(async () => {
  const entries = (await readLog()).filter((e) => e.attemptId !== entry.attemptId);
  entries.push(entry);
  try {
    return await writeLog(entries);
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    const half = trimLog(entries).slice(0, Math.ceil(entries.length / 2));
    return writeLog(half);
  }
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
const isLetter = (x: unknown): x is Letter => isStr(x) && LETTER_SET.has(x);
const DIAGNOSES = new Set<string>(["misread", "rule_gap", "careless", "got_it_right", "unknown"]);
const CONFIDENCES = new Set<string>(["sure", "unsure", "guess"]);

/** A string cut to n, else null. */
const strOrNull = (v: unknown, n: number): string | null => (isStr(v) ? clip(v, n) : null);
/** A string cut to n, else "". */
const str = (v: unknown, n: number): string => (isStr(v) ? clip(v, n) ?? "" : "");
/** An id: a short string that is not an Object.prototype name. Undefined when it isn't usable. */
const idOf = (v: unknown): string | undefined => (isStr(v) && v !== "" && isSafeKey(v) ? v.slice(0, ID_MAX) : undefined);

/**
 * A safe copy of a stored or imported entry, or null when a required field is missing or the wrong type, an id is an
 * Object.prototype name, or the date is before 2020 or more than a day ahead. Built field by field: unknown keys are
 * dropped, every string is cut to a sane length, and optional fields with the wrong type are left out.
 */
export function sanitizeEntry(x: unknown, now = Date.now()): LogEntry | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const e = x as Record<string, unknown>;
  const attemptId = idOf(e.attemptId);
  const ruleId = idOf(e.ruleId);
  if (!attemptId || !ruleId || !isStr(e.stem)) return null;
  if (e.qbId !== undefined && e.qbId !== null && isStr(e.qbId) && !isSafeKey(e.qbId)) return null;
  if (!isNum(e.at) || e.at < AT_MIN || e.at > now + AT_SLACK) return null;
  if (!isLetter(e.correct)) return null;
  const picked = e.picked === "correct" ? "correct" : isLetter(e.picked) ? e.picked : null;
  if (!picked) return null;
  if (e.result !== "right" && e.result !== "missed") return null;
  const drills = Array.isArray(e.drills)
    ? e.drills
        .filter((d): d is DrillRecord => !!d && typeof d === "object" && isNum((d as DrillRecord).at) && typeof (d as DrillRecord).correct === "boolean")
        .slice(0, DRILLS_MAX)
        .map((d) => (d.review === undefined ? { at: d.at, correct: d.correct } : { at: d.at, correct: d.correct, review: Boolean(d.review) }))
    : [];
  const rawChoices = e.choices && typeof e.choices === "object" ? (e.choices as Record<string, unknown>) : null;
  const choices = choicesOf(null);
  if (rawChoices) for (const l of ["A", "B", "C", "D"] as const) choices[l] = str(rawChoices[l], CHOICE_MAX);
  const entry: LogEntry = {
    attemptId,
    at: e.at,
    ruleId,
    ruleName: strOrNull(e.ruleName, ID_MAX),
    ruleStatement: str(e.ruleStatement, TEXT_MAX),
    takeaway: str(e.takeaway, TEXT_MAX),
    whyCorrect: str(e.whyCorrect, TEXT_MAX),
    whyPickFails: strOrNull(e.whyPickFails, TEXT_MAX),
    diagnosis: isStr(e.diagnosis) && DIAGNOSES.has(e.diagnosis) ? (e.diagnosis as Diagnosis) : "unknown",
    confidence: isNum(e.confidence) ? Math.min(1, Math.max(0, e.confidence)) : 0,
    picked,
    correct: e.correct,
    result: e.result,
    qbId: strOrNull(e.qbId, ID_MAX),
    domain: strOrNull(e.domain, ID_MAX),
    skill: strOrNull(e.skill, ID_MAX),
    difficulty: strOrNull(e.difficulty, ID_MAX),
    stem: clip(e.stem, STEM_MAX) ?? "",
    passage: strOrNull(e.passage, PASSAGE_MAX),
    choices,
    solvedByModel: e.solvedByModel === true,
    seconds: isNum(e.seconds) && e.seconds >= 0 ? e.seconds : null,
    note: str(e.note, TEXT_MAX),
    starred: e.starred === true,
    drills,
  };
  if (e.selfConfidence !== undefined) entry.selfConfidence = isStr(e.selfConfidence) && CONFIDENCES.has(e.selfConfidence) ? (e.selfConfidence as SelfConfidence) : null;
  if (e.section === "rw" || e.section === "math" || e.section === null) entry.section = e.section;
  if (e.format === "mcq" || e.format === "spr" || e.format === null) entry.format = e.format;
  if (e.typed !== undefined) entry.typed = strOrNull(e.typed, TYPED_MAX);
  if (isStrings(e.accepted)) entry.accepted = e.accepted.slice(0, ACCEPTED_MAX).map((a) => clip(a, TYPED_MAX * 2) ?? "");
  if (e.figure !== undefined) entry.figure = strOrNull(e.figure, FIGURE_MAX);
  if (isStrings(e.steps)) entry.steps = e.steps.slice(0, STEPS_MAX).map((st) => clip(st, STEP_MAX) ?? "");
  if (e.shortcut !== undefined) entry.shortcut = strOrNull(e.shortcut, STEP_MAX);
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
