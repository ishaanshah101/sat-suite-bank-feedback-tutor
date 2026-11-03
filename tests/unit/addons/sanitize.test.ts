// Restore hardening: sanitizeEntry builds a clean entry field by field and refuses anything that could poison the log.
import { test } from "vitest";
import assert from "node:assert/strict";
import { importEntries, LOG_BYTES_MAX, readLog, recordAttempt, sanitizeEntry, trimLog } from "../../../extension/src/addons/log";
import { parseBackup } from "../../../extension/src/addons/export";
import { sanitizePrefs } from "../../../extension/src/addons/prefs";
import { applyAttempt, applyReview, readSrs, ruleOf } from "../../../extension/src/addons/srs";
import { KEYS, kv, memoryKV, setKV } from "../../../extension/src/addons/store";
import { entry } from "./helpers";

const NOW = Date.UTC(2026, 10, 3);

test("a good entry comes back with only known fields", () => {
  const raw = { ...entry({ at: NOW }), extra: "dropped", __proto__junk: 1 };
  const out = sanitizeEntry(raw, NOW)!;
  assert.ok(out);
  assert.equal("extra" in out, false);
  assert.equal(out.attemptId, raw.attemptId);
  assert.deepEqual(out.choices, raw.choices);
});

test("wrong types are dropped to null or a default, never kept", () => {
  const out = sanitizeEntry(
    { ...entry({ at: NOW }), qbId: 42, domain: { x: 1 }, skill: [], difficulty: true, passage: 7, figure: 1, shortcut: 2, typed: 3,
      seconds: -5, selfConfidence: "certain", solvedByModel: "yes", confidence: 7, note: null, starred: "yes", diagnosis: "bogus", steps: "not a list" },
    NOW,
  )!;
  assert.ok(out);
  assert.equal(out.qbId, null);
  assert.equal(out.domain, null);
  assert.equal(out.skill, null);
  assert.equal(out.difficulty, null);
  assert.equal(out.passage, null);
  assert.equal(out.figure, null);
  assert.equal(out.shortcut, null);
  assert.equal(out.typed, null);
  assert.equal(out.seconds, null);
  assert.equal(out.selfConfidence, null);
  assert.equal(out.solvedByModel, false);
  assert.equal(out.confidence, 1);
  assert.equal(out.note, "");
  assert.equal(out.starred, false);
  assert.equal(out.diagnosis, "unknown");
  assert.equal(out.steps, undefined);
  assert.equal(sanitizeEntry({ ...entry({ at: NOW }), seconds: Number.POSITIVE_INFINITY }, NOW)!.seconds, null);
  assert.equal(sanitizeEntry({ ...entry({ at: NOW }), confidence: -1 }, NOW)!.confidence, 0);
});

test("long strings are clipped", () => {
  const long = "x".repeat(10_000);
  const out = sanitizeEntry({ ...entry({ at: NOW }), ruleStatement: long, whyCorrect: long, takeaway: long, note: long, stem: long, passage: long, ruleName: long, choices: { A: long, B: "b", C: "c", D: "d" } }, NOW)!;
  assert.ok(out.ruleStatement.length <= 2000);
  assert.ok(out.whyCorrect.length <= 2000);
  assert.ok(out.takeaway.length <= 2000);
  assert.ok(out.note.length <= 2000);
  assert.ok(out.stem.length <= 500);
  assert.ok(out.passage!.length <= 1200);
  assert.ok(out.ruleName!.length <= 200);
  assert.ok(out.choices.A.length <= 500);
  assert.equal(sanitizeEntry({ ...entry({ at: NOW }), attemptId: long }, NOW)!.attemptId.length, 200);
});

test("prototype names as ids are rejected", () => {
  for (const bad of ["__proto__", "constructor", "prototype"]) {
    assert.equal(sanitizeEntry({ ...entry({ at: NOW }), ruleId: bad }, NOW), null, `ruleId ${bad}`);
    assert.equal(sanitizeEntry({ ...entry({ at: NOW }), attemptId: bad }, NOW), null, `attemptId ${bad}`);
    assert.equal(sanitizeEntry({ ...entry({ at: NOW }), qbId: bad }, NOW), null, `qbId ${bad}`);
  }
  assert.ok(sanitizeEntry({ ...entry({ at: NOW }), ruleId: "constructor-1" }, NOW));
});

test("dates in the future or before 2020 are rejected", () => {
  assert.equal(sanitizeEntry({ ...entry(), at: NOW + 2 * 86_400_000 }, NOW), null);
  assert.equal(sanitizeEntry({ ...entry(), at: Date.UTC(2019, 11, 31) }, NOW), null);
  assert.equal(sanitizeEntry({ ...entry(), at: "2026-01-01" }, NOW), null);
  assert.ok(sanitizeEntry({ ...entry(), at: NOW + 3_600_000 }, NOW));
  assert.ok(sanitizeEntry({ ...entry(), at: Date.UTC(2020, 0, 1) }, NOW));
});

test("drill records are checked one by one and capped", () => {
  const drills = [{ at: 1, correct: true, review: "yes" }, { at: "1", correct: true }, null, { at: 2, correct: false }];
  const out = sanitizeEntry({ ...entry({ at: NOW }), drills }, NOW)!;
  assert.deepEqual(out.drills, [{ at: 1, correct: true, review: true }, { at: 2, correct: false }]);
  const many = Array.from({ length: 600 }, (_, i) => ({ at: i, correct: true }));
  assert.equal(sanitizeEntry({ ...entry({ at: NOW }), drills: many }, NOW)!.drills.length, 500);
});

test("a restore of mixed junk only keeps what is sound", async () => {
  setKV(memoryKV());
  const added = await importEntries([
    entry({ attemptId: "good" }),
    { ...entry({ attemptId: "proto" }), ruleId: "__proto__" },
    { ...entry({ attemptId: "future" }), at: Date.now() + 10 * 86_400_000 },
    "junk",
    null,
  ]);
  assert.equal(added, 1);
  assert.deepEqual((await readLog()).map((e) => e.attemptId), ["good"]);
});

test("parseBackup refuses anything that is not a backup object", () => {
  assert.throws(() => parseBackup("not json"), /not a Rulecard backup/);
  assert.throws(() => parseBackup("[]"), /not a Rulecard backup/);
  assert.throws(() => parseBackup('{"kind":"rulecard-addons-backup","entries":"x"}'), /not a Rulecard backup/);
  assert.deepEqual(parseBackup('{"kind":"rulecard-addons-backup","version":1,"entries":[1]}'), [1]);
});

test("the log stays under its byte budget by dropping the oldest entries", () => {
  const big = Array.from({ length: 40 }, (_, i) => entry({ attemptId: `b${i}`, at: NOW - i * 1000, passage: "p".repeat(1100), whyCorrect: "w".repeat(1500) }));
  const kept = trimLog(big, 50_000);
  assert.ok(kept.length < 40 && kept.length > 0);
  assert.ok(JSON.stringify(kept).length <= 50_000);
  assert.equal(kept[0]!.attemptId, "b0");
  assert.equal(trimLog(big, LOG_BYTES_MAX).length, 40);
});

test("a full storage area drops half the log and the attempt is still saved", async () => {
  const mem = memoryKV();
  let fail = true;
  setKV({ ...mem, set: async (k, v) => { if (fail && k === KEYS.log) { fail = false; throw new Error("QUOTA_BYTES quota exceeded"); } await mem.set(k, v); } });
  for (let i = 0; i < 10; i++) await mem.set(KEYS.log, Array.from({ length: 10 }, (_, j) => entry({ attemptId: `old${j}`, at: NOW - j })));
  const log = await recordAttempt(entry({ attemptId: "new", at: NOW + 1 }));
  assert.equal(log.length, 6);
  assert.equal(log[0]!.attemptId, "new");
  assert.equal((await readLog()).length, 6);
});

test("srs lookups never read Object.prototype and never write to it", async () => {
  const state = applyAttempt({}, { ruleId: "constructor", ruleName: null, attemptId: "a", result: "missed" }, NOW);
  assert.deepEqual(state, {});
  assert.equal(ruleOf({}, "constructor"), undefined);
  const empty = {};
  assert.equal(applyReview(empty, "__proto__", true, NOW), empty);
  setKV(memoryKV({ [KEYS.srs]: JSON.parse('{"__proto__":{"box":1,"due":1,"attemptId":"x"},"B1":{"ruleId":"B1","ruleName":null,"box":2,"due":5,"attemptId":"a","reps":0,"lapses":0,"lastReviewed":null},"bad":"x"}') }));
  const read = await readSrs();
  assert.deepEqual(Object.keys(read), ["B1"]);
  assert.equal(Object.getPrototypeOf(read), Object.prototype);
  assert.equal(await kv().get(KEYS.srs) !== undefined, true);
});

test("prefs are validated: bad numbers and types fall back to the defaults", () => {
  const p = sanitizePrefs({ reminderHour: 25, dailyGoal: 0, zoom: 9, hotkeys: "no", timer: false, testDate: "soon", unknown: 1 });
  assert.equal(p.reminderHour, 19);
  assert.equal(p.dailyGoal, 10);
  assert.equal(p.zoom, 1);
  assert.equal(p.hotkeys, true);
  assert.equal(p.timer, false);
  assert.equal(p.testDate, null);
  assert.equal("unknown" in p, false);
  assert.equal(sanitizePrefs({ reminderHour: 7.5 }).reminderHour, 19);
  assert.equal(sanitizePrefs({ reminderHour: 0, dailyGoal: 100, zoom: 1.25, testDate: "2026-12-05" }).zoom, 1.25);
  assert.equal(sanitizePrefs({ reminderHour: 0 }).reminderHour, 0);
  assert.equal(sanitizePrefs(null).dailyGoal, 10);
});
