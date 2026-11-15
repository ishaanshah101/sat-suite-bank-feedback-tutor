// SAT rules added after an audit of the library against College Board's published skill descriptions
// (Assessment Framework, test specifications, Skills Insight) and the official practice tests.
import type { Rule } from "./rules";

const r = String.raw;

const SEC = "Standard English Conventions" as const;
const EOI = "Expression of Ideas" as const;
const CAS = "Craft and Structure" as const;
const INI = "Information and Ideas" as const;
const ALG = "Algebra" as const;
const ADV = "Advanced Math" as const;
const PSD = "Problem-Solving and Data Analysis" as const;
const GEO = "Geometry and Trigonometry" as const;

/** New SAT rules that fill gaps (ids continue each skill's numbering). */
export const SAT_GAP_RULES: Rule[] = [
  // ---------------------------------------------------------------- Reading and Writing: Information and Ideas
  {
    id: "CID-03",
    section: "rw",
    domain: INI,
    skill: "Central Ideas and Details",
    name: "Paraphrase literary and older texts",
    statement:
      "For a poem, a novel or play excerpt, or older prose, rewrite each sentence in plain modern words first, then pick the choice that matches what the text shows a character or speaker thinking, feeling, or doing.",
    spot_it: "The passage comes from fiction, drama, or poetry (often with an italic introduction naming the work and the characters) or uses formal, old-fashioned wording.",
    test: "Read the italic introduction for who is who, paraphrase line by line, and demand a phrase in the text for every emotion or motive a choice names.",
    trap: "A choice that names a strong emotion or a backstory the excerpt never shows, or one that reads figurative language literally.",
    example: {
      wrong: "Excerpt: the narrator 'could not keep her eyes from the door all evening' while her brother was away. Pick: 'The narrator is angry that her brother is late.'",
      right: "Excerpt: the narrator 'could not keep her eyes from the door all evening' while her brother was away. Pick: 'The narrator is eagerly awaiting her brother's return.'",
    },
  },
  {
    id: "INF-02",
    section: "rw",
    domain: INI,
    skill: "Inferences",
    name: "Follow the contrast to the gap",
    statement:
      "When a text states an earlier assumption and then reports a finding that conflicts with it, the completion states what the finding means for that assumption (it is wrong, incomplete, or true only in some cases) and claims no more than the finding shows.",
    spot_it: "A text that says researchers long believed X, then 'however' or 'but' a study found Y, and ends with a blank.",
    test: "Name the old belief and the new finding in a few words each, then ask what Y implies about X; the right choice links the two and stays within the cases studied.",
    trap: "A choice that only repeats the new finding, or one that declares the old belief fully overturned when the evidence covers one site or species.",
    example: {
      wrong: "Belief: the beetle feeds only at night. Finding: tagged beetles fed at noon in shaded forests. Pick: 'the beetle prefers to feed in daylight.'",
      right: "Belief: the beetle feeds only at night. Finding: tagged beetles fed at noon in shaded forests. Pick: 'the beetle's feeding is not limited to nighttime, at least in shaded habitats.'",
    },
  },
  {
    id: "INF-03",
    section: "rw",
    domain: INI,
    skill: "Inferences",
    name: "Predicted outcome did not happen",
    statement:
      "If a text says a hypothesis predicts an outcome and then reports that the outcome did not occur, the logical completion is that the hypothesis is weakened or that something else is at work, not that the opposite claim is proven.",
    spot_it: "A text built as 'if A were true, we would expect B' followed by 'but B was not observed' and a blank.",
    test: "Write the if-then link, check whether the expected result appeared, and pick the choice that draws only the conclusion that link allows.",
    trap: "A choice that jumps from 'A is unlikely' to a specific alternative cause the text never names.",
    example: {
      wrong: "If the lake's warming caused the fish decline, cooler lakes would show no decline; cooler lakes declined too. Pick: 'pollution caused the decline.'",
      right: "If the lake's warming caused the fish decline, cooler lakes would show no decline; cooler lakes declined too. Pick: 'warming alone cannot explain the decline.'",
    },
  },
  {
    id: "COE-03",
    section: "rw",
    domain: INI,
    skill: "Command of Evidence",
    name: "Support or weaken a hypothesis",
    statement:
      "A finding supports a hypothesis when it shows what the hypothesis predicts, and weakens it when it shows the proposed cause without the effect or the effect without the cause.",
    spot_it: "'Which finding, if true, would most directly support (or weaken) the researcher's hypothesis?'",
    test: "Rewrite the hypothesis as 'A causes B'; a supporter shows A with B (or no A and no B), a weakener shows A without B or B without A; then check the question asks for that direction.",
    trap: "A finding on the same topic that leaves the cause-and-effect link untouched, or a strong finding in the opposite direction from the one asked.",
    example: {
      wrong: "Hypothesis: the shrub's bitter leaves keep deer away. Asked to weaken. Pick: 'Deer avoided the shrub in some regions.'",
      right: "Hypothesis: the shrub's bitter leaves keep deer away. Asked to weaken. Pick: 'Deer ate the shrub's bitter leaves as often as they ate nonbitter plants.'",
    },
  },
  {
    id: "COE-04",
    section: "rw",
    domain: INI,
    skill: "Command of Evidence",
    name: "Data must cover every part",
    statement:
      "When the claim has more than one part (one group rose while another fell, both sites, the highest in every year), the right data choice shows every part, and an accurate choice that shows only one part is wrong.",
    spot_it: "A table or graph question whose claim names two groups, a comparison, a trend over time, or a superlative.",
    test: "Underline each part of the claim, then check each choice twice: once against the graphic for accuracy and once against every underlined part.",
    trap: "A true statement about one of the two groups, or a single year when the claim is about a change over time.",
    example: {
      wrong: "Claim: species A grew while species B declined from 2010 to 2020. Pick: 'Species A grew from 200 to 450.'",
      right: "Claim: species A grew while species B declined from 2010 to 2020. Pick: 'Species A grew from 200 to 450, while species B fell from 600 to 310.'",
    },
  },

  // ---------------------------------------------------------------- Reading and Writing: Craft and Structure
  {
    id: "WIC-03",
    section: "rw",
    domain: CAS,
    skill: "Words in Context",
    name: "Match charge and strength",
    statement:
      "When several choices share a basic meaning, the most precise word is the one whose connotation (positive, negative, neutral) and strength (mild or extreme) match what the sentence signals.",
    spot_it: "Two or more choices are near synonyms, such as questioned, criticized, and condemned, or notable and unprecedented.",
    test: "Rate the clue in two words (for example, 'mildly doubtful'), then reject any choice that is warmer, colder, or stronger than that rating.",
    trap: "An extreme word (devastating, revolutionary, overturn) where the text signals a modest change or a mild attitude.",
    example: {
      wrong: "'The new measurements led the team to slightly ___ its earlier estimate.' Pick: 'overturn'.",
      right: "'The new measurements led the team to slightly ___ its earlier estimate.' Pick: 'revise'.",
    },
  },
  {
    id: "TSP-03",
    section: "rw",
    domain: CAS,
    skill: "Text Structure and Purpose",
    name: "Map the structure in order",
    statement:
      "For an overall structure question, label each part of the text in order with one verb (describes, presents, challenges, explains), and the right choice names those moves in the same order.",
    spot_it: "'Which choice best describes the overall structure of the text?' with two-part choices such as 'It X and then Y.'",
    test: "Split the text where its direction changes (however, yet, but recently), name each part, and check both the verbs and their order.",
    trap: "A choice with the right moves in the wrong order, or one that adds a move the text never makes (proposes a solution, refutes a critic).",
    example: {
      wrong: "A text describes a common view of octopus learning, then reports a study that complicates it. Pick: 'It presents a study and then explains the view the study confirms.'",
      right: "A text describes a common view of octopus learning, then reports a study that complicates it. Pick: 'It describes a common view and then presents a finding that complicates that view.'",
    },
  },
  {
    id: "CTC-02",
    section: "rw",
    domain: CAS,
    skill: "Cross-Text Connections",
    name: "Respond from Text 2's evidence",
    statement:
      "For 'how would the author of Text 2 most likely respond to Text 1', find the one claim in Text 1 that Text 2 addresses and answer with what Text 2's own evidence says about that claim, at the same strength.",
    spot_it: "A question naming one author's reaction to the other: 'most likely respond', 'would most likely view', 'based on the texts'.",
    test: "Write Text 1's claim and Text 2's stance on it (agrees, rejects, calls it incomplete, limits it to some cases), then confirm which author the question asks you to speak for.",
    trap: "Answering as the wrong author, or a choice that rejects Text 1 completely when Text 2 only qualifies it.",
    example: {
      wrong: "Text 1: the dye alone explains the paintings' color. Text 2: the dye matters, but the binder also changed the color. Pick: 'Text 2's author would argue the dye played no role.'",
      right: "Text 1: the dye alone explains the paintings' color. Text 2: the dye matters, but the binder also changed the color. Pick: 'Text 2's author would say Text 1 overlooks the binder's contribution.'",
    },
  },

  // ---------------------------------------------------------------- Reading and Writing: Expression of Ideas
  {
    id: "RHS-03",
    section: "rw",
    domain: EOI,
    skill: "Rhetorical Synthesis",
    name: "Similarity and difference goals",
    statement:
      "If the goal is to emphasize a similarity or a difference, the right choice names both items and links them with the matching relationship word (both, like, also, similarly for a similarity; while, unlike, whereas, but for a difference).",
    spot_it: "The goal says 'emphasize a similarity', 'emphasize a difference', 'contrast', or 'compare' two studies, species, works, or people.",
    test: "Check that the choice mentions both items and that its relationship word fits the goal; a choice about one item alone fails.",
    trap: "A choice that lists accurate facts about both items without stating how they relate, or uses a contrast word for a similarity goal.",
    example: {
      wrong: "Goal: emphasize a similarity between two bridges. Pick: 'The Akashi Kaikyo Bridge is in Japan, and the Golden Gate Bridge opened in 1937.'",
      right: "Goal: emphasize a similarity between two bridges. Pick: 'Like the Golden Gate Bridge, the Akashi Kaikyo Bridge is a suspension bridge.'",
    },
  },
  {
    id: "RHS-04",
    section: "rw",
    domain: EOI,
    skill: "Rhetorical Synthesis",
    name: "Meet every part of the goal",
    statement:
      "When the goal has more than one part (present the study's aim and its finding, introduce the author and the novel), the right choice does every part, and a choice that does only one part is wrong.",
    spot_it: "A goal joined by 'and', or one with a qualifier such as 'and its significance' or 'to an audience unfamiliar with'.",
    test: "Split the goal at 'and' and at any audience phrase, then tick each part off in every choice.",
    trap: "A choice that meets the first part of the goal thoroughly and ignores the second.",
    example: {
      wrong: "Goal: present the study's aim and its finding. Pick: 'A 2021 study examined whether crows remember individual human faces.'",
      right: "Goal: present the study's aim and its finding. Pick: 'A 2021 study examined whether crows remember individual human faces and found that they do for years.'",
    },
  },

  // ---------------------------------------------------------------- Reading and Writing: Standard English Conventions
  {
    id: "BND-14",
    section: "rw",
    domain: SEC,
    skill: "Boundaries",
    name: "Punctuating quotations and titles",
    statement:
      "A comma comes before a quotation introduced by a speaking verb (said, wrote, asked), but no punctuation comes before a quotation or title woven into the sentence after 'that', 'as', 'called', or a verb whose object it is.",
    spot_it: "A quotation or a title in quotation marks follows the blank, with choices that add or remove a comma or colon before the opening mark.",
    test: "Remove the quotation marks and read the sentence: if it flows as one sentence (she wrote that the method works), use no punctuation; if a verb introduces a full quoted sentence, use a comma; a colon needs a complete sentence before it.",
    trap: "A comma after 'that', or a colon after a verb, in front of a quotation that is part of the sentence's grammar.",
    example: {
      wrong: "The critic wrote that, \"the novel rewards patience.\"",
      right: "The critic wrote that \"the novel rewards patience.\"",
    },
  },
  {
    id: "BND-15",
    section: "rw",
    domain: SEC,
    skill: "Boundaries",
    name: "Commas only between list items",
    statement:
      "In a list of three or more items, commas go between the items (including before the final 'and' in SAT style), never before the first item and never after the last one.",
    spot_it: "A series of nouns, adjectives, or phrases, with choices that move a comma in front of the first item or behind the last.",
    test: "Bracket where the list starts and ends; any comma outside the brackets is wrong unless another rule (an introductory phrase, a nonessential pair) demands it.",
    trap: "A comma right after a verb, 'such as', or 'including' before the first item, or after the last item before the sentence's verb.",
    example: {
      wrong: "Temperature, rainfall, and wind speed, were recorded every hour.",
      right: "Temperature, rainfall, and wind speed were recorded every hour.",
    },
  },
  {
    id: "FSS-12",
    section: "rw",
    domain: SEC,
    skill: "Form, Structure, and Sense",
    name: "Inverted sentences hide the subject",
    statement:
      "When a sentence opens with 'there', 'here', or a place or prepositional phrase, the subject comes after the verb, so find it there and make the verb agree with it.",
    spot_it: "Sentences like 'Among the findings ___ a surprising result' or 'There ___ several reasons', with singular and plural verb choices.",
    test: "Flip the sentence into normal order (a surprising result was among the findings) and check agreement.",
    trap: "Matching the verb to the plural noun in the opening phrase (findings, artifacts) instead of the subject that follows the verb.",
    example: {
      wrong: "Among the artifacts were a carved bone flute.",
      right: "Among the artifacts was a carved bone flute.",
    },
  },
  {
    id: "FSS-13",
    section: "rw",
    domain: SEC,
    skill: "Form, Structure, and Sense",
    name: "Relative clause verbs follow antecedent",
    statement:
      "The verb inside a 'that', 'which', or 'who' clause agrees with the noun that pronoun stands for, usually the noun just before it, not the main subject of the sentence.",
    spot_it: "A blank verb right after 'that', 'which', or 'who' in a long sentence with nouns of different number.",
    test: "Replace the pronoun with its noun ('which' means the fossils) and read that noun with the verb.",
    trap: "Matching the verb to the singular main subject far to the left.",
    example: {
      wrong: "The report describes the fossils, which was found in Montana.",
      right: "The report describes the fossils, which were found in Montana.",
    },
  },

  // ---------------------------------------------------------------- Math: Algebra
  {
    id: "INQ-05",
    section: "math",
    domain: ALG,
    skill: "Linear inequalities in one or two variables",
    name: "Round the way context demands",
    statement: r`When the answer must be a whole number, the greatest allowed value rounds down and the least allowed value rounds up, whatever the decimal.`,
    spot_it: r`"Greatest number of", "maximum number of", "least number of", or "minimum number of" items, people, trips, or hours.`,
    test: r`Solve as a decimal, then step to the nearest whole number inside the solution set: \(x \le 13.8\) gives 13 and \(x \ge 13.2\) gives 14.`,
    trap: r`Ordinary rounding: answering 14 for \(x \le 13.8\).`,
    example: {
      wrong: r`Boxes weigh 12 kg and a lift holds at most 500 kg: \(\frac{500}{12} \approx 41.7\), so 42 boxes`,
      right: r`\(12x \le 500\) gives \(x \le 41.7\), so at most 41 boxes`,
    },
    shortcut: r`Check your answer and the next whole number in the original inequality: \(12 \cdot 41 = 492 \le 500\) but \(12 \cdot 42 = 504 > 500\).`,
  },

  // ---------------------------------------------------------------- Math: Advanced Math
  {
    id: "EQX-06",
    section: "math",
    domain: ADV,
    skill: "Equivalent expressions",
    name: "Common denominator for fractions",
    statement: r`To add or subtract rational expressions, rewrite each over a common denominator, combine the numerators inside parentheses, and only then simplify.`,
    spot_it: r`A sum or difference of fractions with variables, such as \(\frac{3}{x} - \frac{2}{x + 1}\), and choices that are single fractions.`,
    test: r`Multiply each fraction's top and bottom by the factor it lacks: \(\frac{3(x + 1) - 2x}{x(x + 1)} = \frac{x + 3}{x(x + 1)}\).`,
    trap: r`Adding numerators and denominators straight across, or subtracting only the first term of the second numerator.`,
    example: {
      wrong: r`\(\frac{1}{x} + \frac{1}{2} = \frac{2}{x + 2}\)`,
      right: r`\(\frac{1}{x} + \frac{1}{2} = \frac{2 + x}{2x}\)`,
    },
    shortcut: r`Plug \(x = 3\) into the original and into each choice, or graph both in Desmos; the right choice matches everywhere.`,
  },
  {
    id: "EQX-07",
    section: "math",
    domain: ADV,
    skill: "Equivalent expressions",
    name: "Divide to get remainder form",
    statement: r`A rational expression such as \(\frac{x^2 + 5x + 7}{x + 2}\) can be rewritten as a quotient plus \(\frac{\text{remainder}}{\text{divisor}}\), found by long division or by rewriting the numerator around the divisor.`,
    spot_it: r`Choices of the form \(ax + b + \frac{c}{x + k}\), or a question about the remainder after dividing by \(x - k\).`,
    test: r`Multiply back: quotient \(\times\) divisor \(+\) remainder must rebuild the original numerator; the remainder after dividing \(p(x)\) by \(x - k\) is \(p(k)\).`,
    trap: r`Writing the remainder without its denominator, or putting the wrong number over the divisor.`,
    example: {
      wrong: r`\(\frac{x^2 + 5x + 7}{x + 2} = x + 3 + \frac{7}{x + 2}\)`,
      right: r`\(\frac{x^2 + 5x + 7}{x + 2} = x + 3 + \frac{1}{x + 2}\), because \((x + 3)(x + 2) = x^2 + 5x + 6\)`,
    },
    shortcut: r`Graph the original and each choice in Desmos; the equivalent one draws the identical curve.`,
  },
  {
    id: "EQX-08",
    section: "math",
    domain: ADV,
    skill: "Equivalent expressions",
    name: "Solve a formula for one letter",
    statement: r`To solve a formula for one variable, treat every other letter as a number and undo the operations around the target in reverse order, factoring the target out if it appears in two terms.`,
    spot_it: r`"Which equation gives \(r\) in terms of \(V\) and \(h\)?" or "which expression is equivalent to \(m\)?" after a formula.`,
    test: r`Pick easy numbers that make the original formula true and check that the rearranged choice gives the same value for the target.`,
    trap: r`Forgetting the square root when the target was squared, or dividing by only one term of a sum.`,
    example: {
      wrong: r`\(V = \pi r^2 h\), so \(r = \frac{V}{\pi h}\)`,
      right: r`\(V = \pi r^2 h\), so \(r^2 = \frac{V}{\pi h}\) and \(r = \sqrt{\frac{V}{\pi h}}\)`,
    },
  },
  {
    id: "NLE-08",
    section: "math",
    domain: ADV,
    skill: "Nonlinear equations in one variable and systems of equations in two variables",
    name: "Quadratic formula and completing squares",
    statement: r`Any quadratic \(ax^2 + bx + c = 0\) solves with \(x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}\), and completing the square, \(x^2 + bx = \left(x + \frac{b}{2}\right)^2 - \left(\frac{b}{2}\right)^2\), gives the same roots in the form \(h \pm \sqrt{k}\).`,
    spot_it: r`A quadratic that does not factor nicely, or choices written as \(p \pm \sqrt{q}\) or \(\frac{p \pm \sqrt{q}}{r}\).`,
    test: r`Set the equation equal to 0, read \(a\), \(b\), and \(c\) with their signs, and simplify \(\sqrt{b^2 - 4ac}\) before dividing every term by \(2a\).`,
    trap: r`Dividing only \(-b\) by \(2a\) and not the square root, or losing the sign of \(b\) or \(c\).`,
    example: {
      wrong: r`\(x^2 - 4x - 1 = 0\) gives \(x = 4 \pm \frac{\sqrt{20}}{2}\)`,
      right: r`\(x^2 - 4x - 1 = 0\) gives \(x = \frac{4 \pm \sqrt{20}}{2} = 2 \pm \sqrt{5}\)`,
    },
    shortcut: r`Graph \(y = x^2 - 4x - 1\) in Desmos, click the x-intercepts, and compare the decimals with the choices (\(2 + \sqrt{5} \approx 4.236\)).`,
  },
  {
    id: "NLF-06",
    section: "math",
    domain: ADV,
    skill: "Nonlinear functions",
    name: "The exponent sets the period",
    statement: r`In \(f(t) = a \cdot b^{t/k}\) the quantity is multiplied by \(b\) every \(k\) units of time, and in \(a \cdot b^{nt}\) it is multiplied by \(b\) every \(\frac{1}{n}\) of a unit, so doubling every 5 years is \(a \cdot 2^{t/5}\) and halving every 8 hours is \(a\left(\frac{1}{2}\right)^{t/8}\).`,
    spot_it: r`An exponential model whose exponent is \(\frac{t}{k}\) or \(nt\), a half-life or doubling time, or a change of time units (years to months).`,
    test: r`Find the \(t\) that makes the exponent equal 1; the base \(b\) is the factor of change over that much time.`,
    trap: r`Reading \(500(1.04)^{4t}\), with \(t\) in years, as 4% growth per year.`,
    example: {
      wrong: r`\(f(t) = 500(1.04)^{4t}\), with \(t\) in years, grows 4% per year`,
      right: r`\(f(t) = 500(1.04)^{4t}\) grows 4% every quarter year, since \(t = \frac{1}{4}\) makes the exponent 1`,
    },
    shortcut: r`In Desmos, compute \(f(t + k) \div f(t)\) for any \(t\); the result is the growth factor over a period of \(k\).`,
  },
  {
    id: "NLF-07",
    section: "math",
    domain: ADV,
    skill: "Nonlinear functions",
    name: "Zeros cross or touch",
    statement: r`Each factor \((x - c)\) of a polynomial gives a zero at \(x = c\); a factor raised to an odd power crosses the x-axis there, and one raised to an even power touches the axis and turns back.`,
    spot_it: r`Matching a polynomial's equation to its graph, or "which could be the equation" of a graph with marked x-intercepts.`,
    test: r`List the x-intercepts, write a factor for each (an intercept at \(-3\) means \(x + 3\)), check crossing versus touching, then check the y-intercept with \(x = 0\).`,
    trap: r`Flipping the sign: an intercept at \(x = 2\) comes from \((x - 2)\), not \((x + 2)\).`,
    example: {
      wrong: r`A graph that crosses at \(x = -1\) and touches at \(x = 3\) is \(y = (x - 1)(x + 3)^2\)`,
      right: r`A graph that crosses at \(x = -1\) and touches at \(x = 3\) is \(y = (x + 1)(x - 3)^2\)`,
    },
    shortcut: r`Graph each choice in Desmos and compare intercepts and shape with the given graph.`,
  },

  // ---------------------------------------------------------------- Math: Problem-Solving and Data Analysis
  {
    id: "RAT-04",
    section: "math",
    domain: PSD,
    skill: "Ratios, rates, proportional relationships, and units",
    name: "Density is amount per space",
    statement: r`Density is an amount divided by the space it fills, \(\text{density} = \frac{\text{mass}}{\text{volume}}\) or \(\frac{\text{people}}{\text{area}}\), so mass \(=\) density \(\times\) volume.`,
    spot_it: r`The word density or population density, or units like grams per cubic centimeter or people per square mile.`,
    test: r`Write the formula with units, compute the volume or area of any shape first, and let the units cancel to the one asked.`,
    trap: r`Using a side length instead of the volume, or converting cubic units once instead of three times (\(1 \text{ m}^3 = 100^3 \text{ cm}^3\)).`,
    example: {
      wrong: r`A cube with side 3 cm and density \(2 \text{ g/cm}^3\) has mass \(2 \times 3 = 6\) g`,
      right: r`A cube with side 3 cm and density \(2 \text{ g/cm}^3\) has mass \(2 \times 3^3 = 54\) g`,
    },
  },
  {
    id: "PCT-04",
    section: "math",
    domain: PSD,
    skill: "Percentages",
    name: "Translate percent sentences",
    statement: r`Read "is" as \(=\), "of" as \(\times\), "percent" as \(\div 100\), and "what" as the unknown, and remember that "A is \(p\%\) more than B" means \(A = \left(1 + \frac{p}{100}\right)B\), a percent of B.`,
    spot_it: r`"What percent of", "is \(p\%\) of", "\(p\%\) greater than", or a percent of a percent of a quantity.`,
    test: r`Name the base, the quantity after "of" or "than"; percent comparisons always divide by that base, and a percent of a percent multiplies.`,
    trap: r`Using the wrong base: if \(A = 150\) and \(B = 120\), A is 25% more than B, but B is 20% less than A.`,
    example: {
      wrong: r`40% of 60% of 200 is \(0.4 \times 200 = 80\)`,
      right: r`40% of 60% of 200 is \(0.4 \times 0.6 \times 200 = 48\)`,
    },
  },
  {
    id: "TWO-04",
    section: "math",
    domain: PSD,
    skill: "Two-variable data: Models and scatterplots",
    name: "Desmos regression from a table",
    statement: r`When data are given without a model, enter them in a Desmos table and fit \(y_1 \sim mx_1 + b\) for a line, \(y_1 \sim ab^{x_1}\) for an exponential, or \(y_1 \sim ax_1^2 + bx_1 + c\) for a quadratic.`,
    spot_it: r`A table or scatterplot with a question about the best-fit equation, a predicted value, or which model fits best.`,
    test: r`Choose the shape from the pattern first (constant differences linear, constant ratios exponential, rise then fall quadratic), then read the fitted constants from Desmos.`,
    trap: r`Typing \(=\) instead of \(\sim\), so nothing is fitted, or estimating the slope from only two rows when the points are not exactly on a line.`,
    example: {
      wrong: r`Taking the slope between the first two rows as the slope of the line of best fit`,
      right: r`Fitting \(y_1 \sim mx_1 + b\) to every row and reading \(m\) and \(b\) from the result`,
    },
    shortcut: r`After the fit, type the model with the asked \(x\) value to get the prediction.`,
  },
  {
    id: "SMP-03",
    section: "math",
    domain: PSD,
    skill: "Inference from sample statistics and margin of error",
    name: "Scale the sample proportion up",
    statement: r`To estimate how many members of a population have a trait, multiply the proportion in a random sample by the population size.`,
    spot_it: r`A random sample of \(n\) from a population of \(N\), with \(k\) in the sample having a trait, and "about how many" in the whole population.`,
    test: r`Compute \(\frac{k}{n} \times N\), and confirm the sample was random and drawn from that same population.`,
    trap: r`Answering with the sample count \(k\) or the proportion itself, or scaling to a population that was not sampled.`,
    example: {
      wrong: r`18 of 120 randomly chosen students bike to school, so about 18 of the school's 1500 students do`,
      right: r`\(\frac{18}{120} \times 1500 = 225\) students`,
    },
  },
  {
    id: "EVS-03",
    section: "math",
    domain: PSD,
    skill: "Evaluating statistical claims: Observational studies and experiments",
    name: "Biased samples cannot generalize",
    statement: r`Only a randomly chosen sample represents its population; volunteers, online polls, and convenient groups (one class, one store) are biased, and a larger biased sample is still biased.`,
    spot_it: r`A survey where people chose to respond or were picked for convenience, and a question about what can be concluded.`,
    test: r`Ask how the sample was chosen; if no random process picked it from the population, reject any choice that extends the result beyond the people surveyed.`,
    trap: r`Believing a large sample size fixes bias: 5000 volunteers are still volunteers.`,
    example: {
      wrong: r`An online poll of 5000 volunteers shows that most of the city's residents favor the plan`,
      right: r`An online poll of 5000 volunteers describes only those who chose to respond`,
    },
  },

  // ---------------------------------------------------------------- Math: Geometry and Trigonometry
  {
    id: "LAT-05",
    section: "math",
    domain: GEO,
    skill: "Lines, angles, and triangles",
    name: "Nested triangles use whole sides",
    statement: r`A segment parallel to one side of a triangle cuts off a smaller similar triangle, and the proportion uses whole sides of each triangle, not the leftover pieces.`,
    spot_it: r`A triangle with a segment drawn across it parallel to a side, so the two triangles share a vertex.`,
    test: r`Redraw the small and large triangles separately, label each full side, then set small over large for matching sides.`,
    trap: r`Using the piece of a side beyond the parallel segment as if it were a side of the large triangle.`,
    example: {
      wrong: r`\(DE \parallel BC\), \(AD = 4\), \(DB = 6\), \(DE = 5\): \(\frac{4}{6} = \frac{5}{BC}\), so \(BC = 7.5\)`,
      right: r`\(\frac{AD}{AB} = \frac{4}{10} = \frac{5}{BC}\), so \(BC = 12.5\)`,
    },
  },
  {
    id: "TRG-05",
    section: "math",
    domain: GEO,
    skill: "Right triangles and trigonometry",
    name: "Unit circle and radians",
    statement: r`The point at angle \(\theta\) on the unit circle is \((\cos\theta, \sin\theta)\), so any angle uses its reference angle with the sign of its quadrant, and \(\sin(\pi - \theta) = \sin\theta\) while \(\cos(\pi - \theta) = -\cos\theta\).`,
    spot_it: r`An angle in radians such as \(\frac{5\pi}{6}\), an angle greater than \(90^\circ\), or a point on a circle centered at the origin.`,
    test: r`Find the reference angle (the angle to the nearest part of the x-axis), take its sine or cosine, then attach the sign: \(x\) is negative in quadrants II and III, \(y\) is negative in III and IV.`,
    trap: r`Dropping the sign: \(\cos\frac{2\pi}{3} = -\frac{1}{2}\), not \(\frac{1}{2}\).`,
    example: {
      wrong: r`\(\sin\frac{7\pi}{6} = \frac{1}{2}\)`,
      right: r`\(\sin\frac{7\pi}{6} = -\frac{1}{2}\), since \(\frac{7\pi}{6}\) is in quadrant III with reference angle \(\frac{\pi}{6}\)`,
    },
    shortcut: r`Desmos works in radians by default, so typing sin(7π/6) checks the value; switch to degrees in settings for degree angles.`,
  },
  {
    id: "CIR-05",
    section: "math",
    domain: GEO,
    skill: "Circles",
    name: "Inside, on, or outside",
    statement: r`A point is inside, on, or outside the circle \((x - h)^2 + (y - k)^2 = r^2\) when plugging it into the left side gives less than, equal to, or more than \(r^2\).`,
    spot_it: r`"Which point lies inside the circle", "on the circle", or a point compared with a circle's equation.`,
    test: r`Plug the point into the left side and compare the result with \(r^2\), not with \(r\).`,
    trap: r`Comparing the result with the radius instead of the radius squared.`,
    example: {
      wrong: r`For \((x - 2)^2 + (y + 1)^2 = 25\), the point \((5, 2)\) gives 18, which is more than 5, so it is outside`,
      right: r`For \((x - 2)^2 + (y + 1)^2 = 25\), the point \((5, 2)\) gives 18, which is less than 25, so it is inside`,
    },
    shortcut: r`Graph the circle and the point in Desmos and look.`,
  },
  {
    id: "CIR-06",
    section: "math",
    domain: GEO,
    skill: "Circles",
    name: "Perpendicular from center halves chords",
    statement: r`A segment from the center perpendicular to a chord cuts the chord in half, so half the chord, the distance from the center, and the radius form a right triangle with the radius as hypotenuse.`,
    spot_it: r`A chord with its distance from the center, or a chord length with a radius.`,
    test: r`Draw the radius to one end of the chord and use \(\left(\frac{\text{chord}}{2}\right)^2 + d^2 = r^2\).`,
    trap: r`Using the whole chord as a leg instead of half of it.`,
    example: {
      wrong: r`Radius 13 and the chord is 5 from the center, so the chord is \(\sqrt{13^2 - 5^2} = 12\)`,
      right: r`Half the chord is \(\sqrt{13^2 - 5^2} = 12\), so the chord is 24`,
    },
  },
];

/** Extra one-line tips for existing SAT rules, keyed by rule id. */
export const SAT_GAP_TIPS: Record<string, string[]> = {
  // ---------------------------------------------------------------- Reading and Writing
  "CID-01": [r`For a poem or story, the main idea is usually what the speaker or character feels or realizes by the end, often marked by a shift word (but, yet, now, until).`],
  "INF-01": [r`The key premise often sits in the sentence just before the blank, frequently after "however" or "but"; reread the last two sentences before choosing.`],
  "COE-01": [r`For a literary claim with two parts (both pride and doubt), the quotation must show both; a line showing one is a half match.`],
  "COE-02": [r`Read the sentence before the blank first, then go to the graphic looking only for the categories, years, and direction that sentence names.`],
  "TSP-02": [r`A sentence's function often depends on what follows it: "sets up a contrast" needs a later however or but, and "provides an example" needs a general claim before it.`],
  "CTC-01": [r`Check the direction: "how would the author of Text 2 respond to Text 1" asks for Text 2's view, and the reverse question asks for Text 1's.`],
  "RHS-02": [r`For an unfamiliar audience, the right choice names the subject and adds a short identifying phrase (the oud, a stringed instrument); for a familiar audience, the name alone is enough.`],
  "TRN-01": [r`Read the whole sentence before the blank, not only its last clause; the relationship is between complete ideas.`],
  "BND-05": [r`Look left of the blank first: if the extra phrase opened with a dash, it must close with a dash; if it opened with a comma, it closes with a comma.`],
  "FSS-01": [
    r`"One of the [plural noun]" takes a singular verb (One of the samples is), and an amount treated as one unit is singular (Ten miles is a long walk).`,
    r`"Either A or B" agrees with the nearer noun, just like "neither A nor B".`,
  ],
  "FSS-02": [r`If a pronoun could point to two nouns of the same number, the right choice usually replaces it with the noun itself.`],
  "FSS-03": [r`Use had + participle only for an action finished before another past action the sentence names; otherwise the simple past is right.`],
  "FSS-06": [r`Irregular plurals take 's (children's, women's, people's): form the plural first, then add the possessive mark.`],
  // ---------------------------------------------------------------- Math
  "SYS-02": [r`With unknown constants in \(a_1x + b_1y = c_1\) and \(a_2x + b_2y = c_2\): no solution means \(\frac{a_1}{a_2} = \frac{b_1}{b_2} \ne \frac{c_1}{c_2}\); infinitely many means all three ratios are equal.`],
  "NLE-01": [r`For exactly one intersection of a line and a parabola, substitute, write the result as \(ax^2 + bx + c = 0\), and set \(b^2 - 4ac = 0\); in Desmos, add a slider for the constant and find where the graphs just touch.`],
  "NLF-02": [r`To change the period, rewrite the base: 6% a year is \((1.06)^t\) with \(t\) in years, which equals \(\left(1.06^{1/12}\right)^{12t}\) per month, not \((1.005)^{12t}\).`],
  "NLF-03": [r`In Desmos, click the vertex: its y-coordinate is the maximum or minimum value and its x-coordinate is where it occurs; read which one the question asks for.`],
  "PCT-03": [r`Check by going forward: the original times the multiplier must give the stated new amount.`],
  "ONE-02": [r`Removing an outlier lowers the standard deviation; adding a value equal to the mean leaves the mean unchanged and slightly lowers the standard deviation.`],
  "PRB-02": [r`"Of the students who chose B, what fraction are seniors" and "Of the seniors, what fraction chose B" use different denominators: the group after "of" or "given" is the denominator.`],
  "SMP-01": [r`A margin of error does not correct for bias; an interval from a non-random sample is not trustworthy.`],
  "ARV-01": [
    r`The reference sheet also states that a circle has \(360^\circ\) or \(2\pi\) radians of arc and that a triangle's angles add to \(180^\circ\).`,
    r`A pyramid's volume \(\frac{1}{3}lwh\) is one third of the prism with the same base and height, just as a cone is one third of its cylinder.`,
  ],
  "TRG-01": [r`Given one ratio, build the triangle: \(\sin A = \frac{5}{13}\) means opposite 5 and hypotenuse 13, so the adjacent side is 12 and \(\cos A = \frac{12}{13}\).`],
  "TRG-02": [r`In radians the same fact reads \(\sin x = \cos\left(\frac{\pi}{2} - x\right)\); if \(\sin a = \cos b\) for acute angles, then \(a + b = 90^\circ\).`],
  "CIR-01": [r`Desmos graphs an expanded circle equation directly; click its leftmost and rightmost points, whose midpoint is the center and half whose distance is the radius.`],
  "MTH-01": [r`For an unknown constant, add a slider in Desmos and drag it until the graphs show the number of intersections the question requires.`],
};
