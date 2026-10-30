import { describe, expect, it } from "vitest";
import { linesFromItems, parsePdfLines, parsePdfPages, parsePdfText } from "@/lib/questions/pdf-parse";

const NEW_LAYOUT = `
Question ID: 960dec02
Assessment Test Domain Skill Difficulty
SAT Reading and Writing Standard English Boundaries Medium
Conventions
Question
A recent study of coastal towns found that sea walls, which were built in the 1950s _____ many of them are now too low.
Which choice completes the text so that it conforms to the conventions of Standard English?
A. 1950s, and
B. 1950s;
C. 1950s
D. 1950s, because
Answer
Correct Answer: B
Rationale
Choice B is the best answer. The semicolon correctly joins two independent clauses. Choice A is incorrect because
the comma plus "and" leaves the second clause without a subject.
Question ID: 37e5c794
Assessment Test Domain Skill Difficulty
SAT Reading and Writing Expression of Ideas Transitions Easy
Question
Coral reefs are vital ecosystems. _____ they protect coastlines from storms.
Which choice completes the text with the most logical transition?
A. Nevertheless,
B. In addition,
C. For example,
D. Instead,
Answer
Rationale
Choice B is the best answer because the second sentence adds a benefit to the first.
`;

const OLD_LAYOUT = `
https://satsuitequestionbank.collegeboard.org/digital/results 1/15/25, 10:02 AM
Page 1 of 2
Question ID 89fbc3eb
Assessment Test Domain Skill Difficulty
SAT Reading and Writing Standard English Form, Structure, Hard
Conventions and Sense
ID: 89fbc3eb The collection of letters, which spans forty years, _____ donated to the archive in 2011.
Which choice completes the text so that it conforms to the conventions of Standard English?
A. were
B. was
C. have been
D. are
ID: 89fbc3eb Answer
Correct Answ er: B
Rationale
Choice B is the best answer. The subject "collection" is singular.
Question Difficulty: Hard
`;

describe("parsePdfText", () => {
  it("parses the current export layout, including a missing Correct Answer line", () => {
    const { questions, warnings } = parsePdfText(NEW_LAYOUT);
    expect(warnings).toEqual([]);
    expect(questions).toHaveLength(2);
    const [q1, q2] = questions;
    expect(q1.qb_id).toBe("960dec02");
    expect(q1.test).toBe("SAT Reading and Writing");
    expect(q1.domain).toBe("Standard English Conventions");
    expect(q1.skill).toBe("Boundaries");
    expect(q1.difficulty).toBe("Medium");
    expect(q1.passage).toContain("A recent study of coastal towns");
    expect(q1.stem).toBe("Which choice completes the text so that it conforms to the conventions of Standard English?");
    expect(q1.choices).toEqual({ A: "1950s, and", B: "1950s;", C: "1950s", D: "1950s, because" });
    expect(q1.correct).toBe("B");
    expect(q1.rationale).toContain("semicolon");
    expect(q1.rationale).toContain("without a subject");
    expect(q1.ok).toBe(true);

    expect(q2.qb_id).toBe("37e5c794");
    expect(q2.skill).toBe("Transitions");
    expect(q2.correct).toBe("B");
    expect(q2.ok).toBe(true);
  });

  it("parses the 2024 layout with ID: prefixes, stray spaces and print headers", () => {
    const { questions } = parsePdfText(OLD_LAYOUT);
    expect(questions).toHaveLength(1);
    const q = questions[0];
    expect(q.qb_id).toBe("89fbc3eb");
    expect(q.skill).toBe("Form, Structure, and Sense");
    expect(q.domain).toBe("Standard English Conventions");
    expect(q.difficulty).toBe("Hard");
    expect(q.passage).toBe("The collection of letters, which spans forty years, _____ donated to the archive in 2011.");
    expect(q.stem).toMatch(/^Which choice completes/);
    expect(q.choices?.B).toBe("was");
    expect(q.correct).toBe("B");
    expect(q.rationale).toBe('Choice B is the best answer. The subject "collection" is singular.');
    expect(q.ok).toBe(true);
  });

  it("flags a Reading and Writing question without four choices as needing a look", () => {
    const text = `Question ID: cecbdeb0
Assessment Test Domain Skill Difficulty
SAT Reading and Writing Expression of Ideas Transitions Easy
Question
The bakery sold out by noon. _____ the owners doubled the next day's batch.
Which choice completes the text with the most logical transition?
A. Consequently,
B. However,
Answer
Correct Answer: A
Rationale
Choice A is the best answer.`;
    const { questions } = parsePdfText(text);
    expect(questions).toHaveLength(1);
    expect(questions[0].ok).toBe(false);
    expect(questions[0].needsVision).toBe(false);
    expect(questions[0].issues.join(" ")).toContain("Missing choices");
  });

  it("marks Reading and Writing questions as multiple choice that need no vision", () => {
    const [q] = parsePdfText(NEW_LAYOUT).questions;
    expect(q.section).toBe("rw");
    expect(q.format).toBe("mcq");
    expect(q.needsVision).toBe(false);
    expect(q.answers).toBeNull();
    expect(q.figure).toBeNull();
  });

  it("warns when there are no question markers", () => {
    const { questions, warnings } = parsePdfText("just some text\nwith no ids");
    expect(questions).toHaveLength(0);
    expect(warnings[0]).toMatch(/Question ID/);
  });
});

describe("linesFromItems", () => {
  it("clusters items by y, orders by x and inserts spaces across gaps", () => {
    const lines = linesFromItems({
      page: 1,
      items: [
        { str: "Question", x: 20, y: 700, width: 40, height: 9 },
        { str: "ID:", x: 62, y: 700.5, width: 14, height: 9 },
        { str: "960dec02", x: 80, y: 699.6, width: 40, height: 9 },
        { str: "Algebr", x: 20, y: 680, width: 30, height: 9 },
        { str: "a", x: 50.2, y: 680, width: 5, height: 9 },
      ],
    });
    expect(lines.map((l) => l.text)).toEqual(["Question ID: 960dec02", "Algebra"]);
    expect(lines[0].page).toBe(1);
  });

  it("drops print headers and page counters", () => {
    const lines = linesFromItems({
      page: 2,
      items: [
        { str: "Page 2 of 9", x: 500, y: 20, width: 50, height: 8 },
        { str: "Rationale", x: 20, y: 500, width: 50, height: 9 },
      ],
    });
    expect(lines.map((l) => l.text)).toEqual(["Rationale"]);
  });

  it("keeps a question that spans two pages together", () => {
    const pages = [
      {
        page: 1,
        items: [
          { str: "Question ID: 42b4493b", x: 20, y: 700, width: 100, height: 9 },
          { str: "Assessment Test Domain Skill Difficulty", x: 20, y: 680, width: 200, height: 9 },
          { str: "SAT Reading and Writing Information and Ideas Inferences Medium", x: 20, y: 668, width: 300, height: 9 },
          { str: "Question", x: 20, y: 640, width: 40, height: 9 },
          { str: "Some birds migrate at night. This suggests that _____", x: 20, y: 620, width: 300, height: 9 },
          { str: "Which choice most logically completes the text?", x: 20, y: 600, width: 300, height: 9 },
          { str: "A. first", x: 20, y: 580, width: 50, height: 9 },
          { str: "B. second", x: 20, y: 568, width: 50, height: 9 },
        ],
      },
      {
        page: 2,
        items: [
          { str: "C. third", x: 20, y: 700, width: 50, height: 9 },
          { str: "D. fourth", x: 20, y: 688, width: 50, height: 9 },
          { str: "Answer", x: 20, y: 660, width: 40, height: 9 },
          { str: "Correct Answer: D", x: 20, y: 640, width: 100, height: 9 },
          { str: "Rationale", x: 20, y: 620, width: 50, height: 9 },
          { str: "Choice D is the best answer because it follows from the premises.", x: 20, y: 600, width: 300, height: 9 },
        ],
      },
    ];
    const { questions } = parsePdfPages(pages);
    expect(questions).toHaveLength(1);
    expect(questions[0].pages).toEqual([1, 2]);
    expect(questions[0].choices).toEqual({ A: "first", B: "second", C: "third", D: "fourth" });
    expect(questions[0].correct).toBe("D");
    expect(questions[0].skill).toBe("Inferences");
    expect(parsePdfLines([]).questions).toEqual([]);
  });
});
