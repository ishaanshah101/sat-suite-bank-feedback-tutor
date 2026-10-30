// Offline practice: rule flashcards (flashcards.ts), redo my misses (redo.ts), and the DOM-free
// parts of practice-ui.ts (handler wiring and hotkeys).
// Run: node scripts/run-tests.mjs extension/test/practice.test.ts

import { test } from "vitest";
import assert from "node:assert/strict";
import { createDeck, currentCard, deckCounts, deckSummary, flip, grade, isDone, nextDueIf, weakestRules, type DeckState } from "../../../extension/src/addons/flashcards";
import {
  addRedo, answerRedo, choiceList, createRedo, currentRedo, isMultipleChoice, isRedoDone, MAX_REDOS_PER_ENTRY, nextRedo,
  readRedo, recordRedo, REDO_KEY, redoQueue, redoStats, redoSummary, skipRedo, type RedoAttempt, type RedoItem, type RedoState, type RedoStore,
} from "../../../extension/src/addons/redo";
import { flashHandlers, practiceKey, pressPracticeKey, redoHandlers, type PracticeHandlers } from "../../../extension/src/addons/practice-ui";
import { applyAttempt, applyReview, DAY, type RuleSrs, type SrsState } from "../../../extension/src/addons/srs";
import { memoryKV, setKV } from "../../../extension/src/addons/store";
import type { LogEntry } from "../../../extension/src/addons/log";
import type { Letter } from "../../../extension/src/addons/types";
import { entry } from "./helpers";

const NOW = Date.UTC(2026, 9, 20, 12);

const sched = (ruleId: string, due: number, box = 1, extra: Partial<RuleSrs> = {}): RuleSrs => ({
  ruleId, ruleName: null, box, due, attemptId: `srs-${ruleId}`, reps: 0, lapses: 0, lastReviewed: null, ...extra,
});
/** n attempts on a rule, the first `missed` of them missed, a minute apart. */
const attempts = (ruleId: string, n: number, missed: number): LogEntry[] =>
  Array.from({ length: n }, (_, i) => entry({ ruleId, ruleName: `Rule ${ruleId}`, at: NOW - 10 * DAY - i * 60_000, result: i < missed ? "missed" : "right" }));
/** A Math grid-in entry (format is an optional field that may not be on LogEntry yet). */
const gridIn = (p: Partial<LogEntry> = {}): LogEntry => ({ ...entry(p), format: "spr" as const }) as LogEntry;
const ids = (items: RedoItem[]) => items.map((i) => i.entry.attemptId);
const wrong = (at: number): RedoAttempt => ({ at, correct: false, picked: "A" });
const right = (at: number): RedoAttempt => ({ at, correct: true, picked: "C" });

// ---------------------------------------------------------------- flashcards

test("deck: due rules first in dueRules order, then the weakest other rules by miss rate", () => {
  const srs: SrsState = {
    A: sched("A", NOW - DAY),
    B: sched("B", NOW - 3 * DAY),
    C: sched("C", NOW + DAY, 2),
    D: sched("D", NOW + 5 * DAY, 2),
    E: sched("E", NOW + DAY, 4),
    G: sched("G", NOW + 2 * DAY, 2),
  };
  const log = [
    ...attempts("A", 1, 1), // due, so never an extra
    ...attempts("B", 1, 1),
    ...attempts("C", 2, 1), // 50%, 1 miss
    ...attempts("D", 2, 2), // 100%
    ...attempts("E", 3, 0), // never missed: not weak
    ...attempts("F", 3, 1), // 33%, not in the SRS at all
    ...attempts("G", 4, 2), // 50%, 2 misses: beats C on the tie
  ];
  assert.deepEqual(createDeck(log, srs, NOW).cards.map((c) => c.ruleId), ["B", "A"], "no extras unless asked");
  const deck = createDeck(log, srs, NOW, { extra: 3 });
  assert.deepEqual(deck.cards.map((c) => c.ruleId), ["B", "A", "D", "G", "C"]);
  assert.deepEqual(deck.cards.map((c) => c.reason), ["due", "due", "weak", "weak", "weak"]);
  assert.deepEqual([deck.index, deck.flipped, deck.results.length], [0, false, 0]);
  assert.deepEqual(weakestRules(log, srs, NOW), ["D", "G", "C", "F"]);
  assert.deepEqual(deckCounts(log, srs, NOW, 2), { due: 2, weak: 2 });
  assert.equal(createDeck(log, srs, NOW, { extra: Number.NaN }).cards.length, 2);
});

test("card: front cues the latest missed stem; back has the statement, distinct takeaways and notes", () => {
  const log = [
    entry({ attemptId: "r-new", ruleId: "B1", at: NOW - 1000, result: "right", stem: "Newest stem, answered right", ruleStatement: "  ", takeaway: "Use a semicolon.", note: "" }),
    entry({ attemptId: "m-new", ruleId: "B1", at: NOW - 2000, stem: "Latest missed stem", passage: "Passage two", ruleStatement: "Join two clauses with a semicolon or a period.", takeaway: "use a  semicolon", note: "Watch FANBOYS" }),
    entry({ attemptId: "m-old", ruleId: "B1", at: NOW - 3000, stem: "Older missed stem", takeaway: "A comma plus FANBOYS also works.", note: "   " }),
    entry({ attemptId: "m-dup", ruleId: "B1", at: NOW - 4000, takeaway: "Use a semicolon", note: "watch fanboys" }),
    entry({ ruleId: "T3", at: NOW - 500, note: "a note on another rule", takeaway: "Other rule." }),
    entry({ attemptId: "ok", ruleId: "R1", ruleName: "Right only", at: NOW - 900, result: "right", stem: "Only right stem" }),
  ];
  const deck = createDeck([...log].reverse(), { B1: sched("B1", NOW - DAY, 2), R1: sched("R1", NOW - 10, 3) }, NOW);
  const [b1, r1] = deck.cards;
  assert.equal(b1!.ruleId, "B1");
  assert.equal(b1!.ruleName, "Comma splice");
  assert.deepEqual(b1!.cue, { attemptId: "m-new", at: NOW - 2000, stem: "Latest missed stem", passage: "Passage two", missed: true });
  assert.equal(b1!.statement, "Join two clauses with a semicolon or a period.", "latest non-empty statement");
  assert.deepEqual(b1!.takeaways, ["Use a semicolon.", "A comma plus FANBOYS also works."]);
  assert.deepEqual(b1!.notes, [{ attemptId: "m-new", at: NOW - 2000, text: "Watch FANBOYS" }]);
  assert.deepEqual([b1!.attempts, b1!.misses, b1!.missRate, b1!.box], [4, 3, 0.75, 2]);
  assert.equal(r1!.cue?.missed, false, "no saved miss: the cue is the latest question on the rule");
  assert.equal(r1!.cue?.stem, "Only right stem");
  const bare = createDeck([], { Z: sched("Z", NOW - 1, 1, { ruleName: "Zed" }) }, NOW).cards[0]!;
  assert.deepEqual([bare.ruleName, bare.cue, bare.statement, bare.takeaways, bare.notes], ["Zed", null, "", [], []], "a due rule with no log entries still gets a card");
});

test("grades: flip first; Again resets the rule to box 1, Hard and Good move it up one box", () => {
  const srs: SrsState = { A: sched("A", NOW - 1, 3, { ruleName: "Rule A" }), B: sched("B", NOW - 2, 3), C: sched("C", NOW - 3, 3, { ruleName: "Rule C" }) };
  let deck = createDeck([], srs, NOW);
  assert.deepEqual(deck.cards.map((c) => c.ruleId), ["C", "B", "A"]);

  const early = grade(deck, "good", NOW);
  assert.equal(early.state, deck, "the front can't be graded");
  assert.equal(early.srs, srs);
  assert.equal(flip(flip(deck)).flipped, false, "flip turns the card back over");

  deck = flip(deck);
  let r = grade(deck, "again", NOW);
  assert.deepEqual([r.srs.C!.box, r.srs.C!.due, r.srs.C!.lapses, r.srs.C!.reps], [1, NOW + DAY, 1, 1]);
  assert.deepEqual([r.state.index, r.state.flipped, currentCard(r.state)?.ruleId], [1, false, "B"]);
  assert.equal(r.state.srs, r.srs);

  r = grade(flip(r.state), "hard", NOW);
  assert.deepEqual([r.srs.B!.box, r.srs.B!.due, r.srs.B!.lapses], [4, NOW + 8 * DAY, 0]);
  r = grade(flip(r.state), "good", NOW);
  assert.deepEqual([r.srs.A!.box, r.srs.A!.due], [4, NOW + 8 * DAY]);
  assert.ok(isDone(r.state));
  assert.equal(currentCard(r.state), null);
  assert.equal(grade(flip(r.state), "good", NOW).state, r.state, "nothing left to grade");

  assert.equal(srs.C!.box, 3, "the input SRS is not mutated");
  assert.deepEqual(r.state.results.map((x) => [x.ruleId, x.grade, x.boxBefore, x.boxAfter]), [["C", "again", 3, 1], ["B", "hard", 3, 4], ["A", "good", 3, 4]]);
  assert.deepEqual(deckSummary(r.state), { total: 3, graded: 3, remaining: 0, again: 1, hard: 1, good: 1, recalled: 2 / 3, againRules: [{ ruleId: "C", ruleName: "Rule C" }] });
  assert.deepEqual(deckSummary(createDeck([], srs, NOW)), { total: 3, graded: 0, remaining: 3, again: 0, hard: 0, good: 0, recalled: null, againRules: [] });
});

test("Hard currently equals Good", () => {
  const srs: SrsState = { A: sched("A", NOW - 1, 2) };
  const deck = flip(createDeck([], srs, NOW));
  const hard = grade(deck, "hard", NOW + 5);
  const good = grade(deck, "good", NOW + 5);
  assert.deepEqual(hard.srs, good.srs);
  assert.deepEqual(hard.srs, applyReview(srs, "A", true, NOW + 5));
  assert.equal(nextDueIf(deck, "hard", NOW), nextDueIf(deck, "good", NOW));
  assert.equal(nextDueIf(deck, "good", NOW), NOW + 4 * DAY);
  assert.equal(nextDueIf(deck, "again", NOW), NOW + DAY);
});

test("grade uses the latest SRS when passed one; rules the SRS doesn't track are left alone", () => {
  const srs: SrsState = { A: sched("A", NOW - 1, 2) };
  const deck = flip(createDeck(attempts("F", 2, 1), srs, NOW, { extra: 1 }));
  assert.deepEqual(deck.cards.map((c) => [c.ruleId, c.box]), [["A", 2], ["F", null]]);
  const newer = applyAttempt(srs, entry({ ruleId: "N", attemptId: "n1" }), NOW); // a capture while the deck was open
  let r = grade(deck, "good", NOW, newer);
  assert.ok(r.srs.N, "keeps the newer capture");
  assert.equal(r.srs.A!.box, 3);
  r = grade(flip(r.state), "good", NOW);
  assert.equal(r.srs, r.state.srs);
  assert.equal(r.srs.F, undefined);
  assert.deepEqual([r.state.results[1]!.boxBefore, r.state.results[1]!.boxAfter], [null, null]);
  assert.equal(nextDueIf(flip(createDeck(attempts("F", 2, 1), {}, NOW, { extra: 1 })), "good", NOW), null);
});

// ---------------------------------------------------------------- redo my misses

test("redo skips grid-in and entries with an empty choice", () => {
  assert.equal(isMultipleChoice(entry()), true);
  assert.equal(isMultipleChoice({ ...entry(), format: "mcq" as const } as LogEntry), true);
  assert.equal(isMultipleChoice(gridIn()), false);
  assert.equal(isMultipleChoice(entry({ choices: { A: "1", B: "", C: "3", D: "4" } })), false);
  assert.equal(isMultipleChoice(entry({ choices: { A: "1", B: "2", C: "  ", D: "4" } })), false);
  assert.equal(isMultipleChoice(entry({ choices: { A: "1", B: "2", C: "3" } as unknown as Record<Letter, string> })), false);
  const log = [entry({ attemptId: "mc" }), gridIn({ attemptId: "grid" }), entry({ attemptId: "blank", choices: { A: "", B: "", C: "", D: "" } })];
  assert.deepEqual(ids(redoQueue(log, {})), ["mc"]);
  assert.equal(redoStats(log, {}).misses, 1);
});

test("redo queue: never redone first, then redone wrong, oldest first in each group; fixed ones drop out", () => {
  const log = [
    entry({ attemptId: "n2", at: NOW - 1 * DAY, ruleId: "B1", skill: "Boundaries" }),
    entry({ attemptId: "w1", at: NOW - 5 * DAY, ruleId: "T3", skill: "Transitions" }),
    entry({ attemptId: "fx", at: NOW - 9 * DAY, ruleId: "B1", skill: "Boundaries" }),
    entry({ attemptId: "n1", at: NOW - 2 * DAY, ruleId: "T3", skill: "Transitions" }),
    entry({ attemptId: "w2", at: NOW - 6 * DAY, ruleId: "B1", skill: "Boundaries" }),
    entry({ attemptId: "ok", at: NOW - 7 * DAY, result: "right", picked: "correct", diagnosis: "got_it_right" }),
  ];
  const store: RedoStore = {
    w1: [wrong(NOW - DAY)],
    w2: [wrong(NOW - 2 * DAY), right(NOW - 3 * DAY)], // saved out of order: the latest (at) is the wrong one
    fx: [wrong(NOW - 4 * DAY), right(NOW - 3 * DAY)],
  };
  assert.deepEqual(ids(redoQueue(log, store)), ["n1", "n2", "w2", "w1"]);
  assert.deepEqual(ids(redoQueue([...log].reverse(), store)), ["n1", "n2", "w2", "w1"], "log order doesn't matter");
  assert.deepEqual(ids(redoQueue(log, store, { ruleId: "T3" })), ["n1", "w1"]);
  assert.deepEqual(ids(redoQueue(log, store, { skill: "Boundaries" })), ["n2", "w2"]);
  assert.deepEqual(ids(redoQueue(log, store, { ruleId: "B1", skill: "Transitions" })), []);
  assert.deepEqual(redoQueue(log, store).find((i) => i.entry.attemptId === "w2")!.history.map((a) => a.correct), [true, false]);
  assert.deepEqual(ids(createRedo(log, store, NOW, { limit: 2 }).items), ["n1", "n2"]);
  assert.deepEqual(ids(redoQueue(log, { ...store, w1: "junk" } as unknown as RedoStore)), ["w1", "n1", "n2", "w2"], "junk history counts as never redone");
});

test("redo session: checks the stored letter, keeps A-D order, needs an answer or a skip to move on", () => {
  const q1 = entry({ attemptId: "q1", at: NOW - 2 * DAY, correct: "C", picked: "A", choices: { D: "four", C: "three", B: "two", A: "one" } });
  const q2 = entry({ attemptId: "q2", at: NOW - DAY, correct: "B", picked: "D", ruleId: "T3", ruleName: "Transitions" });
  assert.deepEqual(choiceList(q1), [{ letter: "A", text: "one" }, { letter: "B", text: "two" }, { letter: "C", text: "three" }, { letter: "D", text: "four" }]);

  let st = createRedo([q2, q1], {}, NOW);
  assert.equal(currentRedo(st)!.entry.attemptId, "q1");
  assert.equal(nextRedo(st), st, "no answer yet");

  const a = answerRedo(st, "B", NOW + 1);
  assert.deepEqual(a.saved, { attemptId: "q1", attempt: { at: NOW + 1, correct: false, picked: "B" } });
  assert.equal(a.state.picked, "B");
  const twice = answerRedo(a.state, "C", NOW + 2);
  assert.equal(twice.state, a.state, "one answer per question");
  assert.equal(twice.saved, null);

  st = nextRedo(a.state);
  assert.deepEqual([st.index, st.picked], [1, null]);
  const b = answerRedo(st, "B", NOW + 3);
  assert.equal(b.saved?.attempt.correct, true);
  st = nextRedo(b.state);
  assert.ok(isRedoDone(st));
  assert.equal(currentRedo(st), null);
  assert.equal(answerRedo(st, "A", NOW).saved, null);
  assert.deepEqual(redoSummary(st), {
    total: 2, answered: 2, right: 1, wrong: 1, skipped: 0, remaining: 0, accuracy: 0.5,
    missedAgain: [{ ruleId: "B1", ruleName: "Comma splice", count: 1 }],
  });

  let sk = skipRedo(createRedo([q1, q2], {}, NOW), NOW);
  assert.deepEqual([sk.index, sk.results[0]!.skipped, sk.results[0]!.picked], [1, true, null]);
  sk = skipRedo(answerRedo(sk, "A", NOW).state, NOW); // after an answer, skip acts like next
  assert.ok(isRedoDone(sk));
  const sum = redoSummary(sk);
  assert.deepEqual([sum.skipped, sum.answered, sum.wrong, sum.accuracy], [1, 1, 1, 0]);
});

test("redo stats: redone count, accuracy over every redo answer, fixed = latest redo right", () => {
  const log = [
    entry({ attemptId: "a" }), entry({ attemptId: "b" }), entry({ attemptId: "c" }), entry({ attemptId: "d" }),
    entry({ attemptId: "e", result: "right", picked: "correct" }),
    gridIn({ attemptId: "f" }),
  ];
  const store: RedoStore = { a: [wrong(1), right(2)], b: [right(1), wrong(2)], c: [right(1)], e: [right(1)], f: [right(1)], gone: [right(1)] };
  assert.deepEqual(redoStats(log, store), { misses: 4, redone: 3, answers: 5, right: 3, accuracy: 0.6, fixed: 2, left: 2 });
  assert.equal(redoStats(log, store).left, redoQueue(log, store).length);
  assert.deepEqual(ids(redoQueue(log, store)), ["d", "b"]);
  assert.deepEqual(redoStats([], {}), { misses: 0, redone: 0, answers: 0, right: 0, accuracy: null, fixed: 0, left: 0 });
});

test("redo answers persist under rc.addons.redo.v1 via kv() and shape the next queue", async () => {
  const mem = memoryKV();
  setKV(mem);
  assert.equal(REDO_KEY, "rc.addons.redo.v1");
  assert.deepEqual(await readRedo(), {});

  const log = [entry({ attemptId: "p1", at: NOW - 2 * DAY, correct: "C" }), entry({ attemptId: "p2", at: NOW - DAY, correct: "C" })];
  let st = createRedo(log, await readRedo(), NOW);
  for (const [pick, at] of [["C", NOW + 1], ["A", NOW + 2]] as const) {
    const res = answerRedo(st, pick, at);
    if (res.saved) await recordRedo(res.saved.attemptId, res.saved.attempt);
    st = nextRedo(res.state);
  }
  assert.deepEqual(mem.dump()[REDO_KEY], { p1: [{ at: NOW + 1, correct: true, picked: "C" }], p2: [{ at: NOW + 2, correct: false, picked: "A" }] });
  const store = await readRedo();
  assert.deepEqual(ids(redoQueue(log, store)), ["p2"], "p1 is fixed, p2 comes back");
  assert.deepEqual(redoStats(log, store), { misses: 2, redone: 2, answers: 2, right: 1, accuracy: 0.5, fixed: 1, left: 1 });

  await Promise.all([recordRedo("p2", right(NOW + 3)), recordRedo("p3", wrong(NOW + 4)), recordRedo("p2", wrong(NOW + 5))]);
  const after = await readRedo();
  assert.deepEqual(after.p2!.map((a) => a.at), [NOW + 2, NOW + 3, NOW + 5], "saves made at once are all kept");
  assert.equal(after.p3!.length, 1);

  setKV(memoryKV({ [REDO_KEY]: "junk" }));
  assert.deepEqual(await readRedo(), {});
});

test("addRedo is pure and keeps only the latest answers", () => {
  const empty: RedoStore = {};
  let s = empty;
  for (let i = 0; i < MAX_REDOS_PER_ENTRY + 5; i++) s = addRedo(s, "x", { at: i, correct: i % 2 === 0, picked: "A" });
  assert.deepEqual(empty, {});
  assert.equal(s.x!.length, MAX_REDOS_PER_ENTRY);
  assert.deepEqual([s.x![0]!.at, s.x!.at(-1)!.at], [5, MAX_REDOS_PER_ENTRY + 4]);
});

// ---------------------------------------------------------------- screen wiring (no DOM)

test("flashcard handlers: nothing on the front, a grade saves the SRS then updates, next closes the summary", () => {
  const out: { deck?: DeckState; srs?: SrsState } = {};
  const calls: string[] = [];
  const actions = {
    update: (s: DeckState) => { out.deck = s; calls.push("update"); },
    saveSrs: (s: SrsState) => { out.srs = s; calls.push("save"); },
    quit: () => { calls.push("quit"); },
  };
  const deck = createDeck([], { A: sched("A", NOW - 1, 2) }, NOW);
  const front = flashHandlers(deck, actions, () => NOW);
  front.grade("good");
  front.pick("A");
  assert.deepEqual(calls, []);
  front.next();
  assert.equal(out.deck!.flipped, true);
  flashHandlers(out.deck!, actions, () => NOW).grade("good");
  assert.deepEqual(calls, ["update", "save", "update"]);
  assert.equal(out.srs!.A!.box, 3);
  assert.ok(isDone(out.deck!));
  flashHandlers(out.deck!, actions, () => NOW).next();
  assert.equal(calls.at(-1), "quit");
});

test("redo handlers: a pick saves once and updates; next needs an answer; next on the summary quits", () => {
  const out: { st?: RedoState } = {};
  const calls: string[] = [];
  const actions = {
    update: (s: RedoState) => { out.st = s; calls.push("update"); },
    saveAnswer: (id: string, a: RedoAttempt) => { calls.push(`save ${id} ${a.picked} ${a.correct}`); },
    quit: () => { calls.push("quit"); },
  };
  const hs = redoHandlers(createRedo([entry({ attemptId: "h1", correct: "C" })], {}, NOW), actions, () => NOW);
  hs.next();
  hs.flip();
  hs.grade("good");
  assert.deepEqual(calls, []);
  hs.pick("C");
  assert.deepEqual(calls, ["save h1 C true", "update"]);
  redoHandlers(out.st!, actions, () => NOW).pick("A");
  assert.equal(calls.length, 2, "a second pick is ignored");
  redoHandlers(out.st!, actions, () => NOW).next();
  assert.ok(isRedoDone(out.st!));
  redoHandlers(out.st!, actions, () => NOW).next();
  assert.equal(calls.at(-1), "quit");
});

test("practice hotkeys map to the view handlers", () => {
  assert.deepEqual(practiceKey(" ", "flashcards"), { name: "flip" });
  assert.deepEqual(practiceKey("1", "flashcards"), { name: "grade", arg: "again" });
  assert.deepEqual(practiceKey("3", "flashcards"), { name: "grade", arg: "good" });
  assert.equal(practiceKey("4", "flashcards"), null);
  assert.deepEqual(practiceKey("3", "redo"), { name: "pick", arg: "C" });
  assert.deepEqual(practiceKey("C", "redo"), { name: "pick", arg: "C" });
  assert.deepEqual(practiceKey("s", "redo"), { name: "skip" });
  assert.deepEqual(practiceKey("Enter", "redo"), { name: "next" });
  assert.deepEqual(practiceKey("Escape", "flashcards"), { name: "quit" });
  const calls: string[] = [];
  const hs: PracticeHandlers = {
    pick: (l) => { calls.push(`pick ${l}`); }, flip: () => { calls.push("flip"); }, grade: (g) => { calls.push(`grade ${g}`); },
    next: () => { calls.push("next"); }, skip: () => { calls.push("skip"); }, quit: () => { calls.push("quit"); },
  };
  assert.equal(pressPracticeKey(hs, "2", "flashcards"), true);
  assert.equal(pressPracticeKey(hs, "b", "redo"), true);
  assert.equal(pressPracticeKey(hs, "Escape", "redo"), true);
  assert.equal(pressPracticeKey(hs, "x", "redo"), false);
  assert.deepEqual(calls, ["grade hard", "pick B", "quit"]);
});
