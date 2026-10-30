// Practice a Question Bank export offline. The student pastes the text of an exported SAT Question
// Bank PDF (open it, select all, copy, paste). This module turns it into a quiz that is graded with the
// export's own answer key, times each question, sums up the results (score, pace, weakest skills,
// misses) and keeps the quiz and a short history on the device. No AI call and no network: the only
// call happens when the student asks Rulecard to explain a miss.
//
// Pure logic plus storage, no DOM. The screens are in qbquiz-ui.ts, the CSS in extension/addons.css (Wave 5 section).
//
// Hook it in (controller, index.ts):
//   entry:   in renderAboveCapture, show renderQuizEntry({ text, preview, last: history[0] }, ...) while no
//            quiz is active. input(text): keep `parsed = parseExport(text)` and return previewOf(parsed), so
//            the card updates in place and the text box keeps focus. start({ shuffle, limit }):
//            createQuiz(parsed.questions, { now: Date.now(), shuffle, limit }), then saveActive(state).
//   running: while a quiz is active it REPLACES the other cards in that slot: renderQuiz(state, ...) until
//            isFinished(state), then renderQuizResult(quizSummary(state), ...).
//            pick -> answerQuiz(state, letter, Date.now()); next -> nextQuiz(...); skip -> skipQuiz(...);
//            quit -> finishQuiz(...) when something was answered (shows results), else saveActive(null).
//            After every change: saveActive(state). Once finished: recordResult(state).
//            Results: retry -> saveActive(retryMisses(state, Date.now())); done -> saveActive(null).
//   resume:  on panel open, readQuizStore(); if active, use resumeQuiz(active, Date.now()) so the time the
//            panel was closed doesn't count against the current question.
//   keys:    while the quiz is on screen, quizKey(ev.key) gives "A".."D" (1-4, a-d) or "next" (Enter,
//            Space). Skip it when a modifier is held or a text box has focus. Esc can call quit.
//   explain: explain(q, picked) -> host.processImage(await renderQuestionImage(toParsedQB(q))) from
//            textcapture.ts, then preselect `picked` so the rule card explains that pick.
//
// Storage: QUIZ_KEY = "rc.addons.qbquiz.v1" -> { active: QuizState | null, history: QuizResult[] }
// (history newest first, at most HISTORY_MAX = 20).

import { parseQuestionBankText, splitExport, type ParsedQB } from "./qbtext";
import { MATH_TARGET_SECONDS, TARGET_SECONDS, targetSecondsFor } from "./stats";
import { kv } from "./store";
import { domainOfSkill } from "./taxonomy";
import { LETTERS, MATH_DOMAINS, MATH_SKILLS, type Letter } from "./types";

export type Difficulty = "Easy" | "Medium" | "Hard";

export interface QuizQuestion {
  qbId: string | null;
  domain: string | null;
  skill: string | null;
  difficulty: Difficulty | null;
  passage: string | null;
  stem: string;
  choices: Record<Letter, string>;
  correct: Letter;
  /** The export's official explanation, if it has one. */
  rationale: string | null;
}

export interface ParsedExport {
  /** Multiple-choice questions with all four choices and an answer key, in export order, no repeats. */
  questions: QuizQuestion[];
  /** Questions that can't be quizzed: grid-in (no A to D choices), no answer key, or no question text. */
  skipped: number;
  /** Of the skipped, how many had A to D choices but no answer key (an export without answers). */
  noAnswer: number;
  /** Repeats of a question already in the list (same question ID). Not counted in skipped. */
  duplicates: number;
}

/** What the entry card shows about a paste. */
export interface ExportPreview {
  found: number;
  skipped: number;
  noAnswer: number;
  duplicates: number;
}

export interface QuizAnswer {
  picked: Letter;
  correct: boolean;
  /** Time from showing the question to the answer, rounded, at most MAX_SECONDS. */
  seconds: number;
}

export interface QuizState {
  id: string;
  /** The questions in this quiz, in export order. */
  questions: QuizQuestion[];
  /** Indexes into `questions`, in the order they are asked. */
  order: number[];
  /** Position in `order` of the question on screen. Equals order.length once the last one is done. */
  index: number;
  /** Keyed by index into `questions`. Skipped questions have no entry. */
  answers: Record<number, QuizAnswer>;
  /** When the current question appeared. */
  shownAt: number;
  startedAt: number;
  finishedAt: number | null;
  /** Show the clock and pace. Time is recorded either way. */
  timed: boolean;
}

export interface CreateQuizOptions {
  now: number;
  /** Shuffle seed. Defaults to `now`. */
  seed?: number;
  /** Ask in a seeded random order instead of export order. Default false. */
  shuffle?: boolean;
  /** Ask at most this many (after shuffling). null, 0 or missing = all. */
  limit?: number | null;
  /** Default true. */
  timed?: boolean;
}

export interface QuizProgress {
  /** 1-based number of the question on screen ("3" in "3 of 20"). */
  number: number;
  total: number;
  answered: number;
  /** Questions after this one. */
  left: number;
}

export interface SkillScore {
  skill: string;
  right: number;
  total: number;
}

export interface QuizMiss {
  question: QuizQuestion;
  picked: Letter;
  seconds: number;
}

export interface QuizSummary {
  total: number;
  answered: number;
  right: number;
  wrong: number;
  /** Not answered: skipped, or not reached before the quiz ended. */
  unanswered: number;
  /** right / answered, 0..1. Null when nothing was answered. */
  accuracy: number | null;
  avgSeconds: number | null;
  totalSeconds: number;
  /** totalSeconds in whole minutes. */
  minutes: number;
  /** Test pace to compare the average with: 71 s, or 95 s when every question is Math. */
  target: number;
  /** Answers that took longer than the pace for their section (71 s Reading and Writing, 95 s Math). */
  slow: number;
  /** Answered questions grouped by skill, weakest first. */
  bySkill: SkillScore[];
  /** Wrong answers, in the order asked. */
  misses: QuizMiss[];
  startedAt: number;
  finishedAt: number | null;
}

export interface QuizResult {
  id: string;
  startedAt: number;
  finishedAt: number;
  total: number;
  answered: number;
  right: number;
  accuracy: number | null;
  avgSeconds: number | null;
  slow: number;
  minutes: number;
  target: number;
  bySkill: SkillScore[];
}

export interface QuizStore {
  active: QuizState | null;
  /** Newest first. */
  history: QuizResult[];
}

export const QUIZ_KEY = "rc.addons.qbquiz.v1";
export const HISTORY_MAX = 20;
export const MAX_SECONDS = 1800;
const NO_SKILL = "No skill listed";

// ---------------------------------------------------------------- parsing

/** Regex for a phrase whose letters may be split by stray whitespace (PDF text). */
const loose = (phrase: string) =>
  phrase.split("").map((c) => (c === " " ? "\\s*" : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*")).join("");
const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

const RE_HEAD_END = /\n\s*Q\s*u\s*e\s*s\s*t\s*i\s*o\s*n\s*\n/i;
const RE_QDIFF = new RegExp(loose("Question Difficulty"), "gi");
const RE_STOP_LINE = new RegExp(`^(?:${loose("Correct Answer")}|${loose("Rationale")}|${loose("Question Difficulty")})`, "i");
const RE_QUESTION_LINE = new RegExp(`^${loose("Question")}$`, "i");
const RE_ANSWER_LINE = new RegExp(`^(?:ID\\s*:?\\s*\\S+\\s+)?${loose("Answer")}$`, "i");
const RE_ID_LINE = /^ID\s*:/i;
const RE_CHOICE_A = /^\(?A(?:\s*[.)]|\)?\s*\.?$)/;
const MATH_SKILLS_LONGEST = [...MATH_SKILLS].sort((a, b) => b.length - a.length);

/** qbtext only knows the Reading and Writing taxonomy. Read the Math domain and skill from the header. */
function mathTaxonomy(block: string): { domain: string | null; skill: string | null } {
  const end = block.search(RE_HEAD_END);
  const head = squash(block.slice(0, end > 0 ? end : Math.min(block.length, 600)));
  const skill = MATH_SKILLS_LONGEST.find((s) => head.includes(squash(s))) ?? null;
  const domain = MATH_DOMAINS.find((d) => head.includes(squash(d))) ?? (skill ? domainOfSkill(skill) : null);
  return { domain, skill };
}

/** The parser only takes a stem that ends in "?" or starts with "Which choice". Otherwise use all the
 *  text between the "Question" label and choice A (common in Math: "Select the point ..."). */
function fallbackStem(block: string): string | null {
  const lines = block.split(/\r?\n/).map(tidy).filter(Boolean);
  const stop = lines.findIndex((l) => RE_STOP_LINE.test(l));
  const body = stop >= 0 ? lines.slice(0, stop) : lines;
  const label = body.findIndex((l) => RE_QUESTION_LINE.test(l));
  if (label < 0) return null;
  let a = -1;
  for (let j = body.length - 1; j > label; j--) {
    if (RE_CHOICE_A.test(body[j]!)) { a = j; break; }
  }
  if (a < 0) return null;
  return tidy(body.slice(label + 1, a).filter((l) => !RE_ANSWER_LINE.test(l) && !RE_ID_LINE.test(l)).join(" ")) || null;
}

/** Drop the "Question Difficulty: Medium" footer the PDF puts after each rationale. */
function cleanRationale(r: string | null): string | null {
  if (!r) return null;
  let cut = -1;
  for (const m of r.matchAll(RE_QDIFF)) cut = m.index ?? cut;
  return tidy(cut >= 0 && r.length - cut < 48 ? r.slice(0, cut) : r) || null;
}

function toQuizQuestion(block: string): { question: QuizQuestion | null; noAnswer: boolean } {
  const p = parseQuestionBankText(block);
  const texts = LETTERS.map((l) => tidy(p.choices[l] ?? ""));
  if (!texts.every(Boolean)) return { question: null, noAnswer: false };
  if (!p.correct) return { question: null, noAnswer: true };
  const stem = p.stem ? tidy(p.stem) : fallbackStem(block);
  if (!stem) return { question: null, noAnswer: false };
  const math = !p.domain && !p.skill ? mathTaxonomy(block) : null;
  return {
    question: {
      qbId: p.qbId,
      domain: p.domain ?? math?.domain ?? null,
      skill: p.skill ?? math?.skill ?? null,
      difficulty: p.difficulty,
      passage: p.stem && p.passage ? tidy(p.passage) || null : null,
      stem,
      choices: { A: texts[0]!, B: texts[1]!, C: texts[2]!, D: texts[3]! },
      correct: p.correct,
      rationale: cleanRationale(p.rationale),
    },
    noAnswer: false,
  };
}

const fingerprint = (q: QuizQuestion) => squash([q.passage ?? "", q.stem, ...LETTERS.map((l) => q.choices[l])].join("|"));

/** Turn pasted export text into quiz questions. Splits on "Question ID"; with no IDs at all, reads the
 *  whole paste as one question. Repeated question IDs keep the first copy. */
export function parseExport(text: string): ParsedExport {
  const out: ParsedExport = { questions: [], skipped: 0, noAnswer: 0, duplicates: 0 };
  const src = typeof text === "string" ? text.replace(/\r\n?/g, "\n") : "";
  if (!src.trim()) return out;
  const blocks = splitExport(src);
  if (!blocks.length) {
    // One question pasted without its ID. Random text is not counted as a skipped question.
    const r = toQuizQuestion(src);
    if (r.question) out.questions.push(r.question);
    else if (r.noAnswer) { out.skipped++; out.noAnswer++; }
    return out;
  }
  const seen = new Set<string>();
  for (const block of blocks) {
    const r = toQuizQuestion(block);
    if (!r.question) {
      out.skipped++;
      if (r.noAnswer) out.noAnswer++;
      continue;
    }
    const key = r.question.qbId ? `id:${r.question.qbId}` : `text:${fingerprint(r.question)}`;
    if (seen.has(key)) { out.duplicates++; continue; }
    seen.add(key);
    out.questions.push(r.question);
  }
  return out;
}

export const previewOf = (p: ParsedExport): ExportPreview => ({
  found: p.questions.length, skipped: p.skipped, noAnswer: p.noAnswer, duplicates: p.duplicates,
});

/** The question in the shape textcapture.ts renderQuestionImage() takes, answer included. */
export function toParsedQB(q: QuizQuestion): ParsedQB {
  return {
    qbId: q.qbId, domain: q.domain, skill: q.skill, difficulty: q.difficulty, passage: q.passage, stem: q.stem,
    choices: { ...q.choices }, correct: q.correct, rationale: q.rationale, answerRevealed: true,
  };
}

/** Test pace for one question: 71 s Reading and Writing, 95 s Math. */
export const questionTarget = (q: Pick<QuizQuestion, "domain" | "skill">): number => targetSecondsFor(q);

// ---------------------------------------------------------------- shuffle

/** Small seeded PRNG (mulberry32). Same seed, same sequence. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A shuffled copy (Fisher-Yates with mulberry32). The input is not changed. */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

// ---------------------------------------------------------------- quiz flow

const copyQuestion = (q: QuizQuestion): QuizQuestion => ({ ...q, choices: { ...q.choices } });
const toSeconds = (ms: number) => (Number.isFinite(ms) ? Math.min(MAX_SECONDS, Math.max(0, Math.round(ms / 1000))) : 0);

/** A new quiz. With no questions it is finished at once. */
export function createQuiz(questions: readonly QuizQuestion[], opts: CreateQuizOptions): QuizState {
  const now = opts.now;
  const seed = (opts.seed ?? now) >>> 0;
  const all = questions.map((_, i) => i);
  let pick = opts.shuffle ? shuffled(all, seed) : all;
  const limit = opts.limit && opts.limit > 0 ? Math.floor(opts.limit) : null;
  if (limit !== null) pick = pick.slice(0, limit);
  const kept = [...pick].sort((a, b) => a - b);
  const pos = new Map(kept.map((orig, k) => [orig, k] as const));
  return {
    id: `quiz-${Math.round(now).toString(36)}-${seed.toString(36)}`,
    questions: kept.map((i) => copyQuestion(questions[i]!)),
    order: pick.map((i) => pos.get(i)!),
    index: 0,
    answers: {},
    shownAt: now,
    startedAt: now,
    finishedAt: kept.length ? null : now,
    timed: opts.timed ?? true,
  };
}

export const isFinished = (s: QuizState): boolean => s.finishedAt !== null;

/** Index into questions of the question on screen, or null when finished. */
function onScreen(s: QuizState): number | null {
  if (isFinished(s)) return null;
  const qi = s.order[s.index];
  return qi === undefined || !s.questions[qi] ? null : qi;
}

export function currentQuestion(s: QuizState): QuizQuestion | null {
  const qi = onScreen(s);
  return qi === null ? null : s.questions[qi]!;
}

/** The answer to the question on screen, if it has one yet. */
export function currentAnswer(s: QuizState): QuizAnswer | null {
  const qi = onScreen(s);
  return qi === null ? null : s.answers[qi] ?? null;
}

export function quizProgress(s: QuizState): QuizProgress {
  const total = s.order.length;
  return {
    number: Math.min(s.index + 1, total),
    total,
    answered: s.order.filter((i) => s.answers[i]).length,
    left: Math.max(0, total - s.index - 1),
  };
}

/** Grade a pick against the answer key. A second answer to the same question is ignored (same state back). */
export function answerQuiz(s: QuizState, letter: Letter, now: number): QuizState {
  const qi = onScreen(s);
  if (qi === null || s.answers[qi] || !LETTERS.includes(letter)) return s;
  const q = s.questions[qi]!;
  return { ...s, answers: { ...s.answers, [qi]: { picked: letter, correct: letter === q.correct, seconds: toSeconds(now - s.shownAt) } } };
}

function advance(s: QuizState, now: number): QuizState {
  if (s.index >= s.order.length - 1) return { ...s, index: s.order.length, finishedAt: now };
  return { ...s, index: s.index + 1, shownAt: now };
}

/** Move on once the question on screen is answered (no-op before that). After the last one, finishes. */
export function nextQuiz(s: QuizState, now: number): QuizState {
  const qi = onScreen(s);
  return qi === null || !s.answers[qi] ? s : advance(s, now);
}

/** Move on without answering. After the last one, finishes. */
export function skipQuiz(s: QuizState, now: number): QuizState {
  return onScreen(s) === null ? s : advance(s, now);
}

/** End now (for example on Quit). Unanswered questions stay unanswered. */
export function finishQuiz(s: QuizState, now: number): QuizState {
  return isFinished(s) ? s : { ...s, finishedAt: now };
}

/** Restart the clock on an unanswered question, so time with the panel closed doesn't count. */
export function resumeQuiz(s: QuizState, now: number): QuizState {
  const qi = onScreen(s);
  return qi === null || s.answers[qi] ? s : { ...s, shownAt: now };
}

export function quizSummary(s: QuizState): QuizSummary {
  const asked = s.order.filter((i) => s.questions[i]);
  const skills = new Map<string, SkillScore>();
  const misses: QuizMiss[] = [];
  let answered = 0;
  let right = 0;
  let totalSeconds = 0;
  let slow = 0;
  for (const qi of asked) {
    const a = s.answers[qi];
    if (!a) continue;
    const q = s.questions[qi]!;
    answered++;
    totalSeconds += a.seconds;
    if (a.seconds > questionTarget(q)) slow++;
    const key = q.skill ?? q.domain ?? NO_SKILL;
    const g = skills.get(key) ?? { skill: key, right: 0, total: 0 };
    g.total++;
    if (a.correct) { right++; g.right++; } else misses.push({ question: q, picked: a.picked, seconds: a.seconds });
    skills.set(key, g);
  }
  const bySkill = [...skills.values()].sort((a, b) =>
    a.right / a.total - b.right / b.total || (b.total - b.right) - (a.total - a.right) || b.total - a.total || a.skill.localeCompare(b.skill));
  const allMath = asked.length > 0 && asked.every((i) => questionTarget(s.questions[i]!) === MATH_TARGET_SECONDS);
  return {
    total: asked.length,
    answered,
    right,
    wrong: answered - right,
    unanswered: asked.length - answered,
    accuracy: answered ? right / answered : null,
    avgSeconds: answered ? Math.round(totalSeconds / answered) : null,
    totalSeconds,
    minutes: Math.round(totalSeconds / 60),
    target: allMath ? MATH_TARGET_SECONDS : TARGET_SECONDS,
    slow,
    bySkill,
    misses,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
  };
}

/** A fresh quiz with only the questions answered wrong, in the order they were asked. Empty (and
 *  finished at once) when there were no misses. */
export function retryMisses(s: QuizState, now: number): QuizState {
  const missed = s.order.filter((i) => s.answers[i] && !s.answers[i]!.correct && s.questions[i]).map((i) => s.questions[i]!);
  return createQuiz(missed, { now, timed: s.timed });
}

// ---------------------------------------------------------------- hotkeys

const KEY_LETTERS: Record<string, Letter> = { a: "A", b: "B", c: "C", d: "D", "1": "A", "2": "B", "3": "C", "4": "D" };

/** Suggested hotkeys while a quiz question is on screen: 1-4 and A-D pick, Enter and Space go on. Pure. */
export function quizKey(key: string): Letter | "next" | null {
  if (key === "Enter" || key === " ") return "next";
  return key.length === 1 ? KEY_LETTERS[key.toLowerCase()] ?? null : null;
}

// ---------------------------------------------------------------- storage

export function toResult(s: QuizState): QuizResult {
  const m = quizSummary(s);
  return {
    id: s.id, startedAt: s.startedAt, finishedAt: s.finishedAt ?? s.shownAt,
    total: m.total, answered: m.answered, right: m.right, accuracy: m.accuracy, avgSeconds: m.avgSeconds,
    slow: m.slow, minutes: m.minutes, target: m.target, bySkill: m.bySkill,
  };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

function cleanActive(x: unknown): QuizState | null {
  if (!isObj(x)) return null;
  const ok = typeof x.id === "string" && Array.isArray(x.questions) && Array.isArray(x.order) && isNum(x.index)
    && isObj(x.answers) && isNum(x.shownAt) && isNum(x.startedAt) && (x.finishedAt === null || isNum(x.finishedAt));
  return ok ? ({ ...x, timed: typeof x.timed === "boolean" ? x.timed : true } as unknown as QuizState) : null;
}

function cleanStore(raw: unknown): QuizStore {
  if (!isObj(raw)) return { active: null, history: [] };
  const history = Array.isArray(raw.history)
    ? (raw.history as unknown[]).filter((r): r is QuizResult => isObj(r) && typeof r.id === "string" && isNum(r.finishedAt)).slice(0, HISTORY_MAX)
    : [];
  return { active: cleanActive(raw.active), history };
}

// Every public read and write goes through one queue, so unawaited calls can't overwrite each other.
let tail: Promise<unknown> = Promise.resolve();
function queued<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.catch(() => undefined);
  return run;
}

const rawRead = async (): Promise<QuizStore> => cleanStore(await kv().get<unknown>(QUIZ_KEY));
async function rawWrite(s: QuizStore): Promise<QuizStore> {
  const clean: QuizStore = { active: s.active ?? null, history: (s.history ?? []).slice(0, HISTORY_MAX) };
  await kv().set(QUIZ_KEY, clean);
  return clean;
}

export const readQuizStore = (): Promise<QuizStore> => queued(rawRead);
export const writeQuizStore = (s: QuizStore): Promise<QuizStore> => queued(() => rawWrite(s));

/** Save the quiz in progress (null clears it). Keep the finished quiz here until Done, so the results
 *  screen survives closing the panel or explaining a miss. */
export const saveActive = (state: QuizState | null): Promise<QuizStore> =>
  queued(async () => rawWrite({ ...(await rawRead()), active: state }));

/** Add a finished quiz to the history (newest first, 20 kept). Saving the same quiz again replaces its
 *  row. A quiz that isn't finished or has no answers is not recorded. */
export const recordResult = (state: QuizState): Promise<QuizStore> =>
  queued(async () => {
    const store = await rawRead();
    const r = toResult(state);
    if (!isFinished(state) || !r.answered) return store;
    return rawWrite({ ...store, history: [r, ...store.history.filter((x) => x.id !== r.id)] });
  });
