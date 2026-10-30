# Wiring the add-ons into upstream extension 0.3.0 (SAT Math)

The integration map for whoever merges `extension/src/addons/` into
`ishaanshah101/sat-suite-bank-feedback-tutor`. Every line number below refers to `main` at
`7cdf3fdcdcf515372839aa391f0bd12d557bd735` (extension 0.3.0): `extension/src/sidepanel.ts` has 1020
lines and `extension/src/background.ts` has 27. Apply the sidepanel edits from the bottom of the file
up, so the line numbers stay valid while you work.

The 0.2.0 patch (`INTEGRATION-sidepanel.diff`, `INTEGRATION-background.diff`, `reference/patched/`)
is the model. This file says where each hunk lands in 0.3.0 and what changed because of Math.

## 1. What the 0.3.0 server sends

| Endpoint | Request | Response |
| --- | --- | --- |
| `POST /api/extract` | `{image, source: "capture" \| "image" \| "pdf"}` or `{text, source: "paste"}` (text 20 to 20,000 chars) | `{question, provider, model}` |
| `POST /api/explain` | `{questionId, picked, response?, reasoning?, allowModelSolve?}`. `picked` is `Letter \| "correct" \| "spr"`. `response` (max 20 chars, checked with `parseSprEntry`) is required when picked is `"spr"`. Grid-in accepts only `"spr"` or `"correct"`; multiple choice rejects `"spr"` (400, code `invalid_response`). | `{attemptId, card, question, rule: {id, name}, isCorrect, provider, model}` |
| `POST /api/drill` | `{attemptId}` | `{drillId, ruleId, ruleName, format?, question: {passage, figure?, stem, choices \| null}}` |
| `POST /api/drill/check` | `{drillId, picked: Letter}` or, for a grid-in drill, `{drillId, response}` | `{correct, format?, correctLetter \| null, correctAnswer?, whyCorrect, fix, solution?: string[]}` |

Math additions on `Question`: `section: "rw" | "math"`, `format: "mcq" | "spr"`, `choices: null` and
`correct: null` for grid-in, `answers: string[] | null` (every accepted form, e.g. `[".1764", ".1765", "3/17"]`),
`figure` (a figure or table in words), `source`, `test`, `rationale`, `answerSource: "official" | "model" | null`.
On `RuleCard`: `correct_letter: null` and `correct_answer: string` for grid-in, `steps: string[]` (worked
steps), `shortcut` (Desmos or backsolving). `isCorrect` is the server's grade (`true` whenever picked is
`"correct"`, `null` when it can't grade); when it is true the server forces diagnosis `got_it_right`.
The attempt row stores `response` and `is_correct`.

## 2. Types bridge

- `addons/types.ts` now has two layers. The `Api*` types are an exact copy of upstream
  `extension/src/types.ts` (`ApiPick` is upstream `Pick`, renamed so it doesn't shadow TypeScript's
  `Pick<T, K>`). The old add-on names (`Question`, `RuleCard`, `ExplainResponse`, `DrillCheckResponse`)
  still compile and gained the 0.3.0 fields as optional. On merge you can replace the `Api*` block with
  re-exports from `../types`.
- `normalizeQuestion(q)` turns an upstream question into the add-on `Question` (four choice strings,
  empty for grid-in; `format` set). Use it wherever sidepanel.ts hands a question to the add-ons.
- `entryFromExplain(data, picked, extras)` (log.ts) takes the 0.2.0 or the 0.3.0 `/api/explain`
  response as is, a pick of `Letter | "correct" | "spr"`, and `extras.typed` for the grid-in answer.
- Don't import `isGridIn` from `addons/log` into sidepanel.ts: upstream already has its own
  `isGridIn(q)` at line 118 (for questions; the add-on one is for log entries).

## 3. sidepanel.ts hooks (bottom of the file first)

**S14. Create the controller.** After line 1018 (the `}` that closes `boot()`), before line 1020
`void boot();`. Nothing renders before `boot()`, so `const` is safe here.

```ts
const addons = createAddons(
  { get settings() { return state.settings; }, request, rerender: () => render(), openWeb: (path) => openWeb(path), describe },
  {
    getQuestion: () => (state.question ? normalizeQuestion(state.question) : null),
    getExplained: () => state.explained && { attemptId: state.explained.attemptId, picked: state.explained.picked === "spr" ? "correct" : state.explained.picked },
    processImage,
    capture: () => void capture(),
    pick: (letter) => {
      const d = state.drill;
      if (d.data && !d.result) { if (d.data.question.choices && letter !== "correct") void answerDrill(letter); return; }
      if (!state.question || state.explained) return;
      if (isGridIn(state.question) && letter !== "correct") return; // grid-in: type the answer; G still works
      state.picked = letter;
      render();
    },
    explain: () => void explain(),
    testMe: () => void startDrill(),
    focusChat: () => document.getElementById("chat-input")?.focus(),
  },
);
```

The 0.2.0 version mapped a drill pick of `"correct"` to `"A"`; drop that.

**S13. `consumePendingQuestion()`** (new in 0.3.0, lines 981 to 990). It sets `state.question` without
`processImage`, so the add-ons never hear about it. After line 988 `state.question = pending;`:

```ts
  void addons.afterExtract(normalizeQuestion(pending));
```

**S12. `consumePendingCapture()`**: replace line 967 `if (pending.image) await processImage(pending.image);` with

```ts
    if (pending.image) { const image = await addons.transformImage(pending.image); if (image) await processImage(image); }
```

**S11. `checkDrillResponse()`** (new: grid-in drills). After line 912 (the `/api/drill/check` call with `response`):

```ts
    if (state.explained) void addons.afterDrillCheck(state.explained.attemptId, d.result.correct);
```

**S10. `answerDrill(letter)`**. After line 890, the same line as S11.

**S9. `explain()`**. After line 855 `state.explained = { ... picked, response, isCorrect ... };`:

```ts
    void addons.afterExplain(data, picked, response);
```

This needs a one-line change in `addons/index.ts` (not edited here): make `afterExplain` take
`(data: ExplainResponse | ApiExplainResponse, picked: ApiPick, typed: string | null = null)` and pass
`typed` into `entryFromExplain(data, picked, { seconds, selfConfidence, typed })`. Its other uses
(`data.rule?.name`, `data.card.rule_statement`) exist in both shapes.

**S8. `processImage(image)`**. After line 814 `state.question = data.question;`:

```ts
  void addons.afterExtract(normalizeQuestion(data.question));
```

**S7. `capture()`**. After line 787 `const tab = await activeTab();`:

```ts
    if (!(await addons.beforeCapture(tab))) return;
    const textImage = await addons.tryTextCapture(tab);
    if (textImage) { await processImage(textImage); return; }
```

Then replace line 801 `await processImage(await downscale(raw));` with

```ts
    const image = await addons.transformImage(await downscale(raw));
    if (!image) return;
    await processImage(image);
```

**S6. `renderDrill()`**: nothing to do. Line 655 already uses the `picked` class (see Overlaps).

**S5. `renderPickPanel(q)`**. After line 533, before line 534 `children.push(reasoning);`:

```ts
  children.push(...addons.renderPickExtras());
```

**S4. `renderQuestion(q)`**. After line 437 (the `}` that closes the choices and grid-in key block),
before line 438 `if (!state.explained) children.push(renderPickPanel(q));`:

```ts
  children.push(...addons.renderQuestionExtras(normalizeQuestion(q)));
```

**S3. `renderCapture()`**. On line 355 change the busy label to
`state.capturing ? (addons.isCropping() ? "Crop below, then send" : "Reading the question...") : ...`.
After line 360 (end of the health banner `if`), before line 361 `if (state.captureError) ...`:

```ts
  children.push(...addons.renderInCapture());
```

(`Child` at line 83 already allows `null`.)

**S2. `renderMain()`** (lines 283 to 294):

```ts
  const nodes: (Node | null)[] = [renderHeader(), ...addons.renderAboveCapture(), renderCapture()]; // line 284
  // after line 289 renderRuleCard(...):
    nodes.push(...addons.renderAfterRuleCard());
  // after line 291, before line 292 renderFooter():
  nodes.push(...addons.renderBottom());
  return nodes.filter((n): n is Node => Boolean(n)); // line 293
```

**S1. Imports.** After line 20 (end of the `./types` import):

```ts
import { createAddons } from "./addons";
import { normalizeQuestion } from "./addons/types";
```

## 4. Changes the merge needs inside the add-ons (files not edited in this pass)

- **index.ts `afterExplain`**: the signature change in S9.
- **index.ts review queue** (`DrillData`, `answerReview`, `renderReview`): a Math rule can come back as a
  grid-in drill (`format: "spr"`, `choices: null`). Today `d.question.choices[letter]` throws on it.
  Either render an input and post `{drillId, response}` after `parseSprEntry` (import it from
  `../../../src/lib/questions/spr`), or at least skip it:
  `if (!r.drill.question.choices) { r.error = "This one needs a typed answer. Use Test me on the card."; }`.
  Show `correctAnswer` when `correctLetter` is null, and `solution` steps if you like.
- **index.ts `beforeCapture` page check**: `qbtext.ts` only knows A to D answers, so on a grid-in page
  `answerRevealed` is always false and the "answer isn't showing yet" warning would block every capture.
  Guard it: `... && !read.parsed.answerRevealed && hasChoices(read.parsed.choices) && !isMathTaxonomy(read.parsed.domain, read.parsed.skill)`.
- **index.ts `afterExtract` cross-check**: skip `crossCheck` when `question.section === "math"`; the page
  text of a Math question (MathJax, figures) won't match the extracted LaTeX.
- **timer.ts**: the clock turns "over" at `TARGET_SECONDS` (71 s, Reading and Writing). Use
  `targetSecondsFor(host.getQuestion())` from stats.ts (95 s for Math). Same for the `${e.seconds}s`
  chip in index.ts (`e.seconds > targetSecondsFor(e)`).
- **Math rendering in add-on panels**: upstream renders LaTeX with `mathEl()` (line 111, KaTeX to
  MathML). The review drill, redo and flashcards show plain strings. Pass a renderer through the host
  (e.g. `renderMath?(text): Node` backed by `mathEl("span", text)`), or use `plainMath()` from export.ts.
- **welcome.html** copy says Reading and Writing only; add Math.
- **strategies.ts** has Reading and Writing skills only, so the strategy hint stays empty on Math. Fine.

## 5. background.ts

Upstream `background.ts` is unchanged from 0.2.0, so `INTEGRATION-background.diff` applies as is:

```ts
import { installBackgroundAddons } from "./addons/background"; // after line 2

// lines 11 to 27 become:
function captureTab(tab: chrome.tabs.Tab): void {
  // the old body of lines 13 to 26: sidePanel.open inside the gesture, then captureVisibleTab,
  // downscale, and chrome.storage.session.set({ pendingCapture })
}
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "capture" || !tab) return;
  captureTab(tab);
});
installBackgroundAddons({ captureTab });
```

## 6. manifest.json and build

- `permissions`: add `"scripting"` (page check and text capture read the Question Bank tab),
  `"contextMenus"` ("Capture this question with Rulecard" on Question Bank pages) and `"alarms"`
  (due-count badge every 30 minutes, daily reminder). Result:
  `["sidePanel", "activeTab", "storage", "scripting", "contextMenus", "alarms"]`.
- `"optional_permissions": ["notifications"]`, requested only when reminders are turned on.
- No new host permissions; the existing Question Bank hosts cover `scripting`.
- Welcome page: copy `extension/welcome.html` and `extension/welcome.css`, add
  `welcome: "extension/src/addons/welcome.ts"` to `entryPoints` in `scripts/build-extension.mjs`
  (it builds `dist/welcome.js`). `installBackgroundAddons` opens it on install.
- CSS: link `addons.css` from `extension/sidepanel.html` after `sidepanel.css`, or concatenate it at
  build time like `scripts/build-preview-extension.mjs` does.
- `scripts/check-extension.mjs` only adds `<all_urls>` to a test copy of the manifest and checks the
  worker; it needs no change.

## 7. Overlaps (don't build these twice)

- Drill `pick` class bug: fixed upstream (`renderDrill`, line 655 uses `picked`). Drop that hunk.
- Grid-in input and validation: upstream has `parseSprEntry` and the input in `renderPickPanel`
  (line 496). Reuse them; the add-ons don't validate typed answers.
- Steps and shortcut: upstream `renderRuleCard` shows them. The log keeps them only for export and the journal.
- Math rendering: upstream `mathEl()`/`renderMathHtml`. Prefer it over `plainMath()` in the panel.
- Text in, not pictures: `/api/extract` now takes `{text, source: "paste"}`. The add-on text capture
  still draws the page text to a PNG and sends that. A cheaper path is to add `processText(text)` to
  the host bridge and let `tryTextCapture` send the parsed text directly.
- `consumePendingQuestion` is a second way a question arrives; S13 covers it.
- Server-side grading: `isCorrect` is now stored on the attempt. The local log copies it into
  `result`; there is no need to grade locally.
- Keyboard: upstream has no global hotkeys (only per-input Enter handlers), so `hotkeys.ts` doesn't collide.

## 8. Math caveats

- Text capture falls back to a screenshot on Math pages, by design: `readQuestionBankPage` counts
  MathJax/MathML as media and `canTextCapture` requires four choices and no media. The parser has no
  Math taxonomy and no grid-in answers.
- Hotkeys 1 to 4 and A to D don't apply to grid-in (S14 ignores them); keys typed in the grid-in box are
  skipped by the hotkeys typing guard. G ("I got it right") still works because grid-in accepts `"correct"`.
- Log entries: grid-in entries have `format: "spr"`, empty `choices`, `picked: "correct"`, a placeholder
  `correct: "A"`, the answer in `typed` and the accepted answers in `accepted`. Read them with
  `isGridIn`, `answerText`, `responseText`, `sectionOf` (log.ts). Entries saved before 0.3.0 have none
  of the new fields and read as Reading and Writing multiple choice. `redo.ts` already skips grid-in.
- Stats: `Summary.bySection` (`rw`, `math`), per-section pace (71 s and 95 s), `pacing.target`.
- Exports: grid-in cards show the accepted and typed answers and no A to D list; Math cards add steps
  and the shortcut. Anki keeps `\( \)` LaTeX (Anki renders it); Markdown, the printable sheet and the
  copied card use `plainMath()`.
- Storage keys are unchanged (`rc.addons.log.v1`, `srs`, `prefs`, `timer`, `sets`); no migration.

## 9. Public repo check

Replaced with made-up questions: `extension/test/helpers.ts`, `extension/test/qbtext.test.ts`,
`demo/mock.ts`. Still containing College Board text, outside this pass: `demo/make-samples.ts` (one
stem override) and the generated `demo/samples/anki.csv`, `notes.md`, `study-sheet.html` (fix
make-samples, then regenerate). `demo/preview.js`, `.test-build/` and `extension/test/fixtures/local/`
are gitignored. The generic prompt "Which choice completes the text so that it conforms to the
conventions of Standard English?" is kept on purpose.
