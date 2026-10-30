import { test } from "vitest";
import assert from "node:assert/strict";
import { applyAttempt, applyReview, DAY, describeDue, dueRules, masteryCounts, rebuildFromLog, type SrsState } from "../../../extension/src/addons/srs";
import { entry } from "./helpers";

const T0 = Date.UTC(2026, 9, 1, 12);

test("a miss schedules the rule for tomorrow in box 1", () => {
  const s = applyAttempt({}, entry({ ruleId: "B1", result: "missed", attemptId: "x" }), T0);
  assert.equal(s.B1!.box, 1);
  assert.equal(s.B1!.due, T0 + DAY);
  assert.equal(s.B1!.attemptId, "x");
  assert.equal(s.B1!.lapses, 0);
});

test("first-time right goes to box 3; a later miss resets to 1 and counts a lapse", () => {
  let s = applyAttempt({}, entry({ ruleId: "T2", result: "right" }), T0);
  assert.equal(s.T2!.box, 3);
  s = applyAttempt(s, entry({ ruleId: "T2", result: "missed" }), T0 + DAY);
  assert.equal(s.T2!.box, 1);
  assert.equal(s.T2!.lapses, 1);
});

test("right on a tracked rule only promotes when due", () => {
  let s = applyAttempt({}, entry({ ruleId: "B1", result: "missed" }), T0);
  s = applyAttempt(s, entry({ ruleId: "B1", result: "right" }), T0 + 1000);
  assert.equal(s.B1!.box, 1, "not due yet, no promotion");
  s = applyAttempt(s, entry({ ruleId: "B1", result: "right" }), T0 + DAY + 1);
  assert.equal(s.B1!.box, 2);
});

test("review ladder: correct climbs 1→2→3 with growing intervals, wrong drops to 1", () => {
  let s: SrsState = applyAttempt({}, entry({ ruleId: "B1" }), T0);
  s = applyReview(s, "B1", true, T0 + DAY);
  assert.equal(s.B1!.box, 2);
  assert.equal(s.B1!.due, T0 + DAY + 2 * DAY);
  s = applyReview(s, "B1", true, T0 + 3 * DAY);
  assert.equal(s.B1!.box, 3);
  assert.equal(s.B1!.due, T0 + 3 * DAY + 4 * DAY);
  s = applyReview(s, "B1", false, T0 + 7 * DAY);
  assert.equal(s.B1!.box, 1);
  assert.equal(s.B1!.lapses, 1);
  assert.equal(s.B1!.reps, 3);
});

test("box caps at 6 and counts as mastered from 5", () => {
  let s: SrsState = applyAttempt({}, entry({ ruleId: "B1" }), T0);
  for (let i = 0; i < 10; i++) s = applyReview(s, "B1", true, T0 + i);
  assert.equal(s.B1!.box, 6);
  assert.deepEqual(masteryCounts(s), { learning: 0, reviewing: 0, mastered: 1 });
});

test("dueRules sorts most overdue first, ignores future", () => {
  let s: SrsState = {};
  s = applyAttempt(s, entry({ ruleId: "A" }), T0);
  s = applyAttempt(s, entry({ ruleId: "B" }), T0 - DAY);
  s = applyAttempt(s, entry({ ruleId: "C", result: "right" }), T0);
  const due = dueRules(s, T0 + DAY + 1).map((r) => r.ruleId);
  assert.deepEqual(due, ["B", "A"]);
});

test("rebuildFromLog replays attempts and review drills in time order", () => {
  const log = [
    entry({ ruleId: "B1", at: T0 + 2 * DAY, result: "right", drills: [] }),
    entry({ ruleId: "B1", at: T0, result: "missed", drills: [{ at: T0 + DAY, correct: true, review: true }] }),
  ];
  const s = rebuildFromLog(log);
  // missed (box1) -> review correct (box2, due T0+3d) -> right at T0+2d not due -> stays 2
  assert.equal(s.B1!.box, 2);
});

test("describeDue", () => {
  assert.equal(describeDue(T0 - 1, T0), "due now");
  assert.equal(describeDue(T0 + 3 * 3_600_000, T0), "in 3h");
  assert.equal(describeDue(T0 + 2 * DAY, T0), "in 2 days");
});
