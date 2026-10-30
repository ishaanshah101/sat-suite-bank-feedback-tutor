// Spaced review by RULE (not by question): the product promise is "the one rule behind
// every miss", so what we schedule is the rule. Leitner boxes, pure functions, `now` injected.

import type { LogEntry } from "./log";
import { KEYS, kv } from "./store";

export const DAY = 86_400_000;
/** Box -> days until next review. Box 0 is unused (never scheduled). */
export const INTERVAL_DAYS = [0, 1, 2, 4, 8, 16, 32] as const;
export const MAX_BOX = INTERVAL_DAYS.length - 1;
export const MASTERED_BOX = 5;

export interface RuleSrs {
  ruleId: string;
  ruleName: string | null;
  box: number;
  due: number;
  /** Latest attempt on this rule; /api/drill needs an attemptId to write a fresh question. */
  attemptId: string;
  reps: number;
  lapses: number;
  lastReviewed: number | null;
}

export type SrsState = Record<string, RuleSrs>;

const intervalFor = (box: number) => (INTERVAL_DAYS[Math.min(Math.max(box, 1), MAX_BOX)] ?? 1) * DAY;

/** A real Question Bank attempt was explained. */
export function applyAttempt(state: SrsState, entry: Pick<LogEntry, "ruleId" | "ruleName" | "attemptId" | "result">, now: number): SrsState {
  const next = { ...state };
  const prev = state[entry.ruleId];
  if (entry.result === "missed") {
    next[entry.ruleId] = {
      ruleId: entry.ruleId,
      ruleName: entry.ruleName ?? prev?.ruleName ?? null,
      box: 1,
      due: now + intervalFor(1),
      attemptId: entry.attemptId,
      reps: prev?.reps ?? 0,
      lapses: (prev?.lapses ?? 0) + (prev ? 1 : 0),
      lastReviewed: prev?.lastReviewed ?? null,
    };
  } else if (!prev) {
    // Got it right first time we see the rule: track it, but far out.
    next[entry.ruleId] = {
      ruleId: entry.ruleId,
      ruleName: entry.ruleName ?? null,
      box: 3,
      due: now + intervalFor(3),
      attemptId: entry.attemptId,
      reps: 0,
      lapses: 0,
      lastReviewed: null,
    };
  } else {
    // Right on a rule we already track: counts as a successful review only if it was due.
    const promoted = now >= prev.due ? Math.min(prev.box + 1, MAX_BOX) : prev.box;
    next[entry.ruleId] = {
      ...prev,
      ruleName: entry.ruleName ?? prev.ruleName,
      attemptId: entry.attemptId,
      box: promoted,
      due: promoted !== prev.box ? now + intervalFor(promoted) : prev.due,
    };
  }
  return next;
}

/** A review drill on this rule was answered. */
export function applyReview(state: SrsState, ruleId: string, correct: boolean, now: number): SrsState {
  const prev = state[ruleId];
  if (!prev) return state;
  const box = correct ? Math.min(prev.box + 1, MAX_BOX) : 1;
  return {
    ...state,
    [ruleId]: {
      ...prev,
      box,
      due: now + intervalFor(box),
      reps: prev.reps + 1,
      lapses: prev.lapses + (correct ? 0 : 1),
      lastReviewed: now,
    },
  };
}

/** Due rules, most urgent first: overdue longest, then most lapses, then lowest box. */
export function dueRules(state: SrsState, now: number): RuleSrs[] {
  return Object.values(state)
    .filter((r) => r.due <= now)
    .sort((a, b) => a.due - b.due || b.lapses - a.lapses || a.box - b.box);
}

export function nextDue(state: SrsState, now: number): RuleSrs | null {
  const upcoming = Object.values(state).filter((r) => r.due > now).sort((a, b) => a.due - b.due);
  return upcoming[0] ?? null;
}

export function masteryCounts(state: SrsState): { learning: number; reviewing: number; mastered: number } {
  let learning = 0, reviewing = 0, mastered = 0;
  for (const r of Object.values(state)) {
    if (r.box >= MASTERED_BOX) mastered++;
    else if (r.box <= 2) learning++;
    else reviewing++;
  }
  return { learning, reviewing, mastered };
}

/** Rebuild the schedule from the log (used after import or if SRS storage is lost). */
export function rebuildFromLog(entries: LogEntry[]): SrsState {
  let state: SrsState = {};
  const chronological = [...entries].sort((a, b) => a.at - b.at);
  for (const e of chronological) {
    state = applyAttempt(state, e, e.at);
    for (const d of e.drills) if (d.review) state = applyReview(state, e.ruleId, d.correct, d.at);
  }
  return state;
}

export async function readSrs(): Promise<SrsState> {
  return (await kv().get<SrsState>(KEYS.srs)) ?? {};
}
export async function writeSrs(state: SrsState): Promise<void> {
  await kv().set(KEYS.srs, state);
}

export function describeDue(ms: number, now: number): string {
  const diff = ms - now;
  if (diff <= 0) return "due now";
  const hours = Math.round(diff / 3_600_000);
  if (hours < 24) return `in ${Math.max(1, hours)}h`;
  const days = Math.round(diff / DAY);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}
