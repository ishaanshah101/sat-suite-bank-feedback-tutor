// Trap detector: sorts each miss into the KIND of wrong answer that caught you (too extreme, half
// right, comma splice, solved for the wrong quantity...) with transparent keyword rules over the
// card's "why your pick fails" text, plus the diagnosis, skill and domain. Pure classification;
// renderTraps() draws a small "Traps you fall for" section.
// Hook-in (index.ts): in renderBottom, next to the Progress card:
//   const traps = renderTraps(trapReport(s.log)); if (traps) nodes.push(traps)
// or append it inside renderProgress(). Load the .rc-traps CSS from addons.css.
import { h } from "./dom";
import { sectionOf, type LogEntry } from "./log";
import { domainOfSkill } from "./taxonomy";
import type { Section } from "./types";

export type TrapId =
  | "extreme" | "unsupported" | "half_right" | "reversed" | "irrelevant" | "transition"
  | "splice" | "punctuation" | "agreement" | "tense" | "pronoun" | "modifier"
  | "wrong_quantity" | "wrong_setup" | "units_percent" | "calc_slip" | "misread" | "other";

interface Rule { re: RegExp; w: number }
export interface TrapDef { id: TrapId; label: string; tip: string; section?: Section; domains?: string[]; skills?: string[]; rules: Rule[] }

const SEC = ["Standard English Conventions"];

export const TRAPS: TrapDef[] = [
  { id: "extreme", label: "Too extreme", section: "rw", tip: "Words like always, never, proves and only need the text to back them all the way. If the text hedges, the answer should too.",
    rules: [{ re: /\btoo (strong|extreme|absolute|sweeping|broad|definitive|far)\b/, w: 1.5 }, { re: /\b(overstat\w*|exaggerat\w*|goes too far|extreme)\b/, w: 1 }, { re: /\b(always|never|proves?|certainly|completely|entirely)\b/, w: 0.5 }] },
  { id: "unsupported", label: "Not supported by the text", section: "rw", tip: "Before you pick, point to the words in the text that prove it. If you can't, it's out.",
    rules: [{ re: /\bnot (supported|stated|mentioned|discussed|addressed|indicated)\b/, w: 1.5 }, { re: /\b(no evidence|unsupported|out of scope|outside (knowledge|the text)|beyond (what|the text)|never (says|mentions|states|discusses))\b/, w: 1.5 }, { re: /\b(text|passage|author) (doesn't|does not|never) (say|mention|state|support|discuss|indicate)/, w: 1.5 }, { re: /\b(assumption|speculat\w*)\b/, w: 0.5 }] },
  { id: "half_right", label: "Half right", tip: "Check every part of the choice. One wrong word makes the whole choice wrong.",
    rules: [{ re: /\b(only (part|half|one part|one half) of|half[- ]right|partially (correct|true|right|accurate)|partly (correct|true|right))\b/, w: 1.5 }, { re: /\b(misses|ignores|leaves out|omits) (the )?(second|other|rest|key)\b/, w: 1 }] },
  { id: "reversed", label: "Says the opposite", tip: "Mark which way the text leans (for or against, up or down) before you read the choices.",
    rules: [{ re: /\b(opposite|revers\w*|backwards|the other way around|contradicts?)\b/, w: 1.5 }] },
  { id: "irrelevant", label: "True but beside the point", section: "rw", tip: "Ask whether the choice answers this exact question or goal. Accurate isn't enough.",
    rules: [{ re: /\b(irrelevant|off[- ]topic|unrelated|beside the point|true but)\b/, w: 1.5 }, { re: /\b(doesn't|does not|fails to) (address|support|weaken|meet|accomplish|achieve|relate to|answer)\b/, w: 1 }] },
  { id: "transition", label: "Wrong transition", section: "rw", skills: ["Transitions"], tip: "Name the relationship between the two sentences (contrast, cause, example, addition) before you look at the choices.",
    rules: [{ re: /\b(transition|logical relationship|relationship between)\b/, w: 1 }, { re: /\b(contrast\w*|cause|result|example|addition|continu\w*|sequence)\b/, w: 0.5 }] },
  { id: "splice", label: "Comma splice or run-on", section: "rw", domains: SEC, tip: "Two complete sentences need a period, a semicolon, or a comma plus and, but, or, so.",
    rules: [{ re: /\b(comma splice|run[- ]on|fused sentence)\b/, w: 2 }, { re: /\bindependent clauses?\b/, w: 1 }] },
  { id: "punctuation", label: "Colon, dash or semicolon misuse", section: "rw", domains: SEC, tip: "A colon or semicolon needs a complete sentence before it. Dashes and commas around extra info come in pairs.",
    rules: [{ re: /\b(colon|semicolon|dash(es)?)\b/, w: 1 }, { re: /\b(nonessential|non-essential|nonrestrictive|interrupt\w*|pair of (commas|dashes))\b/, w: 1 }] },
  { id: "agreement", label: "Subject-verb agreement", section: "rw", domains: SEC, tip: "Cross out the words between the subject and the verb, then match the verb to the subject.",
    rules: [{ re: /\bsubject[- ]verb\b/, w: 2 }, { re: /\b(singular|plural) (verb|subject)\b/, w: 1 }, { re: /\b(singular|plural)\b/, w: 0.5 }] },
  { id: "tense", label: "Verb tense", section: "rw", domains: SEC, tip: "Match the tense to the verbs around the blank and to when the action happens.",
    rules: [{ re: /\btense\b/, w: 1.5 }, { re: /\b(past perfect|present perfect|future perfect|simple (past|present)|conditional)\b/, w: 1 }] },
  { id: "pronoun", label: "Pronoun", section: "rw", domains: SEC, tip: "Find what the pronoun replaces and match it in number. Its/it's and their/they're are favorite traps.",
    rules: [{ re: /\b(pronoun|antecedent)\b/, w: 1.5 }, { re: /\b(its|it's|their|they're|whose|who's)\b/, w: 0.5 }] },
  { id: "modifier", label: "Misplaced modifier", section: "rw", domains: SEC, tip: "Whatever an opening phrase describes has to come right after the comma.",
    rules: [{ re: /\b(dangling|misplaced) modifier\b/, w: 2 }, { re: /\b(modifier|modifies|introductory (phrase|clause))\b/, w: 1 }] },
  { id: "wrong_quantity", label: "Answered a different quantity", section: "math", tip: "Circle what the question asks for. After you solve, check that's what you're reporting.",
    rules: [{ re: /\b(solved for|value of [a-z] (rather|instead)|asks for|asked for|requested|instead of the (value|expression|quantity))\b/, w: 1.5 }, { re: /\b(rather than|not the (value|quantity|expression))\b/, w: 0.5 }] },
  { id: "wrong_setup", label: "Set up the wrong equation", section: "math", tip: "Translate the words one phrase at a time, then plug a choice back in to check your setup.",
    rules: [{ re: /\b(wrong|incorrect) (equation|expression|model|setup|set-up)\b/, w: 1.5 }, { re: /\b(set ?up|sets up|misinterpret\w*|confus\w* (the )?(slope|intercept|rate))\b/, w: 1 }] },
  { id: "units_percent", label: "Units or percent base", section: "math", tip: "Write units next to every number, and say what the percent is a percent of.",
    rules: [{ re: /\b(units?|conver(t|ted|sion)|per (hour|minute|second|day|year))\b/, w: 1 }, { re: /\bpercent(age)? (of|increase|decrease|change)\b|\b(original|new) (value|price|amount)\b/, w: 1 }] },
  { id: "calc_slip", label: "Calculation slip", section: "math", tip: "Write each step down, and check mental arithmetic in Desmos.",
    rules: [{ re: /\b(arithmetic|calculation|computation|miscalculat\w*|sign error|negative sign|distribut\w*|rounding|added instead|subtracted instead|multiplied instead|divided instead)\b/, w: 1.5 }] },
];

const EXTRA: Record<"misread" | "other", { label: string; tip: string }> = {
  misread: { label: "Misread the question", tip: "Say what the question asks in your own words before you read the choices." },
  other: { label: "Other", tip: "Re-read the rule and write one line in your own words on why your pick failed." },
};

export function trapInfo(id: TrapId): { label: string; tip: string } {
  const def = TRAPS.find((t) => t.id === id);
  return def ? { label: def.label, tip: def.tip } : EXTRA[id as "misread" | "other"] ?? EXTRA.other;
}

export interface TrapHit { id: TrapId; label: string; score: number; matched: string[] }

type MissFields = Pick<LogEntry, "whyPickFails" | "ruleName" | "ruleStatement" | "diagnosis" | "skill" | "domain" | "section">;

export function classifyMiss(e: MissFields): TrapHit {
  const section = sectionOf(e);
  const domain = e.domain ?? domainOfSkill(e.skill);
  const text = (e.whyPickFails ?? "").toLowerCase();
  const ruleText = `${e.ruleName ?? ""} ${e.ruleStatement ?? ""}`.toLowerCase();
  let best: TrapHit | null = null;
  for (const t of TRAPS) {
    if (t.section && t.section !== section) continue;
    if (t.domains && domain && !t.domains.includes(domain)) continue;
    let score = 0;
    const matched: string[] = [];
    for (const r of t.rules) {
      const m = text.match(r.re);
      if (m) { score += r.w; matched.push(m[0]); continue; }
      const m2 = ruleText.match(r.re); // the rule's own name counts half
      if (m2) { score += r.w / 2; matched.push(m2[0]); }
    }
    if (t.skills && e.skill && t.skills.includes(e.skill)) score += 0.5;
    if (score >= 1 && (!best || score > best.score)) best = { id: t.id, label: t.label, score, matched };
  }
  if (best) return best;
  if (e.diagnosis === "misread") return { id: "misread", label: EXTRA.misread.label, score: 1, matched: [] };
  if (section === "math" && e.diagnosis === "careless") return { id: "calc_slip", label: trapInfo("calc_slip").label, score: 1, matched: [] };
  return { id: "other", label: EXTRA.other.label, score: 0, matched: [] };
}

export interface TrapCount { id: TrapId; label: string; tip: string; count: number; share: number; attemptIds: string[] }
export interface TrapReport { total: number; counts: TrapCount[]; top: TrapCount | null }

const ORDER = [...TRAPS.map((t) => t.id), "misread", "other"] as TrapId[];

export function trapReport(entries: LogEntry[]): TrapReport {
  const misses = entries.filter((e) => e.result === "missed");
  const map = new Map<TrapId, TrapCount>();
  for (const e of misses) {
    const hit = classifyMiss(e);
    const c = map.get(hit.id) ?? { id: hit.id, ...trapInfo(hit.id), count: 0, share: 0, attemptIds: [] };
    c.count++;
    c.attemptIds.push(e.attemptId);
    map.set(hit.id, c);
  }
  const counts = [...map.values()]
    .map((c) => ({ ...c, share: misses.length ? c.count / misses.length : 0 }))
    .sort((a, b) => b.count - a.count || ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  return { total: misses.length, counts, top: counts.find((c) => c.id !== "other") ?? null };
}

/** "Traps you fall for" section. Returns null until there are at least 3 misses. */
export function renderTraps(r: TrapReport): HTMLElement | null {
  if (r.total < 3) return null;
  const shown = r.counts.filter((c) => c.id !== "other").slice(0, 4);
  if (!shown.length) return null;
  return h(
    "section",
    { class: "card rc-traps" },
    h("h2", { text: "Traps you fall for" }),
    h("ul", { class: "rc-groups" }, ...shown.map((c) =>
      h("li", null, h("div", { class: "rc-group", title: c.tip },
        h("span", { class: "rc-group-label", text: c.label }),
        h("span", { class: "rc-meter" }, h("span", { style: `width:${Math.round(c.share * 100)}%` })),
        h("span", { class: "small muted rc-group-n", text: String(c.count) }))))),
    r.top ? h("p", { class: "small rc-trap-tip" }, h("b", { text: `${r.top.label}: ` }), r.top.tip) : null,
  );
}
