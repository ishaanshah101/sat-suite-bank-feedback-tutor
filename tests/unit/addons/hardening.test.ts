import { test } from "vitest";
import assert from "node:assert/strict";
import { importEntries, readLog, recordAttempt, recordDrill, sanitizeEntry, updateEntry } from "../../../extension/src/addons/log";
import { KEYS, kv, memoryKV, setKV } from "../../../extension/src/addons/store";
import { actionFor } from "../../../extension/src/addons/hotkeys";
import { entry } from "./helpers";

test("restore drops broken entries and broken drill records instead of storing them", async () => {
  setKV(memoryKV());
  const good = { ...entry({ attemptId: "good" }), drills: [null, { at: 5, correct: true }, { at: "x", correct: 1 }] };
  const noStem = { ...entry({ attemptId: "nostem" }), stem: undefined };
  const added = await importEntries([good, noStem, null, 42, { attemptId: "x" }] as unknown[]);
  assert.equal(added, 1);
  const log = await readLog();
  assert.equal(log.length, 1);
  assert.deepEqual(log[0]!.drills, [{ at: 5, correct: true }]);
});

test("a log already corrupted in storage still reads safely", async () => {
  setKV(memoryKV());
  await kv().set(KEYS.log, [entry({ attemptId: "ok" }), null, { attemptId: "bad", drills: [null] }, "junk"]);
  const log = await readLog();
  assert.deepEqual(log.map((e) => e.attemptId), ["ok"]);
  assert.equal(sanitizeEntry({ ...entry(), at: Number.NaN }), null);
});

test("overlapping saves keep both changes", async () => {
  setKV(memoryKV());
  await recordAttempt(entry({ attemptId: "a1" }));
  await Promise.all([updateEntry("a1", { note: "my note" }), recordDrill("a1", true), updateEntry("a1", { starred: true }), recordDrill("a1", false)]);
  const [e] = await readLog();
  assert.equal(e!.note, "my note");
  assert.equal(e!.starred, true);
  assert.equal(e!.drills.length, 2);
});

test("hotkey map is unchanged by the button guard", () => {
  assert.deepEqual(actionFor("Enter"), { name: "explain" });
});
