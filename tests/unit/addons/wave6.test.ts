// Tests for Wave 6: the word quiz (wordquiz.ts), the activity calendar (calendar.ts) and the error log export
// (errorlog.ts). Every word, sentence and question here is made up for the tests (no College Board text).
// Render functions are not called: tests run in Node without a DOM.
import { test } from "vitest";
import assert from "node:assert/strict";
import { activityInsight, activityLevel, activityModel, dayLabel, shiftDay, streakLine, totalsLine } from "../../../extension/src/addons/calendar";
import {
  answerCells, ERROR_LOG_COLUMNS, errorLogFilename, errorLogRows, guardCell, toErrorLogCsv, toErrorLogTsv,
} from "../../../extension/src/addons/errorlog";
import { memoryKV, setKV } from "../../../extension/src/addons/store";
import type { WordItem } from "../../../extension/src/addons/vocab";
import {
  answerWord, applyWordResults, BLANK, blankWord, cleanMeaning, cleanWordRecord, createWordQuiz, currentWord,
  finishWordQuiz, isWordQuizFinished, markWord, nextWord, pickDistractors, pickWords, readWordRecord,
  saveWordResults, wordKey, wordQuestionKinds, wordQuizAvailability, wordQuizKey, wordQuizProgress,
  wordQuizSizes, wordQuizSummary, type WordRecord,
} from "../../../extension/src/addons/wordquiz";
import { at, entry } from "./helpers";

// ---------------------------------------------------------------- word quiz fixtures

let wn = 0;
function word(w: string, p: Partial<WordItem> = {}): WordItem {
  wn++;
  return {
    word: w,
    meaning: `"${w}" fits because the sentence describes something ${w}.`,
    sentence: `The volunteers were surprisingly ${w} about the long repair list.`,
    picked: null,
    result: "right",
    seen: 1,
    lastAt: at(2026, 10, 1) + wn,
    attemptIds: [`att-w${wn}`],
    qbId: null,
    ...p,
  };
}

const BANK = (): WordItem[] => [
  word("resilient", { result: "missed", picked: "fragile", meaning: "Able to recover quickly after a setback.", sentence: "The kelp forests proved resilient, regrowing within months." }),
  word("candid", { meaning: "Honest and direct, even when it is awkward.", sentence: "Her candid review named every flaw in the plan." }),
  word("sparse", { meaning: "Thinly spread, with little in any one place.", sentence: "Trees were sparse on the windy ridge." }),
  word("meticulous", { meaning: "Very careful about small details.", sentence: "The meticulous archivist labeled every folder twice." }),
  word("brisk", { meaning: "Quick and energetic.", sentence: "They set off at a brisk pace before sunrise." }),
  word("tentative", { meaning: "Not certain or fixed; offered as a first try.", sentence: "The council reached a tentative agreement on the park." }),
];

// ---------------------------------------------------------------- word quiz: text

test("blankWord blanks every whole-word copy, any case, and keeps quotes hugging the blank", () => {
  assert.equal(blankWord("Brisk walks are brisk.", "brisk"), `${BLANK} walks are ${BLANK}.`);
  assert.equal(blankWord("Briskly is not the word.", "brisk"), "Briskly is not the word.");
  assert.equal(blankWord('"Candid" means honest.', "candid"), `"${BLANK}" means honest.`);
  assert.equal(blankWord("a  well   known fact", "well known"), `a ${BLANK} fact`);
});

test("markWord splits text around the word for bolding", () => {
  assert.deepEqual(markWord("A brisk, Brisk day", "brisk"), [
    { text: "A ", hit: false }, { text: "brisk", hit: true }, { text: ", ", hit: false }, { text: "Brisk", hit: true }, { text: " day", hit: false },
  ]);
  assert.deepEqual(markWord("", "x"), []);
});

test("cleanMeaning drops a lead-in that names a letter", () => {
  assert.equal(cleanMeaning("Choice B is the best answer because it means quick and lively."), "It means quick and lively.");
  assert.equal(cleanMeaning("The correct answer is C: a careful, exact approach."), "A careful, exact approach.");
  assert.equal(cleanMeaning("Choice B is the best answer."), null);
  assert.equal(cleanMeaning("Quick and lively."), "Quick and lively.");
  assert.equal(cleanMeaning(null), null);
});

test("wordQuestionKinds needs the word in the sentence and a meaning that survives blanking, and skips leaks", () => {
  assert.deepEqual(wordQuestionKinds(word("brisk", { meaning: "Quick and energetic." })), ["blank", "meaning"]);
  assert.deepEqual(wordQuestionKinds(word("brisk", { sentence: "No match here.", meaning: "Quick and energetic." })), ["meaning"]);
  assert.deepEqual(wordQuestionKinds(word("brisk", { meaning: "Brisk." })), ["blank"]);
  // "tempering" gives "tempered" away.
  assert.deepEqual(wordQuestionKinds(word("tempered", { sentence: "Tempering the steel, the smith tempered it again.", meaning: null })), []);
});

// ---------------------------------------------------------------- word quiz: availability and picks

test("availability needs 4 distinct words and says how many more", () => {
  const three = BANK().slice(0, 3);
  assert.deepEqual(wordQuizAvailability([]), { available: 0, reason: "Add 4 Words in Context cards to unlock the word quiz." });
  assert.deepEqual(wordQuizAvailability(three), { available: 0, reason: "Add 1 more Words in Context card to unlock the word quiz." });
  assert.deepEqual(wordQuizAvailability([...three, word("Candid")]), { available: 0, reason: "Add 1 more Words in Context card to unlock the word quiz." });
  assert.deepEqual(wordQuizAvailability(BANK()), { available: 6, reason: null });
  assert.deepEqual(wordQuizSizes(6), [5, 6]);
  assert.deepEqual(wordQuizSizes(12), [5, 10]);
  assert.deepEqual(wordQuizSizes(4), [4]);
  assert.deepEqual(wordQuizSizes(0), []);
});

test("pickWords puts missed words first, then bad records, then the least recently quizzed", () => {
  const bank = BANK();
  const record: WordRecord = {
    candid: { right: 0, wrong: 2, lastAt: 500 },
    sparse: { right: 3, wrong: 0, lastAt: 100 },
    meticulous: { right: 1, wrong: 0, lastAt: 900 },
  };
  const picked = pickWords(bank, record, { seed: 7, n: 6 }).map((w) => w.word);
  assert.equal(picked[0], "resilient");
  assert.equal(picked[1], "candid");
  // brisk and tentative were never quizzed, so they come before sparse (100) and meticulous (900).
  assert.deepEqual(new Set(picked.slice(2, 4)), new Set(["brisk", "tentative"]));
  assert.deepEqual(picked.slice(4), ["sparse", "meticulous"]);
  assert.equal(pickWords(bank, record, { seed: 7, n: 2 }).length, 2);
});

test("pickDistractors uses your own wrong picks first and never the word itself", () => {
  const bank = BANK();
  const item = { ...bank[0]!, picks: ["fragile", "Fragile", "rigid"] };
  const out = pickDistractors(item, bank, 3);
  assert.equal(out.length, 3);
  assert.deepEqual(out.slice(0, 2), ["fragile", "rigid"]);
  assert.ok(!out.map(wordKey).includes("resilient"));
  assert.equal(new Set(out.map(wordKey)).size, 3);
});

// ---------------------------------------------------------------- word quiz: flow

test("createWordQuiz builds four distinct choices with the answer at `correct`, seeded and repeatable", () => {
  const a = createWordQuiz(BANK(), {}, { now: at(2026, 10, 30), seed: 42, n: 5 });
  const b = createWordQuiz(BANK(), {}, { now: at(2026, 10, 30), seed: 42, n: 5 });
  assert.deepEqual(a, b);
  assert.equal(a.questions.length, 5);
  assert.equal(a.finishedAt, null);
  for (const q of a.questions) {
    const opts = Object.values(q.choices).map(wordKey);
    assert.equal(new Set(opts).size, 4, `choices repeat for ${q.word}`);
    assert.equal(wordKey(q.choices[q.correct]), wordKey(q.word));
    // "blank" shows the sentence with a gap; "meaning" shows the definition (a gap only if it used the word).
    if (q.kind === "blank") assert.ok(q.prompt.includes(BLANK));
    assert.ok(!new RegExp(`\\b${q.word}\\b`, "i").test(q.prompt), `prompt gives away ${q.word}`);
  }
  // The missed word is always in a 5-word quiz.
  assert.ok(a.questions.some((q) => q.word === "resilient"));
});

test("a bank with fewer than 4 words gives a finished, empty quiz", () => {
  const s = createWordQuiz(BANK().slice(0, 3), {}, { now: 1000 });
  assert.equal(s.questions.length, 0);
  assert.ok(isWordQuizFinished(s));
  assert.equal(currentWord(s), null);
});

test("answer, next and finish: one answer per word, summary counts misses with what you picked", () => {
  let s = createWordQuiz(BANK(), {}, { now: 1000, seed: 3, n: 4 });
  const q0 = currentWord(s)!;
  const wrong0 = (["A", "B", "C", "D"] as const).find((l) => l !== q0.correct)!;
  assert.equal(nextWord(s, 1001), s, "next before an answer is a no-op");
  s = answerWord(s, wrong0, 1002);
  assert.equal(answerWord(s, q0.correct, 1003), s, "a second answer is ignored");
  s = nextWord(s, 1004);
  assert.deepEqual(wordQuizProgress(s), { number: 2, total: 4, answered: 1, left: 2 });
  const q1 = currentWord(s)!;
  s = nextWord(answerWord(s, q1.correct, 1005), 1006);
  s = finishWordQuiz(s, 1007);
  assert.ok(isWordQuizFinished(s));
  const sum = wordQuizSummary(s);
  assert.deepEqual({ total: sum.total, answered: sum.answered, right: sum.right, wrong: sum.wrong, accuracy: sum.accuracy }, { total: 4, answered: 2, right: 1, wrong: 1, accuracy: 0.5 });
  assert.equal(sum.misses[0]?.word, q0.word);
  assert.equal(sum.misses[0]?.picked, q0.choices[wrong0]);
});

test("the last next finishes the quiz", () => {
  let s = createWordQuiz(BANK(), {}, { now: 1, seed: 9, n: 4 });
  for (let i = 0; i < 4; i++) s = nextWord(answerWord(s, currentWord(s)!.correct, 10 + i), 20 + i);
  assert.ok(isWordQuizFinished(s));
  assert.equal(s.finishedAt, 23);
  assert.equal(wordQuizSummary(s).right, 4);
});

test("wordQuizKey maps letters, numbers and Enter/Space", () => {
  assert.equal(wordQuizKey("b"), "B");
  assert.equal(wordQuizKey("4"), "D");
  assert.equal(wordQuizKey("Enter"), "next");
  assert.equal(wordQuizKey(" "), "next");
  assert.equal(wordQuizKey("e"), null);
  assert.equal(wordQuizKey("ArrowLeft"), null);
});

// ---------------------------------------------------------------- word quiz: record

test("cleanWordRecord merges case copies and drops bad rows", () => {
  assert.deepEqual(cleanWordRecord({ Brisk: { right: 1, wrong: 0, lastAt: 5 }, brisk: { right: 0, wrong: 2, lastAt: 9 }, bad: { right: "x" }, "": { right: 1, wrong: 1, lastAt: 1 } }), {
    brisk: { right: 1, wrong: 2, lastAt: 9 },
  });
  assert.deepEqual(cleanWordRecord(null), {});
  assert.deepEqual(cleanWordRecord([1, 2]), {});
});

test("applyWordResults counts each answer once, even if the same quiz is saved twice", () => {
  let s = createWordQuiz(BANK(), {}, { now: 100, seed: 5, n: 4 });
  s = answerWord(s, currentWord(s)!.correct, 110);
  s = finishWordQuiz(s, 120);
  const key = wordKey(s.questions[0]!.word);
  const once = applyWordResults({}, s, 130);
  assert.deepEqual(once[key], { right: 1, wrong: 0, lastAt: 130 });
  assert.equal(Object.keys(once).length, 1, "unanswered words are left alone");
  assert.deepEqual(applyWordResults(once, s, 140), once);
});

test("saveWordResults writes through kv and reads back", async () => {
  setKV(memoryKV());
  let s = createWordQuiz(BANK(), {}, { now: 100, seed: 5, n: 4 });
  const q = currentWord(s)!;
  s = finishWordQuiz(answerWord(s, q.correct === "A" ? "B" : "A", 110), 120);
  await Promise.all([saveWordResults(s, 130), saveWordResults(s, 131)]);
  const rec = await readWordRecord();
  assert.deepEqual(rec[wordKey(q.word)], { right: 0, wrong: 1, lastAt: 130 });
});

// ---------------------------------------------------------------- calendar

test("activityLevel compares questions with the goal; drills alone are level 1", () => {
  assert.equal(activityLevel(0, 0, 10), 0);
  assert.equal(activityLevel(0, 3, 10), 1);
  assert.equal(activityLevel(4, 0, 10), 1);
  assert.equal(activityLevel(5, 0, 10), 2);
  assert.equal(activityLevel(10, 0, 10), 3);
  assert.equal(activityLevel(20, 0, 10), 4);
  assert.equal(activityLevel(3, 0, 0), 1, "a bad goal falls back to 10");
});

test("shiftDay steps calendar dates, across months, years and DST", () => {
  assert.equal(shiftDay("2026-10-31", 1), "2026-11-01");
  assert.equal(shiftDay("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftDay("2026-11-01", 1), "2026-11-02");
  assert.equal(shiftDay("2026-03-08", 1), "2026-03-09");
  assert.equal(shiftDay("2026-03-09", -1), "2026-03-08");
});

test("activityModel lays out 16 weeks ending with today's week and ignores future entries", () => {
  const now = at(2026, 10, 30, 10); // a Friday
  const m = activityModel([], { now, dailyGoal: 10 });
  assert.equal(m.weeks.length, 16);
  assert.ok(m.weeks.every((c) => c.length === 7));
  const last = m.weeks[15]!;
  assert.equal(last[0]!.key, "2026-10-25", "columns start on Sunday");
  assert.equal(last[5]!.key, "2026-10-30");
  assert.equal(last[6]!.future, true);
  const all = m.weeks.flat().map((d) => d.key);
  assert.equal(new Set(all).size, 112, "no day repeats or is skipped");
  assert.equal(activityInsight(m), "No practice in the last 16 weeks yet.");
  assert.equal(streakLine(m), "");
  assert.equal(totalsLine(m), "");
  const withFuture = activityModel([entry({ at: at(2026, 10, 31) })], { now, dailyGoal: 10 });
  assert.equal(withFuture.totals.questions, 0);
});

test("activityModel counts questions and drills, streaks, the busiest day and goal days", () => {
  const now = at(2026, 10, 30, 18);
  const log = [
    ...Array.from({ length: 10 }, () => entry({ at: at(2026, 10, 30, 9) })),
    entry({ at: at(2026, 10, 29), drills: [{ at: at(2026, 10, 29, 13), ok: true } as never] }),
    entry({ at: at(2026, 10, 28) }),
    entry({ at: at(2026, 10, 20), drills: [{ at: at(2026, 10, 21), ok: false } as never] }),
  ];
  const m = activityModel(log, { now, dailyGoal: 10 });
  assert.deepEqual(m.totals, { questions: 13, reviews: 2, activeDays: 5 });
  assert.equal(m.currentStreak, 3);
  assert.equal(m.longestStreak, 3);
  assert.equal(m.goalDays, 1);
  assert.deepEqual(m.busiest, { key: "2026-10-30", questions: 10 });
  const today = m.weeks.flat().find((d) => d.key === "2026-10-30")!;
  assert.equal(today.level, 3);
  const reviewsOnly = m.weeks.flat().find((d) => d.key === "2026-10-21")!;
  assert.deepEqual({ q: reviewsOnly.questions, r: reviewsOnly.reviews, l: reviewsOnly.level }, { q: 0, r: 1, l: 1 });
  assert.equal(streakLine(m), "Current streak 3 days. Longest 3.");
  assert.equal(totalsLine(m), "13 questions and 2 reviews. You hit your goal of 10 on 1 day. Busiest day: Oct 30 (10).");
  assert.match(activityInsight(m), /^5 active days in the last 16 weeks\./);
  assert.equal(dayLabel(today), "Fri, Oct 30: 10 questions");
});

test("the current streak still counts when you haven't practiced yet today", () => {
  const now = at(2026, 10, 30, 8);
  const m = activityModel([entry({ at: at(2026, 10, 29) }), entry({ at: at(2026, 10, 28) })], { now });
  assert.equal(m.currentStreak, 2);
});

test("month labels sit over the column with the 1st", () => {
  const m = activityModel([], { now: at(2026, 10, 30) });
  const oct1 = m.weeks.findIndex((c) => c.some((d) => d.key === "2026-10-01"));
  assert.ok(m.monthLabels.some((l) => l.column === oct1 && l.label === "Oct"));
});

// ---------------------------------------------------------------- error log

test("errorLogRows: header, oldest first, missed scope by default use", () => {
  const log = [
    entry({ at: at(2026, 10, 3), result: "right", picked: "correct", correct: "C" }),
    entry({ at: at(2026, 10, 2), qbId: "aa11bb22", seconds: 95, selfConfidence: "unsure", starred: true, note: "watch commas" }),
    entry({ at: at(2026, 10, 1), qbId: "cc33dd44", seconds: 40 }),
  ];
  const rows = errorLogRows(log, { scope: "missed", srs: { B1: { box: 2, due: 0 } } as never });
  assert.deepEqual(rows[0], [...ERROR_LOG_COLUMNS]);
  assert.equal(rows.length, 3);
  assert.equal(rows[1]![1], "cc33dd44");
  const r = rows[2]!;
  const col = (name: (typeof ERROR_LOG_COLUMNS)[number]) => r[ERROR_LOG_COLUMNS.indexOf(name)];
  assert.equal(col("Date"), "2026-10-02");
  assert.equal(col("Your answer"), "A: tools, lawn");
  assert.equal(col("Correct answer"), "C: tools; lawn");
  assert.equal(col("Result"), "Missed");
  assert.equal(col("Rule"), "B1 · Comma splice");
  assert.equal(col("Diagnosis"), "Didn't know the rule");
  assert.equal(col("How sure"), "Unsure");
  assert.equal(col("Seconds"), "95");
  assert.equal(col("Over pace"), "Yes");
  assert.equal(col("Starred"), "Yes");
  assert.equal(col("Note"), "watch commas");
  assert.match(col("Review box") ?? "", /^2 of \d+$/);
  assert.equal(errorLogRows(log, { scope: "all" }).length, 4);
});

test("answerCells: right answers repeat the correct choice; grid-ins show typed and accepted answers", () => {
  assert.deepEqual(answerCells(entry({ picked: "correct", correct: "C", result: "right" })), { yours: "C: tools; lawn", correct: "C: tools; lawn" });
  const grid = entry({ section: "math", choices: undefined, accepted: ["3/4", ".75"], typed: "0.7", picked: "A", result: "missed" } as never);
  assert.deepEqual(answerCells(grid), { yours: "0.7", correct: "3/4 or .75" });
});

test("guardCell stops formulas but leaves plain negative numbers", () => {
  assert.equal(guardCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(guardCell("+1"), "'+1");
  assert.equal(guardCell("@x"), "'@x");
  assert.equal(guardCell("-5"), "-5");
  assert.equal(guardCell("-2.5"), "-2.5");
  assert.equal(guardCell("-5/2"), "'-5/2");
  assert.equal(guardCell("plain"), "plain");
});

test("CSV has a BOM, CRLF, quoted cells and doubled quotes; TSV flattens tabs and newlines", () => {
  const rows = [["a", 'say "hi"'], ["line\none", "=1+1"]];
  assert.equal(toErrorLogCsv(rows), '\uFEFF"a","say ""hi"""\r\n"line\none","\'=1+1"\r\n');
  assert.equal(toErrorLogTsv(rows), 'a\tsay "hi"\nline one\t\'=1+1');
  assert.equal(errorLogFilename("missed", at(2026, 10, 30)), "rulecard-error-log-missed-2026-10-30.csv");
});
