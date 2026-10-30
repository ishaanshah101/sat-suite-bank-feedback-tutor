// Rule flashcards: clear due rules with no AI call and no network. One card per rule.
//   Front: the rule id and name, plus a cue: the stem of the latest question you missed on it.
//   Back:  the rule statement, every distinct takeaway saved for it, and your notes on its entries.
// You grade yourself and the rule's Leitner box moves through srs.ts applyReview:
//   Again      -> applyReview(correct = false): back to box 1, due tomorrow.
//   Hard, Good -> applyReview(correct = true): up one box. Hard currently equals Good.
//
// A pure state machine. Nothing is saved here; the caller saves the SRS:
//   let deck = createDeck(await readLog(), s.srs, Date.now(), { extra: 0 });
//   deck = flip(deck);                                  // show the back
//   const r = grade(deck, "good", Date.now(), s.srs);   // -> { state, srs }
//   deck = r.state; s.srs = r.srs; await writeSrs(r.srs);
//   isDone(deck); deckSummary(deck);
// Hook it in: practice-ui.ts has the entry card (renderPracticeEntry, use deckCounts() for its
// "Flip rule cards (N due)" label) and the screen (renderFlashcards).

import type { LogEntry } from "./log";
import { applyReview, dueRules, type SrsState } from "./srs";

/**
 * Self-grades for a flipped card.
 * - "again": applyReview(..., false). The rule drops to box 1 and is due tomorrow.
 * - "hard" and "good": applyReview(..., true). The rule moves up one box.
 * Hard currently equals Good, because srs.ts has a single "correct" path. Hard stays its own
 * grade so a later scheduler can give it a shorter interval without changing screens or results.
 */
export type FlashGrade = "again" | "hard" | "good";
export const FLASH_GRADES: readonly FlashGrade[] = ["again", "hard", "good"];

/** The question on the front that jogs your memory. */
export interface FlashCue {
  attemptId: string;
  at: number;
  stem: string;
  passage: string | null;
  /** true: the latest question you missed on this rule. false: no miss is saved, so it is the latest question on it. */
  missed: boolean;
}

export interface FlashNote {
  attemptId: string;
  at: number;
  text: string;
}

export interface FlashCard {
  ruleId: string;
  ruleName: string | null;
  /** "due": scheduled now by the SRS. "weak": an extra card, picked by miss rate. */
  reason: "due" | "weak";
  cue: FlashCue | null;
  /** Latest saved rule statement, or "" if none is saved on this device. */
  statement: string;
  /** Distinct takeaways for the rule, newest first. */
  takeaways: string[];
  /** Your notes on this rule's entries, newest first, repeats dropped. */
  notes: FlashNote[];
  attempts: number;
  misses: number;
  missRate: number;
  /** Leitner box when the deck was built; null if the SRS doesn't track the rule. */
  box: number | null;
}

export interface FlashResult {
  ruleId: string;
  grade: FlashGrade;
  at: number;
  boxBefore: number | null;
  boxAfter: number | null;
}

export interface DeckState {
  cards: FlashCard[];
  /** Index of the card on screen. Equals cards.length once the deck is done. */
  index: number;
  /** false: the front is showing. true: the back is showing and the card can be graded. */
  flipped: boolean;
  results: FlashResult[];
  /** The SRS that grades are applied to. grade() returns the updated copy. */
  srs: SrsState;
  startedAt: number;
}

export interface DeckOptions {
  /** After the due rules, add up to this many other rules, highest miss rate first. Default 0. */
  extra?: number;
}

export interface DeckSummary {
  total: number;
  graded: number;
  remaining: number;
  again: number;
  hard: number;
  good: number;
  /** (hard + good) / graded, or null before the first grade. */
  recalled: number | null;
  /** Rules graded Again, in the order graded. They are due again tomorrow. */
  againRules: { ruleId: string; ruleName: string | null }[];
}

const newestFirst = (a: LogEntry, b: LogEntry) => b.at - a.at;
const clean = (s: string | null | undefined) => (typeof s === "string" ? s.trim() : "");
/** Comparison key for "distinct": ignores case, spacing and trailing punctuation. */
const norm = (s: string) => s.trim().replace(/\s+/g, " ").replace(/[\s.!?;:,]+$/, "").toLowerCase();

/** Entries per rule, newest first. */
function byRule(log: LogEntry[]): Map<string, LogEntry[]> {
  const map = new Map<string, LogEntry[]>();
  for (const e of [...log].sort(newestFirst)) {
    if (!e || typeof e.ruleId !== "string" || !e.ruleId) continue;
    const list = map.get(e.ruleId);
    if (list) list.push(e);
    else map.set(e.ruleId, [e]);
  }
  return map;
}

/** Keeps the first (newest) wording of each distinct text. */
function distinct<T>(items: T[], textOf: (item: T) => string | null | undefined): { item: T; text: string }[] {
  const seen = new Set<string>();
  const out: { item: T; text: string }[] = [];
  for (const item of items) {
    const text = clean(textOf(item));
    const key = norm(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ item, text });
  }
  return out;
}

function buildCard(ruleId: string, entries: LogEntry[], srs: SrsState, reason: FlashCard["reason"]): FlashCard {
  const withStem = entries.filter((e) => clean(e.stem));
  const cueEntry = withStem.find((e) => e.result === "missed") ?? withStem[0];
  const misses = entries.filter((e) => e.result === "missed").length;
  return {
    ruleId,
    ruleName: entries.find((e) => e.ruleName)?.ruleName ?? srs[ruleId]?.ruleName ?? null,
    reason,
    cue: cueEntry
      ? { attemptId: cueEntry.attemptId, at: cueEntry.at, stem: clean(cueEntry.stem), passage: clean(cueEntry.passage) || null, missed: cueEntry.result === "missed" }
      : null,
    statement: entries.map((e) => clean(e.ruleStatement)).find(Boolean) ?? "",
    takeaways: distinct(entries, (e) => e.takeaway).map((d) => d.text),
    notes: distinct(entries, (e) => e.note).map(({ item, text }) => ({ attemptId: item.attemptId, at: item.at, text })),
    attempts: entries.length,
    misses,
    missRate: entries.length ? misses / entries.length : 0,
    box: srs[ruleId]?.box ?? null,
  };
}

/**
 * Rules that are not due but have at least one miss, weakest first: highest miss rate, then
 * more misses, then the most recent miss. Rules you have never missed are left out.
 */
export function weakestRules(log: LogEntry[], srs: SrsState, now: number, limit = Infinity): string[] {
  const due = new Set(dueRules(srs, now).map((r) => r.ruleId));
  const rows: { ruleId: string; rate: number; misses: number; lastMiss: number }[] = [];
  for (const [ruleId, entries] of byRule(log)) {
    if (due.has(ruleId)) continue;
    const missed = entries.filter((e) => e.result === "missed");
    if (!missed.length) continue;
    rows.push({ ruleId, rate: missed.length / entries.length, misses: missed.length, lastMiss: missed[0]?.at ?? 0 });
  }
  rows.sort((a, b) => b.rate - a.rate || b.misses - a.misses || b.lastMiss - a.lastMiss || (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0));
  return rows.slice(0, Math.max(0, limit)).map((r) => r.ruleId);
}

/** Due rules first, in dueRules order; then up to opts.extra of the weakest other rules. */
export function createDeck(log: LogEntry[], srs: SrsState, now: number, opts: DeckOptions = {}): DeckState {
  const groups = byRule(log);
  const cards = dueRules(srs, now).map((r) => buildCard(r.ruleId, groups.get(r.ruleId) ?? [], srs, "due"));
  const extra = Math.max(0, Math.floor(opts.extra ?? 0)) || 0;
  if (extra) for (const ruleId of weakestRules(log, srs, now, extra)) cards.push(buildCard(ruleId, groups.get(ruleId) ?? [], srs, "weak"));
  return { cards, index: 0, flipped: false, results: [], srs, startedAt: now };
}

export function currentCard(state: DeckState): FlashCard | null {
  return state.cards[state.index] ?? null;
}

export function isDone(state: DeckState): boolean {
  return state.index >= state.cards.length;
}

/** Turn the current card over (front to back, or back to front). No-op once the deck is done. */
export function flip(state: DeckState): DeckState {
  return isDone(state) ? state : { ...state, flipped: !state.flipped };
}

/**
 * Grade the current card and move on to the next one, front side up.
 * Only a flipped card can be graded. Otherwise (front showing, deck done, unknown grade) this
 * returns the same state object and the SRS unchanged.
 * Again calls applyReview(correct = false). Hard and Good both call applyReview(correct = true),
 * so Hard currently equals Good.
 * Pass `latest` when the SRS may have changed since createDeck (say, a capture while the deck
 * was open). It defaults to the deck's own copy.
 */
export function grade(state: DeckState, g: FlashGrade, now: number, latest: SrsState = state.srs): { state: DeckState; srs: SrsState } {
  const card = currentCard(state);
  if (!card || !state.flipped || !FLASH_GRADES.includes(g)) return { state, srs: latest };
  const srs = applyReview(latest, card.ruleId, g !== "again", now);
  const result: FlashResult = {
    ruleId: card.ruleId,
    grade: g,
    at: now,
    boxBefore: latest[card.ruleId]?.box ?? null,
    boxAfter: srs[card.ruleId]?.box ?? null,
  };
  return { state: { ...state, index: state.index + 1, flipped: false, results: [...state.results, result], srs }, srs };
}

/** When the current card's rule would be due after grading it `g` now. Null when done or not tracked. */
export function nextDueIf(state: DeckState, g: FlashGrade, now: number, latest: SrsState = state.srs): number | null {
  const card = currentCard(state);
  if (!card || !latest[card.ruleId]) return null;
  return applyReview(latest, card.ruleId, g !== "again", now)[card.ruleId]?.due ?? null;
}

export function deckSummary(state: DeckState): DeckSummary {
  const count = (g: FlashGrade) => state.results.filter((r) => r.grade === g).length;
  const again = count("again");
  const hard = count("hard");
  const good = count("good");
  const graded = state.results.length;
  const names = new Map(state.cards.map((c) => [c.ruleId, c.ruleName]));
  return {
    total: state.cards.length,
    graded,
    remaining: Math.max(0, state.cards.length - state.index),
    again,
    hard,
    good,
    recalled: graded ? (hard + good) / graded : null,
    againRules: state.results.filter((r) => r.grade === "again").map((r) => ({ ruleId: r.ruleId, ruleName: names.get(r.ruleId) ?? null })),
  };
}

/** Counts for the entry card: rules due now, and weak non-due rules (capped at `extra`). */
export function deckCounts(log: LogEntry[], srs: SrsState, now: number, extra = 5): { due: number; weak: number } {
  return { due: dueRules(srs, now).length, weak: weakestRules(log, srs, now, extra).length };
}
