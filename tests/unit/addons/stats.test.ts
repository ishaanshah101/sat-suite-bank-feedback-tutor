import { test } from "vitest";
import assert from "node:assert/strict";
import { insights, summarize } from "../../../extension/src/addons/stats";
import { applyAttempt } from "../../../extension/src/addons/srs";
import { at, entry } from "./helpers";

test("empty log gives an onboarding insight", () => {
  const s = summarize([], {});
  assert.equal(s.attempts, 0);
  assert.equal(s.accuracy, null);
  assert.match(insights(s)[0]!.text, /Capture and explain/);
});

test("counts, accuracy, diagnosis and per-rule grouping", () => {
  const log = [
    entry({ ruleId: "B1", result: "missed", diagnosis: "careless" }),
    entry({ ruleId: "B1", result: "missed", diagnosis: "careless" }),
    entry({ ruleId: "B1", result: "right", diagnosis: "got_it_right" }),
    entry({ ruleId: "T3", ruleName: "Transitions", result: "missed", diagnosis: "rule_gap", skill: "Transitions" }),
  ];
  const s = summarize(log, {});
  assert.equal(s.attempts, 4);
  assert.equal(s.missed, 3);
  assert.equal(s.accuracy, 0.25);
  assert.equal(s.missesByDiagnosis.careless, 2);
  assert.equal(s.byRule[0]!.key, "B1");
  assert.equal(s.byRule[0]!.misses, 2);
  assert.equal(s.byRule[0]!.attempts, 3);
});

test("streak counts back from today, or from yesterday if nothing today yet", () => {
  const now = at(2026, 10, 20, 15);
  const log = [entry({ at: at(2026, 10, 19) }), entry({ at: at(2026, 10, 18) }), entry({ at: at(2026, 10, 17) }), entry({ at: at(2026, 10, 15) })];
  let s = summarize(log, {}, now);
  assert.equal(s.practicedToday, false);
  assert.equal(s.streakDays, 3);
  s = summarize([...log, entry({ at: at(2026, 10, 20, 9) })], {}, now);
  assert.equal(s.streakDays, 4);
  assert.equal(s.daily.length, 14);
  assert.equal(s.daily[13]!.attempts, 1);
});

test("pacing ignores missing and absurd times", () => {
  const s = summarize([entry({ seconds: 50 }), entry({ seconds: 100 }), entry({ seconds: null }), entry({ seconds: 5000 })], {});
  assert.equal(s.pacing.timed, 2);
  assert.equal(s.pacing.avgSeconds, 75);
  assert.equal(s.pacing.slow, 1);
});

test("insights flag careless-heavy misses, worst rule, and due reviews", () => {
  const log = Array.from({ length: 6 }, (_, i) => entry({ diagnosis: i < 4 ? "careless" : "rule_gap", result: "missed" }));
  let srs = {};
  for (const e of log) srs = applyAttempt(srs, e, e.at);
  const tips = insights(summarize(log, srs), 2).map((t) => t.text).join("\n");
  assert.match(tips, /2 rules are due/);
  assert.match(tips, /careless slips/);
  assert.match(tips, /most-missed rule is B1 · Comma splice/);
});

test("week over week change", () => {
  const now = at(2026, 10, 20, 15);
  const thisWeek = Array.from({ length: 5 }, () => entry({ at: at(2026, 10, 19), result: "right" }));
  const lastWeek = Array.from({ length: 5 }, (_, i) => entry({ at: at(2026, 10, 10), result: i < 2 ? "right" : "missed" }));
  const s = summarize([...thisWeek, ...lastWeek], {}, now);
  assert.equal(s.thisWeek.accuracy, 1);
  assert.equal(s.lastWeek.accuracy, 0.4);
  assert.match(insights(s).map((t) => t.text).join(" "), /up 60%/);
});
