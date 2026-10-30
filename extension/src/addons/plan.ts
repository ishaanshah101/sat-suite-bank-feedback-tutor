// Today's plan: a short, deterministic checklist built from the local log and the review schedule.
// 1) clear the rules that are due, 2) N questions on the skills that need it most, each with a
// suggested difficulty and the exact Question Bank filter steps, 3) timed mixed sets that grow as
// the test date nears, then a light day before and a no-new-questions test day.
// Skill and difficulty stats only use questions from BEFORE today, so the plan doesn't reshuffle
// while the student works; today's questions and reviews only tick the boxes.
// Pure (buildPlan, planText) plus renderPlan(). No storage of its own: it reads log, srs and prefs.
//
// Hook-in (index.ts), in renderAboveCapture (or renderBottom above Progress):
//   renderPlan(buildPlan({ log: s.log, srs: s.srs, now: Date.now(), dailyGoal: s.prefs.dailyGoal,
//     testDate: s.prefs.testDate }), { startReview: () => void startReview(), openFlashcards, startSet })

import { chip, h } from "./dom";
import { sectionOf, type LogEntry } from "./log";
import type { SrsState } from "./srs";
import { dayKey, MATH_TARGET_SECONDS, TARGET_SECONDS } from "./stats";
import { qbFilterSteps, skillInfo, SKILLS, type SkillInfo } from "./taxonomy";
import type { Section } from "./types";

const DAY = 86_400_000;
/** Score for a skill with no history: below a clearly weak skill, above a strong recent one. */
export const EXPLORE_SCORE = 0.45;
/** Weight of "it's been a while" (maxes out at 14 days). */
const RECENCY_WEIGHT = 0.3;

export type Phase = "steady" | "build" | "strengthen" | "sharpen" | "final" | "eve" | "test" | "past";

export interface PlanInput {
  log: LogEntry[];
  srs: SrsState;
  now: number;
  /** prefs.dailyGoal. Defaults to 10. */
  dailyGoal?: number;
  /** prefs.testDate, YYYY-MM-DD local. */
  testDate?: string | null;
  /** Only plan skills in these sections. Default: sections in the log, or both when the log is empty. */
  sections?: Section[];
}

export interface SkillStat extends SkillInfo {
  attempts: number;
  misses: number;
  lastAt: number | null;
  /** Whole days between the last practice day and today (null if never). */
  daysSince: number | null;
  score: number;
  /** Suggested Question Bank difficulty, e.g. "Medium" or "Easy, Medium". */
  difficulty: string;
  reason: string;
  difficultyReason: string;
}

export type PlanItemKind = "review" | "focus" | "mixed" | "flashcards" | "checklist";

export interface PlanItem {
  id: string;
  kind: PlanItemKind;
  title: string;
  detail: string;
  /** Question Bank filter steps for "do questions" items. */
  steps: string | null;
  skill: string | null;
  section: Section | null;
  difficulty: string | null;
  /** null = advice only, no counter. */
  target: number | null;
  done: number;
  complete: boolean;
}

export interface Plan {
  day: string;
  phase: Phase;
  phaseLabel: string;
  headline: string;
  daysToTest: number | null;
  /** True when there's no history before today: the focus items are a sampler. */
  fresh: boolean;
  /** Questions planned today (sum of the question items). */
  goal: number;
  /** Questions explained today. */
  doneToday: number;
  items: PlanItem[];
  /** Every item with a counter is done (false when there are none). */
  complete: boolean;
  /** Focus candidates, best first (handy for the UI and for tests). */
  skills: SkillStat[];
}

const PHASE_LABEL: Record<Phase, string> = {
  steady: "Daily practice", build: "Build", strengthen: "Strengthen", sharpen: "Sharpen",
  final: "Final week", eve: "Day before", test: "Test day", past: "Daily practice",
};

/** Share of the daily goal for [focus 1, focus 2, timed mixed]. */
const MIX: Record<Phase, [number, number, number]> = {
  steady: [0.6, 0.4, 0], past: [0.6, 0.4, 0], build: [0.6, 0.4, 0], strengthen: [0.5, 0.3, 0.2],
  sharpen: [0.4, 0.2, 0.4], final: [0.4, 0, 0.6], eve: [0, 0, 1], test: [0, 0, 0],
};

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Calendar days from today to a YYYY-MM-DD date (0 = today, negative = passed), or null. */
export function daysUntil(testDate: string | null | undefined, now: number): number | null {
  const m = testDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return Math.round((new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() - startOfDay(now)) / DAY);
}

export function phaseFor(days: number | null): Phase {
  if (days === null) return "steady";
  if (days < 0) return "past";
  if (days === 0) return "test";
  if (days === 1) return "eve";
  if (days <= 7) return "final";
  if (days <= 14) return "sharpen";
  if (days <= 30) return "strengthen";
  return "build";
}

/** Split `total` by weights with the largest-remainder method (ties go to the earlier slot). */
export function splitGoal(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i] = (out[i] ?? 0) + 1;
    left--;
  }
  return out;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

function suggestDifficulty(mine: LogEntry[]): { difficulty: string; why: string } {
  if (mine.length < 3) return { difficulty: "Medium", why: "" };
  const at = (level: string) => {
    const xs = mine.filter((e) => (e.difficulty ?? "").toLowerCase() === level);
    return { n: xs.length, acc: xs.length ? xs.filter((e) => e.result === "right").length / xs.length : 0 };
  };
  const hard = at("hard"), medium = at("medium");
  const overall = mine.filter((e) => e.result === "right").length / mine.length;
  if (hard.n >= 3 && hard.acc >= 0.7) return { difficulty: "Hard", why: `You get ${pct(hard.acc)} of Hard right here. Stay on Hard.` };
  if (medium.n >= 3 && medium.acc >= 0.8) return { difficulty: "Hard", why: `You get ${pct(medium.acc)} of Medium right, so step up to Hard.` };
  if (overall < 0.5) return { difficulty: "Easy, Medium", why: `You're under 50% here, so lock in the rule on Easy and Medium first.` };
  return { difficulty: "Medium", why: "" };
}

function reasonFor(attempts: number, misses: number, daysSince: number | null): string {
  if (!attempts) return "You haven't practiced this skill yet.";
  const when = daysSince === null ? "" : daysSince <= 1 ? ", last practiced yesterday" : `, last practiced ${daysSince} days ago`;
  return `Missed ${misses} of ${attempts}${when}.`;
}

/** Score every skill in `sections` from history before `today`. Best focus candidate first. */
export function rankSkills(before: LogEntry[], sections: Section[], today: number): SkillStat[] {
  const bySkill = new Map<string, LogEntry[]>();
  for (const e of before) {
    const info = skillInfo(e.skill);
    if (!info) continue;
    const xs = bySkill.get(info.skill) ?? [];
    xs.push(e);
    bySkill.set(info.skill, xs);
  }
  return SKILLS.map((info, index) => ({ info, index }))
    .filter(({ info }) => sections.includes(info.section))
    .map(({ info, index }) => {
      const mine = bySkill.get(info.skill) ?? [];
      const attempts = mine.length;
      const misses = mine.filter((e) => e.result === "missed").length;
      const lastAt = attempts ? Math.max(...mine.map((e) => e.at)) : null;
      const daysSince = lastAt === null ? null : Math.round((today - startOfDay(lastAt)) / DAY);
      const score = attempts
        ? (misses + 1) / (attempts + 2) + RECENCY_WEIGHT * (Math.min(daysSince ?? 0, 14) / 14)
        : EXPLORE_SCORE;
      const { difficulty, why } = suggestDifficulty(mine);
      return { stat: { ...info, attempts, misses, lastAt, daysSince, score, difficulty, reason: reasonFor(attempts, misses, daysSince), difficultyReason: why }, index };
    })
    .sort((a, b) => b.stat.score - a.stat.score || b.stat.attempts - a.stat.attempts || a.index - b.index)
    .map(({ stat }) => stat);
}

/** Two focus skills from different domains when possible. A fresh sampler over both sections takes one from each. */
function pickFocus(ranked: SkillStat[], fresh: boolean): SkillStat[] {
  const first = ranked[0];
  if (!first) return [];
  const otherSection = fresh ? ranked.find((s) => s.section !== first.section) : undefined;
  const second = otherSection ?? ranked.find((s) => s !== first && s.domain !== first.domain) ?? ranked[1];
  return second ? [first, second] : [first];
}

const sectionTest = (sections: Section[]) =>
  sections.length === 2 ? "Reading and Writing, then Math" : sections[0] === "math" ? "Math" : "Reading and Writing";

const paceText = (sections: Section[]) =>
  sections.length === 2 ? `${TARGET_SECONDS} s per Reading and Writing question, ${MATH_TARGET_SECONDS} s per Math question`
    : sections[0] === "math" ? `${MATH_TARGET_SECONDS} s per question` : `${TARGET_SECONDS} s per question`;

export function buildPlan(input: PlanInput): Plan {
  const { log, srs, now } = input;
  const today = startOfDay(now);
  const tomorrow = today + DAY;
  const before = log.filter((e) => e.at < today);
  const todays = log.filter((e) => e.at >= today && e.at < tomorrow);
  const fresh = before.length === 0;
  const daysToTest = daysUntil(input.testDate, now);
  const phase = phaseFor(daysToTest);

  const seen = [...new Set(log.map((e) => sectionOf(e)))].sort() as Section[];
  const sections: Section[] = input.sections?.length ? input.sections : seen.length ? seen : ["rw", "math"];
  const ranked = rankSkills(before, sections, today);
  const focus = pickFocus(ranked, fresh);

  const baseGoal = Math.max(1, Math.round(input.dailyGoal ?? 10));
  const goalTotal = phase === "test" ? 0 : phase === "eve" ? Math.min(baseGoal, 5) : baseGoal;
  const [w1, w2, w3] = MIX[phase];
  const [n1 = 0, n2 = 0, n3 = 0] = splitGoal(goalTotal, [focus[0] ? w1 : 0, focus[1] ? w2 : 0, w3 || (focus.length ? 0 : w1 + w2)]);

  const items: PlanItem[] = [];
  const item = (p: Omit<PlanItem, "complete" | "steps" | "skill" | "section" | "difficulty"> & Partial<PlanItem>): PlanItem => {
    const full: PlanItem = { steps: null, skill: null, section: null, difficulty: null, ...p, complete: false };
    full.complete = full.target !== null && full.target > 0 && full.done >= full.target;
    return full;
  };

  // 1. Reviews: everything due now plus whatever was already reviewed today, so the box ticks up.
  const rules = Object.values(srs);
  const reviewedToday = rules.filter((r) => r.lastReviewed !== null && r.lastReviewed >= today && r.lastReviewed < tomorrow);
  const dueNow = rules.filter((r) => r.due <= now && !reviewedToday.includes(r));
  const reviewTarget = dueNow.length + reviewedToday.length;
  if (reviewTarget > 0 && phase !== "test") {
    items.push(item({
      id: "review", kind: "review",
      title: `Review ${reviewTarget} due rule${reviewTarget === 1 ? "" : "s"}`,
      detail: "One fresh question per rule. Rules you get right move to a longer gap; misses come back tomorrow.",
      target: reviewTarget, done: reviewedToday.length,
    }));
  }

  // 2. Focus skills.
  const focusSkills = new Set<string>();
  [n1, n2].forEach((n, i) => {
    const s = focus[i];
    if (!s || n <= 0) return;
    focusSkills.add(s.skill);
    const done = todays.filter((e) => skillInfo(e.skill)?.skill === s.skill).length;
    items.push(item({
      id: `focus-${i + 1}`, kind: "focus",
      title: `${n} ${s.skill} question${n === 1 ? "" : "s"} (${s.difficulty})`,
      detail: fresh ? `${s.domain}. A starting sample so Rulecard can find your weak spots.` : [s.reason, s.difficultyReason].filter(Boolean).join(" "),
      steps: qbFilterSteps(s, s.difficulty), skill: s.skill, section: s.section, difficulty: s.difficulty,
      target: n, done,
    }));
  });

  // 3. Timed mixed set (or the whole goal when no skill could be ranked).
  if (n3 > 0) {
    const difficulty = phase === "eve" ? "Easy, Medium" : "Medium, Hard";
    const done = todays.filter((e) => !focusSkills.has(skillInfo(e.skill)?.skill ?? "")).length;
    const test = sectionTest(sections);
    items.push(item({
      id: "mixed", kind: "mixed",
      title: phase === "eve" ? `${n3}-question warm-up (${difficulty})` : `Timed mixed set: ${n3} question${n3 === 1 ? "" : "s"}`,
      detail: phase === "eve"
        ? "Easy wins only. Stop as soon as you feel warmed up."
        : `Mixed skills at test pace: ${paceText(sections)}. Turn on the timer or start a practice set.`,
      steps: `In the Question Bank pick Assessment: SAT, Test: ${test}, check every domain, Difficulty: ${difficulty}. Work through them in order and skip any you've seen.`,
      section: sections.length === 1 ? sections[0]! : null, difficulty, target: n3, done,
    }));
  }

  // 4. Light, no-counter items near the test.
  if (rules.length && (phase === "final" || phase === "eve" || phase === "test")) {
    const n = phase === "test" ? 5 : 10;
    items.push(item({
      id: "flashcards", kind: "flashcards",
      title: `Flip your ${n} weakest rule cards`,
      detail: phase === "test" ? "Read each rule once. No new questions today." : "Practice offline, then Rule flashcards. A few minutes is enough.",
      target: null, done: 0,
    }));
  }
  if (phase === "eve") {
    items.push(item({ id: "rest", kind: "checklist", title: "Stop early and sleep", detail: "Cramming the night before costs more than it adds. Pack your bag and charge your device tonight.", target: null, done: 0 }));
  }
  if (phase === "test") {
    items.push(
      item({ id: "device", kind: "checklist", title: "Device charged, Bluebook up to date", detail: "Open Bluebook before you leave so any update is already done.", target: null, done: 0 }),
      item({ id: "bag", kind: "checklist", title: "Photo ID, admission ticket, pencils", detail: "Pencils or pens are for scratch paper. Bluebook has the Desmos calculator built in.", target: null, done: 0 }),
    );
  }

  const goal = items.filter((i) => i.kind === "focus" || i.kind === "mixed").reduce((a, i) => a + (i.target ?? 0), 0);
  const countable = items.filter((i) => i.target !== null && i.target > 0);
  const d = daysToTest ?? 0;
  const headline = phase === "test" ? "Test day. No new questions: read your weakest rules once and go."
    : phase === "eve" ? "Test tomorrow. A light warm-up, your weakest rules, then rest."
    : fresh ? "Start with a few questions from different skills so Rulecard can find your weak spots."
    : phase === "final" ? `${d} days left. Mostly timed mixed sets at test pace, plus quick rule reviews.`
    : phase === "sharpen" ? `${d} days out. Half skill work, half timed mixed sets.`
    : phase === "strengthen" ? `${d} days out. Keep fixing weak skills and start timing some questions.`
    : phase === "build" ? `${d} days out. Build the rules: work your weakest skills, no timer needed.`
    : phase === "past" ? "Your test date has passed. Set the next one under Export & settings."
    : "Clear your reviews, then work your weakest skills.";

  return {
    day: dayKey(now), phase, phaseLabel: PHASE_LABEL[phase], headline, daysToTest, fresh,
    goal, doneToday: todays.length, items,
    complete: countable.length > 0 && countable.every((i) => i.complete),
    skills: ranked,
  };
}

/** The plan as plain text, for copying to a notes app or sending to a tutor. */
export function planText(plan: Plan): string {
  const lines = [`Rulecard plan for ${plan.day} (${plan.phaseLabel})`, plan.headline, ""];
  for (const i of plan.items) {
    const box = i.target === null ? "-" : i.complete ? "[x]" : "[ ]";
    const counter = i.target === null ? "" : ` ${Math.min(i.done, i.target)}/${i.target}`;
    lines.push(`${box} ${i.title}${counter}`);
    if (i.detail) lines.push(`    ${i.detail}`);
    if (i.steps) lines.push(`    ${i.steps}`);
  }
  return lines.join("\n");
}

export interface PlanActions {
  startReview?: () => void;
  openFlashcards?: () => void;
  /** Start a practice set of n questions (sets.ts startSet). */
  startSet?: (n: number) => void;
  copy?: (text: string) => void;
}

/** null until the student toggles it; until then the card is open only if nothing's done today. */
let open: boolean | null = null;

/** "Today's plan" card. Collapsed it is one line: phase, questions done today, a meter. */
export function renderPlan(plan: Plan, actions: PlanActions = {}): HTMLElement {
  const isOpen = open ?? (plan.doneToday === 0 && !plan.complete);
  const share = plan.goal ? Math.min(1, plan.doneToday / plan.goal) : plan.complete ? 1 : 0;
  const actionFor = (i: PlanItem): HTMLElement | null => {
    if (i.complete) return null;
    if (i.kind === "review" && actions.startReview) return h("button", { class: "btn small", text: "Start review", onclick: actions.startReview });
    if (i.kind === "flashcards" && actions.openFlashcards) return h("button", { class: "btn small", text: "Open flashcards", onclick: actions.openFlashcards });
    if (i.kind === "mixed" && actions.startSet && i.target) {
      const left = Math.max(1, i.target - i.done);
      return h("button", { class: "btn small", text: `Start a set of ${left}`, onclick: () => actions.startSet?.(left) });
    }
    return null;
  };
  const row = (i: PlanItem) => h("li", { class: `rc-plan-item${i.complete ? " done" : ""}${i.target === null ? " advice" : ""}` },
    h("span", { class: "rc-check", "aria-hidden": "true", text: i.complete ? "✓" : i.target === null ? "•" : "" }),
    h("div", { class: "rc-plan-body" },
      h("div", { class: "rc-plan-line" },
        h("span", { class: "rc-plan-title", text: i.title }),
        i.target !== null ? h("span", { class: "small muted rc-num", text: `${Math.min(i.done, i.target)}/${i.target}` }) : null),
      i.detail ? h("p", { class: "small muted", text: i.detail }) : null,
      i.steps ? h("details", { class: "rc-plan-steps" }, h("summary", { class: "small", text: "Find these in the Question Bank" }), h("p", { class: "small", text: i.steps })) : null,
      actionFor(i)));
  return h("details", { class: `card rc-plan${plan.complete ? " complete" : ""}`, open: isOpen ? "" : null, ontoggle: (ev: Event) => { open = (ev.target as HTMLDetailsElement).open; } },
    h("summary", null,
      h("span", { class: "rc-plan-head" },
        h("span", { class: "rc-plan-name", text: plan.complete ? "Today's plan: done" : "Today's plan" }),
        chip(plan.daysToTest !== null && plan.daysToTest > 0 ? `${plan.phaseLabel} · ${plan.daysToTest}d` : plan.phaseLabel, plan.complete ? "good" : ""),
        plan.goal ? h("span", { class: "small muted rc-num", text: `${Math.min(plan.doneToday, plan.goal)}/${plan.goal}` }) : null),
      h("span", { class: `rc-meter${plan.complete ? " good" : " accent"}` }, h("span", { style: `width:${Math.round(share * 100)}%` }))),
    h("p", { class: "small rc-plan-headline", text: plan.headline }),
    h("ol", { class: "rc-plan-items" }, ...plan.items.map(row)),
    actions.copy ? h("button", { class: "btn link small", text: "Copy plan", onclick: () => actions.copy?.(planText(plan)) }) : null);
}
