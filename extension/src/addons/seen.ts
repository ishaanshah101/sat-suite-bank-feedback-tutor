// "Seen before": looks up the question on screen in the local attempt log. When the student has
// done it before, it shows a short banner such as
//   "You did this question on Oct 12 and picked B (missed). Rule: B1 Comma splice."
// with a "Show my old card" toggle that reveals the old rule statement, why the right answer is
// right, and the takeaway.
//
// Matching: the Question Bank id (qbId) first. Without a shared id, the question text is compared
// with similarity() from qbtext.ts: passage + stem + choices must reach 0.85 and contain the same
// numbers (so "3x + 5 = 20" and "3x + 7 = 20" stay different questions). The passage is included
// because many SAT stems are boilerplate ("Which choice completes the text so that it conforms to
// the conventions of Standard English?"). Two different qbIds never match.
//
// Hook in: renderQuestionExtras(q) slot:
//   const seen = createSeenCheck(ctx.rerender);                                   // once
//   seen.render(s.log, q, { excludeAttemptIds: [host.getExplained()?.attemptId] })
// The exclusion stops the attempt you just explained from matching itself. Lower level:
// findPrevious(log, q, opts) and renderSeenBanner(prev, { open, onToggle }).
// Storage: none (reads the log you pass in). Permissions: none.

import { h } from "./dom";
import type { LogEntry } from "./log";
import { similarity } from "./qbtext";
import { LETTERS, type Letter, type Question } from "./types";

export const SEEN_THRESHOLD = 0.85;
// log.ts clips these before saving; clip the live question the same way so long passages still match.
const STEM_MAX = 500;
const PASSAGE_MAX = 1200;
const DAY_MS = 86_400_000;

export interface PastAttempt {
  attemptId: string;
  at: number;
  result: "right" | "missed";
  picked: Letter | "correct";
  correct: Letter;
  ruleId: string;
  ruleName: string | null;
  ruleStatement: string;
  whyCorrect: string;
  takeaway: string;
  matchedBy: "qbId" | "text";
  /** 1 for a qbId match, otherwise the text similarity. */
  score: number;
}

export interface FindOptions {
  /** Attempts to skip, such as the one just explained for this same question. */
  excludeAttemptIds?: readonly (string | null | undefined)[];
  /** Only count attempts made before this time. */
  before?: number;
  threshold?: number;
}

export type Comparable = Pick<Question, "stem" | "choices" | "passage">;

const clip = (s: string | null | undefined, n: number) => (s ? (s.length > n ? `${s.slice(0, n - 1)}…` : s) : "");
const normId = (id: string | null | undefined) => (id ?? "").trim().toLowerCase();
const numbersIn = (s: string) => (s.match(/\d+(?:[.,]\d+)*/g) ?? []).sort().join(" ");

/** Passage + stem + choices, clipped the way log.ts clips them. */
export function questionText(q: Comparable): string {
  const choices = LETTERS.map((l) => q.choices?.[l] ?? "");
  return [clip(q.passage, PASSAGE_MAX), clip(q.stem, STEM_MAX), ...choices].filter(Boolean).join("\n");
}

/** Text similarity of two questions, or 0 when their numbers differ. */
export function sameQuestionScore(a: Comparable, b: Comparable): number {
  const ta = questionText(a);
  const tb = questionText(b);
  if (!ta || !tb || numbersIn(ta) !== numbersIn(tb)) return 0;
  return similarity(ta, tb);
}

function toPast(e: LogEntry, matchedBy: PastAttempt["matchedBy"], score: number): PastAttempt {
  return {
    attemptId: e.attemptId,
    at: e.at,
    result: e.result,
    picked: e.picked,
    correct: e.correct,
    ruleId: e.ruleId,
    ruleName: e.ruleName,
    ruleStatement: e.ruleStatement,
    whyCorrect: e.whyCorrect,
    takeaway: e.takeaway,
    matchedBy,
    score,
  };
}

/** Earlier attempts at this question, newest first. qbId matches win; otherwise close text matches. */
export function findPrevious(
  log: readonly LogEntry[],
  question: Comparable & Pick<Question, "qbId">,
  opts: FindOptions = {},
): PastAttempt[] {
  const skip = new Set(opts.excludeAttemptIds?.filter((x): x is string => Boolean(x)) ?? []);
  const pool = log.filter((e) => !skip.has(e.attemptId) && (opts.before === undefined || e.at < opts.before));
  const newestFirst = (a: PastAttempt, b: PastAttempt) => b.at - a.at;
  const id = normId(question.qbId);
  if (id) {
    const byId = pool.filter((e) => normId(e.qbId) === id).map((e) => toPast(e, "qbId", 1));
    if (byId.length) return byId.sort(newestFirst);
  }
  const text = questionText(question);
  if (!text) return [];
  const numbers = numbersIn(text);
  const threshold = opts.threshold ?? SEEN_THRESHOLD;
  const out: PastAttempt[] = [];
  for (const e of pool) {
    // Two different Question Bank ids are two different questions, however alike they read.
    if (id && normId(e.qbId)) continue;
    const other = questionText(e);
    if (!other || numbersIn(other) !== numbers) continue;
    const score = similarity(text, other);
    if (score >= threshold) out.push(toPast(e, "text", score));
  }
  return out.sort(newestFirst);
}

// ---------------------------------------------------------------- wording (pure)

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Today", "Yesterday", "Oct 12", or "Oct 12, 2025" in another year. */
export function dayLabel(at: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();
  return new Date(at).toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

/** "today", "yesterday" or "on Oct 12". */
export function whenPhrase(at: number, now: number): string {
  const label = dayLabel(at, now);
  return label === "Today" || label === "Yesterday" ? label.toLowerCase() : `on ${label}`;
}

/** "picked B (missed)", "picked C (right)", or "got it right". */
export function pickedPhrase(p: Pick<PastAttempt, "picked" | "result">): string {
  return p.picked === "correct" ? "got it right" : `picked ${p.picked} (${p.result})`;
}

/** "Rule: B1 Comma splice." */
export function ruleLine(p: Pick<PastAttempt, "ruleId" | "ruleName">): string {
  const name = p.ruleName?.trim().replace(/[.\s]+$/, "");
  return `Rule: ${p.ruleId}${name ? ` ${name}` : ""}.`;
}

/** "You did this question on Oct 12 and picked B (missed)." Text-only matches start with "Looks like". */
export function seenSentence(prev: readonly PastAttempt[], now: number): string {
  const last = prev[0];
  if (!last) return "";
  const lead = last.matchedBy === "text" ? "Looks like you did this question" : "You did this question";
  if (prev.length === 1) return `${lead} ${whenPhrase(last.at, now)} and ${pickedPhrase(last)}.`;
  return `${lead} ${prev.length} times before. Last time was ${whenPhrase(last.at, now).replace(/^on /, "")}: you ${pickedPhrase(last)}.`;
}

// ---------------------------------------------------------------- rendering

export interface SeenBannerOptions {
  open: boolean;
  onToggle: () => void;
  now?: number;
}

export function renderSeenBanner(prev: readonly PastAttempt[], opts: SeenBannerOptions): HTMLElement | null {
  const last = prev[0];
  if (!last) return null;
  const now = opts.now ?? Date.now();
  return h("div", { class: `banner ${last.result === "missed" ? "warn" : "good"} rc-seen`, role: "note" },
    h("p", { class: "rc-seen-text" },
      h("span", { text: `${seenSentence(prev, now)} ` }),
      h("span", { class: "rc-seen-rule", text: ruleLine(last) })),
    h("button", {
      class: "btn link small rc-seen-toggle",
      text: opts.open ? "Hide my old card" : "Show my old card",
      "aria-expanded": opts.open ? "true" : "false",
      onclick: opts.onToggle,
    }),
    opts.open ? renderOldCard(prev, now) : null);
}

function renderOldCard(prev: readonly PastAttempt[], now: number): HTMLElement {
  const last = prev[0]!;
  return h("div", { class: "rc-seen-card" },
    h("p", { class: "rule-statement", text: last.ruleStatement }),
    last.whyCorrect ? h("h4", { class: "rc-seen-label", text: `Why ${last.correct} is right` }) : null,
    last.whyCorrect ? h("p", { class: "small", text: last.whyCorrect }) : null,
    last.takeaway ? h("h4", { class: "rc-seen-label", text: "Takeaway" }) : null,
    last.takeaway ? h("p", { class: "small", text: last.takeaway }) : null,
    prev.length > 1
      ? h("ul", { class: "rc-seen-history small muted" },
        ...prev.map((p) => h("li", { text: `${dayLabel(p.at, now)}: ${pickedPhrase(p)}, rule ${p.ruleId}` })))
      : null);
}

/** findPrevious + renderSeenBanner with the toggle state and a small cache. One per side panel. */
export function createSeenCheck(rerender: () => void) {
  let openFor: string | null = null;
  let cache: { key: string; prev: PastAttempt[] } | null = null;

  function find(log: readonly LogEntry[], q: Question, opts: FindOptions = {}): PastAttempt[] {
    const key = [q.id, q.qbId ?? "", log.length, log[0]?.attemptId ?? "", opts.before ?? "", ...(opts.excludeAttemptIds ?? [])].join("|");
    if (cache?.key !== key) cache = { key, prev: findPrevious(log, q, opts) };
    return cache.prev;
  }

  return {
    find,
    render(log: readonly LogEntry[], q: Question, opts: FindOptions = {}, now = Date.now()): HTMLElement | null {
      const prev = find(log, q, opts);
      if (!prev.length) return null;
      return renderSeenBanner(prev, {
        open: openFor === q.id,
        onToggle: () => {
          openFor = openFor === q.id ? null : q.id;
          rerender();
        },
        now,
      });
    },
  };
}
