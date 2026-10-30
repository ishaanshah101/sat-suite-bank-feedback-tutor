// Practice sets: "do 10 questions", with a live progress strip and a recap at the end
// (accuracy, pace, total time, which rules to review). Pure core + storage under KEYS.sets.
// Works the same for Math and grid-in: it only reads ruleId, result and seconds, and "slow"
// uses each question's own section pace (71 s Reading and Writing, 95 s Math).
// Hook-in: index.ts afterExplain() calls addToSet() after recordAttempt(); the progress strip
// renders in renderInCapture and the recap in renderAboveCapture.

import type { LogEntry } from "./log";
import { KEYS, kv } from "./store";
import { targetSecondsFor } from "./stats";

export interface ActiveSet {
  target: number;
  startedAt: number;
  attemptIds: string[];
}

export interface SetRecap {
  count: number;
  right: number;
  accuracy: number;
  avgSeconds: number | null;
  slow: number;
  minutes: number;
  missedRules: { ruleId: string; ruleName: string | null; misses: number }[];
  attemptIds: string[];
  startedAt: number;
  endedAt: number;
}

export interface SetState {
  active: ActiveSet | null;
  recap: SetRecap | null;
}

export const emptySets = (): SetState => ({ active: null, recap: null });

export function startSet(target: number, now: number): SetState {
  return { active: { target: Math.max(1, Math.min(100, Math.round(target))), startedAt: now, attemptIds: [] }, recap: null };
}

export function buildRecap(entries: LogEntry[], attemptIds: string[], startedAt: number, endedAt: number): SetRecap {
  const ids = new Set(attemptIds);
  const mine = entries.filter((e) => ids.has(e.attemptId));
  const right = mine.filter((e) => e.result === "right").length;
  const timed = mine.filter((e) => typeof e.seconds === "number" && (e.seconds ?? 0) > 0);
  const missed = new Map<string, { ruleId: string; ruleName: string | null; misses: number }>();
  for (const e of mine) {
    if (e.result !== "missed") continue;
    const m = missed.get(e.ruleId) ?? { ruleId: e.ruleId, ruleName: e.ruleName, misses: 0 };
    m.misses++;
    missed.set(e.ruleId, m);
  }
  return {
    count: mine.length,
    right,
    accuracy: mine.length ? right / mine.length : 0,
    avgSeconds: timed.length ? Math.round(timed.reduce((a, e) => a + (e.seconds ?? 0), 0) / timed.length) : null,
    slow: timed.filter((e) => (e.seconds ?? 0) > targetSecondsFor(e)).length,
    minutes: Math.max(1, Math.round((endedAt - startedAt) / 60_000)),
    missedRules: [...missed.values()].sort((a, b) => b.misses - a.misses),
    attemptIds: mine.map((e) => e.attemptId),
    startedAt,
    endedAt,
  };
}

/** An attempt was explained while a set is running. Finishes the set when the target is hit. */
export function addToSet(state: SetState, attemptId: string, entries: LogEntry[], now: number): SetState {
  const a = state.active;
  if (!a || a.attemptIds.includes(attemptId)) return state;
  const attemptIds = [...a.attemptIds, attemptId];
  if (attemptIds.length >= a.target) return { active: null, recap: buildRecap(entries, attemptIds, a.startedAt, now) };
  return { ...state, active: { ...a, attemptIds } };
}

export function endSet(state: SetState, entries: LogEntry[], now: number): SetState {
  const a = state.active;
  if (!a) return state;
  return { active: null, recap: a.attemptIds.length ? buildRecap(entries, a.attemptIds, a.startedAt, now) : null };
}

export async function readSets(): Promise<SetState> {
  return (await kv().get<SetState>(KEYS.sets)) ?? emptySets();
}
export async function writeSets(s: SetState): Promise<void> {
  await kv().set(KEYS.sets, s);
}
