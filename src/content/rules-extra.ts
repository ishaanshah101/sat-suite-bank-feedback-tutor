// Rules added from the owner's study materials (his handwritten and typed notes, cheat sheets, formula sheets,
// grammar guides). Each fills a gap the original library did not cover. BND-12 targets a specific mix-up in
// his own notes: putting "; despite," or "; because," between two sentences as if those words were
// transition words like "however".
import type { Rule } from "./rules";

const r = String.raw;

const SEC = "Standard English Conventions" as const;
const ALG = "Algebra" as const;
const ADV = "Advanced Math" as const;
const PSD = "Problem-Solving and Data Analysis" as const;
const GEO = "Geometry and Trigonometry" as const;

export const EXTRA_RW_RULES: Rule[] = [
  {
    id: "BND-12",
    section: "rw",
    domain: SEC,
    skill: "Boundaries",
    name: "Transition word or joining word",
    statement:
      "Only transition words (however, therefore, indeed, instead, nonetheless, thus) sit in the '; ___,' slot between two sentences; joining words (although, because, since, until, if, whether, even though) attach a clause with no semicolon and no comma after them, and prepositions (despite, due to, regardless of) take a noun, not a sentence.",
    spot_it: "The choices put the same word with different punctuation: '; although', '. Although,', ', although', or '; despite,'.",
    test: "Ask what the word is: if it can start a stand-alone sentence and be followed by a comma (However, ...), it is a transition; if it makes its clause depend on another (although it rained), it joins with no comma after it; if a noun follows (despite the snow), it is a preposition.",
    trap: "Treating 'despite', 'because' or 'although' like 'however': '; despite, the snow' and '; because, the roads were icy' are never correct.",
    example: {
      wrong: "The trains kept running; despite, the heavy snow.",
      right: "The trains kept running despite the heavy snow.",
    },
  },
  {
    id: "BND-13",
    section: "rw",
    domain: SEC,
    skill: "Boundaries",
    name: "Commas between equal adjectives",
    statement:
      "Put a comma (or 'and') between two adjectives that each describe the noun equally, but no comma before an adjective that names a type or category of the noun.",
    spot_it: "Two describing words in a row before a noun, with a comma option between them.",
    test: "Swap the order or put 'and' between them; if it still sounds right (healthy and happy cat), they are equal and take a comma; if not (healthy and Siamese cat), no comma.",
    trap: "Adding a comma between every pair of adjectives because there are two of them.",
    example: {
      wrong: "Cindy adopted a healthy, Siamese cat.",
      right: "Cindy adopted a healthy, happy cat. / Cindy adopted a healthy Siamese cat.",
    },
  },
  {
    id: "FSS-09",
    section: "rw",
    domain: SEC,
    skill: "Form, Structure, and Sense",
    name: "Word pairs stay paired",
    statement:
      "Fixed pairs must be completed with their partner and must join matching things: either/or, neither/nor, both/and, whether/or, not only/but also, as/as, prefer/to, just as/so too.",
    spot_it: "The sentence opens a pair (neither, both, not only, prefer) and the choices change the second half.",
    test: "Find the first half of the pair, check its partner is the right word, then check both halves join the same kind of thing (person to person, action to action).",
    trap: "'Neither ... or', 'prefer ... than', and 'both ... as well as' sound fine in speech.",
    example: {
      wrong: "She prefers reading than watching TV.",
      right: "She prefers reading to watching TV.",
    },
  },
  {
    id: "FSS-10",
    section: "rw",
    domain: SEC,
    skill: "Form, Structure, and Sense",
    name: "Two things or three",
    statement:
      "Use the comparative (-er, more, less) for two things and the superlative (-est, most, least) for three or more; use fewer for things you can count and less for things you cannot.",
    spot_it: "Choices differ between better/best, more/most, fewer/less, or a doubled form like 'more taller'.",
    test: "Count what is being compared: two means -er or more, three or more means -est or most; then ask whether the noun can be counted (fewer cars, less traffic).",
    trap: "Stacking forms ('more faster', 'most smartest') or using less with a countable noun.",
    example: {
      wrong: "Of the two proposals, the second was the most practical, and it needed less workers.",
      right: "Of the two proposals, the second was the more practical, and it needed fewer workers.",
    },
  },
  {
    id: "FSS-11",
    section: "rw",
    domain: SEC,
    skill: "Form, Structure, and Sense",
    name: "Every sentence needs a real verb",
    statement:
      "Each clause needs a conjugated main verb (is, was, studies, found); an -ing form, a to-verb or a bare participle cannot be the main verb, and after would, could, can, will or should the verb takes its base form.",
    spot_it: "The choices are forms of one verb: finds, found, finding, to find, having found.",
    test: "Find the subject, then check whether the sentence already has a conjugated verb for it; if not, the blank must supply one that agrees in number and tense.",
    trap: "Picking an -ing form because it sounds descriptive, which leaves the sentence with no main verb.",
    example: {
      wrong: "The researchers, after years of fieldwork in the Andes, finding a new species of frog.",
      right: "The researchers, after years of fieldwork in the Andes, found a new species of frog.",
    },
  },
];

export const EXTRA_MATH_RULES: Rule[] = [
  {
    id: "LE2-04",
    section: "math",
    domain: ALG,
    skill: "Linear equations in two variables",
    name: "Parallel and perpendicular slopes",
    statement: r`Parallel lines have equal slopes; perpendicular lines have slopes that are negative reciprocals, so their product is \(-1\).`,
    spot_it: r`The question says parallel, perpendicular, or "never intersects".`,
    test: r`Put each line in \(y = mx + b\) form and compare the slopes: same \(m\) means parallel, \(m_1 \cdot m_2 = -1\) means perpendicular.`,
    trap: r`Taking the reciprocal without changing the sign, or forgetting to solve \(Ax + By = C\) for \(y\) before reading the slope.`,
    example: {
      wrong: r`A line perpendicular to \(y = 3x + 1\) has slope \(\frac{1}{3}\)`,
      right: r`A line perpendicular to \(y = 3x + 1\) has slope \(-\frac{1}{3}\)`,
    },
    shortcut: r`In Desmos, graph both lines; perpendicular lines meet at a visible right angle and parallel lines never cross.`,
  },
  {
    id: "LE2-05",
    section: "math",
    domain: ALG,
    skill: "Linear equations in two variables",
    name: "Distance and midpoint",
    statement: r`The midpoint averages the coordinates, \(\left(\frac{x_1 + x_2}{2}, \frac{y_1 + y_2}{2}\right)\), and the distance is \(\sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}\), which is the Pythagorean theorem on the right triangle the points make.`,
    spot_it: r`Two points are given and the question asks for the point halfway between them or how far apart they are.`,
    test: r`Sketch the right triangle: the horizontal and vertical gaps are the legs and the distance is the hypotenuse.`,
    trap: r`Forgetting the square root in the distance formula, or subtracting instead of adding for the midpoint.`,
    example: {
      wrong: r`The distance from \((1, 2)\) to \((4, 6)\) is \(3^2 + 4^2 = 25\)`,
      right: r`The distance from \((1, 2)\) to \((4, 6)\) is \(\sqrt{3^2 + 4^2} = 5\)`,
    },
  },
  {
    id: "INQ-04",
    section: "math",
    domain: ALG,
    skill: "Linear inequalities in one or two variables",
    name: "Absolute value splits in two",
    statement: r`\(|x - a| = k\) splits into \(x - a = k\) or \(x - a = -k\); \(|x| < k\) means \(-k < x < k\), and \(|x| > k\) means \(x < -k\) or \(x > k\).`,
    spot_it: r`Absolute value bars around an expression, or "within", "at most \(k\) away from", or a tolerance like \(\pm\).`,
    test: r`Read \(|x - a|\) as "the distance from \(x\) to \(a\)": less than \(k\) is a band around \(a\), greater than \(k\) is outside the band.`,
    trap: r`Keeping only the positive case and losing the second solution.`,
    example: {
      wrong: r`\(|x - 2| = 5\) gives only \(x = 7\)`,
      right: r`\(|x - 2| = 5\) gives \(x = 7\) or \(x = -3\)`,
    },
    shortcut: r`Graph \(y = |x - 2|\) and \(y = 5\) in Desmos and read both intersections.`,
  },
  {
    id: "EQX-05",
    section: "math",
    domain: ADV,
    skill: "Equivalent expressions",
    name: "Cancel factors, never terms",
    statement: r`In a fraction, only common factors cancel, so factor the top and bottom first; and a cancelled factor still rules out the value that makes it zero.`,
    spot_it: r`A rational expression to simplify, or choices that look like the original with pieces crossed out.`,
    test: r`Factor completely, cancel matching factors, and list any \(x\) that made the original denominator zero.`,
    trap: r`Cancelling across a plus or minus sign, like \(\frac{x + 3}{x} = 3\).`,
    example: {
      wrong: r`\(\frac{x^2 - 16}{x - 4} = x - 4\)`,
      right: r`\(\frac{x^2 - 16}{x - 4} = \frac{(x + 4)(x - 4)}{x - 4} = x + 4\), with \(x \ne 4\)`,
    },
  },
  {
    id: "NLE-06",
    section: "math",
    domain: ADV,
    skill: "Nonlinear equations in one variable and systems of equations in two variables",
    name: "Never divide by the variable",
    statement: r`Do not divide both sides by \(x\) or by an expression with \(x\); move everything to one side and factor, or you lose the solution where that expression is zero.`,
    spot_it: r`The variable appears as a factor on both sides, like \(x^2 = 3x\) or \(x(x - 2) = 5(x - 2)\).`,
    test: r`Set one side to zero, factor, and use the zero product property; also remember an even power gives two roots (\(x^2 = 9\) means \(\pm 3\)).`,
    trap: r`Dividing by \(x\) in \(x^2 = 3x\) and reporting only \(x = 3\).`,
    example: {
      wrong: r`\(x^2 = 3x\), so \(x = 3\)`,
      right: r`\(x^2 - 3x = 0\), so \(x(x - 3) = 0\) and \(x = 0\) or \(x = 3\)`,
    },
  },
  {
    id: "NLE-07",
    section: "math",
    domain: ADV,
    skill: "Nonlinear equations in one variable and systems of equations in two variables",
    name: "Match the bases",
    statement: r`To solve an exponential equation, rewrite both sides with the same base and set the exponents equal.`,
    spot_it: r`The variable is in an exponent and the numbers are powers of the same base (2, 4, 8, 16 or 3, 9, 27).`,
    test: r`Write each number as a power of the smallest base: \(9^x = 3^{2x}\), \(8 = 2^3\); then equate the exponents.`,
    trap: r`Setting the exponents equal before the bases match.`,
    example: {
      wrong: r`\(9^x = 3^4\), so \(x = 4\)`,
      right: r`\(9^x = 3^{2x} = 3^4\), so \(2x = 4\) and \(x = 2\)`,
    },
    shortcut: r`Graph \(y = 9^x\) and \(y = 81\) in Desmos and read the intersection.`,
  },
  {
    id: "ONE-04",
    section: "math",
    domain: PSD,
    skill: "One-variable data: Distributions and measures of center and spread",
    name: "Total equals average times count",
    statement: r`Total = average \(\times\) number of values, so a missing value is the new total minus the old total.`,
    spot_it: r`An average changes when a value is added or removed, or one value is missing from a known average.`,
    test: r`Write both totals (old average \(\times\) old count, new average \(\times\) new count) and subtract.`,
    trap: r`Averaging the two averages, or using the old count for the new total.`,
    example: {
      wrong: r`4 tests average 80; to average 82 after 5 tests you need 84`,
      right: r`\(5 \times 82 - 4 \times 80 = 410 - 320 = 90\)`,
    },
  },
  {
    id: "ONE-05",
    section: "math",
    domain: PSD,
    skill: "One-variable data: Distributions and measures of center and spread",
    name: "What each graph can show",
    statement: r`A box plot shows the minimum, quartiles, median and maximum (so range and IQR) but not the mean or mode; a dot plot or frequency table shows every value, so every statistic can be found.`,
    spot_it: r`A question asks for a mean, mode or standard deviation from a box plot, or compares two displays.`,
    test: r`Before computing, ask whether the display holds individual values; if it is a box plot, only five-number-summary facts are available.`,
    trap: r`Reading the line in the middle of a box as the mean.`,
    example: {
      wrong: r`The box plot's middle line shows the mean is 12`,
      right: r`The box plot's middle line shows the median is 12; the mean cannot be read from it`,
    },
  },
  {
    id: "PRB-04",
    section: "math",
    domain: PSD,
    skill: "Probability and conditional probability",
    name: "And, or, at least one",
    statement: r`For independent events multiply, \(P(A \text{ and } B) = P(A)P(B)\); for "or" add and remove the overlap, \(P(A) + P(B) - P(A \text{ and } B)\); and \(P(\text{at least one}) = 1 - P(\text{none})\).`,
    spot_it: r`Two events together, the word "or", or "at least one" over several tries.`,
    test: r`For "at least one", find the chance that it never happens and subtract from 1; for counting, multiply the number of choices at each step.`,
    trap: r`Adding probabilities for "and", or forgetting to subtract the overlap for "or".`,
    example: {
      wrong: r`A 0.6 chance each day for 3 days gives \(0.6 \times 3 = 1.8\) for at least one`,
      right: r`\(1 - 0.4^3 = 0.936\)`,
    },
  },
  {
    id: "LAT-04",
    section: "math",
    domain: GEO,
    skill: "Lines, angles, and triangles",
    name: "Polygon angle sums",
    statement: r`The interior angles of an \(n\)-sided polygon add to \((n - 2) \cdot 180^\circ\), each angle of a regular polygon is that sum divided by \(n\), and the exterior angles always add to \(360^\circ\).`,
    spot_it: r`A pentagon, hexagon, or other polygon with a missing angle.`,
    test: r`Count the sides, compute \((n - 2) \cdot 180\), and subtract the known angles.`,
    trap: r`Using \(n \cdot 180\) or forgetting that the exterior sum is always 360.`,
    example: {
      wrong: r`A hexagon's angles add to \(6 \cdot 180 = 1080^\circ\)`,
      right: r`A hexagon's angles add to \(4 \cdot 180 = 720^\circ\)`,
    },
  },
  {
    id: "TRG-04",
    section: "math",
    domain: GEO,
    skill: "Right triangles and trigonometry",
    name: "Know the special values",
    statement: r`\(\sin 30^\circ = \cos 60^\circ = \frac{1}{2}\), \(\sin 60^\circ = \cos 30^\circ = \frac{\sqrt{3}}{2}\), and \(\sin 45^\circ = \cos 45^\circ = \frac{\sqrt{2}}{2}\).`,
    spot_it: r`A trig value of 30, 45 or 60 degrees, or a ratio like \(\frac{1}{2}\) or \(\frac{\sqrt{3}}{2}\) that names an angle.`,
    test: r`Picture the 30-60-90 triangle with sides \(1, \sqrt{3}, 2\) or the 45-45-90 with \(1, 1, \sqrt{2}\) and read the ratio.`,
    trap: r`Swapping the sine and cosine of 30 and 60 degrees.`,
    example: {
      wrong: r`\(\sin 60^\circ = \frac{1}{2}\)`,
      right: r`\(\sin 60^\circ = \frac{\sqrt{3}}{2}\)`,
    },
    shortcut: r`Desmos computes trig values directly; set it to degrees first.`,
  },
  {
    id: "CIR-04",
    section: "math",
    domain: GEO,
    skill: "Circles",
    name: "Radians and arc length",
    statement: r`Radians = degrees \(\times \frac{\pi}{180}\); with the angle \(\theta\) in radians, arc length is \(r\theta\) and sector area is \(\frac{1}{2}r^2\theta\).`,
    spot_it: r`An angle given in radians, or a question asking for an angle "in radians".`,
    test: r`Convert to the form the question wants, then use the fraction of the circle: \(\frac{\theta}{2\pi}\) of the circumference or area.`,
    trap: r`Using the degree formula with an angle in radians, or forgetting that \(180^\circ = \pi\).`,
    example: {
      wrong: r`\(60^\circ = \frac{\pi}{6}\) radians`,
      right: r`\(60^\circ = 60 \cdot \frac{\pi}{180} = \frac{\pi}{3}\) radians`,
    },
  },
  {
    id: "MTH-05",
    section: "math",
    domain: "General",
    skill: "General",
    name: "Four steps for word problems",
    statement: r`Read the final question first, note what is given, pick the fastest route (Desmos, backsolve, plug in numbers, or algebra), then check the answer is the quantity asked for.`,
    spot_it: r`A long word problem with a context and several numbers.`,
    test: r`Before choosing, reread the last sentence and confirm the units and the quantity (the total, the difference, the other group).`,
    trap: r`Solving for \(x\) correctly and picking it when the question asked for something built from \(x\).`,
    example: {
      wrong: r`Finding that 12 adults came and answering 12 when the question asked how many children came`,
      right: r`Finding 12 adults, then answering \(30 - 12 = 18\) children`,
    },
  },
];
