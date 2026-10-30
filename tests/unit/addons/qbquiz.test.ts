// Practice a Question Bank export (qbquiz.ts): parsing a pasted export, the quiz flow, the summary,
// storage and hotkeys. The DOM screens (qbquiz-ui.ts) are not loaded here.
// Run: node scripts/run-tests.mjs extension/test/qbquiz.test.ts

import { test } from "vitest";
import assert from "node:assert/strict";
import {
  answerQuiz, createQuiz, currentAnswer, currentQuestion, finishQuiz, HISTORY_MAX, isFinished, MAX_SECONDS, mulberry32,
  nextQuiz, parseExport, previewOf, QUIZ_KEY, quizKey, quizProgress, quizSummary, readQuizStore, recordResult, resumeQuiz,
  retryMisses, saveActive, shuffled, skipQuiz, toParsedQB, writeQuizStore, type QuizState, type QuizStore,
} from "../../../extension/src/addons/qbquiz";
import { memoryKV, setKV } from "../../../extension/src/addons/store";
import type { Letter } from "../../../extension/src/addons/types";

// Every question below is made up for these tests (no College Board text). The layout copies what a
// Question Bank PDF export gives after select all + copy: a header table, the "Question" label, the
// choices, then "Correct Answer", "Rationale" and a "Question Difficulty" footer. SEEDS uses the web
// layout instead (labels and letters on their own lines).

const LIGHTHOUSE = `Question ID 1a2b3c4d
Assessment Test Domain Skill Difficulty
SAT Reading and Writing Craft and Structure Words in Context Easy
ID: 1a2b3c4d
Question
The lighthouse keeper kept a ______ log of every passing ship, noting the hour, the weather, and the color of each hull.
Which choice completes the text with the most logical and precise word or phrase?
A. careless
B. meticulous
C. brief
D. secret
ID: 1a2b3c4d Answer
Correct Answer: B
Rationale
Choice B is the best answer because a log that records the hour, the weather, and every hull's color is careful and detailed.
Question Difficulty: Easy
`;

const SEEDS = `Question ID 5e6f7a8b
Assessment
SAT
Test
Reading and Writing
Domain
Standard English Conventions
Skill
Boundaries
Difficulty
Medium
Question
Each autumn the volunteers of the Millbrook seed library sort thousands of donated packets by ______ label every envelope with the grower's name and the year of harvest.
Which choice completes the text so that it conforms to the conventions of Standard English?
A
hand, they
B
hand they
C
hand; they
D
hand, and, they
Correct Answer: C
Rationale
Choice C is the best answer. A semicolon can join two complete thoughts.
`;

// Grid-in Math: a typed answer, no A to D choices. Can't be quizzed as multiple choice.
const GRID = `Question ID 7b8c9d0e
Assessment Test Domain Skill Difficulty
SAT Math Algebra Linear equations in one variable Easy
ID: 7b8c9d0e
Question
If 3x + 7 = 31, what is the value of x?
ID: 7b8c9d0e Answer
Correct Answer: 8
Rationale
The correct answer is 8. Subtracting 7 from each side gives 3x = 24, so x = 8.
Question Difficulty: Easy
`;

const BIKE = `Question ID 9c0d1e2f
Assessment Test Domain Skill Difficulty
SAT Math Algebra Linear functions Hard
ID: 9c0d1e2f
Question
A bike rental shop charges a flat fee of $6 plus $4 for each hour a bike is rented. Which function gives the total cost c(h), in dollars, of renting a bike for h hours?
A. c(h) = 6h + 4
B. c(h) = 4h + 6
C. c(h) = 10h
D. c(h) = 4h - 6
ID: 9c0d1e2f Answer
Correct Answer: B
Rationale
Choice B is correct. The cost starts at the flat fee of 6 dollars and grows by 4 dollars for each hour.
Question Difficulty: Hard
`;

// Exported without answers: four choices but no answer key.
const NOKEY = `Question ID 2f3a4b5c
Assessment Test Domain Skill Difficulty
SAT Reading and Writing Information and Ideas Inferences Hard
ID: 2f3a4b5c
Question
Field notes from a coastal survey show that sandpipers fed on the mudflats only in the two hours after low tide, even on days when the flats stayed bare much longer. This pattern suggests that ______
Which choice most logically completes the text?
A. the birds depend on food that the falling tide exposes only briefly.
B. the mudflats are unsafe once they dry out completely.
C. sandpipers prefer to feed after dark.
D. the survey counted each bird only once.
`;

const BUS = `Question ID 3d4e5f6a
Assessment Test Domain Skill Difficulty
SAT Reading and Writing Craft and Structure Words in Context Medium
ID: 3d4e5f6a
Question
Although the new bus schedule looked ______ on paper, riders soon found that each transfer left them only two minutes to cross a busy plaza.
Which choice completes the text with the most logical and precise word or phrase?
A. workable
B. ancient
C. noisy
D. colorful
ID: 3d4e5f6a Answer
Correct Answer: A
Rationale
Choice A is the best answer. The contrast with the tight transfers shows the plan only seemed practical.
Question Difficulty: Medium
`;

// Math stem that doesn't end in "?" (the qbtext parser finds no stem; qbquiz falls back).
const CIRCLE = `Question ID 4a5b6c7d
Assessment Test Domain Skill Difficulty
SAT Math Geometry and Trigonometry Circles Medium
ID: 4a5b6c7d
Question
A circle in the xy-plane has center (2, -3) and radius 5. Select the point that lies on the circle.
A. (2, 2)
B. (7, 2)
C. (2, -9)
D. (0, 0)
ID: 4a5b6c7d Answer
Correct Answer: A
Rationale
Choice A is correct. The point (2, 2) is 5 units straight above the center.
Question Difficulty: Medium
`;

const ALL = [LIGHTHOUSE, SEEDS, GRID, BIKE, NOKEY, BUS].join("\n");
const T0 = Date.UTC(2026, 9, 30, 9);
const qs = parseExport(ALL).questions; // LIGHTHOUSE (B), SEEDS (C), BIKE (B), BUS (A)

/** Answer the question on screen `secs` seconds after it appeared, then move on 5 s later. */
function play(s: QuizState, letter: Letter, secs: number): QuizState {
  const at = s.shownAt + secs * 1000;
  return nextQuiz(answerQuiz(s, letter, at), at + 5_000);
}

/** The four test questions, in export order, answered B (right), A (wrong), B (right), C (wrong). */
function played(): QuizState {
  let s = createQuiz(qs, { now: T0 });
  s = play(s, "B", 30);
  s = play(s, "A", 80);
  s = play(s, "B", 90);
  s = play(s, "C", 72);
  return s;
}

// ---------------------------------------------------------------- parsing

test("parseExport: counts usable questions, skips grid-in and no-key questions", () => {
  const p = parseExport(ALL);
  assert.deepEqual(p.questions.map((q) => q.qbId), ["1a2b3c4d", "5e6f7a8b", "9c0d1e2f", "3d4e5f6a"]);
  assert.equal(p.skipped, 2);
  assert.equal(p.noAnswer, 1);
  assert.equal(p.duplicates, 0);
  assert.deepEqual(previewOf(p), { found: 4, skipped: 2, noAnswer: 1, duplicates: 0 });
  assert.deepEqual(p.questions.map((q) => q.correct), ["B", "C", "B", "A"]);
});

test("parseExport: PDF layout fields, rationale without the difficulty footer", () => {
  const q = qs[0]!;
  assert.equal(q.domain, "Craft and Structure");
  assert.equal(q.skill, "Words in Context");
  assert.equal(q.difficulty, "Easy");
  assert.match(q.passage!, /^The lighthouse keeper kept a ______ log/);
  assert.match(q.stem, /^Which choice completes the text/);
  assert.deepEqual(q.choices, { A: "careless", B: "meticulous", C: "brief", D: "secret" });
  assert.match(q.rationale!, /^Choice B is the best answer/);
  assert.match(q.rationale!, /careful and detailed\.$/);
  assert.doesNotMatch(q.rationale!, /Difficulty/);
});

test("parseExport: web layout with letters on their own lines", () => {
  const q = qs[1]!;
  assert.equal(q.skill, "Boundaries");
  assert.equal(q.domain, "Standard English Conventions");
  assert.equal(q.difficulty, "Medium");
  assert.deepEqual(q.choices, { A: "hand, they", B: "hand they", C: "hand; they", D: "hand, and, they" });
  assert.equal(q.correct, "C");
  assert.equal(q.rationale, "Choice C is the best answer. A semicolon can join two complete thoughts.");
});

test("parseExport: Math taxonomy from the header, and a stem that doesn't end in a question mark", () => {
  const bike = qs[2]!;
  assert.equal(bike.domain, "Algebra");
  assert.equal(bike.skill, "Linear functions");
  assert.equal(bike.difficulty, "Hard");
  assert.equal(bike.passage, null);
  assert.match(bike.stem, /^A bike rental shop .* for h hours\?$/);

  const c = parseExport(CIRCLE);
  assert.equal(c.questions.length, 1);
  const circle = c.questions[0]!;
  assert.equal(circle.stem, "A circle in the xy-plane has center (2, -3) and radius 5. Select the point that lies on the circle.");
  assert.equal(circle.skill, "Circles");
  assert.equal(circle.domain, "Geometry and Trigonometry");
  assert.equal(circle.choices.C, "(2, -9)");
  assert.equal(circle.correct, "A");
});

test("parseExport: repeated question IDs keep the first copy", () => {
  const p = parseExport(`${ALL}\n${LIGHTHOUSE.replace("A. careless", "A. careful")}`);
  assert.equal(p.questions.length, 4);
  assert.equal(p.duplicates, 1);
  assert.equal(p.skipped, 2);
  assert.equal(p.questions[0]!.choices.A, "careless");
});

test("parseExport: a single question, with or without its ID, and text that isn't an export", () => {
  const one = parseExport(BUS);
  assert.equal(one.questions.length, 1);
  assert.equal(one.questions[0]!.qbId, "3d4e5f6a");

  const noId = parseExport(SEEDS.replace(/^Question ID.*\n/, ""));
  assert.equal(noId.questions.length, 1);
  assert.equal(noId.questions[0]!.qbId, null);
  assert.equal(noId.questions[0]!.correct, "C");

  assert.deepEqual(parseExport("Just some notes about commas."), { questions: [], skipped: 0, noAnswer: 0, duplicates: 0 });
  assert.deepEqual(parseExport("   \n "), { questions: [], skipped: 0, noAnswer: 0, duplicates: 0 });
  const unrevealed = parseExport(NOKEY.replace(/^Question ID.*\n/, ""));
  assert.deepEqual([unrevealed.questions.length, unrevealed.skipped, unrevealed.noAnswer], [0, 1, 1]);
});

test("toParsedQB: the shape renderQuestionImage takes, answer revealed", () => {
  const p = toParsedQB(qs[1]!);
  assert.equal(p.answerRevealed, true);
  assert.equal(p.correct, "C");
  assert.equal(p.qbId, "5e6f7a8b");
  assert.deepEqual(p.choices, qs[1]!.choices);
  assert.notEqual(p.choices, qs[1]!.choices);
});

// ---------------------------------------------------------------- shuffle

test("shuffled: deterministic for a seed, a permutation, input untouched", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const a = shuffled(items, 42);
  assert.deepEqual(a, shuffled(items, 42));
  assert.notDeepEqual(a, shuffled(items, 43));
  assert.notDeepEqual(a, items);
  assert.deepEqual([...a].sort((x, y) => x - y), items);
  assert.deepEqual(items, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const r = mulberry32(7);
  const xs = Array.from({ length: 50 }, () => r());
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  const again = mulberry32(7);
  assert.deepEqual(xs.slice(0, 3), [again(), again(), again()]);
});

test("createQuiz: seed and limit pick the same questions every time, kept in export order", () => {
  const s = createQuiz(qs, { now: T0, seed: 7, shuffle: true, limit: 2 });
  assert.deepEqual(s, createQuiz(qs, { now: T0, seed: 7, shuffle: true, limit: 2 }));
  const expected = shuffled([0, 1, 2, 3], 7).slice(0, 2).map((i) => qs[i]!.qbId);
  assert.equal(s.questions.length, 2);
  assert.deepEqual(s.order.map((i) => s.questions[i]!.qbId), expected);
  const exportPos = s.questions.map((q) => qs.findIndex((x) => x.qbId === q.qbId));
  assert.deepEqual(exportPos, [...exportPos].sort((a, b) => a - b));
  assert.equal(currentQuestion(s)!.qbId, expected[0]);

  assert.deepEqual(createQuiz(qs, { now: T0 }).order, [0, 1, 2, 3]);
  assert.equal(createQuiz(qs, { now: T0, limit: 10 }).order.length, 4);
  assert.equal(createQuiz(qs, { now: T0, limit: null }).order.length, 4);
  assert.deepEqual(createQuiz(qs, { now: T0, limit: 3 }).questions.map((q) => q.qbId), ["1a2b3c4d", "5e6f7a8b", "9c0d1e2f"]);
});

// ---------------------------------------------------------------- flow

test("flow: answer, next, and finishing after the last question", () => {
  let s = createQuiz(qs, { now: T0 });
  assert.equal(isFinished(s), false);
  assert.equal(currentQuestion(s)!.qbId, "1a2b3c4d");
  assert.equal(currentAnswer(s), null);
  assert.deepEqual(quizProgress(s), { number: 1, total: 4, answered: 0, left: 3 });

  s = answerQuiz(s, "B", T0 + 30_000);
  assert.deepEqual(currentAnswer(s), { picked: "B", correct: true, seconds: 30 });
  s = nextQuiz(s, T0 + 40_000);
  assert.equal(s.index, 1);
  assert.equal(s.shownAt, T0 + 40_000);
  assert.equal(currentQuestion(s)!.qbId, "5e6f7a8b");
  assert.deepEqual(quizProgress(s), { number: 2, total: 4, answered: 1, left: 2 });

  s = play(s, "A", 10);
  s = play(s, "B", 10);
  assert.equal(quizProgress(s).left, 0);
  s = answerQuiz(s, "A", s.shownAt + 10_000);
  assert.equal(isFinished(s), false);
  s = nextQuiz(s, T0 + 999_000);
  assert.equal(isFinished(s), true);
  assert.equal(s.finishedAt, T0 + 999_000);
  assert.equal(currentQuestion(s), null);
  assert.equal(nextQuiz(s, T0 + 1_000_000), s);
  assert.equal(answerQuiz(s, "A", T0 + 1_000_000), s);
});

test("flow: a second answer, an unknown letter, and next before answering are ignored", () => {
  const s0 = createQuiz(qs, { now: T0 });
  assert.equal(nextQuiz(s0, T0 + 5_000), s0);
  assert.equal(answerQuiz(s0, "E" as Letter, T0 + 5_000), s0);
  const s1 = answerQuiz(s0, "A", T0 + 20_000);
  const s2 = answerQuiz(s1, "B", T0 + 25_000);
  assert.equal(s2, s1);
  assert.deepEqual(s2.answers[0], { picked: "A", correct: false, seconds: 20 });
});

test("seconds: rounded, never negative, capped at 30 minutes; slow means over the pace", () => {
  const s = createQuiz(qs, { now: T0 });
  assert.equal(answerQuiz(s, "B", T0 + 12_400).answers[0]!.seconds, 12);
  assert.equal(answerQuiz(s, "B", T0 + 12_500).answers[0]!.seconds, 13);
  assert.equal(answerQuiz(s, "B", T0 - 5_000).answers[0]!.seconds, 0);
  assert.equal(answerQuiz(s, "B", T0 + 3 * 3_600_000).answers[0]!.seconds, MAX_SECONDS);
  assert.equal(MAX_SECONDS, 1800);

  // Reading and Writing pace is 71 s: 71 is on pace, 72 is slow.
  let rw = createQuiz([qs[0]!, qs[3]!], { now: T0 });
  rw = play(play(rw, "B", 71), "A", 72);
  const m = quizSummary(rw);
  assert.equal(m.slow, 1);
  assert.equal(m.target, 71);
  assert.equal(m.avgSeconds, 72);
});

test("Math questions use the 95 s Math pace", () => {
  const one = (secs: number) => quizSummary(play(createQuiz([qs[2]!], { now: T0 }), "B", secs));
  assert.equal(one(90).target, 95);
  assert.equal(one(90).slow, 0);
  assert.equal(one(96).slow, 1);
});

test("quizSummary: score, accuracy, time, skills weakest first, misses in order", () => {
  const m = quizSummary(played());
  assert.equal(m.total, 4);
  assert.equal(m.answered, 4);
  assert.equal(m.right, 2);
  assert.equal(m.wrong, 2);
  assert.equal(m.unanswered, 0);
  assert.equal(m.accuracy, 0.5);
  assert.equal(m.totalSeconds, 272);
  assert.equal(m.avgSeconds, 68);
  assert.equal(m.minutes, 5);
  assert.equal(m.target, 71);
  assert.equal(m.slow, 2); // 80 s and 72 s on Reading and Writing; 90 s on Math is within 95 s
  assert.deepEqual(m.bySkill, [
    { skill: "Boundaries", right: 0, total: 1 },
    { skill: "Words in Context", right: 1, total: 2 },
    { skill: "Linear functions", right: 1, total: 1 },
  ]);
  assert.deepEqual(m.misses.map((x) => [x.question.qbId, x.picked, x.seconds]), [["5e6f7a8b", "A", 80], ["3d4e5f6a", "C", 72]]);
});

test("skip and finish early: unanswered questions don't count against accuracy", () => {
  let s = createQuiz(qs, { now: T0 });
  s = skipQuiz(s, T0 + 3_000);
  assert.equal(s.index, 1);
  assert.equal(s.shownAt, T0 + 3_000);
  assert.equal(s.answers[0], undefined);
  s = play(s, "C", 40);
  s = finishQuiz(s, T0 + 60_000);
  assert.equal(isFinished(s), true);
  assert.equal(currentQuestion(s), null);
  assert.equal(skipQuiz(s, T0 + 70_000), s);
  assert.equal(finishQuiz(s, T0 + 70_000), s);
  const m = quizSummary(s);
  assert.deepEqual([m.total, m.answered, m.right, m.unanswered, m.accuracy], [4, 1, 1, 3, 1]);

  // Skipping the last question finishes the quiz.
  let last = createQuiz([qs[0]!], { now: T0 });
  last = skipQuiz(last, T0 + 1_000);
  assert.equal(isFinished(last), true);
  const none = quizSummary(last);
  assert.deepEqual([none.answered, none.accuracy, none.avgSeconds, none.misses.length], [0, null, null, 0]);
});

test("resumeQuiz restarts the clock only for an unanswered question", () => {
  const s = createQuiz(qs, { now: T0 });
  const later = resumeQuiz(s, T0 + 3_600_000);
  assert.equal(later.shownAt, T0 + 3_600_000);
  assert.equal(answerQuiz(later, "B", T0 + 3_620_000).answers[0]!.seconds, 20);
  const answered = answerQuiz(s, "B", T0 + 10_000);
  assert.equal(resumeQuiz(answered, T0 + 99_000), answered);
});

test("retryMisses: a fresh quiz with only the wrong answers", () => {
  const done = played();
  const r = retryMisses(done, T0 + 5_000_000);
  assert.deepEqual(r.questions.map((q) => q.qbId), ["5e6f7a8b", "3d4e5f6a"]);
  assert.deepEqual(r.order, [0, 1]);
  assert.deepEqual(r.answers, {});
  assert.equal(r.index, 0);
  assert.equal(r.startedAt, T0 + 5_000_000);
  assert.equal(r.shownAt, T0 + 5_000_000);
  assert.equal(isFinished(r), false);
  assert.notEqual(r.id, done.id);

  let perfect = createQuiz([qs[0]!], { now: T0 });
  perfect = play(perfect, "B", 20);
  const empty = retryMisses(perfect, T0 + 1);
  assert.equal(empty.questions.length, 0);
  assert.equal(isFinished(empty), true);
  assert.equal(isFinished(createQuiz([], { now: T0 })), true);
});

// ---------------------------------------------------------------- storage

test("storage: saveActive and readQuizStore round trip under one key", async () => {
  const mem = memoryKV();
  setKV(mem);
  assert.equal(QUIZ_KEY, "rc.addons.qbquiz.v1");
  assert.deepEqual(await readQuizStore(), { active: null, history: [] });

  const s = createQuiz(qs, { now: T0, seed: 3, shuffle: true });
  await saveActive(s);
  assert.deepEqual((await readQuizStore()).active, s);
  assert.deepEqual(Object.keys(mem.dump()), [QUIZ_KEY]);

  const s2 = answerQuiz(s, "A", T0 + 20_000);
  void saveActive(s); // not awaited: the queue keeps the order of writes
  await saveActive(s2);
  assert.deepEqual((await readQuizStore()).active, s2);

  const done = played();
  await recordResult(done);
  const store = await readQuizStore();
  assert.deepEqual(store.active, s2, "recordResult leaves the active quiz alone");
  assert.equal(store.history.length, 1);
  const r = store.history[0]!;
  assert.deepEqual(
    [r.id, r.total, r.answered, r.right, r.accuracy, r.avgSeconds, r.slow, r.minutes, r.finishedAt],
    [done.id, 4, 4, 2, 0.5, 68, 2, 5, done.finishedAt],
  );
  assert.equal(r.bySkill[0]!.skill, "Boundaries");

  await saveActive(null);
  assert.equal((await readQuizStore()).active, null);
  assert.equal((await readQuizStore()).history.length, 1);
});

test("storage: history newest first, capped at 20, same quiz replaced, unfinished ignored", async () => {
  setKV(memoryKV());
  let last: QuizState | null = null;
  for (let i = 0; i < 25; i++) {
    const s = play(createQuiz([qs[0]!], { now: T0 + i * 60_000 }), i % 2 ? "B" : "A", 30);
    assert.equal(isFinished(s), true);
    await recordResult(s);
    last = s;
  }
  let store = await readQuizStore();
  assert.equal(HISTORY_MAX, 20);
  assert.equal(store.history.length, 20);
  assert.equal(store.history[0]!.id, last!.id);
  assert.equal(store.history[0]!.finishedAt, last!.finishedAt);
  assert.equal(new Set(store.history.map((r) => r.id)).size, 20);

  await recordResult(last!);
  store = await readQuizStore();
  assert.equal(store.history.length, 20);
  assert.equal(store.history[0]!.id, last!.id);

  await recordResult(createQuiz(qs, { now: T0 + 9e9 })); // not finished
  await recordResult(skipQuiz(createQuiz([qs[0]!], { now: T0 + 9e9 }), T0 + 9e9 + 1)); // finished, nothing answered
  assert.equal((await readQuizStore()).history[0]!.id, last!.id);

  const big: QuizStore = { active: null, history: Array.from({ length: 30 }, (_, i) => ({ ...store.history[0]!, id: `r${i}` })) };
  const written = await writeQuizStore(big);
  assert.equal(written.history.length, 20);
  assert.equal((await readQuizStore()).history.length, 20);
});

test("storage: a damaged value reads as empty", async () => {
  setKV(memoryKV({ [QUIZ_KEY]: { active: { id: 5 }, history: "nope" } }));
  assert.deepEqual(await readQuizStore(), { active: null, history: [] });
  setKV(memoryKV({ [QUIZ_KEY]: "garbage" }));
  assert.deepEqual(await readQuizStore(), { active: null, history: [] });
  setKV(memoryKV({ [QUIZ_KEY]: { active: null, history: [{ id: "ok", finishedAt: T0 }, { id: 3 }, null] } }));
  assert.deepEqual((await readQuizStore()).history.map((r) => r.id), ["ok"]);
});

// ---------------------------------------------------------------- hotkeys

test("quizKey: 1-4 and A-D pick, Enter and Space go on, anything else is null", () => {
  assert.deepEqual(["1", "2", "3", "4"].map(quizKey), ["A", "B", "C", "D"]);
  assert.deepEqual(["a", "b", "c", "d"].map(quizKey), ["A", "B", "C", "D"]);
  assert.deepEqual(["A", "B", "C", "D"].map(quizKey), ["A", "B", "C", "D"]);
  assert.equal(quizKey("Enter"), "next");
  assert.equal(quizKey(" "), "next");
  for (const k of ["5", "0", "e", "E", "Escape", "ArrowDown", "Tab", "", "ab"]) assert.equal(quizKey(k), null, k);
});
