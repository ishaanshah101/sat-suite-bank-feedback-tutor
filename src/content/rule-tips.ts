// Extra tips for existing rules, distilled from the owner's study materials (cheat sheets, formula sheets,
// grammar guides, his own handwritten and typed notes, College Board documents). Each tip is one sentence a
// student can use mid-test. They appear on the Rules page and go to the model with the rule, so a card can
// use the fastest route. Old paper-SAT advice from those sources (no-calculator section, five choices,
// "grid-ins are never negative", complex numbers, logarithms) is deliberately left out.

/** Formulas are LaTeX inside \( \); String.raw keeps the backslashes readable. */
const r = String.raw;

export const RULE_TIPS: Record<string, string[]> = {
  // ---------------------------------------------------------------- Reading and Writing: Boundaries
  "BND-01": [
    r`The four legal joins: [sentence]. [sentence] / [sentence]; [sentence] / [sentence], FANBOYS [sentence] / [sentence]. or ; Transition, [sentence].`,
    r`A transition word like however or therefore is not a joiner: ", however," between two full sentences is still a comma splice; use "; however," or ". However,".`,
    r`Comma alone between two sentences is a comma splice; nothing at all is a run-on; both are always wrong on this test.`,
    r`For ", and" or ", but", put a period in its place: if the second half has no subject of its own, drop the comma; a comma followed by a pronoun (it, they) is often a splice.`,
    r`Equal joins cancel out: if a period, a semicolon and a comma plus and would all be correct, eliminate them all.`,
  ],
  "BND-02": [
    r`Dependent clause first takes a comma ("Once you finish, you can leave."); dependent clause second usually takes none ("...since you got the promotion").`,
    r`Exception: a comma before a contrast clause with while or whereas is fine.`,
  ],
  "BND-03": [
    r`Before a colon: a complete sentence. After it: something that explains, lists or restates it (a noun phrase, a list, a quote, or another sentence).`,
    r`Never put a colon right after including, such as, like, for example, for instance or especially, or between a verb and its list.`,
  ],
  "BND-04": [
    r`Period and semicolon are interchangeable between two full sentences; the test never asks you to judge "how related" they are.`,
    r`A semicolon also separates list items that already contain commas.`,
    r`A transition word inside one clause (the plan, however, failed) takes a pair of commas; starting the second sentence, it takes "; however," or ". However,".`,
  ],
  "BND-05": [
    r`Take-it-out test: remove the phrase; if the sentence still works and still points to the same thing, it is extra and needs a matched pair (two commas or two dashes, never one of each).`,
    r`If removing it loses "which one" (the biologist Dr. Barman), it is essential and takes no commas.`,
    r`A single dash comes after a complete sentence, like a colon.`,
  ],
  "BND-06": [
    r`No comma between subject and verb, no matter how long the subject is.`,
    r`No comma before an infinitive ("want to go"), and usually none before or after "that".`,
    r`No commas around a prepositional phrase in mid-sentence ("Many people in Canada speak French").`,
  ],
  "BND-07": [r`An introductory phrase or clause (In Canada, ... / Because it rained, ...) gets one comma after it.`],
  "BND-08": [
    r`If the sentence already has its main verb, the blank is a describing phrase (-ing or -ed), not a second verb.`,
    r`An -ing or -ed phrase alone is not a sentence: it needs a helping verb (is running) or a full sentence attached.`,
  ],
  "BND-11": [
    r`Three name-and-title patterns: "John Doe, Professor of English, published..." (pair of commas) / "...by John Smith, CEO." / "Professor John Doe published..." (no commas when the title comes first).`,
  ],
  // ---------------------------------------------------------------- Reading and Writing: Form, Structure, and Sense
  "FSS-01": [
    r`Cross out prepositional phrases ("of this laptop") and ask "what are we talking about?"; that noun is the subject.`,
    r`The s-flip: an s on a noun makes it plural (girls), an s on a present verb makes it singular (dances).`,
    r`Always singular: each, every, either, neither, everyone, anyone, a gerund subject (Swimming is), collective nouns (the team is). Always plural: both, few, many, several. All, none, some, most, any: check the noun they refer to.`,
    r`"Neither A nor B" agrees with the nearer noun; "along with" and "as well as" are not part of the subject.`,
  ],
  "FSS-02": [
    r`Draw an arrow from the pronoun to its noun; the test plants extra nouns to confuse you.`,
    r`Collective nouns take it/its (the committee and its report); this, that, these and those need a noun after them when the reference is unclear.`,
    r`The noun a pronoun refers to may be in the previous sentence; "rivers such as the Mississippi" is plural, so it takes they.`,
  ],
  "FSS-03": [
    r`Irregular verbs: the simple past stands alone (began, drank); the past participle needs has, have or had (has begun, had drunk).`,
    r`Time triggers: "since", "for" or "over" + a span takes has/have; "by the time" + a past event takes had.`,
  ],
  "FSS-04": [
    r`Ask "who or what is doing this?" about the opening phrase; that noun must come right after the comma.`,
    r`The possessive trick: "Excited about the game, Javi's skates sat by the door" is wrong because the noun after the comma is skates, not Javi.`,
  ],
  "FSS-05": [
    r`Keep every item in the same form: all -ing words, or all infinitives.`,
    r`With infinitives, repeat "to" on every item or put it once at the start; never mix the two.`,
  ],
  "FSS-06": [
    r`Read a possessive backwards: "the dog's dish" is the dish of the dog. One owner 's, plural owners s', plural with no owner no apostrophe.`,
    r`Possessive pronouns never take an apostrophe (its, whose, theirs); expand it's to "it is" and they're to "they are" to check.`,
    r`Separate ownership marks both names (Chesnutt's and Dunbar's novels).`,
  ],
  "FSS-08": [r`Whose shows possession; who is for people, which for things and animals, where for places, when for times.`],
  // ---------------------------------------------------------------- Reading and Writing: Transitions and Expression of Ideas
  "TRN-01": [
    r`Label the relationship before reading the choices: same direction (+), contrast, cause and effect, example, or emphasis.`,
    r`Check the direction of cause and effect: therefore and thus point forward to a result; because and since point back to a reason.`,
  ],
  "TRN-02": [
    r`Instead: the first thing did not happen and the second happened in its place (the first sentence usually has a "not").`,
    r`Conversely: the second statement reverses the first (poor sleep causes stress; conversely, stress hurts sleep).`,
    r`In fact: intensifies or corrects an expectation. Indeed: confirms and strengthens the previous claim.`,
    r`Nonetheless and nevertheless: something is true despite the drawback just mentioned. Still, at the start of a sentence, means "even so" (concession), not "continuing".`,
    r`Two figures set side by side want "By comparison" or "Similarly", not a cause word.`,
  ],
  "RHS-01": [
    r`Underline the goal in the question first; every wrong choice is a true fact aimed at the wrong target.`,
    r`Concision only breaks ties between choices that both meet the goal.`,
  ],
  // ---------------------------------------------------------------- Reading and Writing: Craft and Structure, Information and Ideas
  "WIC-01": [
    r`Five clues hand you the meaning: a definition, a synonym nearby, an antonym nearby (take the opposite), an explanation after a colon, or an example after "like" or a semicolon.`,
    r`Predict your own word from those clues before looking at the choices, then match.`,
    r`When two choices both fit the dictionary meaning, the connotation (positive, negative, strength) the passage signals decides.`,
  ],
  "WIC-02": [r`Too means more than needed, not "very"; common words often carry their less common meaning on the test.`],
  "COE-02": [
    r`Data checklist: right units (percent vs count), right time window, right category or line, right direction of change, exact numbers; no extrapolating and no causation from a graph.`,
  ],
  "TSP-01": [
    r`Function verbs: establish (make firm), elaborate (add detail to something already said), present (offer evidence), set up (give background or context), illustrate (give an example or analogy), lay out (arrange the parts, such as chronological or cause and effect).`,
    r`Overall purposes: entertain, inform or explore, persuade or promote, refute or disagree.`,
  ],
  "GEN-01": [r`Extreme words that usually sink a choice: all, alone, always, every, never, none, no one, only, solely, too, will, not.`],
  // ---------------------------------------------------------------- Math: Algebra
  "LE1-01": [
    r`Order: distribute, combine like terms, undo \(+\) and \(-\), then undo \(\times\) and \(\div\).`,
    r`Subtracting a parenthesis flips every sign inside: \(4 - (x + 3) = 1 - x\), not \(7 - x\).`,
    r`Sanity-check in context: a negative or fractional count of people or books means a slip.`,
  ],
  "LE1-03": [
    r`If the target is a multiple of what you are given, scale it: \(2x - 3y = 6\) gives \(6y - 4x = -12\) with no solving.`,
    r`Adding or subtracting the two given equations often produces the target expression directly; check that before answering "cannot be determined".`,
  ],
  "LFN-01": [
    r`Interpretation sentences: slope means "for each additional 1 [x-unit], [y] changes by \(m\) [y-units]"; the y-intercept means "when [x] is 0, [y] is \(b\)".`,
    r`Fixed fee plus a per-unit charge is \(y = (\text{rate})x + (\text{fee})\): $50 plus $12 an hour is \(y = 12x + 50\).`,
  ],
  "LFN-02": [
    r`With two points, find the slope first, then plug one point into \(y = mx + b\) to get \(b\).`,
    r`Horizontal line \(y = c\) has slope 0; vertical line \(x = c\) has an undefined slope.`,
  ],
  "LFN-03": [
    r`Constant differences in a table mean linear; a constant ratio between consecutive outputs means exponential.`,
    r`An arithmetic sequence \(a + (n - 1)d\) is a linear function of the term number; to find \(d\), divide the change in value by the change in term number.`,
  ],
  "LFN-04": [r`\(f(g(x))\): work from the inside out, plugging \(g(x)\) into \(f\).`],
  "LE2-01": [r`In \(Ax + By = C\): slope \(-\frac{A}{B}\), x-intercept \(\frac{C}{A}\), y-intercept \(\frac{C}{B}\).`],
  "LE2-02": [r`"Which point cannot lie on the line": write the equation once, then test each choice.`],
  "LE2-03": [
    r`Translate one fact per equation: "twice as many as Tom" is \(S = 2T\); "together 18" is \(S + T = 18\).`,
    r`"5 less than \(x\)" is \(x - 5\): "less than" and "fewer than" reverse the order you read them in.`,
    r`Counts and costs cannot be negative, and people come in whole numbers.`,
  ],
  "SYS-01": [
    r`Word problems are usually a "how many" equation plus a "how much" equation (items and money); define both variables first.`,
    r`Desmos: graph both lines and click the intersection.`,
  ],
  "SYS-02": [r`For "no solution", set the slopes equal and check that the intercepts differ; there is nothing to solve.`],
  "SYS-03": [r`Infinitely many solutions means one equation is a constant multiple of the other, constants included.`],
  "INQ-01": [r`Add inequalities that point the same way; never subtract, multiply or divide one inequality by another.`],
  "INQ-02": [
    r`At least \(\ge\); at most and no more than \(\le\); more than \(>\); fewer than and less than \(<\).`,
    r`"And" means the overlap of two conditions; "or" means either one.`,
  ],
  "INQ-03": [
    r`Graphs: \(>\) and \(<\) use a dashed boundary, \(\ge\) and \(\le\) a solid one; \(y > mx + b\) shades above the line.`,
    r`For "which must be greatest" with a condition, pick numbers that satisfy the condition and evaluate every choice.`,
  ],
  // ---------------------------------------------------------------- Math: Advanced Math
  "EQX-01": [r`Expand a guess to check it: \((x - 4)(x - 6)\) gives \(+24\), not \(-24\).`],
  "EQX-02": [
    r`MADSPM: when bases match, Multiply means Add exponents, Divide means Subtract, Power means Multiply.`,
    r`\(a^{m/n} = \sqrt[n]{a^m}\): the numerator is the power and the denominator is the root; a negative exponent is a reciprocal.`,
    r`Factor out the smallest power: \(4^6 - 4^5 = 4^5(4 - 1) = 3 \cdot 4^5\).`,
    r`An even power of a negative is positive, an odd power is negative.`,
  ],
  "EQX-03": [
    r`Factor in layers: greatest common factor first, then difference of squares or a perfect square, then the trinomial with sum \(b\) and product \(c\).`,
    r`Patterns: \((a + b)^2 = a^2 + 2ab + b^2\), \((a - b)^2 = a^2 - 2ab + b^2\), \(a^2 - b^2 = (a + b)(a - b)\), and \(x^2 + bx = (x + \frac{b}{2})^2 - (\frac{b}{2})^2\).`,
  ],
  "NLE-01": [r`"How many x-intercepts" is the same question as "how many real solutions": use \(b^2 - 4ac\).`],
  "NLE-02": [r`Sum of roots \(-\frac{b}{a}\) and product \(\frac{c}{a}\) answer many quadratic questions without solving.`],
  "NLE-03": [
    r`Plug each answer into the original equation; a value that makes a denominator 0 is out.`,
    r`One fraction equal to one fraction: cross-multiply instead of hunting for a common denominator.`,
  ],
  "NLE-04": [r`To factor \(ax^2 + bx + c\), find two numbers that multiply to \(ac\) and add to \(b\).`],
  "NLE-05": [r`Desmos: graph the line and the curve and count or click the intersections.`],
  "NLF-01": [
    r`Exponential change multiplies: "doubles every 3 years" means \(\times 4\) after 6 years, not \(\times 2\).`,
    r`A geometric sequence (multiply by \(r\) each step) is exponential; an arithmetic one (add \(d\)) is linear.`,
  ],
  "NLF-02": [
    r`In \(a(1 \pm r)^t\): \(a\) is the start, \(1 + r\) is growth and \(1 - r\) is decay, and \(r \times 100\) is the percent per period.`,
    r`Compounding \(n\) times a year: \(P(1 + \frac{r}{n})^{nt}\); simple interest: \(P(1 + rt)\).`,
  ],
  "NLF-03": [
    r`From factored form \(a(x - m)(x - n)\), the vertex x-value is the midpoint \(\frac{m + n}{2}\).`,
    r`\(a > 0\) opens up (a minimum), \(a < 0\) opens down (a maximum).`,
    r`For a launched object: the y-intercept is the launch height, the vertex is the top, and the positive zero is when it lands.`,
  ],
  "NLF-04": [r`Factor theorem: \(f(r) = 0\) exactly when \((x - r)\) is a factor; dividing \(f(x)\) by \((x - a)\) leaves remainder \(f(a)\).`],
  "NLF-05": [
    r`\(f(x - h)\) moves right \(h\) and \(f(x + h)\) moves left; \(-f(x)\) flips over the x-axis and \(f(-x)\) over the y-axis.`,
    r`\(c \cdot f(x)\) stretches vertically by \(c\); \(f(bx)\) squeezes horizontally by \(\frac{1}{b}\).`,
  ],
  // ---------------------------------------------------------------- Math: Problem-Solving and Data Analysis
  "RAT-01": [
    r`\(a:b\) means \(\frac{a}{a + b}\) of the whole is the first part; each part is the total divided by the sum of the parts.`,
    r`Combine two ratios by scaling the shared term: \(3:2\) and \(4:5\) become \(6:4:5\).`,
    r`Direct variation \(y = kx\) is a line through the origin; inverse variation is \(y = \frac{k}{x}\).`,
  ],
  "RAT-02": [r`Multiply by fractions equal to 1 and cancel units like variables; metric steps are powers of 10, and \(1 \text{ mL} = 1 \text{ cm}^3\).`],
  "RAT-03": [
    r`Average speed is total distance over total time, never the average of the two speeds.`,
    r`Work together: \(\frac{1}{A} + \frac{1}{B} = \frac{1}{T}\), so two workers finish in \(\frac{AB}{A + B}\).`,
    r`A mixture or average lands between its parts and closer to the bigger part, which often picks the answer without a system.`,
  ],
  "PCT-01": [
    r`Percent change divides by the original, for an increase or a decrease.`,
    r`"250% of" and "150% more than" are both \(\times 2.5\).`,
    r`Quick math: 10% is \(\div 10\), 25% is \(\div 4\), 25% off is \(\times 0.75\).`,
  ],
  "PCT-02": [r`Start from 100: up 80% then down 30% is \(100 \to 180 \to 126\), a 26% increase, not 50%.`],
  "ONE-01": [
    r`Skew drags the mean toward the tail: right-skewed data has mean greater than median.`,
    r`Median and IQR resist outliers; mean, range and standard deviation do not.`,
    r`Evenly spaced data has mean equal to median.`,
  ],
  "ONE-02": [r`A taller, narrower distribution has a smaller standard deviation than a flat, wide one.`],
  "ONE-03": [r`Never average two averages: rebuild the totals with sum = mean \(\times\) count, then divide.`],
  "TWO-01": [
    r`Predictions inside the data range (interpolation) are reliable; outside it (extrapolation) they are not.`,
    r`\(r\) runs from \(-1\) to 1; the closer to \(\pm 1\), the stronger the linear pattern.`,
    r`Desmos: put the data in a table and run a regression such as \(y_1 \sim mx_1 + b\).`,
  ],
  "TWO-02": [r`A positive residual means the point is above the line, so the model underestimated it.`],
  "TWO-03": [r`A curved pattern in the residuals means a line is the wrong model.`],
  "PRB-01": [
    r`Geometric probability is favorable area over total area.`,
    r`The complement is usually one of the choices: check you found the asked event, not its opposite.`,
  ],
  "PRB-02": [r`In a two-way table, circle the given row or column first; that total is the denominator.`],
  "PRB-03": [r`Expected value is the sum of each outcome times its probability.`],
  "SMP-01": [r`Overlapping margin-of-error intervals do not show a real difference between two groups.`],
  "EVS-01": [
    r`Correlation is not causation, even with \(r = 0.99\): a third variable can drive both.`,
    r`A causal claim about a whole population needs random sampling and random assignment.`,
  ],
  // ---------------------------------------------------------------- Math: Geometry and Trigonometry
  "ARV-01": [
    r`Not on the reference sheet: trapezoid \(\frac{1}{2}(b_1 + b_2)h\), equilateral triangle \(\frac{\sqrt{3}}{4}s^2\), cylinder surface \(2\pi r^2 + 2\pi rh\), sphere surface \(4\pi r^2\), box surface \(2(lw + lh + wh)\).`,
    r`The height of a triangle must be perpendicular to the base you chose; in a non-right triangle, draw the altitude.`,
  ],
  "ARV-02": [r`Work backward too: volume ratio \(1:8\), cube root gives lengths \(1:2\), square gives areas \(1:4\).`],
  "ARV-03": [
    r`Shaded area is the outer shape minus the inner shape.`,
    r`A circle inscribed in a square has diameter equal to the side; overlapping shapes are linked by the side or angle they share.`,
  ],
  "LAT-01": [r`Parallel lines cut by a transversal make only two angle sizes: every acute angle is equal, every obtuse angle is equal, and acute plus obtuse is \(180^\circ\).`],
  "LAT-02": [
    r`An exterior angle equals the sum of the two far interior angles.`,
    r`Each side is longer than the difference and shorter than the sum of the other two; the largest angle faces the longest side.`,
  ],
  "LAT-03": [
    r`Similar means sides are proportional, not equal; congruent means equal (SSS, SAS, ASA, AAS).`,
    r`Similarity by AA is enough: two matching angles force the third.`,
  ],
  "TRG-03": [
    r`Triples to spot: 3-4-5, 5-12-13, 8-15-17, 7-24-25 and their multiples (6 and 8 give 10).`,
    r`A square's diagonal makes a 45-45-90 triangle, so the diagonal is \(s\sqrt{2}\); sides \(1, \sqrt{3}, 2\) mean a 30-60-90.`,
    r`The distance between two points is the hypotenuse of the right triangle they make.`,
  ],
  "CIR-01": [
    r`From \(x^2 + y^2 + Dx + Ey + F = 0\), complete the square on \(x\) and on \(y\) to read the center and radius.`,
    r`Points at distance \(d\) from the origin lie on \(x^2 + y^2 = d^2\).`,
  ],
  "CIR-02": [r`Central angle over 360 = arc over circumference = sector area over circle area.`],
  "CIR-03": [
    r`When a tangent appears, draw the radius to the tangent point: it makes a right angle.`,
    r`An angle inscribed in a semicircle is \(90^\circ\); all radii are equal, so look for isosceles triangles.`,
  ],
  // ---------------------------------------------------------------- Math: general strategy
  "MTH-01": [
    r`Graph \(y =\) left side and \(y =\) right side; the x-value where they cross solves almost any equation.`,
    r`Use Desmos for statistics, messy quadratics, long arithmetic and radical choices; do quick angle chasing by hand.`,
  ],
  "MTH-02": [
    r`The "other part" trap: a wrong choice is often the value of the group that was not asked about.`,
    r`Read the final question again before choosing: \(3x\), \(x + 2\) or the total, not just \(x\).`,
  ],
  "MTH-03": [
    r`Backsolve from a middle choice; if it is too small, every smaller choice goes too.`,
    r`For "greatest" questions test the largest choice first, for "least" the smallest; the first that works wins.`,
    r`Plug in small, allowed numbers when the choices have variables, and test every choice.`,
    r`For "how much more per extra unit", evaluate at \(x = 1\) and \(x = 2\) and subtract.`,
  ],
  "MTH-04": [r`If several answers work, enter any one; leave out units, %, $ and commas.`],
};
