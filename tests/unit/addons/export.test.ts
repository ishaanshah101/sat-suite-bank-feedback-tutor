import { test } from "vitest";
import assert from "node:assert/strict";
import { cardAsText, filterScope, groupByRule, parseBackup, toAnkiCsv, toBackup, toMarkdown, toPrintableHtml } from "../../../extension/src/addons/export";
import { entry } from "./helpers";

test("anki csv: header lines, one row per entry, quotes escaped, tags", () => {
  const csv = toAnkiCsv([entry({ stem: 'He said "hi"', ruleId: "B 1" }), entry()]);
  const lines = csv.trim().split("\n");
  assert.equal(lines[0], "#separator:comma");
  assert.equal(lines.length, 5);
  assert.match(lines[3]!, /He said &quot;hi&quot;/);
  assert.match(lines[3]!, /rule::B_1/);
  assert.match(lines[3]!, /skill::Boundaries/);
  assert.match(lines[3]!, /Why A fails/);
});

test("html output escapes user text", () => {
  const html = toPrintableHtml([entry({ note: "<script>alert(1)</script>" })]);
  assert.ok(!html.includes("<script>alert(1)"));
  assert.match(html, /&lt;script&gt;/);
});

test("groupByRule orders by misses and dedupes takeaways", () => {
  const g = groupByRule([entry({ ruleId: "X", result: "right" }), entry({ ruleId: "Y" }), entry({ ruleId: "Y" })]);
  assert.equal(g[0]!.ruleId, "Y");
  assert.equal(g[0]!.takeaways.length, 1);
});

test("markdown + scopes + backup roundtrip + card text", () => {
  const log = [entry({ starred: true }), entry({ result: "right", picked: "correct" })];
  assert.equal(filterScope(log, "missed").length, 1);
  assert.equal(filterScope(log, "starred").length, 1);
  assert.match(toMarkdown(log), /## B1 · Comma splice {2}\(1 missed \/ 2\)/);
  assert.deepEqual(parseBackup(toBackup(log)), log);
  assert.throws(() => parseBackup('{"foo":1}'), /not a Rulecard backup/);
  const txt = cardAsText(log[0]!);
  assert.match(txt, /^Rule B1 · Comma splice\n/);
  assert.match(txt, /Why A fails/);
  assert.ok(!cardAsText(log[1]!).includes("fails"));
});
