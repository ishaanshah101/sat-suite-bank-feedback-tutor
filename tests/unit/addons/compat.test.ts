// Upstream 0.3.0 compatibility: Math multiple choice and grid-in attempts through logging,
// export, journal search, stats and sets, plus entries saved before 0.3.0. All questions are made up.
import { test } from "vitest";
import assert from "node:assert/strict";
import { answerLine, cardAsText, plainMath, toAnkiCsv, toMarkdown, toPrintableHtml } from "../../../extension/src/addons/export";
import { defaultFilter, filterJournal } from "../../../extension/src/addons/journal";
import { answerText, entryFromExplain, hasChoiceList, importEntries, isGridIn, readLog, repairEntry, responseText, sectionOf, type LogEntry } from "../../../extension/src/addons/log";
import { buildRecap } from "../../../extension/src/addons/sets";
import { memoryKV, setKV } from "../../../extension/src/addons/store";
import { insights, MATH_TARGET_SECONDS, summarize, TARGET_SECONDS, targetSecondsFor } from "../../../extension/src/addons/stats";
import { choicesOf, hasChoices, isMathTaxonomy, normalizeQuestion, type ApiExplainResponse, type ApiQuestion, type ApiRuleCard } from "../../../extension/src/addons/types";
import { entry } from "./helpers";

const mathQuestion = (p: Partial<ApiQuestion> = {}): ApiQuestion => ({
  id: "q-math", qbId: "9a8b7c6d", section: "math", format: "mcq", source: "capture", test: "SAT",
  domain: "Algebra", skill: "Linear equations in one variable", difficulty: "Medium",
  stem: "If \\(3x + 5 = 20\\), what is the value of \\(\\frac{x}{2}\\)?", passage: null,
  choices: { A: "\\(2\\)", B: "\\(\\frac{5}{2}\\)", C: "\\(5\\)", D: "\\(10\\)" }, correct: "B",
  answers: null, figure: null, answerSource: "official", rationale: null, ...p,
});

const mathCard = (p: Partial<ApiRuleCard> = {}): ApiRuleCard => ({
  rule_id: "M-LIN1", rule_statement: "Undo operations in reverse order to isolate the variable.",
  correct_letter: "B", correct_answer: null, why_correct: "\\(x = 5\\), so \\(\\frac{x}{2} = \\frac{5}{2}\\).",
  why_pick_fails: "2 is what you get if you stop before solving for x.", eliminations: [],
  steps: ["Subtract 5: \\(3x = 15\\).", "Divide by 3: \\(x = 5\\).", "Halve it: \\(\\frac{5}{2}\\)."],
  shortcut: "In Desmos, graph \\(y = 3x + 5\\) and \\(y = 20\\) and read the x of the intersection.",
  takeaway: "Answer the question asked: it wants x/2, not x.", diagnosis: "careless", confidence: 0.9,
  solved_by_model: false, suggested_rule: null, ...p,
});

const mcq: ApiExplainResponse = { attemptId: "m1", question: mathQuestion(), card: mathCard(), rule: { id: "M-LIN1", name: "Isolate the variable" }, isCorrect: false };

const gridQuestion = mathQuestion({
  id: "q-grid", qbId: "1f2e3d4c", format: "spr", domain: "Problem-Solving and Data Analysis", skill: "Probability and conditional probability",
  stem: "A bag holds 3 red and 14 blue marbles. One is drawn at random. What is the probability it is red?",
  choices: null, correct: null, answers: [".1764", ".1765", "3/17"], figure: "A table: red 3, blue 14, total 17.",
});
const gridCard = mathCard({
  rule_id: "M-PROB1", rule_statement: "Probability is favorable outcomes over total outcomes.",
  correct_letter: null, correct_answer: "3/17", why_correct: "3 red out of 17 marbles is \\(\\frac{3}{17}\\).",
  why_pick_fails: "You divided by the blue count instead of the total.", steps: ["Total: \\(3 + 14 = 17\\).", "Red over total: \\(\\frac{3}{17}\\)."],
  shortcut: null, takeaway: "Divide by the total, not the other group.", diagnosis: "rule_gap",
});
const grid: ApiExplainResponse = { attemptId: "g1", question: gridQuestion, card: gridCard, rule: { id: "M-PROB1", name: "Favorable over total" }, isCorrect: false };

test("Math multiple choice logs section, format, steps and shortcut, and keeps the letters", () => {
  const e = entryFromExplain(mcq, "A", { now: 5, seconds: 80 });
  assert.equal(e.result, "missed");
  assert.equal(e.section, "math");
  assert.equal(e.format, "mcq");
  assert.equal(e.picked, "A");
  assert.equal(e.correct, "B");
  assert.equal(e.choices.B, "\\(\\frac{5}{2}\\)");
  assert.equal(e.steps?.length, 3);
  assert.match(e.shortcut ?? "", /Desmos/);
  assert.equal("typed" in e, false);
  assert.equal("accepted" in e, false);
  assert.equal(isGridIn(e), false);
  assert.equal(hasChoiceList(e), true);
  assert.equal(answerText(e), "B");
  assert.equal(responseText(e), "A");
});

test("the server's isCorrect wins; without it the old rule applies", () => {
  assert.equal(entryFromExplain({ ...mcq, isCorrect: true }, "A").result, "right");
  assert.equal(entryFromExplain({ ...mcq, isCorrect: null }, "B").result, "right");
  assert.equal(entryFromExplain({ ...mcq, isCorrect: null }, "A").result, "missed");
  assert.equal(entryFromExplain({ ...mcq, isCorrect: undefined }, "correct").result, "right");
});

test("grid-in logs the typed and accepted answers with empty choices and placeholder letters", () => {
  const e = entryFromExplain(grid, "spr", { typed: " 3/14 ", now: 9 });
  assert.equal(e.format, "spr");
  assert.equal(e.section, "math");
  assert.equal(e.result, "missed");
  assert.equal(e.typed, "3/14");
  assert.deepEqual(e.accepted, ["3/17", ".1764", ".1765"]);
  assert.deepEqual(e.choices, { A: "", B: "", C: "", D: "" });
  assert.equal(e.picked, "correct");
  assert.equal(e.correct, "A");
  assert.equal(e.figure, "A table: red 3, blue 14, total 17.");
  assert.equal(isGridIn(e), true);
  assert.equal(hasChoiceList(e), false);
  assert.equal(answerText(e), "3/17");
  assert.equal(responseText(e), "3/14");

  const right = entryFromExplain({ ...grid, attemptId: "g2", isCorrect: true, card: { ...gridCard, diagnosis: "got_it_right" } }, "spr", { typed: ".1765" });
  assert.equal(right.result, "right");
  const claimed = entryFromExplain({ ...grid, attemptId: "g3", isCorrect: true }, "correct", { typed: "ignored" });
  assert.equal(claimed.typed, null);
  assert.equal(claimed.result, "right");
});

test("a grid-in with no known answer yet still logs, with an empty accepted list", () => {
  const e = entryFromExplain({ ...grid, isCorrect: null, question: { ...gridQuestion, answers: null }, card: { ...gridCard, correct_answer: null } }, "spr", { typed: "1" });
  assert.deepEqual(e.accepted, []);
  assert.equal(answerText(e), "?");
  assert.equal(e.result, "missed");
});

test("entries saved before 0.3.0 stay valid: Reading and Writing, multiple choice, same exports", () => {
  const old = entry();
  assert.equal(sectionOf(old), "rw");
  assert.equal(isGridIn(old), false);
  assert.equal(answerLine(old), "Answer C, you picked A.");
  const csv = toAnkiCsv([old]);
  assert.match(csv, /A\. tools, lawn<br>B\. tools lawn/);
  assert.match(csv, /Why A fails/);
  assert.ok(!csv.includes("section::math"));
  assert.equal(sectionOf(entry({ skill: "Circles", domain: "Geometry and Trigonometry" })), "math");
});

test("exports: grid-in shows accepted and typed answers and no choice list", () => {
  const e = entryFromExplain(grid, "spr", { typed: "3/14" });
  const row = toAnkiCsv([e]).trim().split("\n")[3]!;
  assert.match(row, /Grid-in: type your answer\./);
  assert.ok(!/A\. /.test(row), "no A-D list");
  assert.match(row, /Answer: 3\/17/);
  assert.match(row, /Also accepted: \.1764, \.1765/);
  assert.match(row, /Why 3\/14 fails:/);
  assert.match(row, /<b>Steps:<\/b><ol><li>/);
  assert.match(row, /Figure:/);
  assert.match(row, /section::math grid_in missed/);

  const md = toMarkdown([e]);
  assert.match(md, /Answer \*\*3\/17\*\* \(also accepted: \.1764, \.1765\), you entered \*\*3\/14\*\*\. 3 red out of 17 marbles is 3\/17\./);
  assert.match(md, / {4}1\. Total: 3 \+ 14 = 17\./);
  assert.ok(!md.includes("you picked"));

  const html = toPrintableHtml([e]);
  assert.match(html, /Answer 3\/17 \(also accepted: \.1764, \.1765\), you entered 3\/14\./);
  assert.ok(!html.includes("you picked"));

  const txt = cardAsText(e);
  assert.match(txt, /Why 3\/17 is right: 3 red out of 17 marbles is 3\/17\./);
  assert.match(txt, /Also accepted: \.1764, \.1765/);
  assert.match(txt, /Why 3\/14 fails:/);
  assert.match(txt, /Steps:\n1\. Total/);
  assert.ok(!/Why A /.test(txt));

  const blank = entryFromExplain({ ...grid, card: { ...gridCard, why_pick_fails: null } }, "spr", { typed: "2" });
  assert.match(cardAsText(blank), /You entered 2\./);
  assert.match(toAnkiCsv([blank]), /You entered:<\/b> 2/);
});

test("exports: Math multiple choice keeps the letters; LaTeX stays for Anki and reads as text elsewhere", () => {
  const e = entryFromExplain(mcq, "A");
  const row = toAnkiCsv([e]).trim().split("\n")[3]!;
  assert.match(row, /B\. \\\(\\frac\{5\}\{2\}\\\)/);
  assert.match(row, /Why A fails/);
  assert.match(row, /section::math missed/);
  assert.ok(!row.includes("grid_in"));
  const md = toMarkdown([e]);
  assert.match(md, /If 3x \+ 5 = 20, what is the value of x\/2\?/);
  assert.match(md, /Answer \*\*B\*\*, you picked \*\*A\*\*\./);
  assert.match(md, /Shortcut: In Desmos, graph y = 3x \+ 5/);
  assert.match(cardAsText(e), /Why B is right: x = 5, so x\/2 = 5\/2\./);
});

test("plainMath turns common LaTeX into readable text", () => {
  assert.equal(plainMath("No math here (really)."), "No math here (really).");
  assert.equal(plainMath("\\(\\frac{3}{4}\\)"), "3/4");
  assert.equal(plainMath("Solve \\(x^{2} \\le 9\\) now"), "Solve x^2 ≤ 9 now");
  assert.equal(plainMath("\\(\\sqrt{x+1} \\cdot 2\\)"), "√(x+1) · 2");
  assert.equal(plainMath("\\(\\dfrac{x+1}{2}\\)"), "(x+1)/2");
  assert.equal(plainMath("angle \\(30^{\\circ}\\)"), "angle 30°");
  assert.equal(plainMath("\\(\\frac{\\sqrt{2}}{2}\\)"), "√2/2");
});

test("stats: bySection split and per-section pace", () => {
  const log: LogEntry[] = [
    entryFromExplain(mcq, "A", { seconds: 90 }),
    entryFromExplain({ ...grid, attemptId: "g9" }, "spr", { typed: "1", seconds: 100 }),
    entry({ seconds: 90 }),
    entry({ result: "right", seconds: 60 }),
  ];
  const s = summarize(log, {});
  const math = s.bySection.find((g) => g.key === "math");
  const rw = s.bySection.find((g) => g.key === "rw");
  assert.deepEqual([math?.label, math?.attempts, math?.misses], ["Math", 2, 2]);
  assert.deepEqual([rw?.label, rw?.attempts, rw?.misses], ["Reading and Writing", 2, 1]);
  // Math 90 s is under 95, Math 100 s and R&W 90 s are over their pace.
  assert.equal(s.pacing.slow, 2);
  assert.equal(s.pacing.target, Math.round((95 + 95 + 71 + 71) / 4));
  assert.equal(targetSecondsFor(null), TARGET_SECONDS);
  assert.equal(targetSecondsFor({ section: "math" }), MATH_TARGET_SECONDS);
  assert.equal(targetSecondsFor({ skill: "Linear functions" }), MATH_TARGET_SECONDS);
  assert.equal(summarize([entry()], {}).bySection.length, 1);
});

test("insights: a big gap between sections gets named; Math-heavy careless misses get the Math tip", () => {
  const mathMiss = (i: number) => entryFromExplain({ ...mcq, attemptId: `mm${i}`, card: mathCard({ diagnosis: "careless" }) }, "A");
  const log = [
    ...Array.from({ length: 5 }, (_, i) => mathMiss(i)),
    ...Array.from({ length: 5 }, () => entry({ result: "right", diagnosis: "got_it_right" })),
  ];
  const tips = insights(summarize(log, {})).map((t) => t.text).join("\n");
  assert.match(tips, /You miss 100% in Math and 0% in Reading and Writing/);
  assert.match(tips, /reread what the question asks for/);
});

test("journal: search finds typed and accepted answers; section filter", () => {
  const g = entryFromExplain(grid, "spr", { typed: "3/14" });
  const log = [g, entry()];
  assert.deepEqual(filterJournal(log, { ...defaultFilter(), q: "1765" }).map((e) => e.attemptId), ["g1"]);
  assert.deepEqual(filterJournal(log, { ...defaultFilter(), q: "3/14" }).map((e) => e.attemptId), ["g1"]);
  assert.equal(filterJournal(log, { ...defaultFilter(), section: "math" }).length, 1);
  assert.equal(filterJournal(log, { ...defaultFilter(), section: "rw" })[0]?.attemptId, log[1]!.attemptId);
  assert.equal(filterJournal(log, defaultFilter()).length, 2);
});

test("sets: slow uses each question's own section pace", () => {
  const m = entryFromExplain(mcq, "A", { seconds: 90 });
  const r = entry({ seconds: 90 });
  assert.equal(buildRecap([m, r], [m.attemptId, r.attemptId], 0, 60_000).slow, 1);
});

test("import repairs malformed or partial entries and keeps the new fields", async () => {
  setKV(memoryKV());
  const g = entryFromExplain(grid, "spr", { typed: "3/14" });
  const broken = { ...entry({ attemptId: "x1" }), choices: null, section: "science", accepted: "3/17" } as unknown as LogEntry;
  assert.equal(await importEntries([g, broken]), 2);
  const log = await readLog();
  const x = log.find((e) => e.attemptId === "x1")!;
  assert.deepEqual(x.choices, { A: "", B: "", C: "", D: "" });
  assert.equal("section" in x, false);
  assert.equal("accepted" in x, false);
  assert.deepEqual(log.find((e) => e.attemptId === "g1")?.accepted, ["3/17", ".1764", ".1765"]);
  assert.deepEqual(repairEntry(entry({ attemptId: "ok" })).choices, entry().choices);
});

test("types helpers: normalizeQuestion, hasChoices, Math taxonomy", () => {
  const q = normalizeQuestion(gridQuestion);
  assert.deepEqual(q.choices, { A: "", B: "", C: "", D: "" });
  assert.equal(q.format, "spr");
  assert.equal(normalizeQuestion({ id: "old", stem: "s", choices: { A: "a", B: "b", C: "c", D: "d" } }).format, "mcq");
  assert.equal(hasChoices(gridQuestion.choices), false);
  assert.equal(hasChoices({ A: "a", B: "b", C: " ", D: "d" }), false);
  assert.deepEqual(choicesOf({ A: "a" }), { A: "a", B: "", C: "", D: "" });
  assert.equal(isMathTaxonomy("algebra", null), true);
  assert.equal(isMathTaxonomy(null, "Two-variable data:  Models and scatterplots"), true);
  assert.equal(isMathTaxonomy("Standard English Conventions", "Boundaries"), false);
});
