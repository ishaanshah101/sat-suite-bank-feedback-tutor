import { test } from "vitest";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { crossCheck, isQuestionBankUrl, parseQuestionBankText, similarity, splitExport } from "../../../extension/src/addons/qbtext";
import type { Question } from "../../../extension/src/addons/types";

// Synthetic sample shaped like Question Bank innerText (labels and letters on their own lines).
const WEB = `Question ID 0a1b2c3d
Assessment
SAT
Test
Reading and Writing
Domain
Craft and Structure
Skill
Words in Context
Difficulty
Hard
Question
The committee's report was notably ______: it covered every budget line in detail.
Which choice completes the text with the most logical and precise word or phrase?
A
thorough
B
brief
C
ambiguous
D
partisan
Correct Answer: A
Rationale
Choice A is the best answer because the report covered every line in detail.`;

test("parses web-style text with letters on separate lines", () => {
  const p = parseQuestionBankText(WEB);
  assert.equal(p.qbId, "0a1b2c3d");
  assert.equal(p.domain, "Craft and Structure");
  assert.equal(p.skill, "Words in Context");
  assert.equal(p.difficulty, "Hard");
  assert.equal(p.correct, "A");
  assert.equal(p.answerRevealed, true);
  assert.deepEqual(p.choices, { A: "thorough", B: "brief", C: "ambiguous", D: "partisan" });
  assert.match(p.stem!, /^Which choice completes/);
  assert.match(p.passage!, /committee's report/);
  assert.match(p.rationale!, /Choice A is the best answer/);
});

test("answer not revealed yet", () => {
  const p = parseQuestionBankText(WEB.split("Correct Answer")[0]!);
  assert.equal(p.correct, null);
  assert.equal(p.answerRevealed, false);
  assert.equal(p.choices.D, "partisan");
});

// Made-up question laid out like text pulled from a Question Bank PDF export: split words
// ("wer e", "Standar d"), a spaced hex ID ("6f ece68e") and a spaced choice letter ("D . is").
test("PDF-style spacing: 'Corr ect A nswer', 'D . is', 'F orm, Structur e', spaced ID", () => {
  const pdf = `Question ID: 6f ece68e
Assessment T est Domain Skill Difficulty
SA T Reading and W riting Standar d English
Conventions
F orm, Structur e, and
Sense
Medium
Question
Opened last spring after years of delays, the town's new public library, with its glass r eading r oom and seed-sharing shelf, ______ a r ooftop garden wher e volunteers gr ow vegetables for a nearby food pantry.
Which choice completes the text so that it conforms  t o the conventions of Standar d English?
A nswer
A. wer e home t o
B. ar e home t o
C. hav e been home t o
D . is home t o
Corr ect A nswer: D
Rationale
Choice D is the best answer.`;
  const p = parseQuestionBankText(pdf);
  assert.equal(p.qbId, "6fece68e");
  assert.equal(p.domain, "Standard English Conventions");
  assert.equal(p.skill, "Form, Structure, and Sense");
  assert.equal(p.difficulty, "Medium");
  assert.equal(p.correct, "D");
  assert.equal(p.choices.D, "is home t o");
  assert.equal(p.choices.A, "wer e home t o");
});

test("cross-check flags answer and id mismatches, passes when consistent", () => {
  const page = parseQuestionBankText(WEB);
  const model: Question = { id: "q1", qbId: "0a1b2c3d", stem: "x", choices: { A: "thorough", B: "brief", C: "ambiguous", D: "partisan" }, correct: "A" };
  assert.equal(crossCheck(model, page).ok, true);
  const wrong = crossCheck({ ...model, correct: "B", qbId: "ffffffff" }, page);
  assert.equal(wrong.ok, false);
  assert.equal(wrong.warnings.length, 2);
  const missing = crossCheck({ ...model, correct: null }, page);
  assert.equal(missing.pageCorrect, "A");
  assert.match(missing.warnings[0]!, /page shows the answer is A/);
  const garbled = crossCheck({ ...model, choices: { A: "zebra", B: "quantum", C: "ambiguous", D: "partisan" } }, page);
  assert.match(garbled.warnings.join(" "), /Choices A, B/);
});

test("similarity and url helpers", () => {
  assert.equal(similarity("tools; lawn", "tools ; lawn"), 1);
  assert.ok(similarity("a quiet reading room", "quiet reading rooms") > 0.5);
  assert.equal(isQuestionBankUrl("https://satsuitequestionbank.collegeboard.org/digital/results"), true);
  assert.equal(isQuestionBankUrl("https://example.com"), false);
  assert.equal(isQuestionBankUrl("not a url"), false);
});

// Real College Board exports, extracted locally from Ishaan's PDFs (not committed).
for (const name of ["withanswers.txt", "export1.txt"]) {
  const path = `tests/unit/addons/fixtures/local/${name}`;
  test(`real export ${name}: every question parses with id, 4 choices and the answer`, { skip: !existsSync(path) }, () => {
    const blocks = splitExport(readFileSync(path, "utf8"));
    assert.ok(blocks.length >= 30, `found ${blocks.length} questions`);
    const bad: string[] = [];
    let skills = 0;
    for (const b of blocks) {
      const p = parseQuestionBankText(b);
      const ok = p.qbId && p.correct && ["A", "B", "C", "D"].every((l) => (p.choices as Record<string, string>)[l]) && p.stem;
      if (!ok) bad.push(`${p.qbId}: correct=${p.correct} choices=${Object.keys(p.choices).join("")} stem=${Boolean(p.stem)}`);
      if (p.skill && p.difficulty && p.domain) skills++;
      else bad.push(`${p.qbId}: skill=${p.skill} difficulty=${p.difficulty} domain=${p.domain}`);
    }
    assert.deepEqual(bad, []);
    assert.equal(skills, blocks.length, "skill, difficulty and domain detected for every question");
  });
}
