// Screens for the two offline practice modes: rule flashcards (flashcards.ts) and redo my misses
// (redo.ts). Neither makes an AI call. Rendering only: the logic lives in those two modules, and
// the handler factories below (flashHandlers, redoHandlers) touch no DOM, so they can be tested.
// Uses the side panel classes (card, ol.choices > li.choice > span.letter, banner, btn primary,
// chip) plus rc-pr-*, rc-flash-* and rc-redo-* from extension/addons-practice.css (link it after
// addons.css).
//
// Hook it in (controller, e.g. the renderAboveCapture or renderBottom slot):
//   entry: renderPracticeEntry({ due, misses, weak }, { flashcards: (extra) => ..., redo: () => ... })
//          due/weak from deckCounts(log, srs, now), misses = redoQueue(log, await readRedo()).length.
//          Returns null when there is nothing to practice.
//   deck:  const view = renderFlashcards(s.deck, { update, saveSrs, quit, getSrs });
//          saveSrs(srs) should do `s.srs = srs; void writeSrs(srs)`. update(state) stores it and re-renders.
//   redo:  const view = renderRedo(s.redo, { update, saveAnswer, quit }, { stats: redoStats(log, store) });
//          saveAnswer(id, attempt) should call recordRedo(id, attempt).
//   keys:  keep view.handlers. While practice is open, send keydown through
//          pressPracticeKey(view.handlers, ev.key, mode) instead of the normal hotkeys (skip it when
//          a modifier is held or a text box has focus). Flashcards: Space flip, 1/2/3 Again/Hard/Good.
//          Redo: A-D or 1-4 pick, S skip, Space next. Both: Enter next, Esc quit.
//   math:  pass { renderText } with the side panel's LaTeX-to-MathML renderer so \( \) shows as math.

import { chip, h } from "./dom";
import { currentCard, deckSummary, flip, grade, isDone, nextDueIf, type DeckState, type FlashCard, type FlashGrade } from "./flashcards";
import { answerRedo, choiceList, currentRedo, isRedoDone, nextRedo, redoSummary, skipRedo, type RedoAttempt, type RedoItem, type RedoState, type RedoStats } from "./redo";
import { describeDue, MAX_BOX, type SrsState } from "./srs";
import type { Letter } from "./types";

type Kid = Node | string | null | undefined | false;
type TextFn = (text: string) => Node | string;

/** Keyboard-friendly actions for the screen on view. Ones that don't apply are no-ops. */
export interface PracticeHandlers {
  /** Redo: answer with this letter. */
  pick(letter: Letter): void;
  /** Flashcards: turn the card over. */
  flip(): void;
  /** Flashcards: grade the flipped card. */
  grade(g: FlashGrade): void;
  /** Flashcards: flip if the front is up. Redo: next question once answered. Summary: close. */
  next(): void;
  /** Redo: pass on this question without saving an answer. */
  skip(): void;
  /** Leave practice. */
  quit(): void;
}

export interface PracticeView {
  el: HTMLElement;
  handlers: PracticeHandlers;
}

export interface PracticeRenderOptions {
  /** Turns saved text into nodes. Pass the side panel's math renderer for \( \) LaTeX. Default: plain text. */
  renderText?: TextFn;
  now?: () => number;
}

export interface RedoRenderOptions extends PracticeRenderOptions {
  /** All-time numbers (redoStats) for the summary screen. Optional. */
  stats?: RedoStats | null;
}

export interface FlashcardsActions {
  /** Keep the new deck state and re-render. */
  update(state: DeckState): void;
  /** A grade changed the schedule: make it the panel's SRS and save it (writeSrs). */
  saveSrs(srs: SrsState): void;
  quit(): void;
  /** The panel's current SRS, if it can change while the deck is open. Defaults to the deck's copy. */
  getSrs?(): SrsState;
}

export interface RedoActions {
  /** Keep the new redo state and re-render. */
  update(state: RedoState): void;
  /** Save one answer: recordRedo(attemptId, attempt). */
  saveAnswer(attemptId: string, attempt: RedoAttempt): void;
  quit(): void;
}

export interface PracticeEntryInfo {
  /** Rules due now. */
  due: number;
  /** Misses ready to redo. */
  misses: number;
  /** Weak rules to offer when nothing is due (deckCounts().weak). Optional. */
  weak?: number;
}

export interface PracticeEntryActions {
  /** Start a deck. extra = how many weak non-due rules to add (0 = due rules only). */
  flashcards(extra: number): void;
  redo(): void;
}

export type PracticeMode = "flashcards" | "redo";
export type PracticeKeyAction = { name: "pick"; arg: Letter } | { name: "grade"; arg: FlashGrade } | { name: "flip" | "next" | "skip" | "quit" };

// ---------------------------------------------------------------- handlers (no DOM)

export function flashHandlers(state: DeckState, actions: FlashcardsActions, now: () => number = Date.now): PracticeHandlers {
  return {
    pick: () => {},
    flip: () => {
      if (!isDone(state)) actions.update(flip(state));
    },
    grade: (g) => {
      const r = grade(state, g, now(), actions.getSrs?.() ?? state.srs);
      if (r.state === state) return;
      actions.saveSrs(r.srs);
      actions.update(r.state);
    },
    next: () => {
      if (isDone(state)) actions.quit();
      else if (!state.flipped) actions.update(flip(state));
    },
    skip: () => {},
    quit: () => actions.quit(),
  };
}

export function redoHandlers(state: RedoState, actions: RedoActions, now: () => number = Date.now): PracticeHandlers {
  return {
    pick: (letter) => {
      const r = answerRedo(state, letter, now());
      if (r.state === state) return;
      if (r.saved) actions.saveAnswer(r.saved.attemptId, r.saved.attempt);
      actions.update(r.state);
    },
    flip: () => {},
    grade: () => {},
    next: () => {
      if (isRedoDone(state)) return actions.quit();
      const n = nextRedo(state);
      if (n !== state) actions.update(n);
    },
    skip: () => {
      const n = skipRedo(state, now());
      if (n !== state) actions.update(n);
    },
    quit: () => actions.quit(),
  };
}

const PICK_KEYS: Record<string, Letter> = { a: "A", b: "B", c: "C", d: "D", "1": "A", "2": "B", "3": "C", "4": "D" };
const GRADE_KEYS: Record<string, FlashGrade> = { "1": "again", "2": "hard", "3": "good" };

/** Suggested hotkeys while a practice screen is open. Pure. */
export function practiceKey(key: string, mode: PracticeMode): PracticeKeyAction | null {
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (k === "Escape") return { name: "quit" };
  if (k === "Enter") return { name: "next" };
  if (mode === "flashcards") {
    if (k === " ") return { name: "flip" };
    const g = GRADE_KEYS[k];
    return g ? { name: "grade", arg: g } : null;
  }
  if (k === " ") return { name: "next" };
  if (k === "s") return { name: "skip" };
  const letter = PICK_KEYS[k];
  return letter ? { name: "pick", arg: letter } : null;
}

/** Map a key to the view's handler and call it. True when the key was used (so preventDefault). */
export function pressPracticeKey(handlers: PracticeHandlers, key: string, mode: PracticeMode): boolean {
  const a = practiceKey(key, mode);
  if (!a) return false;
  if (a.name === "pick") handlers.pick(a.arg);
  else if (a.name === "grade") handlers.grade(a.arg);
  else handlers[a.name]();
  return true;
}

// ---------------------------------------------------------------- shared pieces

const plain: TextFn = (text) => text;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const shortDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const ruleLabel = (id: string, name: string | null) => (name ? `${id} · ${name}` : id);
/** log.ts clips saved passages to this many characters, ending in "…". */
const PASSAGE_CLIP = 1200;

function head(title: string, count: string | null, quit: () => void, quitLabel = "Quit"): HTMLElement {
  return h(
    "div",
    { class: "row between rc-pr-head" },
    h("h2", { text: title }),
    h("div", { class: "row" },
      count ? h("span", { class: "small muted rc-pr-count", text: count }) : null,
      h("button", { class: "btn link small", title: "Esc", onclick: () => quit() }, quitLabel)),
  );
}

function bar(done: number, total: number): HTMLElement {
  const n = Math.min(done, total);
  const fill = h("span");
  fill.style.width = `${total ? Math.round((n / total) * 100) : 100}%`;
  return h("div", { class: "rc-pr-bar", role: "progressbar", "aria-label": "Progress", "aria-valuemin": 0, "aria-valuemax": total, "aria-valuenow": n }, fill);
}

// ---------------------------------------------------------------- entry card

/** "Practice offline" card with both start buttons. Null when there is nothing to practice. */
export function renderPracticeEntry(info: PracticeEntryInfo, actions: PracticeEntryActions): HTMLElement | null {
  const due = Math.max(0, info.due || 0);
  const misses = Math.max(0, info.misses || 0);
  const weak = Math.max(0, info.weak || 0);
  if (!due && !misses && !weak) return null;
  return h(
    "div",
    { class: "card rc-practice-entry" },
    h("div", null,
      h("h2", { text: "Practice offline" }),
      h("p", { class: "small muted", text: "Uses only what is saved on this device. No connection needed." })),
    h("div", { class: "row rc-pr-actions" },
      h("button", { class: due ? "btn primary" : "btn", disabled: !due, onclick: () => actions.flashcards(0) }, `Flip rule cards (${due} due)`),
      h("button", { class: !due && misses ? "btn primary" : "btn", disabled: !misses, onclick: () => actions.redo() }, `Redo my misses (${misses})`)),
    !due && weak
      ? h("button", { class: "btn link small", onclick: () => actions.flashcards(weak) }, `Nothing is due. Flip your ${plural(weak, "weakest rule")} instead`)
      : null,
  );
}

// ---------------------------------------------------------------- flashcards

export function renderFlashcards(state: DeckState, actions: FlashcardsActions, opts: PracticeRenderOptions = {}): PracticeView {
  const now = opts.now ?? Date.now;
  const handlers = flashHandlers(state, actions, now);
  const card = currentCard(state);
  const el = card ? flashCardView(state, card, handlers, opts.renderText ?? plain, actions.getSrs?.() ?? state.srs, now()) : flashSummaryView(state, handlers);
  return { el, handlers };
}

function flashCardView(state: DeckState, card: FlashCard, hs: PracticeHandlers, t: TextFn, srs: SrsState, now: number): HTMLElement {
  const total = state.cards.length;
  const kids: Kid[] = [
    head("Rule cards", `${state.index + 1} of ${total}`, hs.quit),
    bar(state.index, total),
    h("div", { class: "rc-flash-front" },
      h("div", { class: "row" },
        h("span", { class: "rule-id", text: card.ruleId }),
        card.reason === "due" ? chip("due", "accent") : chip("often missed", "warn"),
        card.box !== null ? chip(`box ${card.box}/${MAX_BOX}`) : null),
      h("p", { class: "rc-flash-name", text: card.ruleName ?? `Rule ${card.ruleId}` }),
      cueView(card, t)),
  ];
  if (state.flipped) kids.push(backView(card, t), gradesView(state, hs, srs, now));
  else kids.push(
    h("p", { class: "small muted", text: "Say the rule in your own words, then flip the card." }),
    h("button", { class: "btn primary", title: "Space", onclick: () => hs.flip() }, "Flip"),
  );
  return h("div", { class: "card rc-practice rc-flash" }, ...kids);
}

function cueView(card: FlashCard, t: TextFn): HTMLElement {
  const cue = card.cue;
  if (!cue) return h("p", { class: "small muted", text: "No question on this rule is saved on this device." });
  return h("div", { class: "rc-flash-cue" },
    h("p", { class: "small muted", text: `${cue.missed ? "Last question you missed on this rule" : "Last question on this rule"} (${shortDate(cue.at)})` }),
    h("p", { class: "stem" }, t(cue.stem)),
    cue.passage ? h("details", { class: "rc-flash-passage" }, h("summary", { text: "Show the passage" }), h("div", { class: "passage" }, t(cue.passage))) : null);
}

function backView(card: FlashCard, t: TextFn): HTMLElement {
  const list = (items: string[]) => h("ul", { class: "steps" }, ...items.map((x) => h("li", null, t(x))));
  const first = card.takeaways.slice(0, 3);
  const rest = card.takeaways.slice(3);
  return h("div", { class: "rc-flash-back" },
    h("div", null,
      h("h2", { text: "The rule" }),
      card.statement ? h("p", { class: "rule-statement" }, t(card.statement)) : h("p", { class: "small muted", text: "No rule statement is saved on this device." })),
    first.length
      ? h("div", null,
        h("h2", { text: card.takeaways.length === 1 ? "Takeaway" : "Takeaways" }),
        list(first),
        rest.length ? h("details", { class: "rc-flash-more" }, h("summary", { text: `${rest.length} more` }), list(rest)) : null)
      : null,
    card.notes.length
      ? h("div", null,
        h("h2", { text: "Your notes" }),
        h("ul", { class: "rc-flash-notes" }, ...card.notes.map((n) => h("li", null, n.text, h("span", { class: "small muted", text: ` · ${shortDate(n.at)}` })))))
      : null);
}

const GRADE_BUTTONS: { g: FlashGrade; label: string; key: string; cls: string }[] = [
  { g: "again", label: "Again", key: "1", cls: "" },
  { g: "hard", label: "Hard", key: "2", cls: "" },
  { g: "good", label: "Good", key: "3", cls: "primary" },
];

function gradesView(state: DeckState, hs: PracticeHandlers, srs: SrsState, now: number): HTMLElement {
  return h("div", { class: "rc-flash-grade-wrap" },
    h("p", { class: "small muted", text: "How well did you know it?" }),
    h("div", { class: "rc-flash-grades" }, ...GRADE_BUTTONS.map(({ g, label, key, cls }) => {
      const due = nextDueIf(state, g, now, srs);
      return h("button", { class: `btn rc-flash-grade ${cls}`.trim(), title: key, onclick: () => hs.grade(g) },
        h("span", { text: label }),
        due !== null ? h("span", { class: "rc-flash-when", text: describeDue(due, now) }) : null);
    })));
}

function flashSummaryView(state: DeckState, hs: PracticeHandlers): HTMLElement {
  const s = deckSummary(state);
  const header = head("Rule cards", null, hs.quit, "Close");
  const done = h("button", { class: "btn primary", title: "Enter", onclick: () => hs.quit() }, "Done");
  if (!s.total) {
    return h("div", { class: "card rc-practice" }, header,
      h("div", { class: "banner good" },
        h("p", { class: "stem", text: "Nothing to flip right now." }),
        h("p", { class: "small", text: "A rule shows up here when it is due for review." })),
      done);
  }
  return h("div", { class: "card rc-practice rc-pr-summary" }, header,
    h("div", { class: `banner ${s.again ? "warn" : "good"}` },
      h("p", { class: "stem", text: `Done. You knew ${s.hard + s.good} of ${plural(s.graded, "rule")}.` }),
      h("p", { class: "small", text: s.again ? "Rules you marked Again come back tomorrow. The rest wait longer." : "Each rule now waits longer before it comes back." })),
    h("div", { class: "row" },
      chip(`Again ${s.again}`, s.again ? "danger" : ""),
      chip(`Hard ${s.hard}`, s.hard ? "warn" : ""),
      chip(`Good ${s.good}`, s.good ? "good" : "")),
    s.againRules.length
      ? h("div", null, h("h2", { text: "Back tomorrow" }), h("div", { class: "row" }, ...s.againRules.map((r) => chip(ruleLabel(r.ruleId, r.ruleName), "danger"))))
      : null,
    done);
}

// ---------------------------------------------------------------- redo my misses

export function renderRedo(state: RedoState, actions: RedoActions, opts: RedoRenderOptions = {}): PracticeView {
  const handlers = redoHandlers(state, actions, opts.now ?? Date.now);
  const item = currentRedo(state);
  const el = item ? redoQuestionView(state, item, handlers, opts.renderText ?? plain) : redoSummaryView(state, handlers, opts.stats ?? null);
  return { el, handlers };
}

function redoQuestionView(state: RedoState, item: RedoItem, hs: PracticeHandlers, t: TextFn): HTMLElement {
  const e = item.entry;
  const total = state.items.length;
  const picked = state.picked;
  // The saved explanation's "why your pick fails" is about this original letter.
  const first = e.picked !== "correct" && e.picked !== e.correct ? e.picked : null;
  // Math (0.3.0) entries can carry the figure or table in words. Older entries have none.
  const figure = "figure" in e && typeof e.figure === "string" && e.figure.trim() ? e.figure.trim() : null;
  const choices = h("ol", { class: "choices" }, ...choiceList(e).map(({ letter, text }, i) => {
    const cls = picked ? (letter === e.correct ? "correct" : letter === picked ? "picked" : "") : "selectable";
    return h("li", { class: `choice ${cls}`.trim(), title: picked ? null : `${letter} or ${i + 1}`, onclick: () => hs.pick(letter) },
      h("span", { class: "letter", text: `${letter}.` }),
      h("span", null, t(text)),
      picked && letter === first ? h("span", { class: "tag danger", text: "first pick" }) : null);
  }));
  const kids: Kid[] = [
    head("Redo my misses", `${state.index + 1} of ${total}`, hs.quit),
    bar(state.index, total),
    h("div", { class: "row" },
      chip(ruleLabel(e.ruleId, e.ruleName), "accent"),
      e.skill ? chip(e.skill) : null,
      e.difficulty ? chip(e.difficulty) : null,
      chip(`missed ${shortDate(e.at)}`),
      item.history.length ? chip(`redone ${plural(item.history.length, "time")} before`, "warn") : null),
    e.passage ? h("div", { class: "passage" }, t(e.passage)) : null,
    e.passage && e.passage.length >= PASSAGE_CLIP && e.passage.endsWith("…") ? h("p", { class: "small muted", text: "The saved passage is cut short." }) : null,
    figure ? h("div", { class: "passage" }, h("div", { class: "small muted", text: "The figure, in words" }), t(figure)) : null,
    h("p", { class: "stem" }, t(e.stem)),
    choices,
  ];
  if (!picked) {
    kids.push(h("div", { class: "row between" },
      h("p", { class: "small muted", text: "Pick the answer you would choose now." }),
      h("button", { class: "btn link small", title: "S", onclick: () => hs.skip() }, "Skip")));
  } else {
    const right = picked === e.correct;
    const detail = right
      ? first ? `The first time you picked ${first}.` : null
      : picked === first ? `You picked ${picked} again, same as the first time.` : first ? `You picked ${picked}. The first time you picked ${first}.` : `You picked ${picked}.`;
    const left = total - state.index - 1;
    kids.push(
      h("div", { class: `banner ${right ? "good" : "danger"}`, role: "status" },
        h("p", { class: "stem", text: right ? `Right. The answer is ${e.correct}.` : `Not yet. The answer is ${e.correct}.` }),
        detail ? h("p", { class: "small", text: detail }) : null),
      h("div", { class: "rc-redo-why" },
        e.whyCorrect ? h("p", null, h("b", { text: `Why ${e.correct} is right: ` }), t(e.whyCorrect)) : null,
        e.whyPickFails ? h("p", null, h("b", { text: first ? `Why ${first} is wrong: ` : "Why your first pick is wrong: " }), t(e.whyPickFails)) : null,
        e.takeaway ? h("p", null, h("b", { text: "Takeaway: " }), t(e.takeaway)) : null),
      h("button", { class: "btn primary", title: "Enter", onclick: () => hs.next() }, left > 0 ? `Next question (${left} left)` : "See how you did"),
    );
  }
  return h("div", { class: "card rc-practice rc-redo" }, ...kids);
}

function redoSummaryView(state: RedoState, hs: PracticeHandlers, stats: RedoStats | null): HTMLElement {
  const s = redoSummary(state);
  const header = head("Redo my misses", null, hs.quit, "Close");
  const done = h("button", { class: "btn primary", title: "Enter", onclick: () => hs.quit() }, "Done");
  const allTime = stats && stats.redone
    ? h("p", { class: "small muted", text: `All time: ${plural(stats.redone, "miss", "misses")} redone, ${Math.round((stats.accuracy ?? 0) * 100)}% of answers right, ${stats.fixed} fixed, ${stats.left} left.` })
    : null;
  if (!s.total) {
    return h("div", { class: "card rc-practice" }, header,
      h("div", { class: "banner good" },
        h("p", { class: "stem", text: "No misses to redo." }),
        h("p", { class: "small", text: "Multiple-choice questions you miss show up here after you explain them." })),
      allTime,
      done);
  }
  return h("div", { class: "card rc-practice rc-pr-summary" }, header,
    h("div", { class: `banner ${s.wrong ? "warn" : "good"}` },
      h("p", { class: "stem", text: s.answered ? `Done. ${s.right} of ${s.answered} right.` : "Done. You skipped them all." }),
      h("p", { class: "small", text: "Right answers leave your redo list. Wrong and skipped ones stay for next time." })),
    h("div", { class: "row" },
      chip(`Right ${s.right}`, s.right ? "good" : ""),
      chip(`Wrong ${s.wrong}`, s.wrong ? "danger" : ""),
      s.skipped ? chip(`Skipped ${s.skipped}`) : null),
    s.missedAgain.length
      ? h("div", null, h("h2", { text: "Missed again" }), h("div", { class: "row" }, ...s.missedAgain.map((r) => chip(`${ruleLabel(r.ruleId, r.ruleName)}${r.count > 1 ? ` (${r.count})` : ""}`, "danger"))))
      : null,
    allTime,
    done);
}
