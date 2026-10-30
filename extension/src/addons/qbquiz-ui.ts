// Screens for "Practice a Question Bank export" (logic and storage in qbquiz.ts): the entry card with the
// paste box, the quiz (one timed question at a time) and the results. Rendering only. Every action goes
// out through the handler objects, so the controller owns the state.
// Uses the side panel classes (card, row, between, muted, small, btn, primary, link, chip, banner, stem,
// passage, input, ol.choices > li.choice > span.letter with selectable/correct/picked) plus rc-quiz-*
// from extension/addons.css (the Wave 5 section).
//
// Hook it in (controller, renderAboveCapture slot; full wiring in the header of qbquiz.ts):
//   no quiz:  renderQuizEntry({ text, preview, last }, { input, start }). Return previewOf(parseExport(text))
//             from input() and the card updates in place, so the text box keeps focus while you paste.
//   active:   renderQuiz(state, { pick, next, quit, explain, skip? }) replaces the other cards in the slot.
//   finished: renderQuizResult(quizSummary(state), { retry, done, explain }).
//   keys:     quizKey(ev.key) from qbquiz.ts. On the results screen, "next" can call done.
//   math:     pass { renderText } with the side panel's math renderer if you want it (PDF text is plain).

import { chip, h } from "./dom";
import {
  currentAnswer, currentQuestion, MAX_SECONDS, questionTarget, quizProgress,
  type ExportPreview, type QuizAnswer, type QuizMiss, type QuizQuestion, type QuizResult, type QuizState, type QuizSummary,
} from "./qbquiz";
import { LETTERS, type Letter } from "./types";

type Kid = Node | string | null | undefined | false;
type TextFn = (text: string) => Node | string;

/** What the entry card shows about the paste. previewOf(parseExport(text)) fits. */
export type QuizPreview = Pick<ExportPreview, "found" | "skipped"> & Partial<Pick<ExportPreview, "noAnswer" | "duplicates">>;

export interface QuizEntryState {
  text: string;
  /** null before anything is pasted. */
  preview: QuizPreview | null;
  /** Initial shuffle box. Default true. */
  shuffle?: boolean;
  /** Initial question count: 10, 20 or null (all). Default 20. */
  limit?: number | null;
  /** The newest QuizResult from readQuizStore().history, for a "Last quiz" line. */
  last?: QuizResult | null;
}

export interface QuizStartOptions {
  shuffle: boolean;
  limit: number | null;
}

export interface QuizEntryHandlers {
  /** The pasted text changed. Return the new preview to update the card in place. */
  input(text: string): QuizPreview | null | void;
  start(opts: QuizStartOptions): void;
}

export interface QuizHandlers {
  pick(letter: Letter): void;
  /** Next question, or the results after the last one. */
  next(): void;
  quit(): void;
  /** Explain a miss with Rulecard (an /api/extract call). */
  explain(q: QuizQuestion, picked: Letter): void;
  /** Optional: shows a Skip link before you answer. */
  skip?(): void;
}

export interface QuizResultHandlers {
  retry(): void;
  done(): void;
  explain(q: QuizQuestion, picked: Letter): void;
}

export interface QuizRenderOptions {
  /** Turns question text into nodes. Default: plain text. */
  renderText?: TextFn;
  /** Clock source for the live timer. Default Date.now. */
  now?: () => number;
}

export const LIMIT_CHOICES: readonly { value: number | null; label: string }[] = [
  { value: 10, label: "10" },
  { value: 20, label: "20" },
  { value: null, label: "All" },
];

const plain: TextFn = (text) => text;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const secs = (n: number) => `${n} s`;
const pct = (x: number | null) => (x === null ? "0%" : `${Math.round(x * 100)}%`);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// ---------------------------------------------------------------- shared pieces

function header(title: string, count: string | null, extra: Node | null, close: () => void, closeLabel = "Quit"): HTMLElement {
  return h(
    "div",
    { class: "row between rc-quiz-head" },
    h("h2", { text: title }),
    h("div", { class: "row rc-quiz-head-right" },
      count ? h("span", { class: "small muted rc-quiz-count", text: count }) : null,
      extra,
      h("button", { class: "btn link small", title: "Esc", onclick: () => close() }, closeLabel)),
  );
}

function bar(done: number, total: number): HTMLElement {
  const n = Math.max(0, Math.min(done, total));
  const fill = h("span");
  fill.style.width = `${total ? Math.round((n / total) * 100) : 100}%`;
  return h("div", { class: "rc-quiz-bar", role: "progressbar", "aria-label": "Progress", "aria-valuemin": 0, "aria-valuemax": total, "aria-valuenow": n }, fill);
}

/** Time on the question: ticks once a second until answered, stops when the screen goes away. */
function clock(shownAt: number, ans: QuizAnswer | null, target: number, now: () => number): HTMLElement {
  const el = h("span", { class: "rc-quiz-clock", title: `Time on this question. Test pace is ${target} s.` });
  const show = (s: number) => {
    el.textContent = secs(s);
    el.classList.toggle("rc-quiz-over", s > target);
  };
  if (ans) {
    show(ans.seconds);
    return el;
  }
  const elapsed = () => Math.min(MAX_SECONDS, Math.max(0, Math.round((now() - shownAt) / 1000)));
  show(elapsed());
  const timer = setInterval(() => {
    if (!el.isConnected) return clearInterval(timer);
    show(elapsed());
  }, 1000);
  return el;
}

function meta(q: QuizQuestion): HTMLElement | null {
  const label = q.skill ?? q.domain;
  if (!label && !q.difficulty && !q.qbId) return null;
  return h("div", { class: "row rc-quiz-meta" },
    label ? chip(label, "accent") : null,
    q.difficulty ? chip(q.difficulty) : null,
    q.qbId ? h("span", { class: "small muted", text: `ID ${q.qbId}` }) : null);
}

function choiceList(q: QuizQuestion, ans: QuizAnswer | null, pick: ((l: Letter) => void) | null, t: TextFn): HTMLElement {
  return h("ol", { class: "choices" }, ...LETTERS.map((letter, i) => {
    const live = !ans && pick !== null;
    const choose = () => { if (live && pick) pick(letter); };
    const state = ans ? (letter === q.correct ? "correct" : letter === ans.picked ? "picked" : "") : live ? "selectable" : "";
    return h("li", {
      class: `choice ${state}`.trim(),
      role: live ? "button" : null,
      tabindex: live ? 0 : null,
      title: live ? `${letter} or ${i + 1}` : null,
      onclick: live ? choose : null,
      onkeydown: live
        ? (ev: KeyboardEvent) => {
          if (ev.key !== "Enter" && ev.key !== " ") return;
          // Keep the panel's Enter/Space hotkey from also moving on.
          ev.preventDefault();
          ev.stopPropagation();
          choose();
        }
        : null,
    },
    h("span", { class: "letter", text: `${letter}.` }),
    h("span", null, t(q.choices[letter])),
    ans && letter === ans.picked ? h("span", { class: "rc-quiz-tag", text: "your pick" }) : null);
  }));
}

const stat = (value: string, label: string) => h("div", { class: "rc-quiz-stat" }, h("b", { text: value }), h("span", { text: label }));

// ---------------------------------------------------------------- entry card

function previewLines(p: QuizPreview | null): HTMLElement[] {
  if (!p) return [h("p", { class: "small muted", text: "Paste an export to see how many questions it has." })];
  if (!p.found && !p.skipped) {
    return [h("p", { class: "small", text: "No questions found yet. Paste the whole export, from the first Question ID to the end." })];
  }
  const out = [h("p", { class: "rc-quiz-found", text: `Found ${plural(p.found, "question")}` })];
  if (p.skipped) out.push(h("p", { class: "small muted", text: `${p.skipped} skipped (grid-in or no answer key)` }));
  if (p.duplicates) out.push(h("p", { class: "small muted", text: `${plural(p.duplicates, "repeat")} left out` }));
  if (!p.found && p.noAnswer) {
    out.push(h("p", { class: "small rc-quiz-hint", text: "This export has no answer key. Include the answers when you export, then paste again." }));
  }
  return out;
}

/** "Practice a Question Bank export": paste box, question count, shuffle and length, Start. */
export function renderQuizEntry(state: QuizEntryState, handlers: QuizEntryHandlers): HTMLElement {
  let preview: QuizPreview | null = state.preview;
  let shuffle = state.shuffle ?? true;
  let limit: number | null = state.limit === undefined ? 20 : state.limit;
  const found = () => Math.max(0, preview?.found ?? 0);

  const status = h("div", { class: "rc-quiz-preview", "aria-live": "polite" });
  const start = h("button", { class: "btn primary", onclick: () => { if (found()) handlers.start({ shuffle, limit }); } });
  const paint = () => {
    status.replaceChildren(...previewLines(preview));
    const n = found();
    start.disabled = n === 0;
    start.textContent = n ? `Start ${plural(limit ? Math.min(limit, n) : n, "question")}` : "Start";
  };

  const area = h("textarea", {
    id: "rc-quiz-text",
    class: "input rc-quiz-text",
    rows: 7,
    spellcheck: "false",
    placeholder: "Paste the whole export here",
    "aria-label": "Question Bank export text",
    oninput: (ev: Event) => {
      const r = handlers.input((ev.target as HTMLTextAreaElement).value);
      if (r === undefined) return;
      preview = r as QuizPreview | null;
      paint();
    },
  });
  area.value = state.text ?? "";

  const shuffleBox = h("input", {
    type: "checkbox",
    id: "rc-quiz-shuffle",
    checked: shuffle,
    onchange: (ev: Event) => { shuffle = (ev.target as HTMLInputElement).checked; },
  });
  const limits = h("fieldset", { class: "rc-quiz-limits" },
    h("legend", { class: "small muted", text: "Questions" }),
    ...LIMIT_CHOICES.map(({ value, label }) => h("label", { class: "rc-quiz-limit" },
      h("input", {
        type: "radio",
        name: "rc-quiz-limit",
        value: value === null ? "all" : String(value),
        checked: limit === value,
        onchange: () => { limit = value; paint(); },
      }),
      h("span", { text: label }))));

  paint();
  const last = state.last;
  return h(
    "div",
    { class: "card rc-quiz rc-quiz-entry" },
    h("h2", { text: "Practice a Question Bank export" }),
    h("p", { class: "small muted", text: "Export questions from the Question Bank as a PDF, open it, select all, copy, and paste here." }),
    area,
    status,
    h("div", { class: "row rc-quiz-options" },
      h("label", { class: "rc-quiz-check" }, shuffleBox, h("span", { text: "Shuffle the order" })),
      limits),
    h("p", { class: "small muted", text: "You're graded with the export's answer key, and each question is timed. Nothing leaves this device until you ask for an explanation." }),
    h("div", { class: "row" }, start),
    last ? h("p", { class: "small muted rc-quiz-last", text: `Last quiz: ${last.right} of ${last.total} right.` }) : null,
  );
}

// ---------------------------------------------------------------- quiz

/** One question: progress, chips, passage, stem, choices, then the result, the official explanation and Next. */
export function renderQuiz(state: QuizState, handlers: QuizHandlers, opts: QuizRenderOptions = {}): HTMLElement {
  const t = opts.renderText ?? plain;
  const q = currentQuestion(state);
  const p = quizProgress(state);
  if (!q) {
    return h("div", { class: "card rc-quiz rc-quiz-run" },
      header("Question Bank practice", null, null, handlers.quit),
      h("p", { class: "small muted", text: "You've reached the end of this quiz." }),
      h("button", { class: "btn primary", title: "Enter", onclick: () => handlers.next() }, "See results"));
  }
  const ans = currentAnswer(state);
  const target = questionTarget(q);
  const kids: Kid[] = [
    header("Question Bank practice", `${p.number} of ${p.total}`, state.timed ? clock(state.shownAt, ans, target, opts.now ?? Date.now) : null, handlers.quit),
    bar(state.index + (ans ? 1 : 0), p.total),
    meta(q),
    q.passage ? h("div", { class: "passage" }, t(q.passage)) : null,
    h("p", { class: "stem" }, t(q.stem)),
    choiceList(q, ans, (l) => handlers.pick(l), t),
  ];
  if (!ans) {
    kids.push(h("div", { class: "row between rc-quiz-hintrow" },
      h("p", { class: "small muted", text: "Pick an answer. Keys 1 to 4 or A to D work too." }),
      handlers.skip ? h("button", { class: "btn link small", onclick: () => handlers.skip?.() }, "Skip") : null));
  } else {
    const right = ans.correct;
    const pace = ans.seconds > target ? `over the ${target} s pace` : `within the ${target} s pace`;
    kids.push(
      h("div", { class: `banner ${right ? "good" : "danger"}`, role: "status" },
        h("p", { class: "stem", text: right ? `Right. The answer is ${q.correct}.` : `Not quite. You picked ${ans.picked}. The answer is ${q.correct}.` }),
        state.timed ? h("p", { class: "small", text: `You took ${secs(ans.seconds)}, ${pace}.` }) : null),
      h("details", { class: "rc-quiz-rationale" },
        h("summary", { text: "Official explanation" }),
        q.rationale
          ? h("div", { class: "rc-quiz-rationale-text" }, t(q.rationale))
          : h("p", { class: "small muted", text: "This export has no explanation for this question." })),
      h("div", { class: "row rc-quiz-actions" },
        right ? null : h("button", { class: "btn", onclick: () => handlers.explain(q, ans.picked) }, "Explain with Rulecard"),
        h("button", { class: "btn primary", title: "Enter", onclick: () => handlers.next() }, p.left > 0 ? `Next question (${p.left} left)` : "See results")),
    );
  }
  return h("div", { class: "card rc-quiz rc-quiz-run" }, ...kids);
}

// ---------------------------------------------------------------- results

function skillTable(s: QuizSummary): HTMLElement {
  return h("div", null,
    h("h3", { text: "By skill" }),
    h("table", { class: "rc-quiz-skills" },
      h("thead", null, h("tr", null, h("th", { text: "Skill" }), h("th", { text: "Right" }), h("th", { text: "Accuracy" }))),
      h("tbody", null, ...s.bySkill.map((g) => {
        const rate = g.total ? g.right / g.total : 0;
        const fill = h("span");
        fill.style.width = `${Math.round(rate * 100)}%`;
        const tone = rate < 0.5 ? "rc-quiz-weak" : rate < 0.8 ? "rc-quiz-mid" : "";
        return h("tr", null,
          h("td", { text: g.skill }),
          h("td", { class: "rc-quiz-num", text: `${g.right} of ${g.total}` }),
          h("td", null, h("div", { class: "rc-quiz-acc" },
            h("div", { class: `rc-quiz-skill-bar ${tone}`.trim(), "aria-hidden": "true" }, fill),
            h("span", { class: "small muted rc-quiz-num", text: pct(rate) }))));
      }))));
}

function review(q: QuizQuestion, picked: Letter, t: TextFn): HTMLElement {
  return h("details", { class: "rc-quiz-review" },
    h("summary", { text: "Show the question" }),
    q.passage ? h("div", { class: "passage" }, t(q.passage)) : null,
    h("p", { class: "stem" }, t(q.stem)),
    choiceList(q, { picked, correct: picked === q.correct, seconds: 0 }, null, t),
    q.rationale ? h("div", { class: "rc-quiz-rationale-text" }, h("b", { text: "Official explanation: " }), t(q.rationale)) : null);
}

function missItem(m: QuizMiss, handlers: QuizResultHandlers, t: TextFn): HTMLElement {
  const q = m.question;
  return h("li", { class: "rc-quiz-miss" },
    h("p", { class: "rc-quiz-miss-text", text: clip(q.passage ?? q.stem, 140) }),
    h("div", { class: "row rc-quiz-miss-meta" },
      h("span", { class: "small", text: `You picked ${m.picked}. The answer is ${q.correct}.` }),
      q.skill ? chip(q.skill) : null,
      h("span", { class: "small muted", text: secs(m.seconds) })),
    review(q, m.picked, t),
    h("button", { class: "btn small", onclick: () => handlers.explain(q, m.picked) }, "Explain with Rulecard"));
}

/** Score, accuracy, pace, skills weakest first, and every miss with Explain with Rulecard. */
export function renderQuizResult(summary: QuizSummary, handlers: QuizResultHandlers, opts: QuizRenderOptions = {}): HTMLElement {
  const s = summary;
  const t = opts.renderText ?? plain;
  const top = header("Your results", null, null, handlers.done, "Close");
  if (!s.answered) {
    return h("div", { class: "card rc-quiz rc-quiz-result" }, top,
      h("div", { class: "banner warn" },
        h("p", { class: "stem", text: "You didn't answer any questions." }),
        h("p", { class: "small", text: "Paste the export again when you're ready to practice." })),
      h("button", { class: "btn primary", title: "Enter", onclick: () => handlers.done() }, "Done"));
  }
  const avg = s.avgSeconds ?? 0;
  const misses = s.misses.length;
  const paceLine = avg > s.target
    ? `On average you took ${avg - s.target} s longer than the ${s.target} s test pace.`
    : `On average you kept within the ${s.target} s test pace.`;
  return h(
    "div",
    { class: "card rc-quiz rc-quiz-result" },
    top,
    h("div", { class: `banner ${(s.accuracy ?? 0) >= 0.8 ? "good" : "warn"}`, role: "status" },
      h("p", { class: "stem", text: `You got ${s.right} of ${s.total} right.` }),
      h("p", { class: "small", text: s.unanswered ? `That's ${pct(s.accuracy)} of the ${s.answered} you answered. ${s.unanswered} left unanswered.` : `That's ${pct(s.accuracy)}.` })),
    h("div", { class: "rc-quiz-stats" },
      stat(pct(s.accuracy), "Accuracy"),
      stat(secs(avg), `Average time (pace ${s.target} s)`),
      stat(String(s.slow), s.slow === 1 ? "Question over pace" : "Questions over pace"),
      stat(s.minutes < 1 ? "<1" : String(s.minutes), "Minutes answering")),
    h("p", { class: "small muted", text: paceLine }),
    s.bySkill.length ? skillTable(s) : null,
    misses
      ? h("div", null,
        h("h3", { text: `Your misses (${misses})` }),
        h("ol", { class: "rc-quiz-misses" }, ...s.misses.map((m) => missItem(m, handlers, t))))
      : h("p", { class: "small", text: "No misses this time." }),
    h("div", { class: "row rc-quiz-actions" },
      h("button", { class: misses ? "btn primary" : "btn", disabled: !misses, onclick: () => handlers.retry() }, "Retry my misses"),
      h("button", { class: misses ? "btn" : "btn primary", title: "Enter", onclick: () => handlers.done() }, "Done")),
  );
}
