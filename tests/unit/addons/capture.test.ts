// Tests for seen.ts and report.ts (the pure parts).
import { test } from "vitest";
import assert from "node:assert/strict";
import { at, entry } from "./helpers";
import { findPrevious, pickedPhrase, ruleLine, seenSentence, whenPhrase } from "../../../extension/src/addons/seen";
import { buildWeeklyReport, escapeHtml, formatDuration, pct, reportHeadline, toReportHtml, toReportText, weekRows } from "../../../extension/src/addons/report";
import { DAY, type SrsState } from "../../../extension/src/addons/srs";

const NOW = at(2026, 10, 29, 18);

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
