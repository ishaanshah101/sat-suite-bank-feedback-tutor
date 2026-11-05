// My Practice (practice-test review) helpers: which pages count, the student's pick, and text cleanup.
import { test } from "vitest";
import assert from "node:assert/strict";
import { cleanPracticeText, isPracticeUrl, parsePracticePick, showsAnswer } from "../../../extension/src/practice";

test("only https My Practice pages count", () => {
  assert.equal(isPracticeUrl("https://mypractice.collegeboard.org/details?fp_8dbea909-c37c-43c1-bde0-b3c056674757"), true);
  assert.equal(isPracticeUrl("http://mypractice.collegeboard.org/details"), false);
  assert.equal(isPracticeUrl("https://mypractice.collegeboard.org.evil.example/details"), false);
  assert.equal(isPracticeUrl("https://satsuitequestionbank.collegeboard.org/"), false);
  assert.equal(isPracticeUrl(undefined), false);
  assert.equal(isPracticeUrl("not a url"), false);
});

test("the student's pick comes from 'You selected answer D.'", () => {
  assert.deepEqual(parsePracticePick("Answer\nYou selected answer D. The correct answer is A.\nRationale"), { letter: "D" });
  assert.deepEqual(parsePracticePick("you selected choice b. The correct answer is C."), { letter: "B" });
  assert.deepEqual(parsePracticePick("You entered 3/17. The correct answer is 3/17."), { typed: "3/17" });
  assert.equal(parsePracticePick("The correct answer is A."), null);
});

test("the answer panel must be showing", () => {
  assert.equal(showsAnswer("You selected answer D. The correct answer is A.\nRationale\nChoice A is correct."), true);
  assert.equal(showsAnswer("Math: Question 22\nThe function f is defined by..."), false);
});

test("page text is tidied and capped", () => {
  const raw = "SAT Practice 6\n\n\n\nMath: Question 22 \nPrevious\nNext\nShow correct answer and explanation\nA.   -6";
  assert.equal(cleanPracticeText(raw), "SAT Practice 6\n\nMath: Question 22\nA. -6");
  assert.equal(cleanPracticeText("x".repeat(30_000)).length, 18_000);
});
