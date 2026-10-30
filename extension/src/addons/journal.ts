// Mistake journal: search and filter everything saved locally (rule, skill, diagnosis, stars,
// notes, free text). The web app's History has the server copy; this one has your notes,
// stars, timing and self-confidence, and works offline.
// Math (upstream 0.3.0): grid-in entries show the accepted answers and what you typed instead of
// letters, Math entries show their worked steps, and a section filter appears once the log has
// both Reading and Writing and Math. LaTeX shows as plain text (plainMath).
// Hook-in: index.ts renders renderJournal(log, filter, actions, rerender) in the renderBottom slot.

import { chip, h } from "./dom";
import { answerLine, plainMath } from "./export";
import { isGridIn, sectionOf, type LogEntry } from "./log";
import type { Section } from "./types";

export interface JournalFilter {
  q: string;
  result: "all" | "missed" | "starred" | "noted";
  skill: string;
  diagnosis: string;
  limit: number;
  /** "" or missing = both sections. Optional so saved filters from older versions still fit. */
  section?: "" | Section;
}

export const defaultFilter = (): JournalFilter => ({ q: "", result: "missed", skill: "", diagnosis: "", limit: 20 });

const hay = (e: LogEntry) =>
  [e.ruleId, e.ruleName, e.ruleStatement, e.takeaway, e.stem, e.passage, e.note, e.skill, e.qbId, ...Object.values(e.choices ?? {}), e.typed, ...(e.accepted ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export function filterJournal(entries: LogEntry[], f: JournalFilter): LogEntry[] {
  const terms = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((e) => {
    if (f.result === "missed" && e.result !== "missed") return false;
    if (f.result === "starred" && !e.starred) return false;
    if (f.result === "noted" && !e.note) return false;
    if (f.skill && e.skill !== f.skill) return false;
    if (f.section && sectionOf(e) !== f.section) return false;
    if (f.diagnosis && e.diagnosis !== f.diagnosis) return false;
    if (terms.length) {
      const text = hay(e);
      if (!terms.every((t) => text.includes(t))) return false;
    }
    return true;
  });
}

const DIAG_LABEL: Record<string, string> = { rule_gap: "rule gap", careless: "careless", misread: "misread", got_it_right: "got it", unknown: "no reason" };

export interface JournalActions {
  change: (f: JournalFilter) => void;
  openWeb: (path: string) => void;
  toggleStar: (e: LogEntry) => void;
  reviewRule: (ruleId: string) => void;
}

let openState = false;
const expanded = new Set<string>();

export function renderJournal(entries: LogEntry[], f: JournalFilter, actions: JournalActions, rerender: () => void): HTMLElement {
  const sections = new Set(entries.map((e) => sectionOf(e)));
  const bothSections = sections.size > 1 || Boolean(f.section);
  const inSection = f.section ? entries.filter((e) => sectionOf(e) === f.section) : entries;
  const skills = [...new Set(inSection.map((e) => e.skill).filter((s): s is string => !!s))].sort();
  const hits = filterJournal(entries, f);
  const select = (id: string, value: string, options: [string, string][], onChange: (v: string) => void) => {
    const el = h("select", { id, class: "input rc-select", onchange: (ev: Event) => onChange((ev.target as HTMLSelectElement).value) },
      ...options.map(([v, label]) => h("option", { value: v, text: label })));
    el.value = value;
    return el;
  };
  const search = h("input", { id: "rc-journal-q", class: "input", type: "search", placeholder: "Search rules, questions, notes…", value: f.q });
  let t: ReturnType<typeof setTimeout> | null = null;
  search.addEventListener("input", () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => actions.change({ ...f, q: search.value, limit: 20 }), 250);
  });

  const list = h("ul", { class: "rc-journal" }, ...hits.slice(0, f.limit).map((e) => {
    const isOpen = expanded.has(e.attemptId);
    const head = h("button", {
      class: "rc-journal-head",
      "aria-expanded": String(isOpen),
      onclick: () => { if (isOpen) expanded.delete(e.attemptId); else expanded.add(e.attemptId); rerender(); },
    },
      h("span", { class: "row rc-wrap" },
        chip(e.result === "right" ? "right" : "missed", e.result === "right" ? "good" : "danger"),
        h("span", { class: "small", text: e.ruleName ? `${e.ruleId} · ${e.ruleName}` : e.ruleId }),
        e.starred ? h("span", { class: "small", text: "★" }) : null,
        h("span", { class: "small muted", text: new Date(e.at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) })),
      h("span", { class: "rc-journal-stem", text: plainMath(e.stem) }),
      e.note ? h("span", { class: "rc-journal-note", text: `“${e.note}”` }) : null);
    const body = isOpen
      ? h("div", { class: "rc-journal-body" },
        h("p", { class: "rule-statement", text: e.ruleStatement }),
        h("p", { class: "small", text: `${answerLine(e)} ${plainMath(e.result === "missed" && e.whyPickFails ? e.whyPickFails : e.whyCorrect)}` }),
        e.steps?.length ? h("ol", { class: "steps small" }, ...e.steps.map((st) => h("li", { text: plainMath(st) }))) : null,
        e.shortcut ? h("p", { class: "small" }, h("b", { text: "Shortcut: " }), plainMath(e.shortcut)) : null,
        h("p", { class: "small" }, h("b", { text: "Takeaway: " }), plainMath(e.takeaway)),
        h("div", { class: "row rc-wrap small muted" },
          sectionOf(e) === "math" ? chip("Math") : null,
          isGridIn(e) ? chip("grid-in") : null,
          e.skill ? chip(e.skill) : null,
          e.difficulty ? chip(e.difficulty) : null,
          chip(DIAG_LABEL[e.diagnosis] ?? e.diagnosis),
          e.selfConfidence ? chip(`felt ${e.selfConfidence}`) : null,
          e.seconds !== null ? chip(`${e.seconds}s`) : null),
        h("div", { class: "row rc-wrap" },
          h("button", { class: "btn small", text: "Open in web app", onclick: () => actions.openWeb(`/history/${encodeURIComponent(e.attemptId)}`) }),
          h("button", { class: "btn small", text: "Review this rule now", onclick: () => actions.reviewRule(e.ruleId) }),
          h("button", { class: "btn small", text: e.starred ? "★ Unstar" : "☆ Star", onclick: () => actions.toggleStar(e) })))
      : null;
    return h("li", null, head, body);
  }));

  const details = h("details", { class: "card rc-journal-card", open: openState ? "" : null, ontoggle: (ev: Event) => { openState = (ev.target as HTMLDetailsElement).open; } },
    h("summary", null, h("h2", { text: "Journal" }), h("span", { class: "small muted", text: `${entries.length} saved` })),
    search,
    h("div", { class: "row rc-wrap" },
      select("rc-journal-result", f.result, [["missed", "Missed"], ["starred", "Starred"], ["noted", "With notes"], ["all", "All"]], (v) => actions.change({ ...f, result: v as JournalFilter["result"], limit: 20 })),
      select("rc-journal-skill", f.skill, [["", "All skills"], ...skills.map((s) => [s, s] as [string, string])], (v) => actions.change({ ...f, skill: v, limit: 20 })),
      select("rc-journal-diag", f.diagnosis, [["", "Any reason"], ["rule_gap", "Rule gap"], ["careless", "Careless"], ["misread", "Misread"]], (v) => actions.change({ ...f, diagnosis: v, limit: 20 })),
      bothSections ? select("rc-journal-section", f.section ?? "", [["", "Both sections"], ["rw", "Reading and Writing"], ["math", "Math"]], (v) => actions.change({ ...f, section: v === "rw" || v === "math" ? v : "", limit: 20 })) : null),
    hits.length ? list : h("p", { class: "muted small", text: entries.length ? "Nothing matches." : "Explained questions show up here." }),
    hits.length > f.limit ? h("button", { class: "btn small", text: `Show more (${hits.length - f.limit})`, onclick: () => actions.change({ ...f, limit: f.limit + 20 }) }) : null);
  return details;
}
