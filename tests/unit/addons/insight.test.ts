// Tests for the Skill map (skillmap.ts) and the Word bank (vocab.ts). Every passage and question here is made up
// for the tests (no College Board text). The render functions are not called: tests run in Node without a DOM.
import { test } from "vitest";
import assert from "node:assert/strict";
import type { LogEntry } from "../../../extension/src/addons/log";
import { qbFilterSteps, SKILLS } from "../../../extension/src/addons/taxonomy";
import { groupByDomain, levelFor, shortSkillName, skillDetail, skillMap, suggestedDifficulty, type SkillCell } from "../../../extension/src/addons/skillmap";
import { blankOut, collectWords, confusables, filterWords, firstSentence, sentenceFor, wordsToAnkiCsv, type WordItem } from "../../../extension/src/addons/vocab";
import { entry } from "./helpers";

// ---------------------------------------------------------------- fixtures

const many = (n: number, p: Partial<LogEntry>) => Array.from({ length: n }, () => entry(p));
const mathEntry = (p: Partial<LogEntry> = {}) =>
  entry({ section: "math", domain: "Algebra", skill: "Linear functions", choices: { A: "3", B: "5", C: "7", D: "9" }, ...p });

function cellOf(log: LogEntry[], skill: string): SkillCell {
  const c = skillMap(log).find((x) => x.skill === skill);
  assert.ok(c, `no cell for ${skill}`);
  return c;
}

const KELP =
  "Marine biologist Dr. Lena Ortiz spent a decade tracking kelp forests along a rocky coast. Her survey showed that the forests were far more ______ than earlier models predicted, regrowing within months after storms. She now advises coastal towns on restoration.";
const KELP_SENTENCE =
  "Her survey showed that the forests were far more resilient than earlier models predicted, regrowing within months after storms.";
const KELP_MEANING = "\"Resilient\" means able to recover quickly, which matches forests regrowing within months.";
const MURAL = "The town's new mural uses colors so ______ that visitors stop to photograph it from across the square.";

const wic = (p: Partial<LogEntry> = {}) =>
  entry({
    domain: "Craft and Structure",
    skill: "Words in Context",
    stem: "Which word best fills the blank?",
    passage: KELP,
    choices: { A: "fragile", B: "resilient", C: "isolated", D: "uniform" },
    correct: "B",
    picked: "A",
    result: "missed",
    whyCorrect: `${KELP_MEANING} The other words miss the regrowth.`,
    ...p,
  });
const mural = (p: Partial<LogEntry> = {}) =>
  wic({
    passage: MURAL,
    choices: { A: "brisk", B: "idle", C: "vivid", D: "stale" },
    correct: "C",
    whyCorrect: "Vivid means bright and lifelike, which explains why people stop to take photos.",
    ...p,
  });

/** A small CSV reader for checking the export round trip. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------- skill map

test("skillMap: both sections give all 29 official skills in taxonomy order", () => {
  const cells = skillMap([], { sections: ["math", "rw"] });
  assert.equal(cells.length, 29);
  assert.deepEqual(cells.map((c) => c.skill), SKILLS.map((s) => s.skill));
  assert.equal(cells.filter((c) => c.section === "rw").length, 10);
  assert.equal(cells.filter((c) => c.section === "math").length, 19);
  assert.ok(cells.every((c) => c.level === "none" && c.attempts === 0 && c.accuracy === null && c.avgSeconds === null && c.lastAt === null && !c.slow));
});

test("skillMap: default sections follow the log, else Reading and Writing", () => {
  const empty = skillMap([]);
  assert.equal(empty.length, 10);
  assert.ok(empty.every((c) => c.section === "rw"));
  const mathOnly = skillMap([mathEntry()]);
  assert.equal(mathOnly.length, 19);
  assert.ok(mathOnly.every((c) => c.section === "math"));
  // An older entry without `section` still reads as Math from its skill.
  assert.equal(skillMap([entry({ skill: "Circles", domain: "Geometry and Trigonometry" })]).length, 19);
  assert.equal(skillMap([entry()]).length, 10);
  assert.equal(skillMap([entry(), mathEntry()]).length, 29);
  // An explicit list wins over the log; an empty list means the default.
  assert.equal(skillMap([entry()], { sections: ["math"] }).length, 19);
  assert.equal(skillMap([mathEntry()], { sections: [] }).length, 19);
});

test("skillMap: tolerant skill spellings count toward the official skill; unknown ones are ignored", () => {
  const log = [
    entry({ skill: "form structure and sense", result: "right", at: 1000 }),
    entry({ skill: "FORM, STRUCTURE, AND SENSE", result: "missed", at: 3000 }),
    entry({ skill: "Standard English Conventions: Form, Structure, and Sense", result: "right", at: 2000 }),
    entry({ skill: "A skill nobody has heard of" }),
    entry({ skill: null }),
    mathEntry({ skill: "Algebra: Linear functions", result: "right" }),
    mathEntry({ skill: "ratios, rates & units" }),
  ];
  const cells = skillMap(log);
  assert.equal(cells.length, 29);
  const fss = cells.find((c) => c.skill === "Form, Structure, and Sense");
  assert.equal(fss?.attempts, 3);
  assert.equal(fss?.right, 2);
  assert.equal(fss?.lastAt, 3000);
  assert.equal(fss?.domain, "Standard English Conventions");
  assert.equal(cells.find((c) => c.skill === "Linear functions")?.attempts, 1);
  assert.equal(cells.find((c) => c.skill === "Ratios, rates, proportional relationships, and units")?.attempts, 1);
  assert.equal(cells.reduce((s, c) => s + c.attempts, 0), 5);
});

test("levelFor and skillMap: accuracy and level thresholds", () => {
  assert.equal(levelFor(0, null), "none");
  assert.equal(levelFor(1, 0), "new");
  assert.equal(levelFor(2, 1), "new");
  assert.equal(levelFor(3, 0.49), "weak");
  assert.equal(levelFor(4, 0.5), "shaky");
  assert.equal(levelFor(4, 0.74), "shaky");
  assert.equal(levelFor(4, 0.75), "solid");
  assert.equal(levelFor(10, 0.89), "solid");
  assert.equal(levelFor(10, 0.9), "strong");
  assert.equal(levelFor(5, 1), "strong");
  const t = (right: number, missed: number) =>
    cellOf([...many(right, { skill: "Transitions", result: "right" }), ...many(missed, { skill: "Transitions", result: "missed" })], "Transitions");
  assert.equal(t(0, 0).level, "none");
  assert.equal(t(1, 1).level, "new");
  assert.equal(t(1, 2).level, "weak");
  assert.equal(t(2, 2).level, "shaky");
  assert.equal(t(3, 1).level, "solid");
  assert.equal(t(8, 1).level, "solid");
  assert.equal(t(9, 1).level, "strong");
  const c = t(3, 1);
  assert.equal(c.attempts, 4);
  assert.equal(c.right, 3);
  assert.equal(c.accuracy, 0.75);
});

test("skillMap: slow needs 3 timed attempts between 0 and 1800 s", () => {
  const two = many(2, { skill: "Inferences", domain: "Information and Ideas", seconds: 100 });
  const c2 = cellOf(two, "Inferences");
  assert.equal(c2.avgSeconds, 100);
  assert.equal(c2.targetSeconds, 71);
  assert.equal(c2.slow, false);
  // Untimed, zero and runaway timers are not timed attempts.
  const noisy = [...two, entry({ skill: "Inferences", seconds: null }), entry({ skill: "Inferences", seconds: 0 }), entry({ skill: "Inferences", seconds: 1800 })];
  const cn = cellOf(noisy, "Inferences");
  assert.equal(cn.attempts, 5);
  assert.equal(cn.avgSeconds, 100);
  assert.equal(cn.slow, false);
  const c3 = cellOf([...two, entry({ skill: "Inferences", seconds: 70 })], "Inferences");
  assert.equal(c3.avgSeconds, 90);
  assert.equal(c3.slow, true);
});

test("skillMap: Math uses the 95 s pace", () => {
  const circles = (seconds: number) => many(3, { section: "math", domain: "Geometry and Trigonometry", skill: "Circles", seconds });
  const cells = skillMap([...circles(90), ...many(3, { skill: "Boundaries", seconds: 90 })]);
  const c = cells.find((x) => x.skill === "Circles");
  assert.equal(c?.targetSeconds, 95);
  assert.equal(c?.avgSeconds, 90);
  assert.equal(c?.slow, false);
  const b = cells.find((x) => x.skill === "Boundaries");
  assert.equal(b?.targetSeconds, 71);
  assert.equal(b?.slow, true);
  assert.equal(cellOf(circles(120), "Circles").slow, true);
});

test("groupByDomain: domains and skills in taxonomy order, even from shuffled cells", () => {
  const cells = skillMap([], { sections: ["rw", "math"] });
  const groups = groupByDomain([...cells].reverse());
  assert.deepEqual(groups.map((g) => g.domain), [
    "Information and Ideas",
    "Craft and Structure",
    "Expression of Ideas",
    "Standard English Conventions",
    "Algebra",
    "Advanced Math",
    "Problem-Solving and Data Analysis",
    "Geometry and Trigonometry",
  ]);
  assert.deepEqual(groups.map((g) => g.section), ["rw", "rw", "rw", "rw", "math", "math", "math", "math"]);
  assert.deepEqual(groups.map((g) => g.cells.length), [3, 3, 2, 2, 5, 3, 7, 4]);
  assert.deepEqual(groups[1]?.cells.map((c) => c.skill), ["Words in Context", "Text Structure and Purpose", "Cross-Text Connections"]);
  assert.deepEqual(groupByDomain([]), []);
});

test("skillDetail: one plain sentence plus the Question Bank steps", () => {
  const wicLog = (right: number, missed: number, seconds: number | null) => [
    ...many(right, { skill: "Words in Context", domain: "Craft and Structure", result: "right", seconds }),
    ...many(missed, { skill: "Words in Context", domain: "Craft and Structure", result: "missed", seconds }),
  ];
  const shaky = cellOf(wicLog(4, 3, 84), "Words in Context");
  assert.equal(shaky.level, "shaky");
  assert.equal(
    skillDetail(shaky),
    "Right on 4 of 7. Average 84 s, slower than the 71 s test pace. In the Question Bank pick Assessment: SAT, Test: Reading and Writing, Domain: Craft and Structure, Skill: Words in Context, Difficulty: Medium.",
  );
  const quick = cellOf(wicLog(4, 3, 60), "Words in Context");
  assert.ok(skillDetail(quick).includes("Average 60 s, within the 71 s test pace."));
  const fewTimed = cellOf(wicLog(1, 1, 100), "Words in Context");
  assert.ok(skillDetail(fewTimed).startsWith("Right on 1 of 2. A few more cards will show your level. Average 100 s so far."));
  const none = cellOf([], "Words in Context");
  assert.equal(skillDetail(none), `You have no cards for this skill yet. ${qbFilterSteps(none, "Medium")}`);
  const math = cellOf(many(3, { section: "math", domain: "Advanced Math", skill: "Equivalent expressions", result: "right", seconds: null }), "Equivalent expressions");
  assert.ok(skillDetail(math).endsWith("Test: Math, Domain: Advanced Math, Skill: Equivalent expressions, Difficulty: Hard."));
  for (const c of [shaky, quick, fewTimed, none, math]) assert.ok(!/[—–]/.test(skillDetail(c)));
});

test("suggestedDifficulty and shortSkillName", () => {
  assert.equal(suggestedDifficulty({ level: "weak" }), "Easy, Medium");
  assert.equal(suggestedDifficulty({ level: "strong" }), "Hard");
  for (const level of ["none", "new", "shaky", "solid"] as const) assert.equal(suggestedDifficulty({ level }), "Medium");
  const weak = cellOf([...many(1, { skill: "Boundaries", result: "right" }), ...many(3, { skill: "Boundaries", result: "missed" })], "Boundaries");
  assert.ok(skillDetail(weak).endsWith("Difficulty: Easy, Medium."));
  assert.equal(shortSkillName("Form, Structure, and Sense"), "Form and sense");
  for (const s of SKILLS) {
    const short = shortSkillName(s.skill);
    assert.ok(short.length > 0 && short.length <= 24, `${s.skill} -> ${short}`);
  }
});

// ---------------------------------------------------------------- word bank

test("collectWords: word, meaning and the blank's sentence from a Words in Context card", () => {
  const words = collectWords([wic({ attemptId: "kelp-1", qbId: "kelp01", at: 1000 })]);
  assert.equal(words.length, 1);
  const w = words[0]!;
  assert.equal(w.word, "resilient");
  assert.equal(w.sentence, KELP_SENTENCE);
  assert.equal(w.meaning, KELP_MEANING);
  assert.equal(w.picked, "fragile");
  assert.equal(w.result, "missed");
  assert.equal(w.seen, 1);
  assert.equal(w.lastAt, 1000);
  assert.deepEqual(w.attemptIds, ["kelp-1"]);
  assert.equal(w.qbId, "kelp01");
});

test("sentenceFor and firstSentence: sentence edges, titles and the fallback", () => {
  assert.equal(sentenceFor("The plan worked. Critics called it ______.", "prudent"), "Critics called it prudent.");
  assert.equal(
    sentenceFor("Ms. Reyes, a potter, found the glaze ______ after one firing. It cracked\nin the kiln.", "brittle"),
    "Ms. Reyes, a potter, found the glaze brittle after one firing.",
  );
  assert.equal(sentenceFor("A note with no blank in it.", "x"), "A note with no blank in it.");
  assert.equal(sentenceFor(null, "x"), null);
  assert.equal(firstSentence("Lucid means clear. It fits the notes."), "Lucid means clear.");
  assert.equal(firstSentence("Terse (\"brief\") fits the reply!  The rest is filler."), "Terse (\"brief\") fits the reply!");
  assert.equal(firstSentence("   "), null);
  assert.equal(blankOut("Resilient forests are resilient.", "resilient"), "_____ forests are _____.");
});

test("collectWords: no blank falls back to the first 200 characters; no passage gives null", () => {
  const essay =
    "In her essay on small towns, the author calls the new library modest, noting that its quiet rooms draw readers from three counties each weekend, and she credits careful planning rather than a large budget for that success over time.";
  assert.ok(essay.length > 200);
  const words = collectWords([
    wic({ passage: essay, choices: { A: "humble", B: "shy", C: "cheap", D: "tiny" }, correct: "A", result: "right", picked: "correct", at: 2000 }),
    mural({ passage: null, result: "right", picked: "C", at: 1000 }),
  ]);
  const humble = words.find((w) => w.word === "humble");
  assert.ok(humble);
  assert.ok(humble.sentence);
  assert.ok(humble.sentence.length <= 200);
  assert.ok(humble.sentence.endsWith("…"));
  assert.ok(essay.startsWith(humble.sentence.slice(0, -1)));
  assert.equal(humble.picked, null);
  assert.equal(words.find((w) => w.word === "vivid")?.sentence, null);
});

test("collectWords: dedupes by word, keeps the newest card's data, counts seen and keeps any miss", () => {
  const oldMiss = wic({ attemptId: "k-old", at: 1000, result: "missed", picked: "D", whyCorrect: "An older meaning. More." });
  const middle = wic({ attemptId: "k-mid", at: 2000, result: "right", picked: "correct", choices: { A: "fragile", B: "Resilient", C: "isolated", D: "uniform" } });
  const newest = wic({ attemptId: "k-new", at: 3000, result: "right", picked: "B", qbId: "kelp-new", whyCorrect: "The newest meaning. Extra." });
  const other = mural({ attemptId: "m-1", at: 2500, result: "right", picked: "C" });
  const words = collectWords([middle, oldMiss, other, newest, newest]);
  assert.deepEqual(words.map((w) => w.word), ["resilient", "vivid"]);
  const w = words[0]!;
  assert.equal(w.seen, 3);
  assert.deepEqual(w.attemptIds, ["k-new", "k-mid", "k-old"]);
  assert.equal(w.result, "missed");
  assert.equal(w.meaning, "The newest meaning.");
  assert.equal(w.qbId, "kelp-new");
  assert.equal(w.lastAt, 3000);
  assert.equal(w.picked, "uniform");
  assert.equal(words[1]?.result, "right");
});

test("collectWords: a miss records the wrong word you picked, and only then", () => {
  assert.equal(collectWords([wic({ picked: "C", result: "missed" })])[0]?.picked, "isolated");
  const right = collectWords([wic({ picked: "B", result: "right" })])[0];
  assert.equal(right?.picked, null);
  assert.equal(right?.result, "right");
  const noLetter = collectWords([wic({ picked: "correct", result: "missed" })])[0];
  assert.equal(noLetter?.picked, null);
  assert.equal(noLetter?.result, "missed");
});

test("collectWords: skips grid-in, missing choices and other skills; accepts loose spellings", () => {
  const log = [
    wic({ attemptId: "g1", format: "spr", choices: { A: "", B: "", C: "", D: "" } }),
    wic({ attemptId: "g2", format: "spr" }),
    wic({ attemptId: "e1", choices: { A: "fragile", B: "resilient", C: "", D: "uniform" } }),
    entry({ attemptId: "b1" }),
    wic({ attemptId: "t1", skill: "Transitions" }),
    mathEntry({ attemptId: "m1" }),
    mural({ attemptId: "ok1", skill: "words in context" }),
    wic({ attemptId: "ok2", skill: "Craft and Structure: Words in Context" }),
    wic({ attemptId: "ok3", skill: "vocab", choices: { A: "terse", B: "lavish", C: "candid", D: "remote" }, correct: "A" }),
  ];
  const words = collectWords(log);
  assert.deepEqual(words.flatMap((w) => w.attemptIds).sort(), ["ok1", "ok2", "ok3"]);
  assert.deepEqual(words.map((w) => w.word).sort(), ["resilient", "terse", "vivid"]);
});

test("confusables: the wrong word you chose next to the right one, most frequent first", () => {
  const words = collectWords([
    wic({ attemptId: "c1", at: 1000, picked: "A", result: "missed" }),
    wic({ attemptId: "c2", at: 2000, picked: "A", result: "missed" }),
    mural({ attemptId: "c3", at: 3000, picked: "D", result: "missed" }),
    wic({ attemptId: "c4", at: 4000, choices: { A: "terse", B: "lavish", C: "candid", D: "remote" }, correct: "A", picked: "correct", result: "right" }),
  ]);
  assert.deepEqual(confusables(words), [
    { picked: "fragile", word: "resilient", count: 2 },
    { picked: "stale", word: "vivid", count: 1 },
  ]);
  const handMade: WordItem = { word: "lucid", meaning: null, sentence: null, picked: "lurid", result: "missed", seen: 1, lastAt: 1, attemptIds: ["x"], qbId: null };
  assert.deepEqual(confusables([handMade]), [{ picked: "lurid", word: "lucid", count: 1 }]);
  assert.deepEqual(confusables([]), []);
});

test("filterWords: case-insensitive on the word, meaning or sentence", () => {
  const words = collectWords([
    wic({ at: 3000 }),
    mural({ at: 2000 }),
    wic({ at: 1000, passage: null, choices: { A: "terse", B: "lavish", C: "candid", D: "remote" }, correct: "A", whyCorrect: "Terse means brief." }),
  ]);
  assert.deepEqual(filterWords(words, "RESIL").map((w) => w.word), ["resilient"]);
  assert.deepEqual(filterWords(words, "Bright And").map((w) => w.word), ["vivid"]);
  assert.deepEqual(filterWords(words, "storms").map((w) => w.word), ["resilient"]);
  assert.deepEqual(filterWords(words, "means").map((w) => w.word), ["resilient", "vivid", "terse"]);
  assert.equal(filterWords(words, "   ").length, 3);
  assert.deepEqual(filterWords(words, "zebra"), []);
});

test("wordsToAnkiCsv: blanks the word on the front and escapes quotes and commas", () => {
  const words = collectWords([
    wic({ at: 2000 }),
    mural({ at: 1000, passage: null, result: "right", picked: "C", whyCorrect: "Vivid means bright, lifelike and \"loud\" to the eye." }),
  ]);
  const csv = wordsToAnkiCsv(words);
  assert.ok(csv.endsWith("\n"));
  const lines = csv.trimEnd().split("\n");
  assert.deepEqual(lines.slice(0, 4), ["#separator:comma", "#html:false", "#columns:Front,Back,Tags", "#tags column:3"]);
  const rows = parseCsv(lines.filter((l) => !l.startsWith("#")).join("\n"));
  assert.deepEqual(rows, [
    [
      "Her survey showed that the forests were far more _____ than earlier models predicted, regrowing within months after storms.",
      `resilient : ${KELP_MEANING}`,
      "rulecard words_in_context missed",
    ],
    ["vivid", "vivid : Vivid means bright, lifelike and \"loud\" to the eye.", "rulecard words_in_context"],
  ]);
  assert.ok(csv.includes('"resilient : ""Resilient"" means able to recover quickly, which matches forests regrowing within months."'));
  assert.ok(csv.includes('"vivid : Vivid means bright, lifelike and ""loud"" to the eye."'));
  // A sentence without the word (the passage fallback) gives the word itself on the front.
  const fallback: WordItem = { word: "humble", meaning: null, sentence: "In her essay on small towns, the author calls the library modest.", picked: null, result: "right", seen: 1, lastAt: 1, attemptIds: ["h"], qbId: null };
  assert.deepEqual(parseCsv(wordsToAnkiCsv([fallback]).split("\n").filter((l) => l && !l.startsWith("#")).join("\n")), [["humble", "humble", "rulecard words_in_context"]]);
});
