// Word bank: the Words in Context vocabulary from your own explained cards. Each word comes with its meaning
// (the first sentence of the card's "why correct"), the passage sentence it filled, and the wrong word you
// picked when you missed it. You can search the list, see your mix-ups, and export it as an Anki deck.
// The logic (collectWords, confusables, filterWords, wordsToAnkiCsv, sentenceFor, firstSentence) is pure and
// never touches the DOM; renderWordBank is the only DOM code, so tests can import this file in Node.
// Hook-in: index.ts renderBottom slot, near Progress:
//   out.push(renderWordBank(collectWords(log), { download: downloadText }));   // downloadText from export.ts
// Styles: extension/addons.css (Wave 5 section). No storage keys: the open state and the search text live in
// module variables, so they survive re-renders but reset when the panel reloads.

import { chip, h } from "./dom";
import { stamp } from "./export";
import { hasChoiceList, type LogEntry } from "./log";
import { normalizeSkill, qbFilterSteps, SKILLS } from "./taxonomy";
import { LETTERS } from "./types";

export interface WordItem {
  /** The right answer, as written on the newest card with this word. */
  word: string;
  /** The first sentence of the card's "why correct". */
  meaning: string | null;
  /** The passage sentence with the blank filled in by the word, else the start of the passage. */
  sentence: string | null;
  /** The wrong word you picked on your newest miss of this word. */
  picked: string | null;
  /** "missed" if you ever missed this word. */
  result: "right" | "missed";
  /** How many cards had this word. */
  seen: number;
  lastAt: number;
  /** Newest first. */
  attemptIds: string[];
  qbId: string | null;
  /** Every wrong word you picked for this word, newest first, repeats kept. confusables() falls back to `picked`. */
  picks?: string[];
}

export interface Confusable {
  /** The wrong word you chose. */
  picked: string;
  /** The right word. */
  word: string;
  count: number;
}

export interface WordBankHandlers {
  /** Save a file, e.g. downloadText from export.ts. */
  download(filename: string, text: string, mime: string): void;
}

const WIC = "Words in Context";
/** A Words in Context blank: four or more underscores. */
const BLANK = /_{4,}/;
const FALLBACK_CHARS = 200;
const CARD_BLANK = "_____";
/** A sentence end: . ! or ? (plus closing quotes or brackets) followed by whitespace. */
const BOUNDARY = /[.!?]+["'”’)\]]*(?=\s)/g;
/** A period that ends a title or an initial, not a sentence: "Dr. Ortiz", "J. Lee", "e.g. this". */
const ABBREV = /(?:^|[^A-Za-z])(?:Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr|Mt|vs|[A-Za-z])\.$/;

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The word as a whole word or phrase, any case. */
const wordPattern = (word: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(word)}(?![\\p{L}\\p{N}])`, "giu");
const csvCell = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** The sentence of `text` that covers characters [from, to), using simple sentence boundaries. */
function sentenceAt(text: string, from: number, to: number): string {
  let start = 0;
  let end = text.length;
  const re = new RegExp(BOUNDARY.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[0] === "." && ABBREV.test(text.slice(Math.max(0, m.index - 8), m.index + 1))) continue;
    const stop = m.index + m[0].length;
    if (stop <= from) start = stop;
    else if (m.index >= to) {
      end = stop;
      break;
    }
  }
  return squash(text.slice(start, end));
}

/** The first sentence of a text, or null when it is empty. */
export function firstSentence(text: string | null | undefined): string | null {
  const t = squash(text ?? "");
  return t ? sentenceAt(t, 0, 0) || null : null;
}

/**
 * The passage sentence that holds the blank, with the blank replaced by `word`. Without a blank: the first
 * 200 characters of the passage. Without a passage: null.
 */
export function sentenceFor(passage: string | null | undefined, word: string): string | null {
  const text = squash(passage ?? "");
  if (!text) return null;
  const m = BLANK.exec(text);
  if (!m) return clip(text, FALLBACK_CHARS);
  return sentenceAt(text, m.index, m.index + m[0].length).replace(BLANK, () => word);
}

/** One card's word, or null when it isn't a multiple-choice Words in Context card. */
function wordOf(e: LogEntry): (Omit<WordItem, "seen" | "attemptIds" | "picks" | "lastAt"> & { at: number }) | null {
  if (normalizeSkill(e.skill) !== WIC || !hasChoiceList(e) || !LETTERS.includes(e.correct)) return null;
  const word = e.choices[e.correct].trim();
  if (!word) return null;
  const missed = e.result === "missed";
  const letter = missed && e.picked !== "correct" && LETTERS.includes(e.picked) ? e.picked : null;
  const pickedWord = letter ? e.choices[letter].trim() : "";
  return {
    word,
    meaning: firstSentence(e.whyCorrect),
    sentence: sentenceFor(e.passage, word),
    picked: pickedWord && pickedWord.toLowerCase() !== word.toLowerCase() ? pickedWord : null,
    result: missed ? "missed" : "right",
    qbId: e.qbId ?? null,
    at: e.at,
  };
}

/**
 * Every Words in Context word from the log, newest first, one item per word (case-insensitive). The newest
 * card supplies the word, meaning, sentence and qbId (older cards fill a missing meaning or sentence);
 * `picked` comes from the newest miss; `result` is "missed" if any card was missed.
 */
export function collectWords(log: LogEntry[]): WordItem[] {
  type Acc = WordItem & { picks: string[] };
  const byWord = new Map<string, Acc>();
  const ids = new Set<string>();
  for (const e of [...log].sort((a, b) => b.at - a.at)) {
    if (ids.has(e.attemptId)) continue;
    const w = wordOf(e);
    if (!w) continue;
    ids.add(e.attemptId);
    const key = w.word.toLowerCase();
    const hit = byWord.get(key);
    if (!hit) {
      byWord.set(key, {
        word: w.word,
        meaning: w.meaning,
        sentence: w.sentence,
        picked: w.picked,
        result: w.result,
        seen: 1,
        lastAt: w.at,
        attemptIds: [e.attemptId],
        qbId: w.qbId,
        picks: w.picked ? [w.picked] : [],
      });
      continue;
    }
    hit.seen++;
    hit.attemptIds.push(e.attemptId);
    if (w.result === "missed") hit.result = "missed";
    if (w.picked) {
      hit.picks.push(w.picked);
      hit.picked ??= w.picked;
    }
    hit.meaning ??= w.meaning;
    hit.sentence ??= w.sentence;
    hit.qbId ??= w.qbId;
  }
  return [...byWord.values()];
}

/** The wrong word you chose next to the right one, most frequent first (then most recent). */
export function confusables(words: WordItem[]): Confusable[] {
  const pairs = new Map<string, Confusable & { lastAt: number }>();
  for (const w of words) {
    const picks = w.picks?.length ? w.picks : w.picked ? [w.picked] : [];
    for (const p of picks) {
      const key = `${p.toLowerCase()}\u0000${w.word.toLowerCase()}`;
      const hit = pairs.get(key);
      if (hit) hit.count++;
      else pairs.set(key, { picked: p, word: w.word, count: 1, lastAt: w.lastAt });
    }
  }
  return [...pairs.values()]
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
    .map(({ picked, word, count }) => ({ picked, word, count }));
}

/** Case-insensitive search on the word, meaning or sentence. An empty query returns every word. */
export function filterWords(words: WordItem[], query: string): WordItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return words.slice();
  return words.filter((w) => [w.word, w.meaning, w.sentence].some((s) => !!s && s.toLowerCase().includes(q)));
}

/** The sentence with every whole-word copy of `word` replaced by "_____". */
export function blankOut(sentence: string, word: string): string {
  return word.trim() ? sentence.replace(wordPattern(word.trim()), CARD_BLANK) : sentence;
}

/**
 * Anki "Basic" note CSV. Front: the sentence with the word blanked out, or the word itself when there is no
 * sentence with the word in it. Back: "word : meaning". Tags: rulecard, words_in_context, missed.
 * Import with File > Import; the header lines set comma, plain text and the tag column.
 */
export function wordsToAnkiCsv(words: WordItem[]): string {
  const rows = ["#separator:comma", "#html:false", "#columns:Front,Back,Tags", "#tags column:3"];
  for (const w of words) {
    const word = w.word.trim();
    const front = w.sentence && word && wordPattern(word).test(w.sentence) ? blankOut(w.sentence, word) : word;
    const back = w.meaning ? `${word} : ${w.meaning}` : word;
    const tags = ["rulecard", "words_in_context", w.result === "missed" ? "missed" : ""].filter(Boolean).join(" ");
    rows.push([front, back, tags].map(csvCell).join(","));
  }
  return rows.join("\n") + "\n";
}

// ---------------------------------------------------------------- DOM

let bankOpen = false;
let bankQuery = "";
const PAGE = 30;

/** The sentence with the word in bold. */
function withWord(sentence: string, word: string): (Node | string)[] {
  if (!word.trim()) return [sentence];
  const re = wordPattern(word.trim());
  const out: (Node | string)[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sentence))) {
    if (m.index > last) out.push(sentence.slice(last, m.index));
    out.push(h("b", { text: m[0] }));
    last = m.index + m[0].length;
  }
  if (last < sentence.length) out.push(sentence.slice(last));
  return out;
}

function wordRow(w: WordItem): HTMLElement {
  return h("li", { class: `rc-vocab-item${w.result === "missed" ? " rc-vocab-missed" : ""}` },
    h("div", { class: "rc-vocab-head" },
      h("b", { class: "rc-vocab-word", text: w.word }),
      w.result === "missed" ? chip("Missed", "warn") : null,
      w.picked ? h("span", { class: "small muted", text: `you picked ${w.picked}` }) : null,
      w.seen > 1 ? h("span", { class: "small muted", text: `seen ${w.seen} times` }) : null),
    w.meaning ? h("div", { class: "small rc-vocab-meaning", text: w.meaning }) : null,
    w.sentence ? h("div", { class: "small muted rc-vocab-sentence" }, ...withWord(w.sentence, w.word)) : null);
}

const mixText = (c: Confusable) => `"${c.picked}" instead of "${c.word}"${c.count > 1 ? ` (${c.count} times)` : ""}`;

/** The "Word bank" card: a collapsed details element with search, the word list, mix-ups and Anki export. */
export function renderWordBank(words: WordItem[], handlers: WordBankHandlers): HTMLElement {
  const missed = words.filter((w) => w.result === "missed").length;
  const count = `${words.length} ${words.length === 1 ? "word" : "words"}${missed ? `, ${missed} missed` : ""}`;
  const card = h("details", {
    class: "card rc-vocab-card",
    open: bankOpen ? "" : null,
    ontoggle: (ev: Event) => { bankOpen = (ev.target as HTMLDetailsElement).open; },
  },
    h("summary", null, h("h2", { text: "Word bank" }), h("span", { class: "small muted", text: count })));

  if (!words.length) {
    const wic = SKILLS.find((s) => s.skill === WIC);
    card.append(h("p", { class: "small rc-vocab-empty", text: "No Words in Context cards yet. Explain one and its word, meaning and sentence land here, ready to review or send to Anki." }));
    if (wic) card.append(h("p", { class: "small muted", text: qbFilterSteps(wic) }));
    return card;
  }

  let limit = PAGE;
  const status = h("p", { class: "small muted rc-vocab-status", "aria-live": "polite" });
  const list = h("ul", { class: "rc-vocab-list" });
  const more = h("button", { type: "button", class: "btn small rc-vocab-more", onclick: () => { limit += PAGE; paint(); } });
  const paint = () => {
    const hits = filterWords(words, bankQuery);
    const q = bankQuery.trim();
    list.replaceChildren(...hits.slice(0, limit).map(wordRow));
    status.textContent = !q ? "" : hits.length ? `${hits.length} of ${words.length} match.` : `No words match "${q}".`;
    status.hidden = !q;
    more.textContent = `Show more (${Math.max(0, hits.length - limit)})`;
    more.hidden = hits.length <= limit;
  };
  const search = h("input", {
    type: "search",
    // An id lets the side panel keep focus and the text across a re-render (a toast, say).
    id: "rc-vocab-search",
    class: "input rc-vocab-search",
    placeholder: "Search words, meanings, sentences",
    "aria-label": "Search your words",
    value: bankQuery,
    oninput: (ev: Event) => {
      bankQuery = (ev.target as HTMLInputElement).value;
      limit = PAGE;
      paint();
    },
  });
  const mix = confusables(words).slice(0, 5);
  card.append(search, status, list, more);
  if (mix.length) card.append(h("p", { class: "small rc-vocab-mixups" }, h("b", { text: "Mix-ups: " }), `${mix.map(mixText).join("; ")}.`));
  card.append(h("div", { class: "row rc-vocab-actions" },
    h("button", {
      type: "button",
      class: "btn small",
      text: "Export to Anki (.csv)",
      title: "In Anki, use File > Import and pick this file.",
      onclick: () => handlers.download(`rulecard-words-${stamp()}.csv`, wordsToAnkiCsv(words), "text/csv"),
    })));
  paint();
  return card;
}
