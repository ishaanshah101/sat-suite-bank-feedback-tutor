// The November 2026 Question Bank export: a Standard ID column in the header table, and the four
// choices printed under the "Answer" heading, before "Correct Answer:". Text taken from a real export.
import { test } from "vitest";
import assert from "node:assert/strict";
import { parsePdfText } from "@/lib/questions/pdf-parse";

const EXPORT_2026 = `Question ID: 22a41819
Assessment Test Domain Skill Difficulty Standard ID
SAT Reading and Craft and Words in Context Hard California
Writing Structure L.11-12.3 L.11-12.4
L.11-12.5 L.11-12.6
L.CCR.3 L.CCR.4
R.CCR.4 R.CCR.10
RI.11-12.4 RI.11-12.10
Question
Rejecting the premise that the literary magazine Ebony and Topaz (1927) should present a unified vision of Black American identity, editor
Charles S. Johnson fostered his contributors' diverse perspectives by promoting their authorial autonomy. Johnson's self-effacement diverged
from the editorial stances of W.E.B. Du Bois and Alain Locke, whose decisions for their publications were more ______.
Which choice completes the text with the most logical and precise word or phrase?
Answer
A. proficient
B. dogmatic
C. ambiguous
D. unpretentious
Correct Answer: B
Rationale
Choice B is the best answer. A person who is "dogmatic" believes strongly that their principles and opinions are true.
Choice A is incorrect. "Proficient" means "skilled."`;

test("2026 layout: choices under Answer, header with Standard ID", () => {
  const { questions, warnings } = parsePdfText(EXPORT_2026);
  assert.deepEqual(warnings, []);
  assert.equal(questions.length, 1);
  const q = questions[0];
  assert.equal(q.qb_id, "22a41819");
  assert.equal(q.section, "rw");
  assert.equal(q.skill, "Words in Context");
  assert.equal(q.domain, "Craft and Structure");
  assert.equal(q.difficulty, "Hard");
  assert.deepEqual(q.choices, { A: "proficient", B: "dogmatic", C: "ambiguous", D: "unpretentious" });
  assert.equal(q.correct, "B");
  assert.match(q.stem, /^Which choice completes the text/);
  assert.match(q.passage ?? "", /^Rejecting the premise/);
  assert.match(q.rationale ?? "", /^Choice B is the best answer/);
  assert.equal(q.ok, true);
  assert.equal(q.needsVision, false);
});

test("2026 layout without the answer key still reads the choices", () => {
  const noKey = EXPORT_2026.replace(/Correct Answer: B\n/, "").replace(/Rationale[\s\S]*$/, "");
  const q = parsePdfText(noKey).questions[0];
  assert.deepEqual(q.choices, { A: "proficient", B: "dogmatic", C: "ambiguous", D: "unpretentious" });
  assert.equal(q.correct, null);
  assert.equal(q.rationale, null);
});
