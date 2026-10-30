// Screens for "Quiz me on my words" (logic and storage in wordquiz.ts): the entry block that sits inside the
// Word bank card, the quiz (one word at a time) and the results. Rendering only: every action goes out
// through the handler objects, so the controller owns the state.
// Uses the side panel classes (card, row, between, muted, small, btn, primary, link, chip, banner, stem,
// ol.choices > li.choice > span.letter with selectable/correct/picked) plus rc-wq-* from extension/wordquiz.css.
//
// Hook it in (full wiring in the header of wordquiz.ts):
//   entry:    renderWordQuizEntry(wordQuizAvailability(words), { start }) inside the Word bank card (renderBottom).
//             It is a plain block, not a card. Wrap it in a card if you place it outside the Word bank.
//   running:  renderWordQuiz(state, { pick, next, quit }) replaces the other cards in renderAboveCapture.
//   finished: renderWordQuizResult(wordQuizSummary(state), { again, done }).
//   keys:     wordQuizKey(ev.key) from wordquiz.ts, through the hotkeys `raw` handler.

import { chip, h } from "./dom";
import { LETTERS, type Letter } from "./types";
import {
  BLANK, currentWord, currentWordAnswer, markWord, wordQuizProgress, wordQuizSizes,
  type WordAnswer, type WordMiss, type WordQuestion, type WordQuizAvailability, type WordQuizState, type WordQuizSummary,
} from "./wordquiz";

type Kid = Node | string | null | undefined | false;

export interface WordQuizEntryHandlers {
  /** Start a quiz of n words. */
  start(n: number): void;
}

export interface WordQuizHandlers {
  pick(letter: Letter): void;
  /** Next word, or the results after the last one. */
  next(): void;
  quit(): void;
}

export interface WordQuizResultHandlers {
  /** A new quiz of the same length. */
  again(): void;
  done(): void;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pct = (x: number | null) => `${Math.round((x ?? 0) * 100)}%`;
const TITLE = "Quiz me on my words";

/** The text with the word in bold. */
const withWord = (text: string, word: string): (Node | string)[] =>
  markWord(text, word).map((p) => (p.hit ? h("b", { text: p.text }) : p.text));

/** The prompt with each blank drawn as its own span. */
function promptNodes(prompt: string): (Node | string)[] {
  const out: (Node | string)[] = [];
  prompt.split(BLANK).forEach((part, i) => {
    if (i > 0) out.push(h("span", { class: "rc-wq-blank", role: "img", "aria-label": "blank", text: BLANK }));
    if (part) out.push(part);
  });
  return out;
}

function head(title: string, count: string | null, extra: Node | null, close: (() => void) | null): HTMLElement {
  return h("div", { class: "row between rc-wq-head" },
    h("h2", { text: title }),
    h("div", { class: "row rc-wq-head-right" },
      count ? h("span", { class: "small muted rc-wq-count", text: count }) : null,
      extra,
      close ? h("button", { type: "button", class: "btn link small", title: "Esc", onclick: () => close() }, "Quit") : null));
}

function bar(done: number, total: number): HTMLElement {
  const n = Math.max(0, Math.min(done, total));
  const fill = h("span");
  fill.style.width = `${total ? Math.round((n / total) * 100) : 100}%`;
  return h("div", { class: "rc-wq-bar", role: "progressbar", "aria-label": "Progress", "aria-valuemin": 0, "aria-valuemax": total, "aria-valuenow": n }, fill);
}

function choiceList(q: WordQuestion, ans: WordAnswer | null, pick: (l: Letter) => void): HTMLElement {
  return h("ol", { class: "choices rc-wq-choices" }, ...LETTERS.map((letter, i) => {
    const live = !ans;
    const choose = () => { if (live) pick(letter); };
    const state = ans ? (letter === q.correct ? "correct" : letter === ans.picked ? "picked" : "") : "selectable";
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
    h("span", { class: "rc-wq-word", text: q.choices[letter] }),
    ans && letter === ans.picked ? h("span", { class: "rc-wq-tag", text: "your pick" }) : null);
  }));
}

// ---------------------------------------------------------------- entry block

/** "Quiz me on my words" with 5 and 10 buttons (capped by what is available), or why there is no quiz yet. */
export function renderWordQuizEntry(info: WordQuizAvailability, handlers: WordQuizEntryHandlers): HTMLElement {
  const sizes = info.reason ? [] : wordQuizSizes(info.available);
  const title = h("b", { class: "rc-wq-entry-title", text: TITLE });
  if (!sizes.length) {
    return h("div", { class: "rc-wq-entry rc-wq-locked" },
      h("div", { class: "rc-wq-entry-text" }, title,
        h("span", { class: "small muted", text: info.reason ?? "Explain more Words in Context cards to unlock the word quiz." })));
  }
  return h("div", { class: "rc-wq-entry" },
    h("div", { class: "rc-wq-entry-text" }, title,
      h("span", { class: "small muted", text: "Pick the word for each sentence or meaning. Your past wrong picks show up as choices." })),
    h("div", { class: "row rc-wq-sizes", role: "group", "aria-label": "Quiz length" },
      ...sizes.map((n, i) => h("button", {
        type: "button",
        class: i === 0 ? "btn small primary" : "btn small",
        title: `Start a quiz on ${plural(n, "word")}`,
        onclick: () => handlers.start(n),
      }, plural(n, "word")))));
}

// ---------------------------------------------------------------- quiz

function feedback(q: WordQuestion, ans: WordAnswer): HTMLElement {
  const said: Kid[] = ans.correct
    ? ["Right. The word is ", h("b", { text: q.word }), "."]
    : ["Not quite. You picked ", h("b", { text: q.choices[ans.picked] }), ". The word is ", h("b", { text: q.word }), "."];
  return h("div", { class: "rc-wq-feedback" },
    h("div", { class: `banner ${ans.correct ? "good" : "danger"}`, role: "status" }, h("p", { class: "stem" }, ...said)),
    q.sentence ? h("p", { class: "rc-wq-sentence" }, ...withWord(q.sentence, q.word)) : null,
    q.meaning ? h("p", { class: "small rc-wq-meaning" }, ...withWord(q.meaning, q.word)) : null);
}

/** One word: progress, the prompt, four choices, then right or wrong, the sentence, the meaning and Next. */
export function renderWordQuiz(state: WordQuizState, handlers: WordQuizHandlers): HTMLElement {
  const q = currentWord(state);
  const p = wordQuizProgress(state);
  if (!q) {
    return h("div", { class: "card rc-wq rc-wq-run" },
      head("Word quiz", null, null, handlers.quit),
      h("p", { class: "small muted", text: "You've reached the end of this quiz." }),
      h("div", { class: "row rc-wq-actions" },
        h("button", { type: "button", class: "btn primary", title: "Enter", onclick: () => handlers.next() }, "See results")));
  }
  const ans = currentWordAnswer(state);
  const kids: Kid[] = [
    head("Word quiz", `${p.number} of ${p.total}`, null, handlers.quit),
    bar(state.index + (ans ? 1 : 0), p.total),
    h("p", { class: "rc-wq-label", text: q.kind === "blank" ? "Which word fits?" : "Which word means this?" }),
    h("p", { class: `stem rc-wq-prompt rc-wq-kind-${q.kind}` }, ...promptNodes(q.prompt)),
    choiceList(q, ans, (l) => handlers.pick(l)),
  ];
  if (!ans) {
    kids.push(h("p", { class: "small muted rc-wq-hint", text: "Pick a word. Keys 1 to 4 or A to D work too." }));
  } else {
    kids.push(
      feedback(q, ans),
      h("div", { class: "row rc-wq-actions" },
        h("button", { type: "button", class: "btn primary", title: "Enter", onclick: () => handlers.next() }, p.left > 0 ? "Next" : "See results")));
  }
  return h("div", { class: "card rc-wq rc-wq-run" }, ...kids);
}

// ---------------------------------------------------------------- results

function missItem(m: WordMiss): HTMLElement {
  return h("li", { class: "rc-wq-miss" },
    h("div", { class: "rc-wq-miss-head" },
      h("b", { class: "rc-wq-miss-word", text: m.word }),
      h("span", { class: "small muted", text: `you picked ${m.picked}` })),
    m.meaning ? h("p", { class: "small rc-wq-meaning" }, ...withWord(m.meaning, m.word)) : null,
    m.sentence ? h("p", { class: "small muted rc-wq-sentence" }, ...withWord(m.sentence, m.word)) : null);
}

/** The score, every missed word with what you picked, its meaning and sentence, then Again and Done. */
export function renderWordQuizResult(summary: WordQuizSummary, handlers: WordQuizResultHandlers): HTMLElement {
  const s = summary;
  const misses = s.misses.length;
  const tone = s.accuracy === null ? "" : s.accuracy >= 0.8 ? "good" : s.accuracy >= 0.5 ? "warn" : "danger";
  const top = head("Word quiz results", null, s.answered ? chip(pct(s.accuracy), tone) : null, null);
  const actions = h("div", { class: "row rc-wq-actions" },
    h("button", { type: "button", class: misses ? "btn primary" : "btn", onclick: () => handlers.again() }, "Again"),
    h("button", { type: "button", class: misses ? "btn" : "btn primary", title: "Enter", onclick: () => handlers.done() }, "Done"));
  if (!s.answered) {
    return h("div", { class: "card rc-wq rc-wq-result" }, top,
      h("div", { class: "banner warn", role: "status" },
        h("p", { class: "stem", text: "You didn't answer any words." }),
        h("p", { class: "small", text: "Start again whenever you're ready." })),
      actions);
  }
  const left = s.total - s.answered;
  return h("div", { class: "card rc-wq rc-wq-result" },
    top,
    h("div", { class: `banner ${(s.accuracy ?? 0) >= 0.8 ? "good" : "warn"}`, role: "status" },
      h("p", { class: "stem", text: `You got ${s.right} of ${s.answered} right.` }),
      h("p", { class: "small", text: left ? `That's ${pct(s.accuracy)}. You stopped with ${plural(left, "word")} left.` : `That's ${pct(s.accuracy)}.` })),
    misses
      ? h("div", null,
        h("h3", { text: `Words to review (${misses})` }),
        h("ul", { class: "rc-wq-misses" }, ...s.misses.map(missItem)))
      : h("p", { class: "small", text: left ? "No misses in the words you answered." : "You got every word right." }),
    actions);
}
