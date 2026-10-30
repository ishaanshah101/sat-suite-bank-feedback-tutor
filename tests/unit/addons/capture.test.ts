// Tests for selection-bg.ts, selection.ts, paste.ts, seen.ts and report.ts (the pure parts).
import { test } from "vitest";
import assert from "node:assert/strict";
import { at, entry } from "./helpers";
import { pendingFromClick, pickSelectionText, SELECTION_MAX_CHARS } from "../../../extension/src/addons/selection-bg";
import {
  checkQuestionText,
  imageHeader,
  isFreshSelection,
  isPendingSelection,
  layoutQuestion,
  normalizeQuestionText,
  sourceLabel,
  splitQuestion,
  type Measure,
  type QuestionLayout,
} from "../../../extension/src/addons/selection";
import { checkImageFile, isAcceptedImage, looksLikeQuestion, normalizePastedText, questionSignals, scaleToFit } from "../../../extension/src/addons/paste";
import { findPrevious, pickedPhrase, ruleLine, seenSentence, whenPhrase } from "../../../extension/src/addons/seen";
import { buildWeeklyReport, escapeHtml, formatDuration, pct, reportHeadline, toReportHtml, toReportText, weekRows } from "../../../extension/src/addons/report";
import { DAY, type SrsState } from "../../../extension/src/addons/srs";

const NOW = at(2026, 10, 29, 18);

// ---------------------------------------------------------------- text normalization

test("normalizeQuestionText unifies line endings, spaces and blank lines but keeps punctuation", () => {
  const raw = "  Line one\u00A0 with\tspaces \r\nLine\u200B two\r\n\r\n\r\n\r\n\u24B6 periods\u00AD. The ";
  assert.equal(normalizeQuestionText(raw), "Line one with spaces\nLine two\n\n(A) periods. The");
  assert.equal(normalizeQuestionText("a;\u2014b\rc"), "a;\u2014b\nc");
  assert.equal(normalizeQuestionText(""), "");
});

test("normalizeQuestionText folds screen-reader choice labels into the letter", () => {
  assert.equal(normalizeQuestionText("(Choice A)\nA\nperiods. The"), "A\nperiods. The");
  assert.equal(normalizeQuestionText("Option B:\nperiods: the"), "B\nperiods: the");
});

test("checkQuestionText refuses short text with a friendly message", () => {
  assert.deepEqual(checkQuestionText("   \n "), { ok: false, message: "No text came through. Select the question on the page, then try again." });
  assert.deepEqual(checkQuestionText("", "paste"), { ok: false, message: "Paste a question first." });
  const short = checkQuestionText("periods. The", "paste");
  assert.equal(short.ok, false);
  assert.equal(!short.ok && short.message, "That's only 12 characters, which is too short to be a question. Paste the whole question, including any answer choices, then try again.");
  const sel = checkQuestionText("x");
  assert.equal(!sel.ok && sel.message.startsWith("That's only 1 character, "), true);
  const ok = checkQuestionText("Which choice completes the text?\r\nA) one\r\nB) two\r\nC) three\r\nD) four");
  assert.deepEqual(ok, { ok: true, text: "Which choice completes the text?\nA) one\nB) two\nC) three\nD) four" });
  const long = checkQuestionText("word ".repeat(2000));
  assert.equal(long.ok && long.text.length, 6000);
});

// ---------------------------------------------------------------- choice-line detection

test("splitQuestion: choices that start lines, A) style", () => {
  const q = splitQuestion("Since the 1800s, scholars have studied it.\nWhich choice completes the text?\nA) periods. The\nB) periods: the\nC) periods; the\nD) periods, the");
  assert.equal(q.body, "Since the 1800s, scholars have studied it.\nWhich choice completes the text?");
  assert.deepEqual(q.choices, [
    { letter: "A", text: "periods. The" },
    { letter: "B", text: "periods: the" },
    { letter: "C", text: "periods; the" },
    { letter: "D", text: "periods, the" },
  ]);
  assert.equal(q.after, "");
});

test("splitQuestion: inline (A) choices from a PDF go on their own lines", () => {
  const q = splitQuestion("The author's claim is supported by which finding? (A) The first finding (B) The second one (C) A third result (D) None of these");
  assert.equal(q.body, "The author's claim is supported by which finding?");
  assert.deepEqual(q.choices.map((c) => c.text), ["The first finding", "The second one", "A third result", "None of these"]);
  const close = splitQuestion("Choose the best word: A) red B) blue C) green D) gold");
  assert.equal(close.body, "Choose the best word:");
  assert.deepEqual(close.choices.map((c) => `${c.letter}=${c.text}`), ["A=red", "B=blue", "C=green", "D=gold"]);
});

test("splitQuestion: a letter alone on its line, with screen-reader labels and blank lines", () => {
  const q = splitQuestion(
    "Which choice best states the main idea of the text?\n\n(Choice A)\nA\nIt praises the plan.\n\n(Choice B)\nB\nIt questions the plan.\n\n(Choice C)\nC\nIt explains the plan.\n\n(Choice D)\nD\nIt rejects the plan.",
  );
  assert.equal(q.body, "Which choice best states the main idea of the text?");
  assert.deepEqual(q.choices.map((c) => c.text), ["It praises the plan.", "It questions the plan.", "It explains the plan.", "It rejects the plan."]);
  assert.equal(q.after, "");
});

test("splitQuestion: A. style, and Question Bank trailer text stays out of choice D", () => {
  const q = splitQuestion(
    "Text here about a study of bees and their habits in the wild.\nWhich choice completes the text?\nA. bees\nB. wasps\nC. ants\nD. moths\nCorrect Answer: C\nRationale\nChoice C is the best answer.",
  );
  assert.equal(q.body, "Text here about a study of bees and their habits in the wild.\nWhich choice completes the text?");
  assert.deepEqual(q.choices.map((c) => c.text), ["bees", "wasps", "ants", "moths"]);
  assert.equal(q.after, "Correct Answer: C\nRationale\nChoice C is the best answer.");
});

test("splitQuestion: no full A to D set means no choices", () => {
  const prose = "Just a paragraph of prose with no answer choices at all, only words.";
  assert.deepEqual(splitQuestion(prose), { body: prose, choices: [], after: "" });
  assert.deepEqual(splitQuestion("Pick one:\nA) one\nB) two\nC) three").choices, []);
});

// ---------------------------------------------------------------- layout math

const tenPx: Measure = (s) => s.length * 10;
const rows = (l: QuestionLayout) => l.lines.map((x) => [x.text, x.x, x.y] as const);

test("layoutQuestion: body, choice labels and hanging indent", () => {
  const layout = layoutQuestion(
    { body: "Hello world", choices: [{ letter: "A", text: "one" }, { letter: "B", text: "aaaa bbbb cccc dddd eeee ffff" }], after: "" },
    null,
    tenPx,
    400,
  );
  // inner 320; label "A)" 20 + gap 14 = 34; choices start at 40 + 12 = 52, text at 86, text width 274
  assert.deepEqual(rows(layout), [
    ["Hello world", 40, 46],
    ["A)", 52, 99],
    ["one", 86, 99],
    ["B)", 52, 140],
    ["aaaa bbbb cccc dddd eeee", 86, 140],
    ["ffff", 86, 171],
  ]);
  assert.equal(layout.width, 400);
  assert.equal(layout.height, 237);
});

test("layoutQuestion: header, trailing text, blank lines and default width", () => {
  const layout = layoutQuestion({ body: "Hi", choices: [], after: "Correct Answer: B" }, "From x", tenPx, 400);
  assert.deepEqual(rows(layout), [["From x", 40, 44], ["Hi", 40, 94], ["Correct Answer: B", 40, 151]]);
  assert.equal(layout.height, 216);
  assert.ok(layout.lines[0]!.font.startsWith("600 18px"));
  const blank = layoutQuestion({ body: "One\n\nTwo", choices: [], after: "" }, null, tenPx, 400);
  assert.deepEqual(rows(blank), [["One", 40, 46], ["Two", 40, 114]]);
  assert.equal(blank.height, 182);
  assert.equal(layoutQuestion({ body: "x", choices: [], after: "" }, null, tenPx).width, 1100);
});

test("imageHeader names the site only, never the tab title", () => {
  assert.equal(sourceLabel("https://www.khanacademy.org/test-prep/sat"), "khanacademy.org");
  assert.equal(sourceLabel("file:///Users/me/practice-test-4.pdf"), "a local file");
  assert.equal(sourceLabel("not a url"), null);
  assert.equal(imageHeader({ url: "https://www.khanacademy.org/x", title: "  SAT   practice " }), "Selected from khanacademy.org");
  assert.equal(imageHeader({ url: "https://mail.google.com/mail/u/0", title: "Re: my private email subject" }), "Selected from mail.google.com");
  assert.equal(imageHeader({}), null);
});

// ---------------------------------------------------------------- selection plumbing

test("pickSelectionText prefers the page text (with line breaks) when it matches the menu text", () => {
  assert.equal(pickSelectionText("A) one B) two", "A) one\nB) two"), "A) one\nB) two");
  assert.equal(pickSelectionText("Hello there", ""), "Hello there");
  assert.equal(pickSelectionText("", "From the page"), "From the page");
  assert.equal(pickSelectionText("abc def", "something else entirely"), "abc def");
});

test("pendingFromClick builds the session value", () => {
  assert.deepEqual(pendingFromClick("  line1\r\nline2  ", { pageUrl: "https://ex.com/a" }, { url: "https://tab.com", title: " T ", windowId: 7 }, 123), {
    text: "line1\nline2",
    url: "https://ex.com/a",
    title: "T",
    at: 123,
    windowId: 7,
  });
  const big = pendingFromClick("x".repeat(7000), {}, undefined, 1);
  assert.equal(big.text.length, SELECTION_MAX_CHARS);
  assert.equal(big.url, null);
  assert.equal(big.title, null);
  assert.equal(big.windowId, null);
  assert.equal(pendingFromClick("t", { frameUrl: "https://f.com" }, { windowId: -1 }, 1).url, "https://f.com");
  assert.equal(pendingFromClick("t", {}, { windowId: -1 }, 1).windowId, null);
});

test("pending selections must look right and be fresh", () => {
  assert.equal(isPendingSelection({ text: "x", at: 1 }), true);
  assert.equal(isPendingSelection({ text: 1, at: 1 }), false);
  assert.equal(isPendingSelection(null), false);
  assert.equal(isFreshSelection({ at: 1_000 }, 1_000 + 5 * 60_000), true);
  assert.equal(isFreshSelection({ at: 0 }, 11 * 60_000), false);
  assert.equal(isFreshSelection({ at: 3 * 60_000 }, 0), false);
});

// ---------------------------------------------------------------- paste helpers

test("normalizePastedText drops bullets and tidies like normalizeQuestionText", () => {
  assert.equal(normalizePastedText("\u2022 A) one\r\n  \u25E6 B) two\n\u25CF C) three"), "A) one\nB) two\nC) three");
  assert.equal(normalizePastedText("plain   text "), "plain text");
});

test("looksLikeQuestion heuristics", () => {
  const full = "Since the 1800s, scholars have studied it in three primary ______\nWhich choice completes the text?\nA) periods. The\nB) periods: the\nC) periods; the\nD) periods, the";
  assert.equal(questionSignals(full).choices, true);
  assert.equal(looksLikeQuestion(full), true);
  assert.equal(looksLikeQuestion("Which choice best describes the function of the underlined sentence in the text as a whole?"), true);
  assert.equal(looksLikeQuestion("Researchers studied the reef for a decade, and the data suggest the coral ______"), true);
  assert.equal(looksLikeQuestion("Solve the equation 4x - 7 = 21 for x and type your answer below."), true);
  assert.equal(looksLikeQuestion("Thanks for the update on the field trip, see you on Monday at school."), false);
  assert.equal(looksLikeQuestion("Is this a question?"), false);
  const s = questionSignals("Thanks for the update on the field trip, see you on Monday at school.");
  assert.deepEqual(s, { chars: 69, choices: false, prompt: false, blank: false, math: false });
});

test("scaleToFit scales the long edge down, never up", () => {
  assert.deepEqual(scaleToFit(3200, 1800, 1600), { width: 1600, height: 900, scale: 0.5 });
  const tall = scaleToFit(1000, 3000, 1600);
  assert.equal(tall.width, 533);
  assert.equal(tall.height, 1600);
  assert.deepEqual(scaleToFit(800, 600, 1600), { width: 800, height: 600, scale: 1 });
  assert.deepEqual(scaleToFit(1600, 1600, 1600), { width: 1600, height: 1600, scale: 1 });
  assert.equal(scaleToFit(5000, 2, 1600).height, 1);
  assert.deepEqual(scaleToFit(0, 100, 1600), { width: 0, height: 0, scale: 0 });
  assert.deepEqual(scaleToFit(Number.NaN, 100, 1600), { width: 0, height: 0, scale: 0 });
});

test("image files: PNG or JPEG only, not empty, at most 20 MB", () => {
  assert.equal(isAcceptedImage({ type: "image/png" }), true);
  assert.equal(isAcceptedImage({ type: "image/jpeg" }), true);
  assert.equal(isAcceptedImage({ type: "image/gif" }), false);
  assert.equal(isAcceptedImage({ type: "", name: "shot.JPG" }), true);
  assert.equal(isAcceptedImage({ type: "image/webp", name: "x.png" }), false);
  assert.equal(checkImageFile({ type: "image/jpeg", size: 1000 }), null);
  assert.equal(checkImageFile({ type: "image/png", size: 0 }), "That file is empty. Choose another screenshot.");
  assert.equal(checkImageFile({ type: "image/png", size: 25 * 1024 * 1024 }), "That file is over 20 MB. Use a smaller screenshot.");
  assert.equal(checkImageFile({ type: "image/gif", size: 10 }), "That file isn't a PNG or JPEG. Use a screenshot saved as PNG or JPEG.");
});

// ---------------------------------------------------------------- seen before

const BASE = {
  stem: "Which choice completes the text so that it conforms to the conventions of Standard English?",
  choices: { A: "periods. The", B: "periods: the", C: "periods; the", D: "periods, the" },
};
const P1 = "Since the nineteenth century, Egyptologists have divided ancient Egyptian history into three primary ______";

test("findPrevious matches by qbId first (any case), newest first", () => {
  const old1 = entry({ at: at(2026, 10, 12), picked: "B", result: "missed", qbId: "c3397d25" });
  const old2 = entry({ at: at(2026, 9, 1), picked: "C", result: "right", qbId: "c3397d25" });
  const other = entry({ at: at(2026, 10, 20), qbId: "ffff0000", stem: "Something else", passage: "Different" });
  const q = { qbId: "C3397D25", ...BASE, passage: P1 };
  const prev = findPrevious([other, old2, old1], q);
  assert.deepEqual(prev.map((p) => [p.attemptId, p.matchedBy, p.score]), [[old1.attemptId, "qbId", 1], [old2.attemptId, "qbId", 1]]);
  assert.equal(seenSentence(prev.slice(0, 1), NOW), "You did this question on Oct 12 and picked B (missed).");
  assert.equal(ruleLine(prev[0]!), "Rule: B1 Comma splice.");
  assert.equal(seenSentence(prev, NOW), "You did this question 2 times before. Last time was Oct 12: you picked B (missed).");
  assert.equal(prev[0]!.ruleStatement, "Two independent clauses can't be joined by a comma alone.");
  assert.equal(prev[0]!.takeaway, "Period, semicolon, or comma + FANBOYS.");
});

test("findPrevious falls back to passage + stem + choices similarity", () => {
  const seen = entry({ at: at(2026, 10, 12), qbId: null, passage: P1, ...BASE });
  const sameText = { qbId: null, stem: BASE.stem.toUpperCase(), passage: `  ${P1}`, choices: { ...BASE.choices } };
  const m = findPrevious([seen], sameText);
  assert.equal(m.length, 1);
  assert.equal(m[0]!.matchedBy, "text");
  assert.equal(seenSentence(m, NOW), "Looks like you did this question on Oct 12 and picked A (missed).");
  // One OCR slip still matches (Dice 70/72).
  assert.equal(findPrevious([seen], { ...sameText, passage: P1.replace("Egyptologists", "Egyptoiogists") }).length, 1);
  // Same boilerplate stem and choices, different passage: not the same question (Dice 48/75).
  const p2 = "Octopuses can change the color and texture of their skin in a fraction of a second ______";
  assert.equal(findPrevious([seen], { ...sameText, passage: p2 }).length, 0);
});

test("findPrevious: different numbers or different qbIds never match", () => {
  const math = entry({ qbId: null, passage: null, stem: "If 3x + 5 = 20, what is the value of x?", choices: { A: "3", B: "5", C: "7", D: "15" } });
  const same = { qbId: null, passage: null, stem: "If 3x + 5 = 20, what is the value of x?", choices: { A: "3", B: "5", C: "7", D: "15" } };
  assert.equal(findPrevious([math], same).length, 1);
  assert.equal(findPrevious([math], { ...same, stem: "If 3x + 7 = 20, what is the value of x?" }).length, 0);
  const withId = entry({ qbId: "c3397d25", passage: P1, ...BASE });
  const noId = entry({ qbId: null, passage: P1, ...BASE });
  const prev = findPrevious([withId, noId], { qbId: "zz999999", passage: P1, ...BASE });
  assert.deepEqual(prev.map((p) => p.attemptId), [noId.attemptId]);
});

test("findPrevious skips excluded attempts and later ones", () => {
  const a = entry({ at: at(2026, 10, 12), qbId: "c3397d25" });
  const b = entry({ at: at(2026, 9, 1), qbId: "c3397d25" });
  const q = { qbId: "c3397d25", passage: P1, ...BASE };
  assert.deepEqual(findPrevious([a, b], q, { excludeAttemptIds: [a.attemptId, null] }).map((p) => p.attemptId), [b.attemptId]);
  assert.deepEqual(findPrevious([a, b], q, { before: at(2026, 10, 1) }).map((p) => p.attemptId), [b.attemptId]);
  assert.deepEqual(findPrevious([], q), []);
});

test("seen wording: dates, picks and rule line", () => {
  assert.equal(whenPhrase(at(2026, 10, 29, 8), NOW), "today");
  assert.equal(whenPhrase(at(2026, 10, 28, 23), NOW), "yesterday");
  assert.equal(whenPhrase(at(2026, 10, 12), NOW), "on Oct 12");
  assert.equal(whenPhrase(at(2025, 10, 12), NOW), "on Oct 12, 2025");
  assert.equal(pickedPhrase({ picked: "C", result: "right" }), "picked C (right)");
  const right = findPrevious([entry({ at: at(2026, 10, 12), picked: "correct", result: "right", qbId: "q1" })], { qbId: "q1", ...BASE, passage: P1 });
  assert.equal(seenSentence(right, NOW), "You did this question on Oct 12 and got it right.");
  assert.equal(ruleLine({ ruleId: "B1", ruleName: null }), "Rule: B1.");
  assert.equal(ruleLine({ ruleId: "B1", ruleName: "Comma splice. " }), "Rule: B1 Comma splice.");
  assert.equal(seenSentence([], NOW), "");
});

// ---------------------------------------------------------------- weekly report

function fixture() {
  const log = [
    entry({ at: at(2026, 10, 29, 10), ruleId: "B1", ruleName: "Comma splice", result: "missed", skill: "Boundaries", seconds: 60, starred: true, note: "  Watch for two full sentences.  " }),
    entry({ at: at(2026, 10, 28, 9), ruleId: "B1", ruleName: "Comma splice", result: "missed", skill: "Boundaries", seconds: 90 }),
    entry({ at: at(2026, 10, 28, 15), ruleId: "F2", ruleName: "Contrast transitions", result: "right", picked: "C", skill: "Transitions", seconds: 30 }),
    entry({ at: at(2026, 10, 27, 20), ruleId: "F2", ruleName: "Contrast transitions", result: "missed", skill: "Transitions", seconds: 2000 }),
    entry({ at: at(2026, 10, 23, 0), ruleId: "C3", ruleName: "Pronoun agreement", result: "right", picked: "C", skill: "Form, Structure, and Sense", seconds: null }),
    // last week
    entry({ at: at(2026, 10, 22, 23), result: "right", picked: "C", seconds: 45, drills: [{ at: at(2026, 10, 25), correct: true }] }),
    entry({ at: at(2026, 10, 16, 9), result: "missed", seconds: 50, starred: true, note: "old note", drills: [{ at: at(2026, 10, 17), correct: false }] }),
    // older
    entry({ at: at(2026, 10, 10), result: "missed" }),
  ];
  const rule = (ruleId: string, ruleName: string, box: number, due: number) => ({ ruleId, ruleName, box, due, attemptId: "x", reps: 1, lapses: 0, lastReviewed: null });
  const srs: SrsState = {
    B1: rule("B1", "Comma splice", 2, NOW - 1000),
    C3: rule("C3", "Pronoun agreement", 5, NOW + 5 * DAY),
    F9: rule("F9", "Dangling modifier", 6, NOW + 20 * DAY),
  };
  return { log, srs };
}

test("buildWeeklyReport numbers on a fixed clock", () => {
  const { log, srs } = fixture();
  const r = buildWeeklyReport(log, srs, NOW);
  assert.equal(r.thisWeek.start, at(2026, 10, 23, 0));
  assert.equal(r.thisWeek.end, at(2026, 10, 30, 0));
  assert.deepEqual(
    { q: r.thisWeek.questions, right: r.thisWeek.right, missed: r.thisWeek.missed, acc: r.thisWeek.accuracy, sec: r.thisWeek.seconds, timed: r.thisWeek.timed, days: r.thisWeek.daysPracticed, drills: r.thisWeek.drills, dc: r.thisWeek.drillsCorrect },
    { q: 5, right: 2, missed: 3, acc: 0.4, sec: 180, timed: 3, days: 4, drills: 1, dc: 1 },
  );
  assert.deepEqual(
    { q: r.lastWeek.questions, acc: r.lastWeek.accuracy, sec: r.lastWeek.seconds, days: r.lastWeek.daysPracticed, drills: r.lastWeek.drills, dc: r.lastWeek.drillsCorrect },
    { q: 2, acc: 0.5, sec: 95, days: 2, drills: 1, dc: 0 },
  );
  assert.equal(r.streakDays, 3);
  assert.equal(r.practicedToday, true);
  assert.deepEqual(r.topMissedRules, [
    { key: "B1", label: "B1 · Comma splice", misses: 2, attempts: 2 },
    { key: "F2", label: "F2 · Contrast transitions", misses: 1, attempts: 2 },
  ]);
  assert.deepEqual(r.topMissedSkills.map((g) => [g.label, g.misses, g.attempts]), [["Boundaries", 2, 2], ["Transitions", 1, 2]]);
  assert.deepEqual(r.mastered, [{ ruleId: "F9", label: "F9 · Dangling modifier" }, { ruleId: "C3", label: "C3 · Pronoun agreement" }]);
  assert.equal(r.dueRules, 1);
  assert.deepEqual(r.notes.map((n) => n.note), ["Watch for two full sentences."]);
  assert.deepEqual(r.allTime, { questions: 8, accuracy: 0.375 });
  assert.equal(reportHeadline(r), "5 questions this week, up from 2 last week, with 40% right.");
  assert.equal(reportHeadline({ ...r, student: "Maya" }), "Maya answered 5 questions this week, up from 2 last week, and got 40% right.");
  assert.deepEqual(weekRows(r), [
    ["Questions", "5 (last week: 2)"],
    ["Accuracy", "40% (last week: 50%)"],
    ["Time practiced", "3 min (timed on 3 of 5 questions)"],
    ["Days practiced", "4 of 7"],
    ["Streak", "3 days in a row"],
    ["Review drills", "1 (1 right)"],
  ]);
});

test("toReportText is plain text a parent can read", () => {
  const { log, srs } = fixture();
  const text = toReportText(buildWeeklyReport(log, srs, NOW, { student: "Maya" }));
  const lines = text.split("\n");
  assert.equal(lines[0], "Rulecard weekly report for Maya");
  assert.equal(lines[1], "Oct 23 to Oct 29, 2026");
  for (const line of [
    "- Questions: 5 (last week: 2)",
    "- Accuracy: 40% (last week: 50%)",
    "- B1 · Comma splice: missed 2 of 2",
    "- Boundaries: missed 2 of 2",
    "Rules mastered (2)",
    "- F9 · Dangling modifier",
    "- Oct 29, B1 · Comma splice: Watch for two full sentences.",
  ]) assert.ok(lines.includes(line), `missing line: ${line}`);
  assert.ok(!text.includes("old note"));
  assert.ok(!text.includes("\u2014"));
});

test("an empty week still reads well", () => {
  const r = buildWeeklyReport([], {}, NOW);
  assert.equal(r.thisWeek.accuracy, null);
  assert.equal(reportHeadline(r), "No practice this week.");
  const text = toReportText(r);
  for (const line of ["- Accuracy: n/a (last week: n/a)", "- Time practiced: not timed (the pacing timer was off)", "- Streak: none right now", "- No misses this week.", "- None yet.", "- No starred questions this week."]) {
    assert.ok(text.split("\n").includes(line), `missing line: ${line}`);
  }
});

test("formatDuration and pct", () => {
  assert.equal(formatDuration(0), "0 min");
  assert.equal(formatDuration(30), "under 1 min");
  assert.equal(formatDuration(89), "1 min");
  assert.equal(formatDuration(180), "3 min");
  assert.equal(formatDuration(3600), "1 h");
  assert.equal(formatDuration(5400), "1 h 30 min");
  assert.equal(pct(0.714), "71%");
  assert.equal(pct(null), "n/a");
});

test("toReportHtml escapes everything and has no scripts", () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  assert.equal(escapeHtml(null), "");
  const r = buildWeeklyReport(
    [entry({ at: at(2026, 10, 29, 9), starred: true, note: `<script>alert("x")</script> & 'q'`, ruleName: "<img src=x onerror=alert(1)>", skill: "<i>Skill</i>" })],
    {},
    NOW,
    { student: "<b>Maya</b>" },
  );
  const html = toReportHtml(r);
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(!/<script/i.test(html));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<i>"));
  assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;"));
  assert.ok(html.includes("<h1>Rulecard weekly report for &lt;b&gt;Maya&lt;/b&gt;</h1>"));
  assert.ok(html.includes("To save as PDF"));
  const full = toReportHtml(buildWeeklyReport(fixture().log, fixture().srs, NOW));
  assert.ok(full.includes("B1 · Comma splice"));
  assert.ok(full.includes("Rules mastered (2)"));
});
