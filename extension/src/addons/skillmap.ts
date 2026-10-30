// Skill map: one glance at all 29 official Digital SAT skills (10 Reading and Writing, 19 Math). Each skill is a
// tile colored by how you do on it (not yet, new, weak, shaky, solid, strong), with a "slow" marker when your
// average time is over the test pace (71 s Reading and Writing, 95 s Math). Clicking a tile shows one plain
// sentence about that skill and the Question Bank filter steps to practice it.
// The logic (skillMap, groupByDomain, skillDetail, levelFor, suggestedDifficulty, shortSkillName) is pure and
// never touches the DOM; renderSkillMap is the only DOM code, so tests can import this file in Node.
// Hook-in: index.ts renderBottom slot, right after Progress:
//   out.push(renderSkillMap(skillMap(log), { onSelect: (skill) => { /* optional */ } }));
// Styles: extension/addons.css (Wave 5 section). No storage keys: the open state and the selected tile live in
// module variables, so they survive re-renders but reset when the panel reloads.

import { h } from "./dom";
import { sectionOf, type LogEntry } from "./log";
import { MATH_TARGET_SECONDS, SECTION_LABEL, TARGET_SECONDS } from "./stats";
import { qbFilterSteps, SKILLS, skillInfo, type SkillInfo } from "./taxonomy";
import type { Section } from "./types";

export type SkillLevel = "none" | "new" | "weak" | "shaky" | "solid" | "strong";

export interface SkillCell {
  skill: string;
  domain: string;
  section: Section;
  /** Explained cards for this skill. */
  attempts: number;
  right: number;
  /** right / attempts; null with no attempts. */
  accuracy: number | null;
  /** Whole seconds, averaged over attempts timed between 0 and 1800 s (exclusive). null when none were. */
  avgSeconds: number | null;
  /** Test pace per question: 71 s Reading and Writing, 95 s Math. */
  targetSeconds: number;
  /** avgSeconds over targetSeconds, with at least 3 timed attempts. */
  slow: boolean;
  /** Newest attempt time, null with no attempts. */
  lastAt: number | null;
  level: SkillLevel;
}

export interface DomainGroup {
  section: Section;
  domain: string;
  cells: SkillCell[];
}

export interface SkillMapOptions {
  /** Which sections to show. Default: the sections present in the log, else Reading and Writing. */
  sections?: Section[];
}

export interface SkillMapHandlers {
  /** Called when a tile gets selected. */
  onSelect?(skill: string): void;
}

/** A timer at or past 30 minutes was left running; it says nothing about pace. */
const MAX_SECONDS = 1800;
/** Fewer timed attempts than this never count as slow. */
const MIN_TIMED = 3;

const ORDER = new Map(SKILLS.map((s, i) => [s.skill, i]));
const rank = (c: Pick<SkillCell, "skill">) => ORDER.get(c.skill) ?? Number.MAX_SAFE_INTEGER;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const pct = (accuracy: number | null) => `${Math.round((accuracy ?? 0) * 100)}%`;

const SHORT: Record<string, string> = {
  "Central Ideas and Details": "Central ideas",
  "Command of Evidence": "Evidence",
  Inferences: "Inferences",
  "Words in Context": "Words in context",
  "Text Structure and Purpose": "Structure and purpose",
  "Cross-Text Connections": "Cross-text",
  "Rhetorical Synthesis": "Synthesis",
  Transitions: "Transitions",
  Boundaries: "Boundaries",
  "Form, Structure, and Sense": "Form and sense",
  "Linear equations in one variable": "Linear eq., 1 variable",
  "Linear functions": "Linear functions",
  "Linear equations in two variables": "Linear eq., 2 variables",
  "Systems of two linear equations in two variables": "Linear systems",
  "Linear inequalities in one or two variables": "Linear inequalities",
  "Nonlinear functions": "Nonlinear functions",
  "Nonlinear equations in one variable and systems of equations in two variables": "Nonlinear equations",
  "Equivalent expressions": "Equivalent expressions",
  "Ratios, rates, proportional relationships, and units": "Ratios and rates",
  Percentages: "Percentages",
  "One-variable data: Distributions and measures of center and spread": "One-variable data",
  "Two-variable data: Models and scatterplots": "Two-variable data",
  "Probability and conditional probability": "Probability",
  "Inference from sample statistics and margin of error": "Margin of error",
  "Evaluating statistical claims: Observational studies and experiments": "Statistical claims",
  "Area and volume": "Area and volume",
  "Lines, angles, and triangles": "Lines and angles",
  "Right triangles and trigonometry": "Right triangles, trig",
  Circles: "Circles",
};

/** A tile-sized name for an official skill ("Form, Structure, and Sense" becomes "Form and sense"). */
export function shortSkillName(skill: string): string {
  return SHORT[skill] ?? skill.split(":")[0]!.trim();
}

/** 0 attempts "none", 1 to 2 "new", then by accuracy: under 50% weak, under 75% shaky, under 90% solid, else strong. */
export function levelFor(attempts: number, accuracy: number | null): SkillLevel {
  if (attempts <= 0 || accuracy === null) return "none";
  if (attempts < 3) return "new";
  if (accuracy < 0.5) return "weak";
  if (accuracy < 0.75) return "shaky";
  if (accuracy < 0.9) return "solid";
  return "strong";
}

function defaultSections(log: LogEntry[]): Section[] {
  const present = new Set(log.map((e) => sectionOf(e)));
  return present.size ? [...present] : ["rw"];
}

function cellFor(info: SkillInfo, entries: LogEntry[]): SkillCell {
  const attempts = entries.length;
  const right = entries.filter((e) => e.result === "right").length;
  const accuracy = attempts ? right / attempts : null;
  const times = entries
    .map((e) => e.seconds)
    .filter((s): s is number => typeof s === "number" && Number.isFinite(s) && s > 0 && s < MAX_SECONDS);
  const avgSeconds = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  const targetSeconds = info.section === "math" ? MATH_TARGET_SECONDS : TARGET_SECONDS;
  return {
    skill: info.skill,
    domain: info.domain,
    section: info.section,
    attempts,
    right,
    accuracy,
    avgSeconds,
    targetSeconds,
    slow: avgSeconds !== null && times.length >= MIN_TIMED && avgSeconds > targetSeconds,
    lastAt: attempts ? entries.reduce((m, e) => Math.max(m, e.at), -Infinity) : null,
    level: levelFor(attempts, accuracy),
  };
}

/**
 * One cell per official skill, in taxonomy order (Reading and Writing first, then Math). Any reasonable
 * spelling of a skill counts ("form structure and sense", "Algebra: Linear functions"); unknown skills are ignored.
 */
export function skillMap(log: LogEntry[], opts: SkillMapOptions = {}): SkillCell[] {
  const wanted = new Set<Section>(opts.sections?.length ? opts.sections : defaultSections(log));
  const bySkill = new Map<string, LogEntry[]>();
  for (const e of log) {
    const info = skillInfo(e.skill);
    if (!info) continue;
    const list = bySkill.get(info.skill);
    if (list) list.push(e);
    else bySkill.set(info.skill, [e]);
  }
  return SKILLS.filter((s) => wanted.has(s.section)).map((s) => cellFor(s, bySkill.get(s.skill) ?? []));
}

/** Cells grouped by domain, domains and cells in taxonomy order whatever order the cells come in. */
export function groupByDomain(cells: SkillCell[]): DomainGroup[] {
  const groups: DomainGroup[] = [];
  for (const c of [...cells].sort((a, b) => rank(a) - rank(b))) {
    let g = groups.find((x) => x.section === c.section && x.domain === c.domain);
    if (!g) {
      g = { section: c.section, domain: c.domain, cells: [] };
      groups.push(g);
    }
    g.cells.push(c);
  }
  return groups;
}

/** The Question Bank difficulty to practice at: easier when weak, Hard when strong, else Medium. */
export function suggestedDifficulty(cell: Pick<SkillCell, "level">): string {
  if (cell.level === "weak") return "Easy, Medium";
  if (cell.level === "strong") return "Hard";
  return "Medium";
}

/**
 * Plain words for one skill, then where to practice it:
 * "Right on 4 of 7. Average 84 s, slower than the 71 s test pace. In the Question Bank pick ... Difficulty: Medium."
 */
export function skillDetail(cell: SkillCell): string {
  const parts: string[] = [];
  if (!cell.attempts) parts.push("You have no cards for this skill yet.");
  else {
    parts.push(`Right on ${cell.right} of ${cell.attempts}.`);
    if (cell.level === "new") parts.push("A few more cards will show your level.");
  }
  if (cell.avgSeconds !== null) {
    if (cell.slow) parts.push(`Average ${cell.avgSeconds} s, slower than the ${cell.targetSeconds} s test pace.`);
    else if (cell.avgSeconds > cell.targetSeconds) parts.push(`Average ${cell.avgSeconds} s so far. Time a few more to judge your pace.`);
    else parts.push(`Average ${cell.avgSeconds} s, within the ${cell.targetSeconds} s test pace.`);
  }
  parts.push(qbFilterSteps(cell, suggestedDifficulty(cell)));
  return parts.join(" ");
}

function tileValue(c: SkillCell): string {
  if (c.level === "none") return "not yet";
  if (c.level === "new") return "new";
  return pct(c.accuracy);
}

function tileTitle(c: SkillCell): string {
  if (!c.attempts) return `${c.skill}: no cards yet`;
  const time = c.avgSeconds === null ? "" : `, average ${c.avgSeconds} s${c.slow ? `, slower than the ${c.targetSeconds} s pace` : ""}`;
  return `${c.skill}: right on ${c.right} of ${c.attempts} (${pct(c.accuracy)})${time}`;
}

// ---------------------------------------------------------------- DOM

let mapOpen = false;
let selectedSkill: string | null = null;

const LEGEND: [SkillLevel, string][] = [
  ["none", "Not yet"],
  ["new", "New"],
  ["weak", "Under 50%"],
  ["shaky", "50%+"],
  ["solid", "75%+"],
  ["strong", "90%+"],
];

/** The "Skill map" card: a collapsed details element with a tile per skill and the selected skill's detail. */
export function renderSkillMap(cells: SkillCell[], handlers: SkillMapHandlers = {}): HTMLElement {
  const practiced = cells.filter((c) => c.attempts > 0).length;
  const tiles: HTMLButtonElement[] = [];
  const detail = h("div", { class: "rc-sk-detail small", "aria-live": "polite" });

  const paint = () => {
    const cell = cells.find((c) => c.skill === selectedSkill) ?? null;
    for (const t of tiles) {
      const on = cell !== null && t.dataset.skill === cell.skill;
      t.classList.toggle("rc-sk-selected", on);
      t.setAttribute("aria-pressed", on ? "true" : "false");
    }
    if (cell) detail.replaceChildren(h("b", { text: cell.skill }), " ", skillDetail(cell));
    else detail.replaceChildren(h("span", { class: "muted", text: "Pick a skill to see your numbers and how to practice it." }));
  };

  const tile = (c: SkillCell) => {
    const label = tileTitle(c);
    const b = h("button", {
      type: "button",
      class: `rc-sk-tile rc-sk-${c.level}`,
      title: label,
      "aria-label": label,
      "data-skill": c.skill,
      onclick: () => {
        selectedSkill = selectedSkill === c.skill ? null : c.skill;
        paint();
        if (selectedSkill) handlers.onSelect?.(c.skill);
      },
    },
      h("span", { class: "rc-sk-name", text: shortSkillName(c.skill) }),
      h("span", { class: "rc-sk-value", text: tileValue(c) }),
      c.attempts ? h("span", { class: "rc-sk-count", text: plural(c.attempts, "card") }) : null,
      c.slow ? h("span", { class: "rc-sk-slow", text: "slow" }) : null);
    tiles.push(b);
    return b;
  };

  const body: HTMLElement[] = [];
  let section: Section | null = null;
  for (const g of groupByDomain(cells)) {
    if (g.section !== section) {
      section = g.section;
      const inSection = cells.filter((c) => c.section === g.section);
      body.push(h("div", { class: "rc-sk-section row between" },
        h("h3", { text: SECTION_LABEL[g.section] }),
        h("span", { class: "small muted", text: `${inSection.filter((c) => c.attempts > 0).length} of ${inSection.length} practiced` })));
    }
    body.push(h("div", { class: "rc-sk-domain" },
      h("div", { class: "rc-sk-domain-name small muted", text: g.domain }),
      h("div", { class: "rc-sk-tiles" }, ...g.cells.map(tile))));
  }

  const card = h("details", {
    class: "card rc-sk-card",
    open: mapOpen ? "" : null,
    ontoggle: (ev: Event) => { mapOpen = (ev.target as HTMLDetailsElement).open; },
  },
    h("summary", null, h("h2", { text: "Skill map" }), h("span", { class: "small muted", text: `${practiced} of ${cells.length} practiced` })),
    h("div", { class: "rc-sk-legend small muted" },
      ...LEGEND.map(([level, text]) => h("span", { class: `rc-sk-key rc-sk-${level}`, text })),
      h("span", { class: "rc-sk-key-slow", text: "slow: over test pace" })),
    practiced ? null : h("p", { class: "small muted", text: "Explain a few questions and your skills fill in here." }),
    ...body,
    cells.length ? detail : null);
  paint();
  return card;
}
