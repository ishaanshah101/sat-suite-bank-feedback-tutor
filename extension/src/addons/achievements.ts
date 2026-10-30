// Badges: small milestones for the habits that move scores (showing up daily, clearing due
// reviews, mastering rules, honest confidence, staying on pace), not just volume. Earned badges are
// kept forever under KEYS.badges as { [badgeId]: earnedAt }, so a broken streak or a lapsed rule
// never takes a badge back. Pure evaluation (evaluateBadges, awardBadges) plus storage helpers.
//
// Hook-in (index.ts):
//   ready:            await syncBadges(input)                    first run backfills quietly (no toast)
//   afterExplain, review drill answered, set finished:
//                     const { fresh } = await syncBadges(input); if (fresh.length) toast(badgeToast(fresh))
//   renderBottom:     renderBadges(badgeProgress(input, earned))  the grid, collapsed by default
// where input = { log, srs, recaps: sets.recap ? [sets.recap] : [], dailyGoal: prefs.dailyGoal, now }.
// sets.ts only keeps the latest recap, which is why syncBadges() runs right when a set ends.

import { h } from "./dom";
import { sectionOf, type LogEntry } from "./log";
import type { SetRecap } from "./sets";
import { MASTERED_BOX, type SrsState } from "./srs";
import { dayKey, targetSecondsFor } from "./stats";
import { KEYS, kv } from "./store";
import { normalizeSkill, skillsFor } from "./taxonomy";

export type BadgeGroup = "start" | "volume" | "streak" | "mastery" | "review" | "habits";

export interface BadgeInput {
  log: LogEntry[];
  srs: SrsState;
  /** Finished practice sets. sets.ts keeps only the latest recap; pass [recap] when a set ends. */
  recaps?: SetRecap[];
  /** prefs.dailyGoal (questions per day). Defaults to 10. */
  dailyGoal?: number;
}

/** Everything the badge rules look at, computed once per evaluation. Exported for tests and the UI. */
export interface BadgeMetrics {
  questions: number;
  longestStreak: number;
  mastered: number;
  /** Rules missed at least twice that are now mastered. */
  comebacks: number;
  reviewRight: number;
  perfectSet: boolean;
  bestSet: { count: number; right: number } | null;
  sections: number;
  sureAnswers: number;
  sureRight: number;
  hardRight: number;
  onPace: number;
  rwSkills: number;
  mathSkills: number;
  bestDay: number;
  dailyGoal: number;
}

interface Progress { value: number; goal: number; hint?: string }

export interface BadgeDef {
  id: string;
  group: BadgeGroup;
  /** Short text inside the medal: "10", "7d", "M5"... (no emoji, so it renders in any font). */
  mark: string;
  label: string;
  /** How to earn it, in plain words. */
  detail: string;
  progress: (m: BadgeMetrics) => Progress;
}

const count = (value: number, goal: number): Progress => ({ value, goal });

const volume = (n: number): BadgeDef => ({
  id: `questions-${n}`, group: "volume", mark: String(n), label: `${n} questions`,
  detail: `Explain ${n} questions with Rulecard.`, progress: (m) => count(m.questions, n),
});
const streak = (n: number): BadgeDef => ({
  id: `streak-${n}`, group: "streak", mark: `${n}d`, label: `${n}-day streak`,
  detail: `Practice ${n} days in a row. Your longest streak counts, so a missed day later won't take it back.`,
  progress: (m) => count(m.longestStreak, n),
});
const mastered = (n: number): BadgeDef => ({
  id: `mastered-${n}`, group: "mastery", mark: `M${n}`, label: n === 1 ? "First mastered rule" : `${n} rules mastered`,
  detail: n === 1 ? "Get a rule to the mastered box by reviewing it on schedule." : `Get ${n} rules to the mastered box.`,
  progress: (m) => count(m.mastered, n),
});
const reviews = (n: number): BadgeDef => ({
  id: `reviews-${n}`, group: "review", mark: `R${n}`, label: `${n} review drills right`,
  detail: `Answer ${n} review drills correctly from the Review queue.`, progress: (m) => count(m.reviewRight, n),
});

export const BADGES: BadgeDef[] = [
  { id: "first-card", group: "start", mark: "1", label: "First rule card", detail: "Explain your first question.", progress: (m) => count(m.questions, 1) },
  { id: "both-sections", group: "start", mark: "RW+M", label: "Both sections", detail: "Practice at least one Reading and Writing and one Math question.", progress: (m) => count(m.sections, 2) },
  ...[10, 50, 100, 250, 500].map(volume),
  ...[3, 7, 14, 30].map(streak),
  ...[1, 5, 10, 25].map(mastered),
  {
    id: "comeback", group: "mastery", mark: "UP", label: "Comeback",
    detail: "Master a rule you had missed at least twice.", progress: (m) => count(m.comebacks, 1),
  },
  ...[5, 25].map(reviews),
  {
    id: "perfect-set", group: "habits", mark: "5/5", label: "Perfect set",
    detail: "Get every question right in a practice set of 5 or more.",
    progress: (m) => ({ value: m.perfectSet ? 1 : 0, goal: 1, hint: m.bestSet ? `best ${m.bestSet.right}/${m.bestSet.count}` : "start a set" }),
  },
  {
    id: "calibrated", group: "habits", mark: "SURE", label: "Sure means sure",
    detail: "Mark 10 answers as Sure, and be right on at least 80% of them. Knowing when you know is a test skill.",
    progress: (m) => {
      if (m.sureAnswers < 10) return { value: m.sureAnswers, goal: 10, hint: `${m.sureAnswers}/10 sure answers` };
      const pct = Math.round((m.sureRight / m.sureAnswers) * 100);
      return { value: pct >= 80 ? 10 : 9, goal: 10, hint: `${pct}% right when sure, need 80%` };
    },
  },
  { id: "hard-10", group: "habits", mark: "H10", label: "Hard hitter", detail: "Get 10 Hard questions right.", progress: (m) => count(m.hardRight, 10) },
  {
    id: "on-pace-25", group: "habits", mark: "71s", label: "On the clock",
    detail: "Finish 25 timed questions at or under test pace (71 s Reading and Writing, 95 s Math).", progress: (m) => count(m.onPace, 25),
  },
  {
    id: "goal-day", group: "habits", mark: "GOAL", label: "Daily goal met",
    detail: "Hit your daily question goal in a single day.",
    progress: (m) => ({ value: Math.min(m.bestDay, m.dailyGoal), goal: m.dailyGoal, hint: `best day ${m.bestDay}/${m.dailyGoal}` }),
  },
  {
    id: "rw-tour", group: "habits", mark: "R&W", label: "Every R&W skill",
    detail: "Practice all 10 Reading and Writing skills at least once.", progress: (m) => count(m.rwSkills, skillsFor("rw").length),
  },
  {
    id: "math-tour", group: "habits", mark: "MATH", label: "Every Math skill",
    detail: "Practice all 19 Math skills at least once.", progress: (m) => count(m.mathSkills, skillsFor("math").length),
  },
];

const BY_ID = new Map(BADGES.map((b) => [b.id, b]));
export const badgeDef = (id: string): BadgeDef | undefined => BY_ID.get(id);

/** "2026-10-29" -> the next or previous calendar day key, DST safe. */
function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days, 12).getTime());
}

/** Longest run of consecutive calendar days with at least one explained question. */
export function longestStreak(log: Pick<LogEntry, "at">[]): number {
  const days = new Set(log.map((e) => dayKey(e.at)));
  let best = 0;
  for (const d of days) {
    if (days.has(shiftKey(d, -1))) continue; // not the start of a run
    let run = 1;
    let cursor = shiftKey(d, 1);
    while (days.has(cursor)) { run++; cursor = shiftKey(cursor, 1); }
    best = Math.max(best, run);
  }
  return best;
}

export function badgeMetrics(input: BadgeInput): BadgeMetrics {
  const { log, srs } = input;
  const rules = Object.values(srs);
  const missesByRule = new Map<string, number>();
  for (const e of log) if (e.result === "missed") missesByRule.set(e.ruleId, (missesByRule.get(e.ruleId) ?? 0) + 1);
  const sets = (input.recaps ?? []).filter((r) => r.count > 0);
  const bestSet = sets.length ? [...sets].sort((a, b) => b.right / b.count - a.right / a.count || b.count - a.count)[0]! : null;
  const sure = log.filter((e) => e.selfConfidence === "sure");
  const skills = new Set(log.map((e) => normalizeSkill(e.skill)).filter((s): s is string => Boolean(s)));
  const perDay = new Map<string, number>();
  for (const e of log) perDay.set(dayKey(e.at), (perDay.get(dayKey(e.at)) ?? 0) + 1);
  return {
    questions: log.length,
    longestStreak: longestStreak(log),
    mastered: rules.filter((r) => r.box >= MASTERED_BOX).length,
    comebacks: rules.filter((r) => r.box >= MASTERED_BOX && (missesByRule.get(r.ruleId) ?? 0) >= 2).length,
    reviewRight: log.reduce((n, e) => n + e.drills.filter((d) => d.review && d.correct).length, 0),
    perfectSet: sets.some((r) => r.count >= 5 && r.right === r.count),
    bestSet: bestSet ? { count: bestSet.count, right: bestSet.right } : null,
    sections: new Set(log.map((e) => sectionOf(e))).size,
    sureAnswers: sure.length,
    sureRight: sure.filter((e) => e.result === "right").length,
    hardRight: log.filter((e) => e.result === "right" && (e.difficulty ?? "").toLowerCase() === "hard").length,
    onPace: log.filter((e) => typeof e.seconds === "number" && e.seconds > 0 && e.seconds <= targetSecondsFor(e)).length,
    rwSkills: skillsFor("rw").filter((s) => skills.has(s.skill)).length,
    mathSkills: skillsFor("math").filter((s) => skills.has(s.skill)).length,
    bestDay: Math.max(0, ...perDay.values()),
    dailyGoal: Math.max(1, Math.round(input.dailyGoal ?? 10)),
  };
}

const earnedBy = (def: BadgeDef, m: BadgeMetrics) => {
  const p = def.progress(m);
  return p.value >= p.goal;
};

/** Ids of every badge the current history qualifies for, in BADGES order. */
export function evaluateBadges(input: BadgeInput): string[] {
  const m = badgeMetrics(input);
  return BADGES.filter((b) => earnedBy(b, m)).map((b) => b.id);
}

/** Saved badges: id -> when it was first earned. */
export type EarnedBadges = Record<string, number>;

/** Merge newly qualified ids into the saved set. `fresh` lists only the ones that weren't saved yet. */
export function awardBadges(prev: EarnedBadges, qualified: string[], now: number): { badges: EarnedBadges; fresh: string[] } {
  const badges = { ...prev };
  const fresh: string[] = [];
  for (const id of qualified) {
    if (badges[id] !== undefined || !BY_ID.has(id)) continue;
    badges[id] = now;
    fresh.push(id);
  }
  return { badges, fresh };
}

/** One toast line for newly earned badges. */
export function badgeToast(ids: string[]): string {
  const labels = ids.map((id) => BY_ID.get(id)?.label ?? id);
  if (!labels.length) return "";
  if (labels.length === 1) return `Badge earned: ${labels[0]}`;
  const shown = labels.slice(0, 3).join(", ");
  return `${labels.length} badges earned: ${shown}${labels.length > 3 ? ", and more" : ""}`;
}

export async function readBadges(): Promise<EarnedBadges | undefined> {
  return kv().get<EarnedBadges>(KEYS.badges);
}
export async function writeBadges(b: EarnedBadges): Promise<void> {
  await kv().set(KEYS.badges, b);
}

/**
 * Evaluate, save, and report what's new. The very first run (nothing saved yet) backfills every
 * badge the existing history already earned and reports nothing, so updating to this version
 * doesn't fire a pile of toasts.
 */
export async function syncBadges(input: BadgeInput, now = Date.now()): Promise<{ badges: EarnedBadges; fresh: string[] }> {
  const saved = await readBadges();
  const { badges, fresh } = awardBadges(saved ?? {}, evaluateBadges(input), now);
  if (!saved || fresh.length) await writeBadges(badges);
  return { badges, fresh: saved ? fresh : [] };
}

export interface BadgeView extends BadgeDef {
  earnedAt: number | null;
  value: number;
  goal: number;
  /** "37/50" style hint for locked badges. */
  hint: string;
}

/** Every badge with its earned date (if any) and progress, earned first by date, then locked by closeness. */
export function badgeProgress(input: BadgeInput, earned: EarnedBadges): BadgeView[] {
  const m = badgeMetrics(input);
  const views = BADGES.map((b, i) => {
    const p = b.progress(m);
    const earnedAt = earned[b.id] ?? null;
    return { ...b, earnedAt, value: Math.min(p.value, p.goal), goal: p.goal, hint: p.hint ?? `${Math.min(p.value, p.goal)}/${p.goal}`, i };
  });
  const done = views.filter((v) => v.earnedAt !== null).sort((a, b) => (a.earnedAt ?? 0) - (b.earnedAt ?? 0) || a.i - b.i);
  const locked = views.filter((v) => v.earnedAt === null).sort((a, b) => b.value / b.goal - a.value / a.goal || a.i - b.i);
  return [...done, ...locked].map(({ i: _i, ...v }) => v);
}

let open = false;

/** "Badges" card: earned medals in color, locked ones grey with a progress hint. Collapsed by default. */
export function renderBadges(views: BadgeView[]): HTMLElement {
  const earned = views.filter((v) => v.earnedAt !== null);
  const next = views.find((v) => v.earnedAt === null);
  const medal = (v: BadgeView) => {
    const locked = v.earnedAt === null;
    const pct = Math.round((v.value / v.goal) * 100);
    return h("li", { class: `rc-badge${locked ? " locked" : ""}`, title: `${v.label}. ${v.detail}${locked ? ` (${v.hint})` : ""}` },
      h("span", { class: "rc-medal", "aria-hidden": "true", text: v.mark }),
      h("span", { class: "rc-badge-label", text: v.label }),
      locked
        ? h("span", { class: "rc-badge-hint" }, h("span", { class: "rc-meter good" }, h("span", { style: `width:${pct}%` })), h("span", { class: "small muted", text: v.hint }))
        : h("span", { class: "small muted", text: new Date(v.earnedAt ?? 0).toLocaleDateString(undefined, { month: "short", day: "numeric" }) }));
  };
  return h("details", { class: "card rc-badges", open: open ? "" : null, ontoggle: (ev: Event) => { open = (ev.target as HTMLDetailsElement).open; } },
    h("summary", null,
      h("span", { class: "rc-badges-title", text: "Badges" }),
      h("span", { class: "small muted", text: ` ${earned.length} of ${views.length} earned` }),
      next ? h("span", { class: "small muted rc-badges-next", text: `Next: ${next.label} (${next.hint})` }) : null),
    h("ul", { class: "rc-badge-grid" }, ...views.map(medal)));
}
