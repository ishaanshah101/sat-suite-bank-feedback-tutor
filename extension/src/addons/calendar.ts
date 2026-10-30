// Activity heatmap: a GitHub-style contribution graph of the local log. One square per day for the last
// 16 weeks (columns are weeks, rows are weekdays), colored against the daily goal. Explained questions set
// the color; drills count as practice too (every record in an entry's drills[], Test me and Review queue
// alike, dated by its own `at`, shown as "reviews"), so a day with only reviews gets the lightest green.
// Dates are local and stepped by calendar date (new Date(y, m, d + n, 12)), never by adding 24 h, so the
// grid stays right across daylight saving changes. Entries dated after today (a wrong clock) are ignored.
// Streaks count any day with questions or drills. currentStreak ends today, or yesterday if you haven't
// practiced yet today. longestStreak covers the whole log (achievements.ts longestStreak, drills
// included), so it is never shorter than the streak badges you've earned.
// The logic (activityModel, activityLevel, activityInsight, streakLine, totalsLine, dayLabel, shiftDay) is
// pure and never touches the DOM; renderCalendar is the only DOM code, so tests can import this in Node.
// Hook-in: index.ts renderBottom slot, near Progress (right after it):
//   renderCalendar(activityModel(s.log, { now: Date.now(), dailyGoal: s.prefs.dailyGoal }))
// Styles: extension/calendar.css (rc-cal-*). No storage keys, no permissions: the open state lives in a
// module variable, so it survives re-renders but resets when the panel reloads.

import { longestStreak } from "./achievements";
import { h } from "./dom";
import type { LogEntry } from "./log";
import { dayKey } from "./stats";

/** 0 nothing, 1 under half the goal (or drills only), 2 half the goal, 3 the goal, 4 twice the goal. */
export type ActivityLevel = 0 | 1 | 2 | 3 | 4;

export interface ActivityDay {
  /** Local calendar date, "YYYY-MM-DD". */
  key: string;
  /** Local noon of that date, in ms. */
  date: number;
  /** Questions explained that day (log entries). */
  questions: number;
  /** Drills answered that day, by each drill's own time. */
  reviews: number;
  level: ActivityLevel;
  /** After today. Future days are always empty. */
  future: boolean;
}

export interface ActivityOptions {
  now: number;
  /** Columns in the grid. Default 16. */
  weeks?: number;
  /** Questions per day (prefs.dailyGoal). Default 10. */
  dailyGoal?: number;
  /** First row of each column: 0 Sunday (default) to 6 Saturday. */
  weekStart?: number;
}

export interface MonthLabel {
  /** Week column the label sits over. */
  column: number;
  /** "Oct" */
  label: string;
}

export interface ActivityModel {
  /** Columns = weeks, oldest first. Each column has 7 days, starting on weekStart. The last one holds today. */
  weeks: ActivityDay[][];
  /** Over the column holding the 1st of each month, plus the first column when there is room. */
  monthLabels: MonthLabel[];
  /** Over the days shown up to today. activeDays = days with questions or drills. */
  totals: { questions: number; reviews: number; activeDays: number };
  currentStreak: number;
  longestStreak: number;
  /** The day with the most questions (ties go to the most recent). null with no questions. */
  busiest: { key: string; questions: number } | null;
  /** avg[0..6] = questions per Sunday ... per Saturday over the range. best = top weekday, null if none or tied. */
  weekday: { avg: number[]; best: string | null };
  /** Days at or over the daily goal. */
  goalDays: number;
  /** Today's key. */
  today: string;
  dailyGoal: number;
  weekStart: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Tooltips for the legend squares, level 0 to 4. */
export const LEVEL_HINTS: readonly string[] = [
  "No practice",
  "Under half your daily goal, or only reviews",
  "Half your daily goal or more",
  "Daily goal met",
  "Twice your daily goal or more",
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const noon = (y: number, m: number, d: number) => new Date(y, m, d, 12).getTime();
const goalOf = (g: number | undefined) => (typeof g === "number" && Number.isFinite(g) && g > 0 ? Math.max(1, Math.round(g)) : 10);
const weeksOf = (w: number | undefined) => (typeof w === "number" && Number.isFinite(w) && w >= 1 ? Math.floor(w) : 16);
const weekStartOf = (s: number | undefined) => (typeof s === "number" && Number.isFinite(s) ? ((Math.trunc(s) % 7) + 7) % 7 : 0);
const monthOf = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1] ?? "";

/** The calendar date `days` away from a "YYYY-MM-DD" key. Steps the date, not 24 h, so DST can't skip a day. */
export function shiftDay(key: string, days: number): string {
  const [y = 1970, m = 1, d = 1] = key.split("-").map(Number);
  return dayKey(noon(y, m - 1, d + days));
}

/** Level 1 to 4 compare questions with the goal (half, goal, twice); a day with only drills is level 1. */
export function activityLevel(questions: number, reviews: number, dailyGoal: number): ActivityLevel {
  const goal = goalOf(dailyGoal);
  if (questions >= 2 * goal) return 4;
  if (questions >= goal) return 3;
  if (questions > 0 && questions * 2 >= goal) return 2;
  return questions > 0 || reviews > 0 ? 1 : 0;
}

type Counts = Map<string, { questions: number; reviews: number }>;

function countByDay(log: readonly LogEntry[]): Counts {
  const map: Counts = new Map();
  const bump = (at: unknown, field: "questions" | "reviews") => {
    if (typeof at !== "number" || !Number.isFinite(at)) return;
    const key = dayKey(at);
    const c = map.get(key) ?? { questions: 0, reviews: 0 };
    c[field]++;
    map.set(key, c);
  };
  for (const e of log) {
    bump(e.at, "questions");
    for (const d of Array.isArray(e.drills) ? e.drills : []) bump(d.at, "reviews");
  }
  return map;
}

/** Everything the Activity card shows, from the local log. */
export function activityModel(log: readonly LogEntry[], opts: ActivityOptions): ActivityModel {
  const dailyGoal = goalOf(opts.dailyGoal);
  const weekCount = weeksOf(opts.weeks);
  const weekStart = weekStartOf(opts.weekStart);
  const counts = countByDay(log);
  const now = new Date(opts.now);
  const today = dayKey(opts.now);

  // First square: the weekStart day of the week holding today, then (weeks - 1) weeks back.
  const first = now.getDate() - ((now.getDay() - weekStart + 7) % 7) - (weekCount - 1) * 7;
  const weeks: ActivityDay[][] = [];
  for (let c = 0; c < weekCount; c++) {
    const column: ActivityDay[] = [];
    for (let r = 0; r < 7; r++) {
      const date = noon(now.getFullYear(), now.getMonth(), first + c * 7 + r);
      const key = dayKey(date);
      const future = key > today;
      const hit = future ? undefined : counts.get(key);
      const questions = hit?.questions ?? 0;
      const reviews = hit?.reviews ?? 0;
      column.push({ key, date, questions, reviews, level: activityLevel(questions, reviews, dailyGoal), future });
    }
    weeks.push(column);
  }

  const totals = { questions: 0, reviews: 0, activeDays: 0 };
  let goalDays = 0;
  let busiest: ActivityModel["busiest"] = null;
  const sums = [0, 0, 0, 0, 0, 0, 0];
  const seen = [0, 0, 0, 0, 0, 0, 0];
  for (const d of weeks.flat()) {
    if (d.future) continue;
    totals.questions += d.questions;
    totals.reviews += d.reviews;
    if (d.level > 0) totals.activeDays++;
    if (d.questions >= dailyGoal) goalDays++;
    if (d.questions > 0 && (!busiest || d.questions >= busiest.questions)) busiest = { key: d.key, questions: d.questions };
    const wd = new Date(d.date).getDay();
    sums[wd] = (sums[wd] ?? 0) + d.questions;
    seen[wd] = (seen[wd] ?? 0) + 1;
  }
  const avg = sums.map((s, i) => (seen[i] ? s / seen[i]! : 0));
  const top = Math.max(...avg);
  const leaders = avg.flatMap((a, i) => (a === top ? [i] : []));
  const best = totals.questions > 0 && leaders.length === 1 ? WEEKDAYS[leaders[0]!] ?? null : null;

  let currentStreak = 0;
  for (let k = counts.has(today) ? today : shiftDay(today, -1); counts.has(k); k = shiftDay(k, -1)) currentStreak++;
  const stamps = log.flatMap((e) => [{ at: e.at }, ...(Array.isArray(e.drills) ? e.drills : [])]).filter((s) => Number.isFinite(s.at));

  const monthLabels: MonthLabel[] = [];
  weeks.forEach((column, c) => {
    const firstOfMonth = column.find((d) => !d.future && d.key.endsWith("-01"));
    if (firstOfMonth) monthLabels.push({ column: c, label: monthOf(firstOfMonth.key) });
  });
  const lead = weeks[0]?.[0];
  // A label needs about two columns of room, so the first column only gets one if the next label is 2+ away.
  if (lead && (monthLabels[0]?.column ?? Infinity) >= 2) monthLabels.unshift({ column: 0, label: monthOf(lead.key) });

  return {
    weeks,
    monthLabels,
    totals,
    currentStreak,
    longestStreak: Math.max(longestStreak(stamps), currentStreak),
    busiest,
    weekday: { avg, best },
    goalDays,
    today,
    dailyGoal,
    weekStart,
  };
}

const span = (m: Pick<ActivityModel, "weeks">) => (m.weeks.length === 1 ? "the last week" : `the last ${m.weeks.length} weeks`);

/**
 * One plain line for the card and the grid's aria-label:
 * "23 active days in the last 16 weeks. You practice most on Sundays." The weekday part needs 3+ active days.
 */
export function activityInsight(model: ActivityModel): string {
  const n = model.totals.activeDays;
  if (!n) return `No practice in ${span(model)} yet.`;
  const best = model.weekday.best && n >= 3 ? ` You practice most on ${model.weekday.best}s.` : "";
  return `${plural(n, "active day")} in ${span(model)}.${best}`;
}

/** "Current streak 4 days. Longest 11." Empty when you have never practiced. */
export function streakLine(model: Pick<ActivityModel, "currentStreak" | "longestStreak">): string {
  if (!model.longestStreak) return "";
  return `Current streak ${plural(model.currentStreak, "day")}. Longest ${model.longestStreak}.`;
}

/** "Oct 21" for a "YYYY-MM-DD" key. */
const monthDay = (key: string) => `${monthOf(key)} ${Number(key.slice(8, 10))}`;

/** "212 questions and 30 reviews. You hit your goal of 10 on 9 days. Busiest day: Oct 21 (24)." Empty with no activity. */
export function totalsLine(model: ActivityModel): string {
  const { questions, reviews, activeDays } = model.totals;
  if (!activeDays) return "";
  const what = [questions ? plural(questions, "question") : "", reviews ? plural(reviews, "review") : ""].filter(Boolean).join(" and ");
  const out = [`${what}.`];
  if (questions) out.push(model.goalDays ? `You hit your goal of ${model.dailyGoal} on ${plural(model.goalDays, "day")}.` : `You haven't hit your goal of ${model.dailyGoal} yet.`);
  if (model.busiest) out.push(`Busiest day: ${monthDay(model.busiest.key)} (${model.busiest.questions}).`);
  return out.join(" ");
}

/** Tooltip for one square: "Tue, Oct 21: 6 questions, 2 reviews" or "Tue, Oct 21: no practice". */
export function dayLabel(day: Pick<ActivityDay, "date" | "questions" | "reviews">): string {
  const d = new Date(day.date);
  const what = [day.questions ? plural(day.questions, "question") : "", day.reviews ? plural(day.reviews, "review") : ""].filter(Boolean).join(", ");
  return `${WEEKDAYS[d.getDay()]?.slice(0, 3)}, ${MONTHS[d.getMonth()]} ${d.getDate()}: ${what || "no practice"}`;
}

// ---------------------------------------------------------------- DOM

let calOpen = false;

/** The "Activity" card: a collapsed details element with the heatmap, legend, insight and streak lines. */
export function renderCalendar(model: ActivityModel): HTMLElement {
  const insight = activityInsight(model);
  const streak = streakLine(model);
  const totals = totalsLine(model);
  const labelAt = new Map(model.monthLabels.map((l) => [l.column, l.label]));
  const cell = (day: ActivityDay) =>
    h("span", {
      class: `rc-cal-cell rc-cal-l${day.level}${day.future ? " rc-cal-future" : ""}${day.key === model.today ? " rc-cal-today" : ""}`,
      title: day.future ? null : dayLabel(day),
    });
  const weekdayLabel = (row: number) => {
    const wd = (model.weekStart + row) % 7;
    return h("span", { text: wd === 1 || wd === 3 || wd === 5 ? WEEKDAYS[wd]?.slice(0, 3) : "" });
  };

  return h("details", {
    class: "card rc-cal",
    open: calOpen ? "" : null,
    ontoggle: (ev: Event) => { calOpen = (ev.target as HTMLDetailsElement).open; },
  },
    h("summary", null, h("h2", { text: "Activity" }), h("span", { class: "small muted", text: plural(model.totals.activeDays, "active day") })),
    h("div", { class: "rc-cal-scroll" },
      h("div", { class: "rc-cal-chart" },
        h("div", { class: "rc-cal-months", "aria-hidden": "true" }, ...model.weeks.map((_, c) => h("span", { text: labelAt.get(c) ?? "" }))),
        h("div", { class: "rc-cal-wdays", "aria-hidden": "true" }, ...Array.from({ length: 7 }, (_, r) => weekdayLabel(r))),
        h("div", { class: "rc-cal-grid", role: "img", "aria-label": insight }, ...model.weeks.flatMap((column) => column.map(cell))),
        h("div", { class: "rc-cal-legend", "aria-hidden": "true" },
          h("span", { text: "Less" }),
          ...LEVEL_HINTS.map((hint, level) => h("span", { class: `rc-cal-cell rc-cal-l${level}`, title: hint })),
          h("span", { text: "More" })))),
    h("p", { class: "small rc-cal-insight", text: insight }),
    streak ? h("p", { class: "small muted rc-cal-streak", text: streak }) : null,
    totals ? h("p", { class: "small muted rc-cal-totals", text: totals }) : null);
}
