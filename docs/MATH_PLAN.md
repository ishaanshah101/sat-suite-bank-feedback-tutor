# Adding SAT Math (done, shipped 2026-10-30)

Goal: Rulecard covers the Math section as fully as Reading and Writing: capture, PDF, paste and image input; rule cards; chat; Test me drills; history; rules cheat sheet; the extension; the store listing.

## Research (done)

From the Question Bank's own data (October 2026, read from a cloud sandbox):
- Math has 1,925 questions vs 1,845 Reading and Writing.
- 4 domains and 19 skills (exact labels now in `src/lib/questions/taxonomy.ts`): Algebra (5 skills), Advanced Math (3), Problem-Solving and Data Analysis (7), Geometry and Trigonometry (4).
- About a quarter of Math questions are student-produced responses (grid-ins) with no choices. Their official answers list every accepted form, for example `.1764`, `.1765`, `3/17`.
- Equations are MathML; about 1 in 4 questions has a figure or a table.
- College Board's grid-in entry rules: a positive answer fits in 5 characters and a negative one in 6. Fractions and decimals are fine. A decimal that does not fit must fill every space (2/3 as .6666, .6667, 0.666 or 0.667). No mixed numbers. No symbols.

## What shipped (commit 225ffe5, live on https://rulecard.vercel.app)

Every step of the plan is done. Math has the same features as Reading and Writing: capture, PDF, paste and image input; rule cards; chat; Test me drills; history; the rules cheat sheet; the Chrome extension; the store listing.

1. **Taxonomy and rules.** `src/lib/questions/taxonomy.ts` has both sections. `src/content/math-rules.ts` has 66 Math rules: 62 skill rules (2 to 5 for each of the 19 skills) plus MTH-01..04 strategy rules (Desmos, answer what is asked, plug in or backsolve, grid-in entry). Reading and Writing keeps its 37.
2. **Grid-ins.** `src/lib/questions/spr.ts` checks entries against College Board's rules and grades with exact fractions (BigInt). A full-width truncated or rounded decimal counts, and so does any accepted form. Mixed numbers, `%`, `$` and commas are refused before any AI call.
3. **Database.** `0005_math.sql` is applied to Supabase. It adds section, format, answers and figure to questions, and response and is_correct to attempts and drills. `rule_stats` counts misses from `is_correct`. Old rows read as Reading and Writing multiple choice.
4. **AI.** One extraction prompt handles both sections: math in `\( \)` and figures described as text. Math cards add 3 to 6 worked steps and a shortcut. Math uses a separate `math` task kind (more thinking, longer timeouts). Math drills are solved a second time, independently, and shown only when the two answers agree. Chat understands Math.
5. **Rendering.** KaTeX renders math to MathML on the web and in the extension. `trust:false` means no links or scripts.
6. **UI.** Grid-in answer box, figure box, Steps and Shortcut sections, grid-in drills, Reading and Writing / Math tabs on Rules, a section filter on History, and updated copy.
7. **PDF.** The parser detects Math blocks and grid-in answers. Math questions are read with vision.
8. **Extension 0.3.0.** Same Math features. `store/rulecard-extension-0.4.0.zip`, four screenshots including `screenshot-4-math.png`, and an updated `store/LISTING.md`.

## Verification

- Local: lint and typecheck clean, 74 unit tests, 8 of 8 end-to-end tests (including the Math grid-in flow), and 20 of 20 extension checks in Chromium (Reading and Writing plus Math).
- Production (2026-10-30, commit 225ffe5, real model calls through the AI Gateway free tier, `google/gemini-2.5-flash`): `scripts/check-production-math.mjs` passed 18 of 18 from a Vercel sandbox:
  - A pasted grid-in was read as Math with answer 7. `3 1/2` was refused. `17/5` was graded wrong with rule LE1-01 and three steps. `7` was graded right.
  - A Math multiple-choice question about the minimum of \(x^2-6x+5\) produced correct A, rule NLF-03, steps, and eliminations for C and D.
  - A screenshot with a table had its table read into the figure, with answer B. Picking C produced rule LFN-03, which names the step-by-2 trap.
  - A verified grid-in drill and its check returned solution steps.
  - Math chat streamed a reply.
  - Reading and Writing was unchanged (BND-01, no steps).
  - History showed both sections with right and missed results.
  - The test account was deleted.

## Decisions

- Equations use LaTeX in `\( \)`, never `$`, because word problems contain money amounts.
- Figures are kept as a precise text description from vision, not as images. The privacy policy says screenshots are not stored.
- Grid-in correctness is checked by code against the official accepted forms, not by the model.
- Math drills are verified by an independent second solve before the student sees them.
- Not fetching questions from College Board's question API: that is an undocumented endpoint and adds terms-of-use risk before publishing.

## Contracts (fixed; the UI, the extension and the server all build against these)

Math text convention: LaTeX inside `\( \)` (inline) or `\[ \]` (display), never `$`. Render any question, choice, figure, rule, card, drill or chat text with `renderMathHtml()` from `src/lib/math/render.ts`; it escapes plain text and outputs MathML. The extension imports the same file through a relative path (esbuild bundles KaTeX). Reading and Writing text never contains `\(`, so rendering it is a no-op apart from escaping.

`QuestionRow` (`src/db/schema.ts`) gains:
- `section: "rw" | "math"` and `format: "mcq" | "spr"`.
- `choices: Choices | null` (null for grid-ins).
- `answers: string[] | null` (accepted grid-in forms) and `figure: string | null` (the figure or table in words, may contain math).

`AttemptRow` gains `response: string | null` and `isCorrect: boolean | null`; `picked` can be `"spr"`.

API:
- `POST /api/extract`: input unchanged. Response `{ question: QuestionRow, provider, model }`.
- `POST /api/questions`: body `{ questions: ParsedQuestion[] }`. `ParsedQuestion` (`src/lib/ai/schemas.ts`) adds `section`, `format`, `answers`, `figure`, and its choices are nullable; all of these are optional with defaults.
- `POST /api/explain`: body `{ questionId, picked: "A"|"B"|"C"|"D"|"correct"|"spr", response?: string, reasoning?: string|null, allowModelSolve?: boolean }`.
  - `response` is required when `picked` is `"spr"`. It is validated with `parseSprEntry`; a bad entry returns 400 `{ code: "invalid_response", error }`.
  - Response: `{ attemptId, card: RuleCard, question: QuestionRow, rule: { id, name }, isCorrect: boolean | null, provider, model }`.
  - `RuleCard` adds `correct_letter: Letter | null`, `correct_answer: string | null`, `steps: string[]` and `shortcut: string | null`. Show "Steps" when steps is non-empty and "Shortcut" when present. The correct answer label is `correct_letter ?? correct_answer`. A grid-in card has no eliminations.
  - Errors: 409 `needs_answer` when the answer is unknown and `allowModelSolve` is false (grid-ins too).
- `POST /api/drill`: `{ attemptId }` returns `{ drillId, ruleId, ruleName, format: "mcq"|"spr", question: { passage, figure, stem, choices: Choices|null }, provider, model }`. Math drills are verified by an independent solve; on a mismatch the server returns 502 `{ code: "unverified" }`.
- `POST /api/drill/check`: `{ drillId, picked: Letter }` for multiple choice or `{ drillId, response: string }` for a grid-in. Returns `{ correct, format, correctLetter: Letter|null, correctAnswer: string|null, whyCorrect, fix: string|null, solution: string[] }`. A bad grid-in entry returns 400 `invalid_response`.
- `POST /api/chat`: unchanged; replies may contain `\( \)` math.
- `GET /api/attempts`: each item adds `section`, `format`, `response`, and `result: "right" | "missed" | "unknown"`.
- History and Rules pages: rules carry `section`; `rulesForSection(section)` and `SECTION_LABEL` come from `src/content/rules.ts` and `taxonomy.ts`.
