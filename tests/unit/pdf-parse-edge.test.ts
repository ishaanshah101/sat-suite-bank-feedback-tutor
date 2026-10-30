import { describe, expect, it } from "vitest";
import { linesFromItems, parsePdfText } from "@/lib/questions/pdf-parse";

const ANSWER = `Answer
Correct Answer: B
Rationale
Choice B is the best answer because it is.`;

describe("pdf parser edge cases", () => {
  it("keeps a stem that wraps onto a line starting with a trigger word", () => {
    const text = `Question ID: 11111111
Assessment Test Domain Skill Difficulty
SAT Reading and Writing Information and Ideas Cross-Text Connections Hard
Question
Text 1 says one thing about the study.
Text 2 says another thing about the study.
Based on the texts, how would the author of Text 1 most likely respond to the claim made by
the author of Text 2?
A. By agreeing
B. By disagreeing
C. By asking for data
D. By changing the subject
${ANSWER}`;
    const [q] = parsePdfText(text).questions;
    expect(q.stem).toBe("Based on the texts, how would the author of Text 1 most likely respond to the claim made by the author of Text 2?");
    expect(q.passage).toBe("Text 1 says one thing about the study.\nText 2 says another thing about the study.");
    expect(q.skill).toBe("Cross-Text Connections");
    expect(q.ok).toBe(true);
  });

  it("keeps a two-sentence stem together", () => {
    const text = `Question ID: 22222222
Question
The student took notes on a topic.
The student wants to emphasize a similarity between the two findings.
Which choice most effectively uses relevant information from the notes to accomplish this goal?
A. One
B. Two
C. Three
D. Four
${ANSWER}`;
    const [q] = parsePdfText(text).questions;
    expect(q.stem).toBe("The student wants to emphasize a similarity between the two findings. Which choice most effectively uses relevant information from the notes to accomplish this goal?");
    expect(q.passage).toBe("The student took notes on a topic.");
  });

  it("treats a wrapped choice line that starts like a letter as a continuation", () => {
    const text = `Question ID: 33333333
Question
A novel was reviewed.
Which choice best states the main idea of the text?
A. The plot is slow.
B. "The characters are vivid, as noted by critic
D. H. Lawrence."
C. The setting is bleak.
D. "The ending is abrupt."
${ANSWER}`;
    const [q] = parsePdfText(text).questions;
    expect(q.choices?.B).toBe('"The characters are vivid, as noted by critic D. H. Lawrence."');
    expect(q.choices?.C).toBe("The setting is bleak.");
    expect(q.choices?.D).toBe('"The ending is abrupt."');
    expect(q.ok).toBe(true);
  });

  it("does not mistake a name initial in the passage for the first choice", () => {
    const text = `Question ID: 44444444
Question
The 1963 March on Washington was organized in large part by civil rights leader
A. Philip Randolph, who had planned a similar march decades earlier.
Which choice best states the main idea of the text?
A. Randolph planned early.
B. The march was small.
C. The march was in 1973.
D. Randolph opposed the march.
${ANSWER}`;
    const [q] = parsePdfText(text).questions;
    expect(q.passage).toContain("A. Philip Randolph");
    expect(q.stem).toBe("Which choice best states the main idea of the text?");
    expect(q.choices?.A).toBe("Randolph planned early.");
    expect(q.ok).toBe(true);
  });

  it("merges a repeated Question ID marker into the same question", () => {
    const text = `Question ID: 55555555
Question
The passage is short.
Which choice completes the text?
A. For example,
B. Instead,
Question ID: 55555555
C. However,
D. Finally,
${ANSWER}`;
    const { questions } = parsePdfText(text);
    expect(questions).toHaveLength(1);
    expect(questions[0].choices).toEqual({ A: "For example,", B: "Instead,", C: "However,", D: "Finally," });
    expect(questions[0].correct).toBe("B");
  });

  it("reads taxonomy from a header without a Question label and keeps it out of the passage", () => {
    const text = `Question ID: 66666666
Assessment Test Domain Skill Difficulty
SAT Reading and Writing Craft and Structure Cross-Text Connections Hard
The passage begins here with ordinary prose that is long enough to look like body text.
Which choice best describes the texts?
A. One
B. Two
C. Three
D. Four
${ANSWER}`;
    const [q] = parsePdfText(text).questions;
    expect(q.skill).toBe("Cross-Text Connections");
    expect(q.domain).toBe("Craft and Structure");
    expect(q.difficulty).toBe("Hard");
    expect(q.passage).toBe("The passage begins here with ordinary prose that is long enough to look like body text.");
  });

  it("folds a superscript back into its line", () => {
    const lines = linesFromItems({
      page: 1,
      items: [
        { str: "Plants take in CO", x: 10, y: 600, width: 80, height: 10 },
        { str: "2", x: 90, y: 597, width: 4, height: 6 },
        { str: " from the air.", x: 95, y: 600, width: 60, height: 10 },
        { str: "They grow.", x: 10, y: 586, width: 50, height: 10 },
      ],
    });
    expect(lines.map((l) => l.text)).toEqual(["Plants take in CO2 from the air.", "They grow."]);
  });
});
