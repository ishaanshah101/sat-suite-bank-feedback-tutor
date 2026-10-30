// Redo my misses: re-ask your own missed questions from the local log, offline and with no AI
// call. Shows the saved passage, stem and four choices in their original A-D order (the saved
// explanations refer to the letters) and checks the pick against the stored correct letter.
// Skips anything that is not multiple choice: grid-in (format "spr") or any empty choice.
//
// Queue: misses never redone first, then misses whose latest redo was wrong, oldest miss first
// in each group. A miss whose latest redo is right counts as fixed and leaves the queue.
// Redo answers are saved under REDO_KEY ("rc.addons.redo.v1") via kv():
//   { [attemptId]: { at, correct, picked }[] }   (oldest first)
// They do not touch the SRS or the log.
//
// Pure state machine plus storage helpers:
//   let st = createRedo(await readLog(), await readRedo(), Date.now(), { ruleId, skill, limit });
//   const r = answerRedo(st, "C", Date.now()); st = r.state;
//   if (r.saved) await recordRedo(r.saved.attemptId, r.saved.attempt);
//   st = nextRedo(st);                 // or skipRedo(st, now) to pass without answering
//   isRedoDone(st); redoSummary(st); redoStats(log, store);
// Hook it in: practice-ui.ts has the entry card (renderPracticeEntry, use redoQueue(...).length
// for its "Redo my misses (N)" label) and the screen (renderRedo).

import type { LogEntry } from "./log";
import { kv } from "./store";
import { LETTERS, type Letter } from "./types";

export const REDO_KEY = "rc.addons.redo.v1";
/** Redo answers kept per question; the oldest are dropped past this. */
export const MAX_REDOS_PER_ENTRY = 20;

export interface RedoAttempt {
  at: number;
  correct: boolean;
  picked: Letter;
}

/** attemptId -> redo answers, oldest first. */
export type RedoStore = Record<string, RedoAttempt[]>;

export interface RedoFilter {
  ruleId?: string | null;
  skill?: string | null;
}

export interface RedoOptions extends RedoFilter {
  /** Ask at most this many (the front of the queue). Default: all. */
  limit?: number;
}

export interface RedoItem {
  entry: LogEntry;
  /** Redo answers saved before this session, oldest first. */
  history: RedoAttempt[];
}

export interface RedoResult {
  attemptId: string;
  ruleId: string;
  ruleName: string | null;
  /** null when skipped */
  picked: Letter | null;
  correct: boolean;
  skipped: boolean;
  at: number;
}

export interface RedoState {
  items: RedoItem[];
  index: number;
  /** Your answer to the current question; null until you answer. */
  picked: Letter | null;
  results: RedoResult[];
  startedAt: number;
}

export interface RedoSummary {
  total: number;
  answered: number;
  right: number;
  wrong: number;
  skipped: number;
  remaining: number;
  accuracy: number | null;
  /** Rules you missed again in this session, most misses first. */
  missedAgain: { ruleId: string; ruleName: string | null; count: number }[];
}

export interface RedoStats {
  /** Multiple-choice misses in the log (after the filter). */
  misses: number;
  /** Misses redone at least once. */
  redone: number;
  /** Every redo answer on those misses. */
  answers: number;
  right: number;
  /** right / answers, or null before the first redo. */
  accuracy: number | null;
  /** Misses whose latest redo is right. */
  fixed: number;
  /** Misses still to redo (never redone, or latest redo wrong). Equals redoQueue(...).length. */
  left: number;
}

const isLetter = (x: unknown): x is Letter => typeof x === "string" && (LETTERS as readonly string[]).includes(x);

/** False for grid-in (format "spr") and for any entry with an empty or missing choice. */
export function isMultipleChoice(e: LogEntry): boolean {
  if ("format" in e && e.format === "spr") return false;
  const choices: unknown = e.choices;
  if (!choices || typeof choices !== "object") return false;
  return LETTERS.every((l) => {
    const text = (choices as Record<string, unknown>)[l];
    return typeof text === "string" && text.trim() !== "";
  });
}

/** A miss that can be re-asked: missed, multiple choice, with a valid stored correct letter. */
export function isRedoable(e: LogEntry): boolean {
  return !!e && e.result === "missed" && typeof e.attemptId === "string" && isMultipleChoice(e) && isLetter(e.correct);
}

/** The four choices in A-D order, whatever order they were saved in. Never shuffled. */
export function choiceList(e: Pick<LogEntry, "choices">): { letter: Letter; text: string }[] {
  return LETTERS.map((letter) => ({ letter, text: e.choices?.[letter] ?? "" }));
}

/** Saved redo answers for one question, oldest first, malformed records dropped. */
export function historyOf(store: RedoStore, attemptId: string): RedoAttempt[] {
  const list: unknown = Object.prototype.hasOwnProperty.call(store, attemptId) ? store[attemptId] : undefined;
  if (!Array.isArray(list)) return [];
  return list
    .filter((a): a is RedoAttempt => !!a && typeof a === "object" && typeof a.at === "number" && typeof a.correct === "boolean" && isLetter(a.picked))
    .sort((a, b) => a.at - b.at);
}

const matches = (e: LogEntry, f: RedoFilter) => (!f.ruleId || e.ruleId === f.ruleId) && (!f.skill || e.skill === f.skill);
const byAttemptId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const oldestFirst = (a: RedoItem, b: RedoItem) => a.entry.at - b.entry.at || byAttemptId(a.entry.attemptId, b.entry.attemptId);

/** Redoable misses after the filter, one per attemptId, each with its saved history. */
function eligible(log: LogEntry[], store: RedoStore, filter: RedoFilter): RedoItem[] {
  const seen = new Set<string>();
  const out: RedoItem[] = [];
  for (const entry of log) {
    if (!isRedoable(entry) || !matches(entry, filter) || seen.has(entry.attemptId)) continue;
    seen.add(entry.attemptId);
    out.push({ entry, history: historyOf(store, entry.attemptId) });
  }
  return out;
}

/**
 * Misses to redo: never redone first, then the ones whose latest redo was wrong, oldest miss
 * first in each group. Misses whose latest redo is right are fixed and left out.
 */
export function redoQueue(log: LogEntry[], store: RedoStore, filter: RedoFilter = {}): RedoItem[] {
  const fresh: RedoItem[] = [];
  const wrong: RedoItem[] = [];
  for (const item of eligible(log, store, filter)) {
    const last = item.history[item.history.length - 1];
    if (!last) fresh.push(item);
    else if (!last.correct) wrong.push(item);
  }
  return [...fresh.sort(oldestFirst), ...wrong.sort(oldestFirst)];
}

export function createRedo(log: LogEntry[], store: RedoStore, now: number, opts: RedoOptions = {}): RedoState {
  const items = redoQueue(log, store, opts);
  const limit = Math.floor(opts.limit ?? Infinity);
  return { items: limit > 0 && limit < items.length ? items.slice(0, limit) : items, index: 0, picked: null, results: [], startedAt: now };
}

export function currentRedo(state: RedoState): RedoItem | null {
  return state.items[state.index] ?? null;
}

export function isRedoDone(state: RedoState): boolean {
  return state.index >= state.items.length;
}

/**
 * Answer the current question, checked against the stored correct letter. Returns the new state
 * and `saved` (hand it to recordRedo). Answering twice, or after the end, is a no-op: the same
 * state object comes back with saved = null.
 */
export function answerRedo(state: RedoState, letter: Letter, now: number): { state: RedoState; saved: { attemptId: string; attempt: RedoAttempt } | null } {
  const item = currentRedo(state);
  if (!item || state.picked || !isLetter(letter)) return { state, saved: null };
  const e = item.entry;
  const correct = letter === e.correct;
  const result: RedoResult = { attemptId: e.attemptId, ruleId: e.ruleId, ruleName: e.ruleName, picked: letter, correct, skipped: false, at: now };
  return {
    state: { ...state, picked: letter, results: [...state.results, result] },
    saved: { attemptId: e.attemptId, attempt: { at: now, correct, picked: letter } },
  };
}

/** Move to the next question. Needs an answer first (skipRedo passes); otherwise a no-op. */
export function nextRedo(state: RedoState): RedoState {
  if (isRedoDone(state) || !state.picked) return state;
  return { ...state, index: state.index + 1, picked: null };
}

/** Pass on the current question without saving anything. After an answer it acts like nextRedo. */
export function skipRedo(state: RedoState, now: number): RedoState {
  const item = currentRedo(state);
  if (!item) return state;
  if (state.picked) return nextRedo(state);
  const e = item.entry;
  const result: RedoResult = { attemptId: e.attemptId, ruleId: e.ruleId, ruleName: e.ruleName, picked: null, correct: false, skipped: true, at: now };
  return { ...state, index: state.index + 1, picked: null, results: [...state.results, result] };
}

export function redoSummary(state: RedoState): RedoSummary {
  const answered = state.results.filter((r) => !r.skipped);
  const right = answered.filter((r) => r.correct).length;
  const again = new Map<string, { ruleId: string; ruleName: string | null; count: number }>();
  for (const r of answered) {
    if (r.correct) continue;
    const m = again.get(r.ruleId) ?? { ruleId: r.ruleId, ruleName: r.ruleName, count: 0 };
    m.count++;
    again.set(r.ruleId, m);
  }
  return {
    total: state.items.length,
    answered: answered.length,
    right,
    wrong: answered.length - right,
    skipped: state.results.length - answered.length,
    remaining: Math.max(0, state.items.length - state.index),
    accuracy: answered.length ? right / answered.length : null,
    missedAgain: [...again.values()].sort((a, b) => b.count - a.count),
  };
}

/**
 * All-time numbers over the redoable misses in the log (after the filter). Redo records for
 * attempts that are no longer in the log, or that were not misses, are ignored.
 */
export function redoStats(log: LogEntry[], store: RedoStore, filter: RedoFilter = {}): RedoStats {
  let misses = 0, redone = 0, answers = 0, right = 0, fixed = 0;
  for (const { history } of eligible(log, store, filter)) {
    misses++;
    if (!history.length) continue;
    redone++;
    answers += history.length;
    right += history.filter((a) => a.correct).length;
    if (history[history.length - 1]?.correct) fixed++;
  }
  return { misses, redone, answers, right, accuracy: answers ? right / answers : null, fixed, left: misses - fixed };
}

// ---------------------------------------------------------------- storage

export async function readRedo(): Promise<RedoStore> {
  const raw = await kv().get<unknown>(REDO_KEY);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as RedoStore) : {};
}

export async function writeRedo(store: RedoStore): Promise<void> {
  await kv().set(REDO_KEY, store);
}

/** Pure: a copy of `store` with one more answer for attemptId, keeping the latest MAX_REDOS_PER_ENTRY. */
export function addRedo(store: RedoStore, attemptId: string, attempt: RedoAttempt): RedoStore {
  const list = [...historyOf(store, attemptId), { at: attempt.at, correct: attempt.correct, picked: attempt.picked }]
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_REDOS_PER_ENTRY);
  return { ...store, [attemptId]: list };
}

// Saves run one after another so two quick answers can't overwrite each other.
let saving: Promise<unknown> = Promise.resolve();

/** Save one redo answer under REDO_KEY. Resolves to the updated store. */
export function recordRedo(attemptId: string, attempt: RedoAttempt): Promise<RedoStore> {
  const run = saving.then(async () => {
    const next = addRedo(await readRedo(), attemptId, attempt);
    await writeRedo(next);
    return next;
  });
  saving = run.catch(() => undefined);
  return run;
}
