// The playbook: for each official skill, the fastest reliable way to answer, how College Board builds the
// wrong choices, and the word lists that decide the question. Distilled from the owner's study folder:
// College Board's Assessment Framework, Skills Insight and test specifications, his handwritten and typed
// notes, and the cheat sheets, formula sheets and grammar guides he collected. The explain and chat prompts
// receive the entry for the question's skill plus the section's general entry, so cards teach the fastest
// route and name the trap. Mix-ups found in real student notes are listed so cards can correct them.
import type { Section, Skill } from "@/lib/questions/taxonomy";

const r = String.raw;

export interface PlaybookEntry {
  /** Fastest reliable route, in the order a student should try it. */
  route: string[];
  /** How the wrong choices are built for this skill. */
  traps: string[];
  /** Word lists or formulas that decide these questions. */
  lists?: string[];
  /** Misunderstandings seen in real student notes for this skill; correct them when they show up. */
  mixups?: string[];
}

export const GENERAL_PLAYBOOK: Record<Section, PlaybookEntry> = {
  rw: {
    route: [
      "Every answer is in the passage; outside knowledge that goes beyond the text is a trap.",
      "Each wrong choice is built from one of three errors: not supported by the passage, the opposite of the passage, or true but unrelated to the question.",
      "Justify the right answer by pointing to the exact words that prove it, not only by eliminating the others.",
      "About 71 seconds per question; difficulty restarts at each new question type, so never abandon a whole group.",
    ],
    traps: [
      "Half right is all wrong: one unsupported clause sinks a choice.",
      "Extreme words (all, always, never, only, solely, none, every) usually go beyond what the passage supports.",
    ],
    lists: ["Extreme words: all, alone, always, every, never, none, no one, only, solely, too, will, not."],
  },
  math: {
    route: [
      "Read the final question first and circle what it asks for (the value, the other variable, \\(3x\\), the total).",
      "Desmos is allowed on every question: graph each side of an equation and read the intersection, run regressions from tables, check choices.",
      "Spotting structure is often the intended fast path: vertex form gives the extreme value, factored form gives the zeros, \\(a^0 = 1\\) isolates the constant, a square is never negative.",
      "Backsolve from a middle choice when the choices are numbers; plug in small allowed numbers when the choices have variables.",
      "Figures on the digital SAT are drawn to scale unless the question says otherwise, so estimating from a figure is a valid check.",
      "About 95 seconds per question; flag anything over about 2 minutes and come back. A blank scores zero.",
    ],
    traps: [
      "Wrong choices are coded errors: the other variable, the x-value instead of the y-value, a squared or doubled value, a difference instead of a ratio, a residual, a neighboring gridline, a sub-expression.",
      "An answer that is impossible in context (a negative length, a fraction of a person) is a distractor.",
    ],
    lists: [
      "Grid-in: up to 5 characters, 6 if negative; fractions or decimals; a long decimal fills every space (.6667, never .67); no mixed numbers (7/2, not 3 1/2); no %, $ or commas; if several answers work, enter one.",
    ],
    mixups: [
      "Old paper-SAT advice does not apply: there is no no-calculator section, there are four choices, grid-in answers can be negative, and complex numbers and logarithms are not tested.",
    ],
  },
};

export const SKILL_PLAYBOOK: Partial<Record<Skill, PlaybookEntry>> = {
  // ---------------------------------------------------------------- Information and Ideas
  "Central Ideas and Details": {
    route: [
      "Say in five words what the whole passage is about before reading the choices.",
      "For every choice ask \"where does it say this?\"; if you cannot point to the words, eliminate it.",
      "The main idea covers the whole text, including its example or detail, not one sentence of it.",
    ],
    traps: [
      "A claim that sounds like a reasonable review but is never made (widely acclaimed, innovative).",
      "A claim the passage contradicts.",
      "An invented difficulty, emotion or motive.",
    ],
  },
  "Command of Evidence": {
    route: [
      "Break the claim into its exact parts and underline the key words (varied widely, increased after, both, greatest).",
      "\"If true\" findings may be hypothetical: judge only whether it would support or weaken the claim, not whether it happened.",
      "For a quotation, check that it shows every part of the claim; for data, check that it is accurate to the graphic AND matches every word of the claim.",
      "Graph questions in Reading and Writing never need calculation: locate and compare.",
    ],
    traps: [
      "Half-match: a quotation or data point that shows only one part of a two-part claim.",
      "A measurable difference that has no link to the claim's specific point.",
      "True data about the wrong group, variable or year; two equal values when the claim says they varied.",
      "A finding that contradicts the claim when the question asks for support (or the reverse for weaken).",
    ],
  },
  Inferences: {
    route: [
      "Treat the passage as an argument: list the premises, then pick the conclusion that uses all of them.",
      "Stay inside the passage's subject; the right answer is the strong, reasonable conclusion, not a bold extension.",
    ],
    traps: [
      "Overgeneralizing beyond the passage (many or most traits when the passage studied one).",
      "Reversing what is known and what is still unknown, or reversing cause and effect.",
      "A conclusion that uses only one of the premises or invents a new one.",
    ],
  },
  // ---------------------------------------------------------------- Craft and Structure
  "Words in Context": {
    route: [
      "Find the clue phrase that signals the word, predict your own word, then match it to a choice.",
      "Clues come as a definition, a synonym nearby, an antonym nearby (take the opposite), an explanation after a colon, or an example after \"like\".",
      "Plug the choice back into the sentence and check it says exactly what the clue requires.",
    ],
    traps: [
      "The opposite of the clue.",
      "A word that fits the topic but is not signaled by the clue.",
      "A secondary meaning that adds an idea the text does not support (standard vs characteristic).",
    ],
    lists: ["Tested words are common academic words such as convey, credit (believe), favor (prefer), document (record), qualify (limit); rare words are not tested."],
  },
  "Text Structure and Purpose": {
    route: [
      "Name what the author DOES (argues, illustrates, sets up, qualifies, challenges) before reading the choices.",
      "For an underlined sentence, check how it relates to the sentence before AND the sentences after.",
    ],
    traps: [
      "Overstatement: critiques, rejects or proves when the text only reports or questions.",
      "Inventing a claim or a motive the text never states.",
      "The right action aimed at the wrong target (introduces the setting when what follows describes a character).",
    ],
    lists: [
      "Function verbs: establish (make firm), elaborate (add detail to what was said), present (offer evidence), set up (give background), illustrate (give an example or analogy), qualify (limit a claim), lay out (arrange the parts).",
      "Overall purposes: entertain, inform or explore, persuade or promote, refute or disagree.",
    ],
  },
  "Cross-Text Connections": {
    route: [
      "Summarize Text 1's claim in one line, then decide what Text 2 does to it: supports, refutes, qualifies, or extends.",
      "Look for stance markers in Text 2 (contrary to expectations, however, only under).",
    ],
    traps: [
      "Understating the conflict (largely correct, needs minor refinement) when Text 2 undermines Text 1.",
      "Reversing the relationship, or ignoring what the Text 2 author believed before the evidence.",
    ],
  },
  // ---------------------------------------------------------------- Expression of Ideas
  "Rhetorical Synthesis": {
    route: [
      "Read the goal first and ignore the notes; the right choice performs the goal's exact verb (emphasize a similarity, introduce to an unfamiliar audience, present a result).",
      "All four choices are grammatical, so grammar never decides these.",
      "A similarity or difference goal needs both items named and the right relationship word (both, like, while, unlike).",
    ],
    traps: [
      "Every wrong choice is a true fact from the notes aimed at the wrong goal.",
      "A choice that names both items but uses contrast language for a similarity goal (or the reverse).",
      "A general statement that leaves out the specific items the goal names.",
    ],
  },
  Transitions: {
    route: [
      "Cover the choices and label the relationship between the two sentences: same direction, contrast, cause and effect, example, emphasis, concession, restatement, or sequence.",
      "Check the direction of cause and effect: therefore, thus and as a result point forward to a result; because and since point back to a reason.",
      "If two choices mean the same thing (however and nevertheless), neither is the answer.",
      "The hardest ones are subtle: does the second sentence restate (that is, in other words), narrow (specifically, in some instances), concede (admittedly), or escalate (what's more, beyond that)?",
    ],
    traps: [
      "A word from the right family with the wrong strength (in fact when the text only adds; therefore when the second sentence is the reason).",
      "Clue words like \"even\" and \"superficially\" signal concession, not addition.",
    ],
    lists: [
      "Contrast: however, but, yet, on the other hand, conversely, instead (the first thing did not happen), whereas, by contrast.",
      "Concession: nonetheless, nevertheless, still (= even so), even so, admittedly, though, regardless.",
      "Same direction: moreover, furthermore, also, in addition, what's more, beyond that, similarly, likewise, by comparison.",
      "Cause and effect: therefore, thus, hence, consequently, as a result, accordingly.",
      "Example: for example, for instance, to illustrate, specifically, namely, in some instances.",
      "Emphasis or restatement: indeed (confirms and strengthens), in fact (intensifies or corrects an expectation), in other words, that is.",
      "Sequence: then, later, subsequently, finally, meanwhile, previously.",
    ],
    mixups: [
      "\"Still\" as a transition means \"even so\" (concession), not \"continuing\".",
      "\"Overall\" is a summary word, not an example word; \"perhaps\", \"if\" and \"until\" are not transitions.",
      "Yet and but are both plain contrast on the test.",
    ],
  },
  // ---------------------------------------------------------------- Standard English Conventions
  Boundaries: {
    route: [
      "Cover the punctuation and read each side of the blank: is each side a complete sentence?",
      "Two complete sentences join only with a period, a semicolon, a comma plus FANBOYS, a colon (when the second explains the first) or a dash.",
      "If the choices are the same word with a comma, colon, semicolon or nothing, the version with no punctuation is right more often than expected.",
      "Equal joins cancel out: if a period, a semicolon and a comma plus and would all be correct, the question is testing something else.",
    ],
    traps: [
      "A comma alone between two sentences (comma splice) or nothing at all (run-on).",
      "A comma or colon between a long subject and its verb.",
      "A colon or semicolon where only a comma belongs (before an -ing phrase, after an opening phrase).",
      "One comma where the extra information needs a matched pair (or a comma paired with a dash).",
    ],
    lists: [
      "Never punctuate: between subject and verb, between a verb and its object, between a preposition and its object, before or after \"that\", before \"to\" + verb, right after such as or including, around a name that tells you which one (her novel Gingerbread).",
      "Transition words (however, therefore, indeed, instead, nonetheless) need \"; ___,\" or \". ___,\" between sentences.",
    ],
    mixups: [
      "\"Despite\", \"due to\" and \"regardless of\" take a noun with no comma; \"although\", \"because\", \"since\", \"until\", \"if\" and \"even though\" join a clause with no semicolon before them and no comma after them. Writing \"; despite,\" or \"; because,\" is always wrong.",
      "A colon needs a complete sentence BEFORE it; what follows can be a list, a phrase or a sentence.",
      "A period and a semicolon are interchangeable between two sentences; the test never asks whether the topics are related enough.",
      "Two extra phrases after one noun each need their own commas (mycology, the study of fungi, ...).",
    ],
  },
  "Form, Structure, and Sense": {
    route: [
      "Find the real subject: cross out prepositional phrases and clauses between it and the verb, then ask \"what are we talking about?\"",
      "For an opening phrase ending in a comma, ask \"who or what is doing this?\" and pick the choice that starts with that noun.",
      "Check the time frame of the surrounding sentences before choosing a tense.",
      "A sentence needs a conjugated main verb; after would, could or can use the base form.",
    ],
    traps: [
      "A plural noun right before the verb that is not the subject.",
      "A possessive right after the opening phrase (Javi's skates) still leaves the modifier dangling.",
      "it's vs its, they're vs their, and an apostrophe on a plain plural.",
    ],
    lists: [
      "Always singular: each, every, either, neither, everyone, anyone, a gerund subject, collective nouns. Always plural: both, few, many, several. All, none, some, most, any: follow their noun.",
      "Tense triggers: \"since\" or \"for\" + a span takes has/have; \"by the time\" + past takes had.",
    ],
    mixups: [
      "Singular \"they\" is accepted on the test; \"his or her\" is not required.",
      "\"Done\", \"begun\" and \"drunk\" need has, have or had; the simple past stands alone (did, began, drank).",
    ],
  },
  // ---------------------------------------------------------------- Math: Algebra
  "Linear equations in one variable": {
    route: [
      r`Distribute, combine, then undo \(+\) and \(-\) before \(\times\) and \(\div\); or graph both sides in Desmos.`,
      r`For "no solution" or "infinitely many", compare the \(x\) coefficients and the constants instead of solving.`,
      r`If the question asks for an expression (\(3x + 1\)), look for a way to get it directly from the equation.`,
    ],
    traps: [r`Solving for \(x\) when the question asks for a related quantity; distributing a negative to only the first term.`],
  },
  "Linear functions": {
    route: [
      r`Slope is the per-unit amount and the y-intercept is the starting amount; attach units to read them in context.`,
      r`From a table, constant differences mean linear; find the slope from any two rows (change in output over change in input).`,
      r`\(4f(2)\) means four times the output \(f(2)\); \(f(2x)\) changes the input.`,
    ],
    traps: [r`Putting the 4 on the input in \(4f(2)\); reading the rate between rows when \(x\) jumps by more than 1.`],
  },
  "Linear equations in two variables": {
    route: [
      r`A coefficient on a count variable is the per-item amount: in \(3x + 6y = 63\), 6 is the amount for each \(y\).`,
      r`Set \(x = 0\) for the y-intercept and \(y = 0\) for the x-intercept; in \(Ax + By = C\) the slope is \(-\frac{A}{B}\).`,
      r`Parallel lines share a slope; perpendicular slopes multiply to \(-1\).`,
    ],
    traps: [r`Swapping which quantity a coefficient belongs to, or reading the slope of \(Ax + By = C\) as \(A\).`],
  },
  "Systems of two linear equations in two variables": {
    route: [
      r`Graph both lines in Desmos and click the intersection, or eliminate by adding the equations.`,
      r`If the question asks for \(x + y\) or another combination, add or subtract the equations to get it directly.`,
      r`No solution: same slope, different intercept. Infinitely many: one equation is a multiple of the other.`,
    ],
    traps: [r`Solving correctly for one variable and choosing it when the question asked for the other.`],
  },
  "Linear inequalities in one or two variables": {
    route: [
      r`Test each answer point by substituting it into the inequality.`,
      r`Flip the sign only when multiplying or dividing by a negative.`,
      r`Translate limits: at least \(\ge\), at most and no more than \(\le\), more than \(>\), fewer than \(<\).`,
    ],
    traps: [r`Reversing "at least" and "at most", or forgetting to flip after dividing by a negative.`],
  },
  // ---------------------------------------------------------------- Math: Advanced Math
  "Equivalent expressions": {
    route: [
      r`Factor in layers: common factor first, then difference of squares or a perfect square, then the trinomial.`,
      r`To check two forms are equivalent, plug in a number like \(x = 2\) into both, or graph both in Desmos and see if they overlap.`,
      r`Subtracting a whole numerator changes every sign in it.`,
    ],
    traps: [r`Cancelling terms across a plus sign; dropping the negative on the second part of a subtracted numerator.`],
    lists: [r`\((a \pm b)^2 = a^2 \pm 2ab + b^2\); \(a^2 - b^2 = (a + b)(a - b)\); \(x^{m/n} = \sqrt[n]{x^m}\); multiply means add exponents, divide means subtract, power means multiply.`],
  },
  "Nonlinear equations in one variable and systems of equations in two variables": {
    route: [
      r`Graph each side or each equation in Desmos and read the intersections.`,
      r`"Exactly one intersection" of a line and a parabola means the discriminant of the combined equation is 0.`,
      r`A square equal to a negative number has no real solution, with no work needed.`,
      r`Never divide by the variable: move everything to one side and factor.`,
    ],
    traps: [r`Losing the \(x = 0\) or negative root; keeping a solution that makes a denominator zero or a radical negative.`],
    lists: [r`Discriminant \(b^2 - 4ac\): positive two, zero one, negative none. Sum of roots \(-\frac{b}{a}\), product \(\frac{c}{a}\).`],
  },
  "Nonlinear functions": {
    route: [
      r`Pick the form that shows the feature: vertex form for the max or min, factored form for the zeros, standard form for the y-intercept.`,
      r`For an exponential through a point with \(x = 0\), use that point first: \(a^0 = 1\) gives the constant immediately.`,
      r`"Decreases by 80%" means multiply by 0.2, what remains, not 0.8.`,
    ],
    traps: [
      r`Giving the x-value where the minimum happens instead of the minimum value.`,
      r`Using the percent itself as the growth factor instead of \(1 \pm r\).`,
    ],
    lists: [r`Vertex x-value \(-\frac{b}{2a}\) or the midpoint of the zeros; \(a > 0\) opens up; \(f(x - h)\) moves right, \(f(x) + k\) moves up.`],
  },
  // ---------------------------------------------------------------- Math: Problem-Solving and Data Analysis
  "Ratios, rates, proportional relationships, and units": {
    route: [
      r`Let the units choose the operation: kg divided by kg per m³ gives m³.`,
      r`Line up a proportion with matching units in the same positions, then cross-multiply.`,
      r`Average speed is total distance over total time; rates of workers add.`,
    ],
    traps: [r`Averaging two speeds; mixing units (minutes with hours) inside one equation.`],
  },
  Percentages: {
    route: [
      r`Turn every percent change into a multiplier: up 5% is \(\times 1.05\), down 80% is \(\times 0.2\).`,
      r`"30% of the 40%" means multiply: \(0.3 \times 0.4 = 0.12\).`,
      r`For chained changes or unknown originals, start from 100.`,
    ],
    traps: [r`Subtracting or adding percents that should be multiplied; dividing by the new value instead of the original.`],
  },
  "One-variable data: Distributions and measures of center and spread": {
    route: [
      r`Total = mean \(\times\) count; use it whenever a value is added, removed or missing.`,
      r`An outlier moves the mean and the standard deviation, barely the median and the IQR.`,
      r`A box plot gives the median and quartiles, never the mean.`,
    ],
    traps: [r`Averaging two averages; reading the middle line of a box plot as the mean.`],
  },
  "Two-variable data: Models and scatterplots": {
    route: [
      r`Read predictions from the line of best fit, not the nearest dot.`,
      r`Residual = actual \(-\) predicted; positive means the point is above the line.`,
      r`Run a regression in Desmos from the data table when the line is not given.`,
    ],
    traps: [r`Giving the residual instead of the prediction; misreading a neighboring gridline.`],
  },
  "Probability and conditional probability": {
    route: [
      r`"Given" names the row or column you restrict to: that total is the denominator.`,
      r`At least one = \(1 - P(\text{none})\); independent "and" multiplies.`,
    ],
    traps: [r`Using the grand total as the denominator for a conditional probability; adding for "and".`],
  },
  "Inference from sample statistics and margin of error": {
    route: [
      r`Plausible population values lie between estimate \(-\) margin and estimate \(+\) margin.`,
      r`A larger sample generally gives a smaller margin of error.`,
    ],
    traps: [r`Treating the estimate as exact; claiming a difference when the two intervals overlap.`],
  },
  "Evaluating statistical claims: Observational studies and experiments": {
    route: [
      r`Random assignment supports cause and effect; random sampling lets results extend to the population that was sampled, and only that one.`,
    ],
    traps: [r`Claiming causation from an observational study, or extending results to a wider population than the one sampled.`],
  },
  // ---------------------------------------------------------------- Math: Geometry and Trigonometry
  "Area and volume": {
    route: [
      r`Scale factor \(k\): lengths \(\times k\), areas \(\times k^2\), volumes \(\times k^3\).`,
      r`Shaded region = outer shape \(-\) inner shape; split odd shapes into rectangles and triangles.`,
    ],
    traps: [r`Scaling area or volume by \(k\) instead of \(k^2\) or \(k^3\).`],
  },
  "Lines, angles, and triangles": {
    route: [
      r`Similar figures scale by multiplying: set up a ratio of matching sides.`,
      r`Parallel lines cut by a transversal make only two angle sizes, which add to \(180^\circ\).`,
      r`Figures are drawn to scale unless stated otherwise: estimate to check.`,
    ],
    traps: [r`Using a difference of sides instead of a ratio for similar triangles.`],
  },
  "Right triangles and trigonometry": {
    route: [
      r`Look for triples (3-4-5, 5-12-13, 8-15-17) and special triangles before using the Pythagorean theorem.`,
      r`Trig ratios depend only on the angle, so similar triangles share them; \(\sin \theta = \cos(90^\circ - \theta)\).`,
    ],
    traps: [r`Giving \(b^2\) instead of \(b\); forgetting to square the coefficient of a radical: \((5\sqrt{17})^2 = 425\).`],
  },
  Circles: {
    route: [
      r`Arc and sector are the same fraction of the circle as the central angle is of 360.`,
      r`Complete the square on \(x\) and on \(y\) to read the center and radius.`,
      r`A tangent is perpendicular to the radius at the touching point.`,
    ],
    traps: [r`Giving the arc length itself or a doubled or squared value instead of the circumference.`],
  },
};

/** The playbook text for a skill (plus the section's general entry), formatted for a prompt. */
export function playbookForPrompt(section: Section, skill: Skill | null): string {
  const lines: string[] = [];
  const add = (title: string, e: PlaybookEntry) => {
    lines.push(`${title}:`);
    for (const x of e.route) lines.push(`- Route: ${x}`);
    for (const x of e.traps) lines.push(`- Trap: ${x}`);
    for (const x of e.lists ?? []) lines.push(`- List: ${x}`);
    for (const x of e.mixups ?? []) lines.push(`- Common mix-up to correct: ${x}`);
  };
  const entry = skill ? SKILL_PLAYBOOK[skill] : undefined;
  if (entry && skill) add(`Playbook for ${skill}`, entry);
  add(section === "math" ? "Playbook for all Math questions" : "Playbook for all Reading and Writing questions", GENERAL_PLAYBOOK[section]);
  return lines.join("\n");
}
