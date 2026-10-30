import { describe, expect, it } from "vitest";
import { parsePdfText } from "@/lib/questions/pdf-parse";

// Synthetic questions in the Question Bank export layout (not real College Board items).
const MATH_MCQ = `Question ID: a1b2c3d4
Assessment Test Domain Skill Difficulty
SAT Math Algebra Linear functions Medium
Question
The function f is defined by f(x) = 4x - 9. What is the value of f(5)?
A. -11
B. 11
C. 20
D. 29
Answer
Correct Answer: B
Rationale
Choice B is the correct answer. Substituting 5 for x gives 4(5) - 9 = 11.`;

const MATH_GRID_IN = `Question ID: 0f1e2d3c
Assessment Test Domain Skill Difficulty
SAT Math Advanced Math Nonlinear functions Hard
Question
The function g is defined by g(x) = 3x^2 - 17x + 4. What is the value of the smaller zero of g, divided by the larger?
Answer
Correct Answer: .0277, .0278, 1/36
Rationale
The correct answer is 1/36. Examples of ways to enter a correct answer include 1/36 and .0277.`;

const RW = `Question ID: 1234abcd
Assessment Test Domain Skill Difficulty
SAT Reading and Writing Information and Ideas Inferences Hard
Question
Researchers noticed that the moths returned to the lamp every night, which suggests that _____
Which choice most logically completes the text?
A. the lamp attracted them.
B. the moths avoided light.
C. the lamp was off.
D. the moths were asleep.
Answer
Correct Answer: A
Rationale
Choice A is the best answer.`;

describe("Math questions in Question Bank PDF exports", () => {
  it("parses a Math multiple-choice question and sends it to vision", () => {
    const [q] = parsePdfText(MATH_MCQ).questions;
    expect(q.qb_id).toBe("a1b2c3d4");
    expect(q.section).toBe("math");
    expect(q.format).toBe("mcq");
    expect(q.test).toBe("SAT Math");
    expect(q.domain).toBe("Algebra");
    expect(q.skill).toBe("Linear functions");
    expect(q.difficulty).toBe("Medium");
    expect(q.choices).toEqual({ A: "-11", B: "11", C: "20", D: "29" });
    expect(q.correct).toBe("B");
    expect(q.answers).toBeNull();
    expect(q.needsVision).toBe(true);
    expect(q.ok).toBe(true);
    expect(q.stem).toContain("What is the value of f(5)?");
  });

  it("parses a grid-in question with every accepted answer form", () => {
    const [q] = parsePdfText(MATH_GRID_IN).questions;
    expect(q.section).toBe("math");
    expect(q.format).toBe("spr");
    expect(q.skill).toBe("Nonlinear functions");
    expect(q.domain).toBe("Advanced Math");
    expect(q.choices).toBeNull();
    expect(q.correct).toBeNull();
    expect(q.answers).toEqual([".0277", ".0278", "1/36"]);
    expect(q.rationale).toContain("1/36");
    expect(q.needsVision).toBe(true);
    expect(q.ok).toBe(true);
    expect(q.issues).toEqual([]);
  });

  it("reads grid-in answers that wrap onto the next line, and from the rationale when the line is missing", () => {
    const wrapped = `Question ID: 22223333
Assessment Test Domain Skill Difficulty
SAT Math Problem-Solving and Data Analysis Percentages Easy
Question
What is 15% of 40?
Answer
Correct Answer:
6
Rationale
The correct answer is 6.`;
    expect(parsePdfText(wrapped).questions[0].answers).toEqual(["6"]);
    const noLine = `Question ID: 44445555
Assessment Test Domain Skill Difficulty
SAT Math Algebra Linear equations in one variable Easy
Question
If 3x + 2 = 11, what is the value of x?
Answer
Rationale
The correct answer is 3. Subtracting 2 from both sides gives 3x = 9.`;
    const [q] = parsePdfText(noLine).questions;
    expect(q.format).toBe("spr");
    expect(q.answers).toEqual(["3"]);
    expect(q.skill).toBe("Linear equations in one variable");
  });

  it("keeps Reading and Writing and Math apart in a mixed export", () => {
    const { questions, warnings } = parsePdfText(`${RW}\n${MATH_MCQ}\n${MATH_GRID_IN}`);
    expect(warnings).toEqual([]);
    expect(questions.map((q) => [q.qb_id, q.section, q.format, q.needsVision])).toEqual([
      ["1234abcd", "rw", "mcq", false],
      ["a1b2c3d4", "math", "mcq", true],
      ["0f1e2d3c", "math", "spr", true],
    ]);
    expect(questions[0].skill).toBe("Inferences");
    expect(questions[0].ok).toBe(true);
  });

  it("matches long Math skill names that wrap across header lines", () => {
    const text = `Question ID: 5555aaaa
Assessment Test Domain Skill Difficulty
SAT Math Advanced Math Nonlinear equations in one Hard
variable and systems of
equations in two variables
Question
How many solutions does the equation x^2 = 5x have?
A. 0
B. 1
C. 2
D. 3
Answer
Correct Answer: C
Rationale
Choice C is the correct answer.`;
    const [q] = parsePdfText(text).questions;
    expect(q.skill).toBe("Nonlinear equations in one variable and systems of equations in two variables");
    expect(q.domain).toBe("Advanced Math");
    expect(q.difficulty).toBe("Hard");

    const two = `Question ID: 6666bbbb
Assessment Test Domain Skill Difficulty
SAT Math Algebra Systems of two linear Medium
equations in two variables
Question
What is the solution to the system?
A. 1
B. 2
C. 3
D. 4
Answer
Correct Answer: A
Rationale
Choice A is the correct answer.`;
    expect(parsePdfText(two).questions[0].skill).toBe("Systems of two linear equations in two variables");

    const lin = `Question ID: 7777cccc
Assessment Test Domain Skill Difficulty
SAT Math Algebra Linear equations in two Easy
variables
Question
What is the slope?
A. 1
B. 2
C. 3
D. 4
Answer
Correct Answer: D
Rationale
Choice D is the correct answer.`;
    expect(parsePdfText(lin).questions[0].skill).toBe("Linear equations in two variables");
  });

  it("does not confuse Linear with Nonlinear, or Inferences with Inference from sample statistics", () => {
    const nonlinear = MATH_MCQ.replace("Algebra Linear functions", "Advanced Math Nonlinear functions");
    const q1 = parsePdfText(nonlinear).questions[0];
    expect(q1.skill).toBe("Nonlinear functions");
    expect(q1.domain).toBe("Advanced Math");

    const interleaved = `Question ID: 8888dddd
Assessment Test Domain Skill Difficulty
SAT Math Advanced Math Nonlinear equations in one variable Hard
and systems of equations in two variables
Question
What is the positive solution?
Answer
Correct Answer: 4
Rationale
The correct answer is 4.`;
    expect(parsePdfText(interleaved).questions[0].skill).toBe("Nonlinear equations in one variable and systems of equations in two variables");

    const sample = `Question ID: 9999eeee
Assessment Test Domain Skill Difficulty
SAT Math Problem-Solving and Inference from sample Hard
Data Analysis statistics and margin of
error
Question
Which conclusion is best supported by the margin of error?
A. One
B. Two
C. Three
D. Four
Answer
Correct Answer: B
Rationale
Choice B is the correct answer.`;
    const q2 = parsePdfText(sample).questions[0];
    expect(q2.skill).toBe("Inference from sample statistics and margin of error");
    expect(q2.domain).toBe("Problem-Solving and Data Analysis");
    expect(q2.section).toBe("math");

    const q3 = parsePdfText(RW).questions[0];
    expect(q3.skill).toBe("Inferences");
    expect(q3.section).toBe("rw");
  });
});
