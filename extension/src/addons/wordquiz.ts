// Quiz me on my words: a short offline vocabulary quiz built from the student's own Word bank, the Words in
// Context words of their explained cards (collectWords in vocab.ts). A question shows either the passage
// sentence with the word blanked out ("blank") or the card's meaning with the word blanked out ("meaning"),
// and the student picks the word from four. The wrong choices are their own past wrong picks for that word
// first (their real traps), then other words from their bank with a similar shape. Missed words are asked
// first, then words with a poor record in past word quizzes, then the ones quizzed longest ago. A small
// per-word record is kept on the device. No AI call and no network.
//
// Pure logic plus storage, no DOM; `now` and `seed` are passed in. Screens: wordquiz-ui.ts. Styles:
// extension/wordquiz.css (link it next to addons.css in sidepanel.html, or fold it into addons.css).
//
// Hook it in (controller, index.ts). Keep `wordQuiz: WordQuizState | null` and `wordQuizN: number` in state.
//   entry:   renderBottom. Best inside the Word bank card: give renderWordBank (vocab.ts) a new optional
//            handler such as `footer?(): Node | null` and append what it returns to the open card. Until
//            then, push it right after the Word bank card, wrapped in h("div", { class: "card" }, ...).
//            Hide it while a word quiz is open.
//              renderWordQuizEntry(wordQuizAvailability(collectWords(s.log)), { start: (n) => void startWordQuiz(n) })
//            startWordQuiz(n): wordQuizN = n; const record = await readWordRecord();
//              setWordQuiz(createWordQuiz(collectWords(s.log), record, { now: Date.now(), n })); scrollTop().
//   running: renderAboveCapture. While a word quiz is open it REPLACES the other cards in that slot, like the
//            Question Bank quiz: renderWordQuiz(state, { pick, next, quit }) until isWordQuizFinished(state),
//            then renderWordQuizResult(wordQuizSummary(state), { again, done }).
//              pick(l) -> answerWord(state, l, Date.now());   next -> nextWord(state, Date.now());
//              quit -> finishWordQuiz(state, Date.now()) when wordQuizProgress(state).answered, else close (null).
//              again -> startWordQuiz(wordQuizN) (a fresh seed, the record re-read);   done -> close (null).
//   save:    when a state first turns finished: void saveWordResults(state, Date.now()). It runs through this
//            module's queue and is idempotent (an answer already in the record is not counted again), so a
//            second call for the same quiz is harmless.
//   keys:    hotkeyActions(): while the word quiz is on screen return { raw: pressWordQuizKey, help: toggleHelp }.
//            pressWordQuizKey(key): "Escape" quits. wordQuizKey(key) gives "A".."D" (answer; ignore once
//            answered) or "next" (go on; ignore before an answer; on the results screen Enter is Done and
//            Space keeps scrolling). Return true when the key was used. installHotkeys already skips
//            modifier keys and text boxes.
//   also:    count the open word quiz in isPracticing().
//
// Storage: WORDQUIZ_KEY = "rc.addons.wordquiz.v1" -> Record<lowercased word, { right, wrong, lastAt }>.
// The quiz in progress lives in memory only, so closing the panel drops it.

import { mulberry32, shuffled } from "./qbquiz";
import { kv } from "./store";
import { LETTERS, type Letter } from "./types";
import type { WordItem } from "./vocab";

export type WordQuizKind = "blank" | "meaning";

export interface WordQuestion {
  /** The right word, as written in the Word bank. */
  word: string;
  kind: WordQuizKind;
  /** What the student reads: the sentence ("blank") or the meaning ("meaning") with the word as BLANK. */
  prompt: string;
  /** Four different words (case-insensitive), one of them `word`. */
  choices: Record<Letter, string>;
  correct: Letter;
  /** The passage sentence with the word in it, for the feedback. Null when the bank has none. */
  sentence: string | null;
  /** The card's meaning, a "Choice B is the best answer because" lead-in removed. For the feedback. */
  meaning: string | null;
}

export interface WordAnswer {
  picked: Letter;
  correct: boolean;
  /** When it was answered. */
  at: number;
}

export interface WordQuizState {
  id: string;
  /** In the order they are asked. */
  questions: WordQuestion[];
  /** Position of the question on screen. Equals questions.length once the last one is done. */
  index: number;
  /** Keyed by position in `questions`. */
  answers: Record<number, WordAnswer>;
  startedAt: number;
  finishedAt: number | null;
}

export interface CreateWordQuizOptions {
  now: number;
  /** Seed for the picks, the kinds and the order. Defaults to `now`. */
  seed?: number;
  /** Ask at most this many words. Default 10. */
  n?: number | null;
}

export interface PickWordsOptions {
  seed: number;
  /** Default 10. */
  n?: number | null;
}

export interface WordQuizAvailability {
  /** How many words can be asked. 0 when there is no quiz. */
  available: number;
  /** Why there is no quiz, else null. */
  reason: string | null;
}

export interface WordQuizProgress {
  /** 1-based number of the word on screen ("3" in "3 of 10"). */
  number: number;
  total: number;
  answered: number;
  /** Words after this one. */
  left: number;
}

export interface WordMiss {
  word: string;
  /** The word the student picked. */
  picked: string;
  meaning: string | null;
  sentence: string | null;
}

export interface WordQuizSummary {
  /** Questions in the quiz. */
  total: number;
  answered: number;
  right: number;
  wrong: number;
  /** right / answered, 0..1. Null when nothing was answered. */
  accuracy: number | null;
  /** In the order asked. */
  misses: WordMiss[];
}

export interface WordRecordEntry {
  right: number;
  wrong: number;
  /** When the word was last quizzed. */
  lastAt: number;
}

/** Keyed by wordKey(word): lowercase, single spaces. */
export type WordRecord = Record<string, WordRecordEntry>;

export const WORDQUIZ_KEY = "rc.addons.wordquiz.v1";
export const BLANK = "______";
/** Distinct words needed for four choices. */
export const MIN_WORDS = 4;
export const DEFAULT_WORDS = 10;
const QUIZ_SIZES = [5, 10] as const;

// ---------------------------------------------------------------- text

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isText = (x: unknown): x is string => typeof x === "string";

/** The form used for record keys and for comparing words: lowercase, single spaces. */
export const wordKey = (word: string): string => squash(isText(word) ? word : "").toLowerCase();

/** The word or phrase as a whole word, any case. Spaces in a phrase match any run of whitespace. */
function wordPattern(word: string): RegExp | null {
  const parts = squash(isText(word) ? word : "").split(" ").filter(Boolean).map(escapeRe);
  return parts.length ? new RegExp(`(?<![\\p{L}\\p{N}])${parts.join("\\s+")}(?![\\p{L}\\p{N}])`, "giu") : null;
}

const contains = (text: string | null | undefined, word: string): boolean => {
  const re = wordPattern(word);
  return !!text && !!re && re.test(text);
};

const QUOTE_PAIRS: Record<string, string> = { '"': '"', "\u201C": "\u201D", "'": "'", "\u2018": "\u2019" };
/** A quoted blank with a stray space inside, `" ______ "`, standing on its own (not `"yes" ______ "no"`). */
const LOOSE_QUOTED = new RegExp(`(^|[\\s(\\[])(["\u201C'\u2018]) ?${BLANK} ?(["\u201D'\u2019])(?=$|[\\s.,;:!?)\\]])`, "g");

/**
 * `text` with every whole-word copy of `word` (any case) replaced by "______". Quotes around the word stay
 * and hug the blank: `"Lukewarm" means ...` becomes `"______" means ...`. Whitespace is tidied.
 */
export function blankWord(text: string, word: string): string {
  const t = squash(isText(text) ? text : "");
  const re = wordPattern(word);
  if (!re) return t;
  return t.replace(re, BLANK).replace(LOOSE_QUOTED, (m, pre: string, open: string, close: string) =>
    QUOTE_PAIRS[open] === close ? `${pre}${open}${BLANK}${close}` : m);
}

/** `text` cut into pieces, `hit` where the word is (whole word, any case). For showing the word in bold. */
export function markWord(text: string, word: string): { text: string; hit: boolean }[] {
  const re = wordPattern(word);
  if (!isText(text) || !text) return [];
  if (!re) return [{ text, hit: false }];
  const out: { text: string; hit: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), hit: false });
    out.push({ text: m[0], hit: true });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out;
}

/** "Choice B is the best answer because", "The correct answer is B:" and the like. The letters differ in the quiz. */
const LEAD_IN = new RegExp(
  "^(?:(?:choice|option|answer)\\s+)?\\(?[A-D]\\)?\\s+is\\s+(?:the\\s+)?(?:best|correct|right|most\\s+logical(?:\\s+and\\s+precise)?)" +
  "(?:\\s+(?:answer|choice|option))?(?:\\s+(?:because|since|as))?\\s*[,:;.\\-\u2013\u2014]?(?:\\s+|$)" +
  "|^the\\s+(?:best|correct|right)\\s+(?:answer|choice)\\s+is\\s+(?:choice\\s+)?\\(?[A-D]\\)?(?:\\s+(?:because|since|as))?\\s*[,:;.\\-\u2013\u2014]?(?:\\s+|$)",
  "i",
);

/** The meaning without a lead-in that names a letter. Null when nothing else is left. */
export function cleanMeaning(meaning: string | null | undefined): string | null {
  const t = squash(isText(meaning) ? meaning : "");
  if (!t) return null;
  const rest = t.replace(LEAD_IN, "");
  if (rest === t) return t;
  if (!/[\p{L}\p{N}]/u.test(rest)) return null;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** True when the prompt still gives the word away through another form of it ("tempering" for "tempered"). */
function leaks(prompt: string, word: string): boolean {
  const w = wordKey(word);
  if (w.includes(" ") || w.length < 5) return false;
  const stem = w.slice(0, Math.max(4, Math.ceil(w.length * 0.7)));
  return (prompt.toLowerCase().match(/\p{L}+/gu) ?? []).some((t) => t.startsWith(stem));
}

const sentenceOf = (w: WordItem): string | null => {
  const s = squash(isText(w.sentence) ? w.sentence : "");
  return s && contains(s, w.word) ? s : null;
};

function sentencePrompt(w: WordItem): string | null {
  const s = sentenceOf(w);
  if (!s) return null;
  const p = blankWord(s, w.word);
  return leaks(p, w.word) ? null : p;
}

function meaningPrompt(w: WordItem): string | null {
  const m = cleanMeaning(w.meaning);
  if (!m) return null;
  const p = blankWord(m, w.word);
  const words = p.split(BLANK).join(" ").match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length >= 2 && !leaks(p, w.word) ? p : null;
}

/**
 * The kinds of question a word can be asked as, "blank" first. "blank" needs a sentence that contains the
 * word; "meaning" needs a meaning that still says something once the word is blanked out. Either kind is
 * dropped when the prompt would give the word away through another form of it.
 */
export function wordQuestionKinds(w: WordItem): WordQuizKind[] {
  if (!w || !wordKey(w.word)) return [];
  const out: WordQuizKind[] = [];
  if (sentencePrompt(w) !== null) out.push("blank");
  if (meaningPrompt(w) !== null) out.push("meaning");
  return out;
}

// ---------------------------------------------------------------- seeds

function hashText(s: string): number {
  let x = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 0x01000193);
  return x >>> 0;
}
const mix = (seed: number, salt: number) => (seed ^ Math.imul(salt >>> 0, 0x9e3779b1)) >>> 0;
/** A seeded tie-breaker for a word that doesn't depend on where the word sits in the list. */
const tieKey = (seed: number, text: string) => mulberry32(mix(seed, hashText(text)))();
const toSeed = (seed: number | undefined, fallback: number) =>
  (Number.isFinite(seed) ? (seed as number) : Number.isFinite(fallback) ? fallback : 0) >>> 0;
const sizeOf = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_WORDS;
const cmp = (a: number, b: number) => (a < b ? -1 : a > b ? 1 : 0);

// ---------------------------------------------------------------- bank

/** One item per word (case-insensitive, first copy wins), empty words dropped. */
function distinctWords(words: readonly WordItem[] | null | undefined): WordItem[] {
  const seen = new Set<string>();
  const out: WordItem[] = [];
  for (const w of Array.isArray(words) ? words : []) {
    const k = w ? wordKey(w.word) : "";
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(w);
  }
  return out;
}

/** Whether there is enough for a quiz. Fewer than 4 distinct words: no quiz, and the reason says how many more. */
export function wordQuizAvailability(words: readonly WordItem[]): WordQuizAvailability {
  const bank = distinctWords(words);
  if (bank.length < MIN_WORDS) {
    const need = MIN_WORDS - bank.length;
    const what = `Words in Context ${need === 1 ? "card" : "cards"}`;
    return { available: 0, reason: `Add ${need}${bank.length ? " more" : ""} ${what} to unlock the word quiz.` };
  }
  const available = bank.filter((w) => wordQuestionKinds(w).length > 0).length;
  return available
    ? { available, reason: null }
    : { available: 0, reason: "Your words need a sentence or a meaning before you can be quizzed on them." };
}

/** Quiz lengths to offer: 5 and 10, capped by what is available, no repeats. Empty when nothing is. */
export function wordQuizSizes(available: number): number[] {
  const max = Number.isFinite(available) ? Math.max(0, Math.floor(available)) : 0;
  return [...new Set(QUIZ_SIZES.map((n) => Math.min(n, max)))].filter((n) => n > 0);
}

// ---------------------------------------------------------------- choosing words

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

function cleanEntry(x: unknown): WordRecordEntry | null {
  if (!isObj(x) || !isNum(x.right) || !isNum(x.wrong) || !isNum(x.lastAt) || x.right < 0 || x.wrong < 0) return null;
  return { right: Math.floor(x.right), wrong: Math.floor(x.wrong), lastAt: x.lastAt };
}

const entryOf = (record: WordRecord | null | undefined, key: string): WordRecordEntry | null =>
  isObj(record) && Object.prototype.hasOwnProperty.call(record, key) ? cleanEntry(record[key]) : null;

/**
 * Up to n words to ask (default 10), most needed first: missed words, then the worst record in past word
 * quizzes (more wrong answers than right ones), then the least recently quizzed (never quizzed first), then
 * the rest. Ties are broken by the seed. Only words that can be asked (wordQuestionKinds) are picked.
 */
export function pickWords(words: readonly WordItem[], record: WordRecord | null | undefined, opts: PickWordsOptions): WordItem[] {
  const seed = toSeed(opts.seed, 0);
  const rows = distinctWords(words).filter((w) => wordQuestionKinds(w).length > 0).map((w) => {
    const key = wordKey(w.word);
    const r = entryOf(record, key);
    return {
      w,
      missed: w.result === "missed" ? 1 : 0,
      bad: r ? Math.max(0, r.wrong - r.right) : 0,
      last: r ? r.lastAt : Number.NEGATIVE_INFINITY,
      tie: tieKey(seed, key),
    };
  });
  rows.sort((a, b) => b.missed - a.missed || b.bad - a.bad || cmp(a.last, b.last) || cmp(a.tie, b.tie));
  return rows.slice(0, sizeOf(opts.n)).map((r) => r.w);
}

// ---------------------------------------------------------------- choices

/** Endings that give a word its shape. Groups share a shape (-tion/-sion). Longer ones are checked first. */
const ENDINGS: readonly (readonly string[])[] = [
  ["tion", "sion"], ["ness"], ["ment"], ["able", "ible"], ["less"], ["ous"], ["ive"], ["ing"], ["ful"], ["ity"],
  ["ize", "ise"], ["ate"], ["ent", "ant"], ["est"], ["ly"], ["ed"], ["al"], ["ic"], ["er"],
];

function ending(word: string): number {
  const last = wordKey(word).split(" ").pop() ?? "";
  return ENDINGS.findIndex((group) => group.some((sfx) => last.length >= sfx.length + 2 && last.endsWith(sfx)));
}

/** How alike two words look: the same number of words (2), the same ending (2), lengths within 2 (1). */
function shapeScore(answer: string, other: string): number {
  const a = wordKey(answer);
  const b = wordKey(other);
  const e = ending(a);
  return (a.split(" ").length === b.split(" ").length ? 2 : 0) + (e >= 0 && e === ending(b) ? 2 : 0) + (Math.abs(a.length - b.length) <= 2 ? 1 : 0);
}

/** One word explains the other ("frank" in the meaning of "candid"), so it might fit the blank too. */
const related = (a: WordItem, b: WordItem) => contains(a.meaning, b.word) || contains(b.meaning, a.word);

/** The student's own wrong picks for the word: `picks` (most often first, then newest), then `picked`. */
function ownPicks(w: WordItem): string[] {
  const tally = new Map<string, { text: string; count: number; first: number }>();
  const add = (p: unknown, weight: number) => {
    if (!isText(p) || !wordKey(p)) return;
    const hit = tally.get(wordKey(p));
    if (hit) hit.count += weight;
    else tally.set(wordKey(p), { text: squash(p), count: weight, first: tally.size });
  };
  for (const p of Array.isArray(w.picks) ? w.picks : []) add(p, 1);
  add(w.picked, 0);
  return [...tally.values()].sort((a, b) => b.count - a.count || a.first - b.first).map((t) => t.text);
}

/**
 * Three wrong choices for a word, best first: the student's own wrong picks for it, then other words from
 * the bank, most alike in shape first (words used to explain the word, or explained by it, go last). Never
 * the word itself, no repeats (case-insensitive). Ties are broken by the seed.
 */
export function pickDistractors(item: WordItem, words: readonly WordItem[], seed: number, count = 3): string[] {
  const taken = new Set<string>([wordKey(item.word)]);
  const out: string[] = [];
  const add = (text: string) => {
    const k = wordKey(text);
    if (out.length >= count || !k || taken.has(k)) return;
    taken.add(k);
    out.push(squash(text));
  };
  for (const p of ownPicks(item)) add(p);
  if (out.length >= count) return out;
  const s = toSeed(seed, 0);
  distinctWords(words)
    .filter((w) => !taken.has(wordKey(w.word)))
    .map((w) => ({ text: w.word, score: shapeScore(item.word, w.word) - (related(item, w) ? 10 : 0), tie: tieKey(s, wordKey(w.word)) }))
    .sort((a, b) => b.score - a.score || cmp(a.tie, b.tie))
    .forEach((o) => add(o.text));
  return out;
}

const isUpper = (ch: string) => ch !== ch.toLowerCase();
const isLower = (ch: string) => ch !== ch.toUpperCase();

/** Match the answer's first-letter case so a capital doesn't give it away ("Brisk" among "sparse", "candid"). */
function matchCase(option: string, answer: string): string {
  const a = answer.charAt(0);
  const o = option.charAt(0);
  if (isUpper(a) && isLower(o)) return o.toUpperCase() + option.slice(1);
  const rest = option.slice(1);
  if (isLower(a) && isUpper(o) && rest && rest === rest.toLowerCase()) return o.toLowerCase() + rest;
  return option;
}

/** Kinds in ask order: a word that fits both gets "meaning" about one time in three, so "blank" leads. */
function assignKinds(items: readonly WordItem[], seed: number): WordQuizKind[] {
  const phase = seed % 3;
  let meanings = 0;
  return items.map((w, i) => {
    const kinds = wordQuestionKinds(w);
    const kind: WordQuizKind = kinds.length === 1 ? kinds[0]! : (meanings + 1) * 3 <= i + phase ? "meaning" : "blank";
    if (kind === "meaning") meanings++;
    return kind;
  });
}

function buildQuestion(item: WordItem, kind: WordQuizKind, bank: readonly WordItem[], seed: number): WordQuestion | null {
  const word = squash(item.word);
  const prompt = kind === "blank" ? sentencePrompt(item) : meaningPrompt(item);
  if (!prompt) return null;
  const salt = hashText(wordKey(word));
  const wrong = pickDistractors(item, bank, mix(seed, salt));
  if (wrong.length < 3) return null;
  const options = shuffled([word, ...wrong.slice(0, 3)], mix(seed, salt + 1));
  const at = options.indexOf(word);
  const shown = options.map((o, i) => (i === at ? o : matchCase(o, word)));
  return {
    word,
    kind,
    prompt,
    choices: { A: shown[0]!, B: shown[1]!, C: shown[2]!, D: shown[3]! },
    correct: LETTERS[at]!,
    sentence: sentenceOf(item),
    meaning: cleanMeaning(item.meaning),
  };
}

// ---------------------------------------------------------------- quiz flow

/** A new quiz of up to n words (default 10) in a seeded order. With too few words it is finished at once. */
export function createWordQuiz(words: readonly WordItem[], record: WordRecord | null | undefined, opts: CreateWordQuizOptions): WordQuizState {
  const now = opts.now;
  const seed = toSeed(opts.seed, now);
  const bank = distinctWords(words);
  const chosen = bank.length >= MIN_WORDS ? pickWords(bank, record, { seed, n: opts.n }) : [];
  const ask = shuffled(chosen, seed);
  const kinds = assignKinds(ask, seed);
  const questions = ask
    .map((w, i) => buildQuestion(w, kinds[i]!, bank, seed))
    .filter((q): q is WordQuestion => q !== null);
  return {
    id: `wq-${Math.round(now).toString(36)}-${seed.toString(36)}`,
    questions,
    index: 0,
    answers: {},
    startedAt: now,
    finishedAt: questions.length ? null : now,
  };
}

export const isWordQuizFinished = (s: WordQuizState): boolean => s.finishedAt !== null;

/** Position of the question on screen, or null when finished. */
function onScreen(s: WordQuizState): number | null {
  if (isWordQuizFinished(s)) return null;
  return s.index >= 0 && s.index < s.questions.length ? s.index : null;
}

/** The question on screen, or null when the quiz is finished. */
export function currentWord(s: WordQuizState): WordQuestion | null {
  const i = onScreen(s);
  return i === null ? null : s.questions[i] ?? null;
}

/** The answer to the question on screen, if it has one yet. */
export function currentWordAnswer(s: WordQuizState): WordAnswer | null {
  const i = onScreen(s);
  return i === null ? null : s.answers[i] ?? null;
}

export function wordQuizProgress(s: WordQuizState): WordQuizProgress {
  const total = s.questions.length;
  return {
    number: Math.min(s.index + 1, total),
    total,
    answered: s.questions.filter((_, i) => s.answers[i]).length,
    left: Math.max(0, total - s.index - 1),
  };
}

/** Grade a pick. A second answer to the same question is ignored (the same state comes back). */
export function answerWord(s: WordQuizState, letter: Letter, now: number): WordQuizState {
  const i = onScreen(s);
  if (i === null || s.answers[i] || !LETTERS.includes(letter)) return s;
  const q = s.questions[i]!;
  return { ...s, answers: { ...s.answers, [i]: { picked: letter, correct: letter === q.correct, at: now } } };
}

/** Move on once the question on screen is answered (no-op before that). After the last one, finishes. */
export function nextWord(s: WordQuizState, now: number): WordQuizState {
  const i = onScreen(s);
  if (i === null || !s.answers[i]) return s;
  return i >= s.questions.length - 1 ? { ...s, index: s.questions.length, finishedAt: now } : { ...s, index: i + 1 };
}

/** End now (for example on Quit). Unanswered questions stay unanswered. */
export function finishWordQuiz(s: WordQuizState, now: number): WordQuizState {
  return isWordQuizFinished(s) ? s : { ...s, finishedAt: now };
}

export function wordQuizSummary(s: WordQuizState): WordQuizSummary {
  let answered = 0;
  let right = 0;
  const misses: WordMiss[] = [];
  s.questions.forEach((q, i) => {
    const a = s.answers[i];
    if (!a) return;
    answered++;
    if (a.correct) right++;
    else misses.push({ word: q.word, picked: q.choices[a.picked], meaning: q.meaning, sentence: q.sentence });
  });
  return { total: s.questions.length, answered, right, wrong: answered - right, accuracy: answered ? right / answered : null, misses };
}

// ---------------------------------------------------------------- hotkeys

const KEY_LETTERS: Record<string, Letter> = { a: "A", b: "B", c: "C", d: "D", "1": "A", "2": "B", "3": "C", "4": "D" };

/** Suggested hotkeys while a word is on screen: 1-4 and A-D pick, Enter and Space go on. Pure. */
export function wordQuizKey(key: string): Letter | "next" | null {
  if (key === "Enter" || key === " ") return "next";
  return isText(key) && key.length === 1 ? KEY_LETTERS[key.toLowerCase()] ?? null : null;
}

// ---------------------------------------------------------------- record

/** A valid record from anything: keys normalized (copies that differ only in case are merged), bad rows dropped. */
export function cleanWordRecord(raw: unknown): WordRecord {
  const out: WordRecord = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const key = wordKey(k);
    const e = cleanEntry(v);
    if (!key || key === "__proto__" || !e) continue;
    const prev = out[key];
    out[key] = prev ? { right: prev.right + e.right, wrong: prev.wrong + e.wrong, lastAt: Math.max(prev.lastAt, e.lastAt) } : e;
  }
  return out;
}

/**
 * The record with this quiz's answers added: right or wrong +1 and lastAt for every answered word.
 * Unanswered words are left alone. An answer no newer than the word's lastAt is already counted (the same
 * quiz saved twice) and is skipped. Pure: the input record is not changed.
 */
export function applyWordResults(record: WordRecord | null | undefined, state: WordQuizState, now: number): WordRecord {
  const out = cleanWordRecord(record);
  state.questions.forEach((q, i) => {
    const a = state.answers[i];
    const key = wordKey(q.word);
    if (!a || !key || key === "__proto__") return;
    const at = isNum(a.at) ? a.at : now;
    const prev = out[key];
    if (prev && prev.lastAt >= at) return;
    out[key] = {
      right: (prev?.right ?? 0) + (a.correct ? 1 : 0),
      wrong: (prev?.wrong ?? 0) + (a.correct ? 0 : 1),
      lastAt: isNum(now) ? Math.max(now, at) : at,
    };
  });
  return out;
}

// Every public read and write goes through one queue, so unawaited calls can't overwrite each other.
let tail: Promise<unknown> = Promise.resolve();
function queued<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.catch(() => undefined);
  return run;
}

const rawRead = async (): Promise<WordRecord> => cleanWordRecord(await kv().get<unknown>(WORDQUIZ_KEY));
async function rawWrite(record: WordRecord): Promise<WordRecord> {
  const clean = cleanWordRecord(record);
  await kv().set(WORDQUIZ_KEY, clean);
  return clean;
}

export const readWordRecord = (): Promise<WordRecord> => queued(rawRead);
export const writeWordRecord = (record: WordRecord): Promise<WordRecord> => queued(() => rawWrite(record));

/** Add a quiz's answers to the stored record (applyWordResults) and return the new record. */
export const saveWordResults = (state: WordQuizState, now: number): Promise<WordRecord> =>
  queued(async () => {
    const record = await rawRead();
    return state.questions.some((_, i) => state.answers[i]) ? rawWrite(applyWordResults(record, state, now)) : record;
  });
