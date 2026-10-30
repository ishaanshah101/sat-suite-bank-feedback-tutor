import { test } from "vitest";
import assert from "node:assert/strict";
import { entryFromExplain, importEntries, readLog, recordAttempt, recordDrill, updateEntry, MAX_ENTRIES } from "../../../extension/src/addons/log";
import { memoryKV, setKV } from "../../../extension/src/addons/store";
import { formatClock, lap, sessionStats, emptyTimer } from "../../../extension/src/addons/timer";
import { actionFor } from "../../../extension/src/addons/hotkeys";
import { toNaturalRect } from "../../../extension/src/addons/crop";
import { nextAt } from "../../../extension/src/addons/background";
import type { ExplainResponse } from "../../../extension/src/addons/types";
import { entry } from "./helpers";

const explain: ExplainResponse = {
  attemptId: "a1",
  rule: { name: "Comma splice" },
  question: { id: "q", qbId: "abc12345", stem: "S".repeat(800), passage: null, choices: { A: "1", B: "2", C: "3", D: "4" }, correct: "C" },
  card: { diagnosis: "rule_gap", confidence: 0.8, rule_id: "B1", rule_statement: "r", correct_letter: "C", why_correct: "w", why_pick_fails: "f", eliminations: [], takeaway: "t" },
};

test("entryFromExplain derives result and clips long text", () => {
  const e = entryFromExplain(explain, "A", { seconds: 42, now: 1 });
  assert.equal(e.result, "missed");
  assert.equal(e.stem.length, 500);
  assert.equal(e.seconds, 42);
  assert.equal(entryFromExplain(explain, "C").result, "right");
  assert.equal(entryFromExplain(explain, "correct").result, "right");
});

test("log: upsert, note/star, drills, import dedupe, cap", async () => {
  setKV(memoryKV());
  await recordAttempt(entryFromExplain(explain, "A", { now: 10 }));
  await recordAttempt(entryFromExplain(explain, "B", { now: 20 })); // same attemptId → replace
  let log = await readLog();
  assert.equal(log.length, 1);
  assert.equal(log[0]!.picked, "B");
  await updateEntry("a1", { note: "watch FANBOYS", starred: true });
  await recordDrill("a1", true, true, 30);
  log = await readLog();
  assert.equal(log[0]!.note, "watch FANBOYS");
  assert.equal(log[0]!.drills.length, 1);
  assert.equal(await importEntries([log[0]!, entry({ attemptId: "new" })]), 1);
  const many = Array.from({ length: MAX_ENTRIES + 20 }, (_, i) => entry({ attemptId: `m${i}`, at: i }));
  await importEntries(many);
  log = await readLog();
  assert.equal(log.length, MAX_ENTRIES);
  assert.ok(log[0]!.at >= log[1]!.at, "newest first");
});

test("timer laps between captures and ignores breaks", () => {
  let t = emptyTimer();
  let r = lap(t, 0);
  assert.equal(r.seconds, null);
  r = lap(r.state, 65_000);
  assert.equal(r.seconds, 65);
  r = lap(r.state, 65_000 + 90_000);
  assert.equal(r.seconds, 90);
  r = lap(r.state, 155_000 + 3_600_000);
  assert.equal(r.seconds, null, "hour-long gap is a break");
  t = r.state;
  assert.deepEqual(sessionStats(t), { count: 2, avg: 78, overTarget: 1 });
  assert.equal(formatClock(71), "1:11");
  assert.equal(formatClock(5), "0:05");
});

test("hotkey mapping: c captures, 3 picks C", () => {
  assert.deepEqual(actionFor("a"), { name: "pick", arg: "A" });
  assert.deepEqual(actionFor("3"), { name: "pick", arg: "C" });
  assert.deepEqual(actionFor("c"), { name: "capture" });
  assert.deepEqual(actionFor("Enter"), { name: "explain" });
  assert.equal(actionFor("x"), null);
});

test("crop rect maps display px to natural px and rejects tiny drags", () => {
  assert.deepEqual(toNaturalRect({ x: 10, y: 20 }, { x: 110, y: 70 }, { w: 200, h: 100 }, { w: 400, h: 200 }), { x: 20, y: 40, w: 200, h: 100 });
  assert.deepEqual(toNaturalRect({ x: 110, y: 70 }, { x: -50, y: 500 }, { w: 200, h: 100 }, { w: 200, h: 100 }), { x: 0, y: 70, w: 110, h: 30 });
  assert.equal(toNaturalRect({ x: 5, y: 5 }, { x: 8, y: 9 }, { w: 200, h: 100 }, { w: 200, h: 100 }), null);
});

test("reminder time rolls to tomorrow once passed", () => {
  const morning = new Date(2026, 9, 20, 9).getTime();
  const evening = new Date(2026, 9, 20, 21).getTime();
  assert.equal(new Date(nextAt(19, morning)).getDate(), 20);
  assert.equal(new Date(nextAt(19, evening)).getDate(), 21);
});
