// Pure analytics over the local log + SRS state. No DOM, no chrome APIs.
// Math (upstream 0.3.0): Summary.bySection splits attempts into "rw" and "math" (entries saved
// before 0.3.0 count as Reading and Writing unless their skill is a Math one), and pacing compares
// each question with its own section's test pace (targetSecondsFor).
// Hook-in: index.ts recompute() calls summarize(log, srs) and insights(summary, dueCount);
// progress.ts and share.ts render the Summary.

import type { Diagnosis, Section } from "./types";
import { sectionOf, type LogEntry, type SelfConfidence } from "./log";
import { masteryCounts, type SrsState } from "./srs";

/** Digital SAT Reading and Writing: 54 questions in 64 minutes ≈ 71 s per question. */
export const TARGET_SECONDS = 71;
/** Digital SAT Math: 44 questions in 70 minutes ≈ 95 s per question. */
export const MATH_TARGET_SECONDS = 95;

export const SECTION_LABEL: Record<Section, string> = { rw: "Reading and Writing", math: "Math" };

/** Test pace for an entry's or a question's section. No section and no Math skill means Reading and Writing. */
export function targetSecondsFor(e: { section?: Section | null; domain?: string | null; skill?: string | null } | null | undefined): number {
  if (!e) return TARGET_SECONDS;
  return sectionOf({ section: e.section, domain: e.domain ?? null, skill: e.skill ?? null }) === "math" ? MATH_TARGET_SECONDS : TARGET_SECONDS;
}

export interface GroupStat {
  key: string;
  label: string;
  attempts: number;
  misses: number;
  missRate: number;
  lastAt: number;
}

export interface Summary {
  attempts: number;
  right: number;
  missed: number;
  accuracy: number | null;
  missesByDiagnosis: Record<Diagnosis, number>;
  byRule: GroupStat[];
  bySkill: GroupStat[];
  byDifficulty: GroupStat[];
  /** Split by section: key "rw" or "math", label "Reading and Writing" or "Math". Most misses first. */
  bySection: GroupStat[];
  streakDays: number;
  practicedToday: boolean;
  daily: { day: string; attempts: number; misses: number }[];
  drills: { total: number; correct: number; accuracy: number | null };
  /** slow = over its own section's pace. target = that pace averaged over the timed questions (71 s if none). */
  pacing: { timed: number; avgSeconds: number | null; slow: number; target: number };
  mastery: { learning: number; reviewing: number; mastered: number };
  thisWeek: { attempts: number; accuracy: number | null };
  lastWeek: { attempts: number; accuracy: number | null };
  /** Accuracy split by how sure the student said they were. */
  calibration: Record<SelfConfidence, { attempts: number; right: number; accuracy: number | null }>;
  /** Misses the student was "sure" about: misconceptions, not slips. */
  confidentlyWrong: number;
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function shiftDays(ts: number, days: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

function group(entries: LogEntry[], keyOf: (e: LogEntry) => string | null, labelOf: (e: LogEntry) => string): GroupStat[] {
  const map = new Map<string, GroupStat>();
  for (const e of entries) {
    const key = keyOf(e);
    if (!key) continue;
    const g = map.get(key) ?? { key, label: labelOf(e), attempts: 0, misses: 0, missRate: 0, lastAt: 0 };
    g.attempts++;
    if (e.result === "missed") g.misses++;
    if (e.at > g.lastAt) {
      g.lastAt = e.at;
      g.label = labelOf(e);
    }
    map.set(key, g);
  }
  for (const g of map.values()) g.missRate = g.attempts ? g.misses / g.attempts : 0;
  return [...map.values()].sort((a, b) => b.misses - a.misses || b.missRate - a.missRate || b.lastAt - a.lastAt);
}

const acc = (right: number, total: number) => (total ? right / total : null);

export function summarize(entries: LogEntry[], srs: SrsState, now = Date.now()): Summary {
  const right = entries.filter((e) => e.result === "right").length;
  const missed = entries.length - right;

  const missesByDiagnosis: Record<Diagnosis, number> = { misread: 0, rule_gap: 0, careless: 0, got_it_right: 0, unknown: 0 };
  for (const e of entries) if (e.result === "missed") missesByDiagnosis[e.diagnosis] = (missesByDiagnosis[e.diagnosis] ?? 0) + 1;

  // streak: consecutive calendar days with >=1 attempt, ending today (or yesterday if nothing yet today)
  const days = new Set(entries.map((e) => dayKey(e.at)));
  const today = startOfDay(now);
  const practicedToday = days.has(dayKey(today));
  let cursor = practicedToday ? today : shiftDays(today, -1);
  let streakDays = 0;
  while (days.has(dayKey(cursor))) {
    streakDays++;
    cursor = shiftDays(cursor, -1);
  }

  const daily: Summary["daily"] = [];
  for (let i = 13; i >= 0; i--) {
    const day = dayKey(shiftDays(today, -i));
    const onDay = entries.filter((e) => dayKey(e.at) === day);
    daily.push({ day, attempts: onDay.length, misses: onDay.filter((e) => e.result === "missed").length });
  }

  const drills = entries.flatMap((e) => e.drills);
  const drillsCorrect = drills.filter((d) => d.correct).length;

  const timed = entries.filter((e) => typeof e.seconds === "number" && e.seconds > 0 && e.seconds < 1800);
  const totalSec = timed.reduce((s, e) => s + (e.seconds ?? 0), 0);
  const targetSum = timed.reduce((s, e) => s + targetSecondsFor(e), 0);

  const weekStart = shiftDays(today, -6);
  const prevStart = shiftDays(today, -13);
  const thisWeekE = entries.filter((e) => e.at >= weekStart);
  const lastWeekE = entries.filter((e) => e.at >= prevStart && e.at < weekStart);

  const calibration = { sure: { attempts: 0, right: 0, accuracy: null }, unsure: { attempts: 0, right: 0, accuracy: null }, guess: { attempts: 0, right: 0, accuracy: null } } as Summary["calibration"];
  for (const e of entries) {
    if (!e.selfConfidence) continue;
    const c = calibration[e.selfConfidence];
    c.attempts++;
    if (e.result === "right") c.right++;
  }
  for (const c of Object.values(calibration)) c.accuracy = acc(c.right, c.attempts);
  const confidentlyWrong = entries.filter((e) => e.selfConfidence === "sure" && e.result === "missed").length;

  return {
    calibration,
    confidentlyWrong,
    attempts: entries.length,
    right,
    missed,
    accuracy: acc(right, entries.length),
    missesByDiagnosis,
    byRule: group(entries, (e) => e.ruleId, (e) => (e.ruleName ? `${e.ruleId} · ${e.ruleName}` : e.ruleId)),
    bySkill: group(entries, (e) => e.skill, (e) => e.skill ?? ""),
    byDifficulty: group(entries, (e) => e.difficulty, (e) => e.difficulty ?? ""),
    bySection: group(entries, (e) => sectionOf(e), (e) => SECTION_LABEL[sectionOf(e)]),
    streakDays,
    practicedToday,
    daily,
    drills: { total: drills.length, correct: drillsCorrect, accuracy: acc(drillsCorrect, drills.length) },
    pacing: {
      timed: timed.length,
      avgSeconds: timed.length ? Math.round(totalSec / timed.length) : null,
      slow: timed.filter((e) => (e.seconds ?? 0) > targetSecondsFor(e)).length,
      target: timed.length ? Math.round(targetSum / timed.length) : TARGET_SECONDS,
    },
    mastery: masteryCounts(srs),
    thisWeek: { attempts: thisWeekE.length, accuracy: acc(thisWeekE.filter((e) => e.result === "right").length, thisWeekE.length) },
    lastWeek: { attempts: lastWeekE.length, accuracy: acc(lastWeekE.filter((e) => e.result === "right").length, lastWeekE.length) },
  };
}

export interface Insight {
  tone: "good" | "warn" | "danger" | "accent";
  text: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Plain-language coaching from the numbers. Ordered by importance; show the first 3–4. */
export function insights(s: Summary, dueCount = 0): Insight[] {
  const out: Insight[] = [];
  if (s.attempts === 0) {
    return [{ tone: "accent", text: "Capture and explain a few questions and your patterns will show up here." }];
  }
  if (dueCount > 0) out.push({ tone: "accent", text: `${dueCount} rule${dueCount === 1 ? " is" : "s are"} due for review. A quick round now locks them in.` });

  const realMisses = s.missed;
  const mathMisses = s.bySection.find((g) => g.key === "math")?.misses ?? 0;
  if (realMisses >= 4) {
    const careless = s.missesByDiagnosis.careless / realMisses;
    const misread = s.missesByDiagnosis.misread / realMisses;
    const gap = s.missesByDiagnosis.rule_gap / realMisses;
    if (careless >= 0.4)
      out.push({
        tone: "warn",
        text: mathMisses > realMisses / 2
          ? `${pct(careless)} of your misses are careless slips, not missing rules. Before you lock an answer, reread what the question asks for (x or 2x, the units) and plug your answer back in.`
          : `${pct(careless)} of your misses are careless slips, not missing rules. Before you lock an answer, plug it into the blank and read the whole sentence once.`,
      });
    if (misread >= 0.35)
      out.push({ tone: "warn", text: `${pct(misread)} of your misses come from misreading. Say what the question asks in your own words before you look at the choices.` });
    if (gap >= 0.5) out.push({ tone: "danger", text: `${pct(gap)} of your misses are rule gaps. Review the rules more and do fewer new questions until those cards stick.` });
  }

  const worst = s.byRule.find((r) => r.misses >= 2);
  if (worst) out.push({ tone: "danger", text: `Your most-missed rule is ${worst.label} (${worst.misses} of ${worst.attempts}). Start your next review there.` });

  const [rw, math] = (["rw", "math"] as const).map((k) => s.bySection.find((g) => g.key === k));
  if (rw && math && rw.attempts >= 5 && math.attempts >= 5 && Math.abs(rw.missRate - math.missRate) >= 0.2) {
    const [weak, strong] = rw.missRate > math.missRate ? [rw, math] : [math, rw];
    out.push({ tone: "warn", text: `You miss ${pct(weak.missRate)} in ${weak.label} and ${pct(strong.missRate)} in ${strong.label}. Give ${weak.label} more of your next sessions.` });
  }

  const weakSkill = s.bySkill.find((g) => g.attempts >= 3 && g.missRate >= 0.5);
  if (weakSkill) out.push({ tone: "warn", text: `${weakSkill.label} is your weakest skill (${pct(weakSkill.missRate)} missed). Filter the Question Bank to it for one focused set.` });

  const target = s.pacing.target ?? TARGET_SECONDS;
  if (s.pacing.avgSeconds !== null && s.pacing.timed >= 5 && s.pacing.avgSeconds > target)
    out.push({ tone: "warn", text: `You average ${s.pacing.avgSeconds}s a question. Test pace is about ${target}s, so ${s.pacing.slow} of ${s.pacing.timed} timed questions ran long.` });

  if (s.drills.total >= 5 && s.drills.accuracy !== null && s.drills.accuracy < 0.6)
    out.push({ tone: "warn", text: `Test me accuracy is ${pct(s.drills.accuracy)}. Re-read the rule statement before each drill and say why each wrong choice breaks it.` });

  if (s.thisWeek.accuracy !== null && s.lastWeek.accuracy !== null && s.thisWeek.attempts >= 5 && s.lastWeek.attempts >= 5) {
    const delta = s.thisWeek.accuracy - s.lastWeek.accuracy;
    if (delta >= 0.05) out.push({ tone: "good", text: `Accuracy is up ${pct(delta)} on last week. Keep the same routine.` });
    else if (delta <= -0.05) out.push({ tone: "warn", text: `Accuracy is down ${pct(-delta)} on last week. You may be taking on harder sets; check the difficulty mix below.` });
  }

  if (s.streakDays >= 3) out.push({ tone: "good", text: `${s.streakDays}-day streak.${s.practicedToday ? "" : " Do one question today to keep it going."}` });
  else if (!s.practicedToday && s.streakDays > 0) out.push({ tone: "accent", text: `Do one question today to keep your ${s.streakDays}-day streak.` });

  if (s.confidentlyWrong >= 2)
    out.push({ tone: "danger", text: `You were sure on ${s.confidentlyWrong} questions you missed. Those are misunderstood rules, not slips, so they're worth the most review time.` });
  const sure = s.calibration.sure;
  if (sure.attempts >= 5 && sure.accuracy !== null && sure.accuracy < 0.75)
    out.push({ tone: "warn", text: `When you feel sure, you're right only ${pct(sure.accuracy)} of the time. On easy-looking questions, check every choice before you lock in.` });
  const guess = s.calibration.guess;
  if (guess.attempts >= 5 && guess.accuracy !== null && guess.accuracy >= 0.6)
    out.push({ tone: "good", text: `Your "guesses" are right ${pct(guess.accuracy)} of the time. Your instincts are better than you think.` });

  if (s.mastery.mastered > 0) out.push({ tone: "good", text: `${s.mastery.mastered} rule${s.mastery.mastered === 1 ? "" : "s"} mastered (passed reviews spaced 8+ days apart).` });
  return out;
}

export interface Countdown {
  days: number;
  label: string;
  perDay: number;
  projected: number;
}

/** Days until the test date (YYYY-MM-DD, local), plus a projection at this week's pace. */
export function countdown(testDate: string | null | undefined, s: Pick<Summary, "thisWeek">, now = Date.now()): Countdown | null {
  const m = testDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const days = Math.round((date.getTime() - startOfDay(now)) / 86_400_000);
  if (days < 0) return null;
  const perDay = Math.round((s.thisWeek.attempts / 7) * 10) / 10;
  return {
    days,
    label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    perDay,
    projected: Math.round(perDay * days),
  };
}
