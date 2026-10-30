// Weekly report for a parent or tutor, built from the on-device log: questions this week vs last
// week, accuracy, time practiced, streak, the rules and skills missed most, rules mastered, and the
// student's starred notes.
//   buildWeeklyReport(log, srs, now) -> WeeklyReport. Pure. Same 7-day windows as stats.ts:
//                                       this week = the last 7 calendar days including today.
//   toReportHtml(report) -> a printable, self-contained page (escaped text, no scripts), styled
//                           like toPrintableHtml in export.ts. Open it with openPrintable(html).
//   toReportText(report) -> plain text for an email or the clipboard.
//
// Hook in: renderBottom slot, next to the other export tools:
//   renderReportTools(() => buildWeeklyReport(s.log, s.srs, Date.now()), { notify: (m) => toast(m) })
// That gives a "Weekly report" button (opens the printable page) and "Copy report as text".
// Storage: none. Permissions: none beyond what openPrintable already uses (chrome.tabs.create).

import { h } from "./dom";
import { openPrintable } from "./export";
import type { LogEntry } from "./log";
import { dueRules, MASTERED_BOX, masteryCounts, type SrsState } from "./srs";
import { dayKey } from "./stats";

/** Same cut-off as the pacing numbers in stats.ts: longer gaps were breaks, not practice. */
const MAX_TIMED_SECONDS = 1800;

export interface WeekNumbers {
  /** Local midnight, inclusive. */
  start: number;
  /** Local midnight after the last day, exclusive. */
  end: number;
  questions: number;
  right: number;
  missed: number;
  /** 0 to 1, or null with no questions. */
  accuracy: number | null;
  /** Practice time from the pacing timer. */
  seconds: number;
  /** Questions that had a time. */
  timed: number;
  daysPracticed: number;
  drills: number;
  drillsCorrect: number;
}

export interface MissGroup {
  key: string;
  label: string;
  misses: number;
  attempts: number;
}

export interface ReportNote {
  at: number;
  ruleId: string;
  label: string;
  /** The student's note, trimmed. May be empty: the entry was starred without a note. */
  note: string;
  takeaway: string;
  result: "right" | "missed";
}

export interface WeeklyReport {
  generatedAt: number;
  student: string | null;
  thisWeek: WeekNumbers;
  lastWeek: WeekNumbers;
  streakDays: number;
  practicedToday: boolean;
  /** This week, most misses first. Only rules missed at least once. */
  topMissedRules: MissGroup[];
  topMissedSkills: MissGroup[];
  mastered: { ruleId: string; label: string }[];
  mastery: { learning: number; reviewing: number; mastered: number };
  /** Rules due for review now. */
  dueRules: number;
  /** Starred attempts from this week, newest first. */
  notes: ReportNote[];
  allTime: { questions: number; accuracy: number | null };
}

export interface ReportOptions {
  student?: string | null;
  /** How many rules and skills to list (default 5). */
  topN?: number;
  /** How many starred notes to list (default 10). */
  maxNotes?: number;
}

// ---------------------------------------------------------------- numbers (pure)

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

const ratio = (part: number, total: number) => (total ? part / total : null);
const ruleLabel = (id: string, name: string | null | undefined) => (name ? `${id} · ${name}` : id);

function weekNumbers(log: readonly LogEntry[], start: number, end: number): WeekNumbers {
  const inWeek = log.filter((e) => e.at >= start && e.at < end);
  const right = inWeek.filter((e) => e.result === "right").length;
  const timed = inWeek.filter((e) => typeof e.seconds === "number" && e.seconds > 0 && e.seconds < MAX_TIMED_SECONDS);
  const drills = log.flatMap((e) => e.drills ?? []).filter((d) => d.at >= start && d.at < end);
  return {
    start,
    end,
    questions: inWeek.length,
    right,
    missed: inWeek.length - right,
    accuracy: ratio(right, inWeek.length),
    seconds: timed.reduce((sum, e) => sum + (e.seconds ?? 0), 0),
    timed: timed.length,
    daysPracticed: new Set(inWeek.map((e) => dayKey(e.at))).size,
    drills: drills.length,
    drillsCorrect: drills.filter((d) => d.correct).length,
  };
}

function topMissed(entries: readonly LogEntry[], keyOf: (e: LogEntry) => string | null, labelOf: (e: LogEntry) => string, n: number): MissGroup[] {
  const map = new Map<string, MissGroup & { lastAt: number }>();
  for (const e of entries) {
    const key = keyOf(e);
    if (!key) continue;
    const g = map.get(key) ?? { key, label: labelOf(e), misses: 0, attempts: 0, lastAt: -Infinity };
    g.attempts++;
    if (e.result === "missed") g.misses++;
    if (e.at >= g.lastAt) {
      g.lastAt = e.at;
      g.label = labelOf(e);
    }
    map.set(key, g);
  }
  return [...map.values()]
    .filter((g) => g.misses > 0)
    .sort((a, b) => b.misses - a.misses || b.misses / b.attempts - a.misses / a.attempts || b.lastAt - a.lastAt)
    .slice(0, n)
    .map(({ key, label, misses, attempts }) => ({ key, label, misses, attempts }));
}

/** Consecutive days with practice, ending today (or yesterday if nothing yet today), as in stats.ts. */
function streak(log: readonly LogEntry[], now: number): { streakDays: number; practicedToday: boolean } {
  const days = new Set(log.map((e) => dayKey(e.at)));
  const today = startOfDay(now);
  const practicedToday = days.has(dayKey(today));
  let cursor = practicedToday ? today : shiftDays(today, -1);
  let streakDays = 0;
  while (days.has(dayKey(cursor))) {
    streakDays++;
    cursor = shiftDays(cursor, -1);
  }
  return { streakDays, practicedToday };
}

export function buildWeeklyReport(log: readonly LogEntry[], srs: SrsState, now: number, opts: ReportOptions = {}): WeeklyReport {
  const today = startOfDay(now);
  const end = shiftDays(today, 1);
  const weekStart = shiftDays(today, -6);
  const prevStart = shiftDays(today, -13);
  const inWeek = log.filter((e) => e.at >= weekStart && e.at < end);
  const topN = opts.topN ?? 5;
  const right = log.filter((e) => e.result === "right").length;
  return {
    generatedAt: now,
    student: opts.student?.trim() || null,
    thisWeek: weekNumbers(log, weekStart, end),
    lastWeek: weekNumbers(log, prevStart, weekStart),
    ...streak(log, now),
    topMissedRules: topMissed(inWeek, (e) => e.ruleId, (e) => ruleLabel(e.ruleId, e.ruleName), topN),
    topMissedSkills: topMissed(inWeek, (e) => e.skill, (e) => e.skill ?? "", topN),
    mastered: Object.values(srs)
      .filter((r) => r.box >= MASTERED_BOX)
      .sort((a, b) => b.box - a.box || a.ruleId.localeCompare(b.ruleId, undefined, { numeric: true }))
      .map((r) => ({ ruleId: r.ruleId, label: ruleLabel(r.ruleId, r.ruleName) })),
    mastery: masteryCounts(srs),
    dueRules: dueRules(srs, now).length,
    notes: inWeek
      .filter((e) => e.starred)
      .sort((a, b) => b.at - a.at)
      .slice(0, opts.maxNotes ?? 10)
      .map((e) => ({ at: e.at, ruleId: e.ruleId, label: ruleLabel(e.ruleId, e.ruleName), note: (e.note ?? "").trim(), takeaway: e.takeaway, result: e.result })),
    allTime: { questions: log.length, accuracy: ratio(right, log.length) },
  };
}

// ---------------------------------------------------------------- wording (pure)

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** 0.714 -> "71%"; null -> "n/a". */
export function pct(x: number | null): string {
  return x === null ? "n/a" : `${Math.round(x * 100)}%`;
}

/** 0 -> "0 min", 30 -> "under 1 min", 180 -> "3 min", 5400 -> "1 h 30 min". */
export function formatDuration(seconds: number): string {
  if (!(seconds > 0)) return "0 min";
  if (seconds < 60) return "under 1 min";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

const shortDate = (ts: number, withYear = false) =>
  new Date(ts).toLocaleDateString("en-US", withYear ? { month: "short", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" });

/** "Oct 23 to Oct 29, 2026" (end is exclusive). */
export function rangeLabel(start: number, end: number): string {
  const last = end - 1;
  const sameYear = new Date(start).getFullYear() === new Date(last).getFullYear();
  return `${shortDate(start, !sameYear)} to ${shortDate(last, true)}`;
}

export function reportTitle(r: Pick<WeeklyReport, "student">): string {
  return `Rulecard weekly report${r.student ? ` for ${r.student}` : ""}`;
}

/** One sentence for the top of the report. */
export function reportHeadline(r: WeeklyReport): string {
  const t = r.thisWeek;
  const l = r.lastWeek;
  if (!t.questions) {
    const before = l.questions ? ` (${plural(l.questions, "question")} last week)` : "";
    return r.student ? `${r.student} didn't practice this week${before}.` : `No practice this week${before}.`;
  }
  const change = !l.questions
    ? ", with none last week"
    : t.questions > l.questions
      ? `, up from ${l.questions} last week`
      : t.questions < l.questions
        ? `, down from ${l.questions} last week`
        : ", the same as last week";
  return r.student
    ? `${r.student} answered ${plural(t.questions, "question")} this week${change}, and got ${pct(t.accuracy)} right.`
    : `${plural(t.questions, "question")} this week${change}, with ${pct(t.accuracy)} right.`;
}

function timeValue(w: WeekNumbers): string {
  if (!w.timed) return "not timed (the pacing timer was off)";
  const partial = w.timed < w.questions ? ` (timed on ${w.timed} of ${w.questions} questions)` : "";
  return `${formatDuration(w.seconds)}${partial}`;
}

/** [label, value] rows for the "This week" block. */
export function weekRows(r: WeeklyReport): [string, string][] {
  const t = r.thisWeek;
  const l = r.lastWeek;
  return [
    ["Questions", `${t.questions} (last week: ${l.questions})`],
    ["Accuracy", `${pct(t.accuracy)} (last week: ${pct(l.accuracy)})`],
    ["Time practiced", timeValue(t)],
    ["Days practiced", `${t.daysPracticed} of 7`],
    ["Streak", r.streakDays ? `${plural(r.streakDays, "day")} in a row` : "none right now"],
    ["Review drills", t.drills ? `${t.drills} (${t.drillsCorrect} right)` : "none"],
  ];
}

const missLine = (g: MissGroup) => `${g.label}: missed ${g.misses} of ${g.attempts}`;
const reviewLine = (r: WeeklyReport) =>
  `Rule review: ${r.mastery.learning} learning, ${r.mastery.reviewing} reviewing, ${r.mastery.mastered} mastered, ${r.dueRules} due now.`;
const footer = (r: WeeklyReport) =>
  `Made with Rulecard on ${shortDate(r.generatedAt, true)} from the practice log on this device. All time: ${plural(r.allTime.questions, "question")}, ${pct(r.allTime.accuracy)} right.`;

// ---------------------------------------------------------------- plain text

export function toReportText(r: WeeklyReport): string {
  const out: string[] = [reportTitle(r), rangeLabel(r.thisWeek.start, r.thisWeek.end), "", reportHeadline(r), "", "This week"];
  for (const [label, value] of weekRows(r)) out.push(`- ${label}: ${value}`);
  out.push("", "Missed most this week");
  if (!r.topMissedRules.length && !r.topMissedSkills.length) out.push("- No misses this week.");
  else {
    out.push("Rules:", ...r.topMissedRules.map((g) => `- ${missLine(g)}`));
    out.push("Skills:", ...(r.topMissedSkills.length ? r.topMissedSkills.map((g) => `- ${missLine(g)}`) : ["- No skill recorded."]));
  }
  out.push("", `Rules mastered (${r.mastered.length})`, ...(r.mastered.length ? r.mastered.map((m) => `- ${m.label}`) : ["- None yet."]), reviewLine(r));
  out.push("", "Starred notes");
  if (!r.notes.length) out.push("- No starred questions this week.");
  for (const n of r.notes) out.push(`- ${shortDate(n.at)}, ${n.label}: ${n.note || `Takeaway: ${n.takeaway}`}`);
  out.push("", footer(r));
  return out.join("\n");
}

// ---------------------------------------------------------------- printable HTML

export function escapeHtml(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const esc = escapeHtml;

const STYLE = `
  body{font:13px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#16161a}
  h1{font-size:20px;margin:0 0 4px} .meta{color:#6b6b70;margin:0 0 20px} .lead{font-size:15px;margin:0 0 16px}
  section{border:1px solid #e4e4e0;border-radius:10px;padding:12px 14px;margin:0 0 12px;break-inside:avoid}
  h2{font-size:14px;margin:0 0 6px;color:#2f5bea} h3{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b6b70;margin:10px 0 4px}
  ul{padding-left:18px;margin:0} li{margin:2px 0} .small{font-size:12px;color:#3f3f46;margin:8px 0 0}
  .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:4px 0 0}
  .tile{border:1px solid #e4e4e0;border-radius:8px;padding:8px 10px} .tile b{display:block;font-size:18px} .tile span{display:block;color:#6b6b70;font-size:11px}
  .miss{color:#b45309} .note{color:#b45309} .rule{font-weight:600}
  .hint{background:#e8eefc;color:#2f5bea;border-radius:8px;padding:8px 12px;margin:0 0 16px}
  @media print{body{margin:0} section,.tile{border-color:#bbb} .hint{display:none}}
`;

const list = (items: string[], empty: string) =>
  items.length ? `<ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>` : `<p class="small">${esc(empty)}</p>`;

export function toReportHtml(r: WeeklyReport): string {
  const t = r.thisWeek;
  const l = r.lastWeek;
  const tile = (label: string, value: string, sub: string) => `<div class="tile"><span>${esc(label)}</span><b>${esc(value)}</b><span>${esc(sub)}</span></div>`;
  const tiles = [
    tile("Questions", String(t.questions), `last week: ${l.questions}`),
    tile("Accuracy", pct(t.accuracy), `last week: ${pct(l.accuracy)}`),
    tile("Time practiced", t.timed ? formatDuration(t.seconds) : "not timed", `${t.daysPracticed} of 7 days`),
    tile("Streak", plural(r.streakDays, "day"), r.practicedToday ? "practiced today" : "not yet today"),
  ].join("");
  const details = weekRows(r).slice(2).map(([label, value]) => `${label}: ${value}`).join(" · ");
  const missItem = (g: MissGroup) => `<span class="rule">${esc(g.label)}</span>: <span class="miss">missed ${g.misses} of ${g.attempts}</span>`;
  const misses = r.topMissedRules.length || r.topMissedSkills.length
    ? `<h3>Rules</h3>${list(r.topMissedRules.map(missItem), "None.")}<h3>Skills</h3>${list(r.topMissedSkills.map(missItem), "No skill recorded.")}`
    : `<p class="small">No misses this week.</p>`;
  const notes = list(
    r.notes.map((n) => `<span class="rule">${esc(shortDate(n.at))}, ${esc(n.label)}</span>: ${n.note ? `<span class="note">${esc(n.note)}</span>` : `Takeaway: ${esc(n.takeaway)}`}`),
    "No starred questions this week.",
  );
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(reportTitle(r))}</title>
<style>${STYLE}</style></head><body>
<p class="hint">To save as PDF: press ⌘P (Mac) or Ctrl+P, then choose "Save as PDF".</p>
<h1>${esc(reportTitle(r))}</h1><p class="meta">${esc(rangeLabel(t.start, t.end))}</p>
<p class="lead">${esc(reportHeadline(r))}</p>
<section><h2>This week</h2><div class="tiles">${tiles}</div><p class="small">${esc(details)}</p></section>
<section><h2>Missed most this week</h2>${misses}</section>
<section><h2>Rules mastered (${r.mastered.length})</h2>${list(r.mastered.map((m) => esc(m.label)), "None yet.")}<p class="small">${esc(reviewLine(r))}</p></section>
<section><h2>Starred notes</h2>${notes}</section>
<p class="meta">${esc(footer(r))}</p>
</body></html>`;
}

// ---------------------------------------------------------------- buttons (DOM)

export interface ReportToolActions {
  /** Default: openPrintable from export.ts (a new tab with the page). */
  open?: (html: string) => void;
  /** Default: navigator.clipboard.writeText. */
  copy?: (text: string) => Promise<void>;
  /** A short confirmation or error, e.g. the controller's toast. */
  notify?: (message: string) => void;
}

export function renderReportTools(getReport: () => WeeklyReport, act: ReportToolActions = {}): HTMLElement {
  const open = act.open ?? openPrintable;
  const copy = act.copy ?? ((text: string) => navigator.clipboard.writeText(text));
  return h("div", { class: "row rc-wrap rc-report-tools" },
    h("button", {
      class: "btn small",
      text: "Weekly report",
      title: "A printable summary of this week for a parent or tutor",
      onclick: () => open(toReportHtml(getReport())),
    }),
    h("button", {
      class: "btn small",
      text: "Copy report as text",
      onclick: async () => {
        try {
          await copy(toReportText(getReport()));
          act.notify?.("Report copied. Paste it into an email or a message.");
        } catch {
          act.notify?.("Couldn't copy the report. Open the weekly report and copy it from there.");
        }
      },
    }));
}
