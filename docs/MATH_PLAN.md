# Adding SAT Math (work in progress, paused 2026-10-30)

Goal: Rulecard covers the Math section as fully as Reading and Writing: capture, PDF, paste and image input; rule cards; chat; Test me drills; history; rules cheat sheet; the extension; the store listing.

## Research (done)

From the Question Bank's own data (October 2026, read from a cloud sandbox):
- Math has 1,925 questions vs 1,845 Reading and Writing.
- 4 domains and 19 skills (exact labels now in `src/lib/questions/taxonomy.ts`): Algebra (5 skills), Advanced Math (3), Problem-Solving and Data Analysis (7), Geometry and Trigonometry (4).
- About a quarter of Math questions are student-produced responses (grid-ins) with no choices. Their official answers list every accepted form, for example `.1764`, `.1765`, `3/17`.
- Equations are MathML; about 1 in 4 questions has a figure or a table.
- College Board's grid-in entry rules: a positive answer fits in 5 characters and a negative one in 6. Fractions and decimals are fine. A decimal that does not fit must fill every space (2/3 as .6666, .6667, 0.666 or 0.667). No mixed numbers. No symbols.

## Done so far

- [x] `src/lib/questions/taxonomy.ts`: sections (`rw`, `math`), Math domains and skills, skill codes, `inferSection`. *(committed)*
- [x] `src/lib/questions/spr.ts`: grid-in parsing, validation, and correctness (exact value, or a full-width truncated or rounded decimal). *(written but kept out of the commit, in `git stash`: run `git stash pop` on resume. Fix first: typecheck fails because tsconfig targets below ES2020, so replace the `0n`-style BigInt literals with `BigInt(0)` or raise the target to ES2020. Unit tests still to write.)*
- Paused 2026-10-30 at the user's request. Checkpoint commit pushed; the grid-in checker is in `git stash` (or rewrite it from the description above if the stash is gone).
- [x] `src/content/rules.ts`: `Rule` gains `section` and an optional `shortcut`. The R&W array becomes `RW_RULES` (section added by a map), `RULES = [...RW, ...MATH_RULES]`, plus `rulesForSection()` and `generalRules(section)`. *(committed)*
- [x] `src/content/math-rules.ts`: 62 Math rules (2 to 5 per skill, all 19 skills) plus MTH-01..04 strategy rules (Desmos, answer what is asked, plug in or backsolve, grid-in entry rules). Formulas are LaTeX inside `\( \)`. `tests/unit/rules.test.ts` updated. All 42 unit tests pass. *(committed)*

## Remaining steps, in order

1. **Rules:** done.
2. **Database (`0005_math.sql`, applied to Supabase and run on every PGlite boot, so it must be idempotent):**
   - On `questions`: add `section` (`rw` or `math`), `format` (`mcq` or `spr`), `answers` (jsonb list of accepted grid-in forms) and `figure` (the figure as read). `choices` becomes nullable for grid-ins.
   - On `attempts`: `picked` also allows `spr`; add `response` (what was typed) and `is_correct`.
   - On `drills`: `picked` also allows `spr`; add `response`.
   - `rule_stats` counts a miss from `is_correct = false`, falling back to the old letter comparison.
   - Update the Drizzle schema to match.
3. **Schemas (`src/lib/ai/schemas.ts`):**
   - `ParsedQuestion`: add section, format, answers, figure; choices becomes nullable.
   - Extraction output: add section, format, figure, accepted_answers.
   - Rule card: the model-facing schema adds `correct_answer`, `steps[]` and `shortcut`, and `correct_letter` becomes nullable. The stored schema gives defaults to cards saved before this change.
   - `Pick`: letter, `correct`, or `spr` with a `response`.
   - Drill: format, accepted answers and solution steps.
4. **AI:**
   - Extraction prompt for both sections: math in `\( \)`, the figure described exactly (tables as rows), and grid-in answers read from the answer panel.
   - Math explain prompt: the rule card plus 3 to 6 steps and a Desmos or backsolve shortcut. It uses the stronger model with a bigger thinking budget and a longer timeout.
   - Math drill: generate, then an independent solve that must agree. Retry once, otherwise return an error.
   - Chat: math-aware, with LaTeX allowed.
   - Stub model: math variants for the tests.
   - Daily limit: count each drill verification as part of its drill.
5. **Math rendering:** add the `katex` package and render `\( \)` to MathML (no font files needed, Chrome supports MathML). Use it in a `MathText` component on the web and in a bundled helper in the extension. Apply it to the question, choices, rule card, drill and chat.
6. **UI:**
   - Grid-in pick panel: a text box that validates with `parseSprEntry`, plus "I got it right, but explain".
   - Question card: a figure box, a grid-in chip, accepted answers shown once revealed.
   - Rule card: Steps and Shortcut sections.
   - Drill: grid-in input.
   - Rules page: Reading and Writing / Math tabs.
   - History: a section filter or column.
   - Copy on the home page and sign-in page mentions both sections.
7. **PDF:** detect Math blocks from the header. Math questions are read with vision on open, rendering the question's pages stacked. Parse "Correct Answer:" lines for grid-ins.
8. **Extension:** grid-in input, MathML rendering, steps and shortcut, grid-in drills. Bump to version 0.3.0. New zip, new screenshots including a Math one. Store listing and privacy text say "Reading and Writing and Math".
9. **Tests:**
   - Unit: grid-ins, Math rules, the PDF parser on a Math block, extraction normalization, sanitizing Math cards.
   - End-to-end: paste a Math grid-in and run explain, chat and drill.
   - Extension check: one Math flow.
10. **Ship:** run lint, typecheck and all tests. Apply 0005 to Supabase. Deploy production. Run the production check with real Math questions. Update docs (README, HANDOFF). Merge PR #1 to main (the user gave permission).

## Decisions

- Equations use LaTeX in `\( \)`, never `$`, because word problems contain money amounts.
- Figures are kept as a precise text description from vision, not as images. The privacy policy says screenshots are not stored.
- Grid-in correctness is checked by code against the official accepted forms, not by the model.
- Math drills are verified by an independent second solve before the student sees them.
- Not fetching questions from College Board's question API: that is an undocumented endpoint and adds terms-of-use risk before publishing.
