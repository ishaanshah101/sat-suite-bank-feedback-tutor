// "How to attack this question type": a short PROCESS for each official Digital SAT R&W skill.
// Complements the server's rules (what's correct) with a method (how to get there fast).
// Written for Rulecard; keyed by the College Board skill names the extractor already returns.

export interface Strategy {
  skill: string;
  steps: string[];
  traps: string[];
}

export const STRATEGIES: Strategy[] = [
  {
    skill: "Words in Context",
    steps: [
      "Cover the choices. Read the whole text and find the clue that defines the blank (a contrast, a restatement, an example).",
      "Put your own simple word in the blank before you look.",
      "Pick the choice that matches your word in meaning and in tone (positive, negative, neutral).",
    ],
    traps: ["A word that fits the topic but not the exact meaning", "A secondary meaning of a familiar word", "A word that's right but too strong or too weak"],
  },
  {
    skill: "Text Structure and Purpose",
    steps: [
      "Label what each sentence does: claim, background, example, contrast, conclusion.",
      "For main purpose, sum up the whole text in five words. For an underlined sentence, say how it connects to the sentences around it.",
      "Match the verb in the choice (describe, argue, challenge, illustrate) to what the text actually does.",
    ],
    traps: ["True of one detail but not the whole text", "A verb that's too strong (\"refute\" when the text only describes)"],
  },
  {
    skill: "Cross-Text Connections",
    steps: [
      "Write each text's main claim in one line.",
      "Find the exact point in Text 1 that Text 2 is talking about.",
      "Predict Text 2's reaction to that point (agree, add a limit, or reject) before you read the choices.",
    ],
    traps: ["A reaction to something Text 2 never mentions", "Calling a qualification a total disagreement"],
  },
  {
    skill: "Central Ideas and Details",
    steps: [
      "For the main idea, ask what most of the text is about, not just the first or last line.",
      "For a detail, go back and find the line. Don't answer from memory.",
      "Every word of the right choice has to be backed by the text.",
    ],
    traps: ["Too broad or too narrow", "Sounds true in real life but the text doesn't say it"],
  },
  {
    skill: "Command of Evidence",
    steps: [
      "Underline the exact claim you need to support or weaken, every part of it.",
      "For quotes or findings, the right one proves that specific claim, not just the topic.",
      "For graphs and tables, read the title, axes and units first, then find the data point that makes the claim's comparison.",
    ],
    traps: ["Accurate data that doesn't address the claim", "Supports half the claim", "Reading the wrong row, year or unit"],
  },
  {
    skill: "Inferences",
    steps: [
      "Follow the logic step by step: premise, then premise, then what has to follow.",
      "The blank is the next logical step. Say it in your own words first.",
      "Choose what must be true based on the text, not what might be true.",
    ],
    traps: ["Plausible but needs outside knowledge", "Extreme words like always, never, or proves"],
  },
  {
    skill: "Boundaries",
    steps: [
      "Check each side of the blank: is it an independent clause (could stand alone) or not?",
      "Two independent clauses: period, semicolon, or comma + FANBOYS. A colon or dash only after a complete clause.",
      "Nothing goes between a subject and its verb, or a verb and its object. Extra info gets a matching pair: two commas, two dashes, or two parentheses.",
    ],
    traps: ["Comma splice", "Colon after an incomplete clause", "Half a pair (one dash, one comma)"],
  },
  {
    skill: "Form, Structure, and Sense",
    steps: [
      "Find the real subject: skip prepositional phrases and \"which/who\" interrupters, then match the verb to it.",
      "Match the tense to the verbs around the blank and to the time the text describes.",
      "Pronouns agree in number with what they replace. Watch its/it's, their/they're, and plural vs possessive. A modifier sits right next to the thing it describes.",
    ],
    traps: ["Agreeing with the nearest noun instead of the subject", "Switching tense for no reason", "A dangling modifier"],
  },
  {
    skill: "Transitions",
    steps: [
      "Cover the choices. Read the sentence before the blank and the one after it.",
      "Name the relationship: contrast, cause and effect, more of the same, example, or time order.",
      "Choose the transition in that category.",
    ],
    traps: ["If two choices mean the same thing, neither is right", "Choosing \"however\" just because the topic shifts slightly"],
  },
  {
    skill: "Rhetorical Synthesis",
    steps: [
      "Read the goal in the question first (\"emphasize a difference\", \"introduce the study to a new audience\").",
      "Ignore the notes at first. Every choice is accurate to them, so accuracy isn't the test.",
      "Pick the choice that does exactly the stated goal, and all of it.",
    ],
    traps: ["Accurate but doesn't meet the goal", "Meets half the goal (for example, names one item when it should compare two)"],
  },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

export function strategyFor(skill: string | null | undefined): Strategy | null {
  if (!skill) return null;
  const k = norm(skill);
  return STRATEGIES.find((s) => norm(s.skill) === k) ?? STRATEGIES.find((s) => k.includes(norm(s.skill)) || norm(s.skill).includes(k)) ?? null;
}
