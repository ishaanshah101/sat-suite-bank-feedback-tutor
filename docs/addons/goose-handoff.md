# Rulecard add-ons: handoff for the integrator

**Read this first.** This folder holds raw, working, tested features built *alongside* the upstream
repo `ishaanshah101/sat-suite-bank-feedback-tutor`. Nothing here has touched upstream. Your job is the
integration: move what you want into upstream `extension/`, wire the hooks, and ship.

- **Where:** `~/Documents/Rulecard-Addons` (a local git repo; `git log` shows one commit per wave).
- **State at handoff:** `tsc --noEmit` clean, **150/150 tests pass** (`npm test`), and **22 preview
  scenarios run the real side panel with 0 console errors** (`node scripts/screens.mjs`).
- **Built against:** extension 0.2.0 (the patched copies in `reference/`), with every module made
  Math/grid-in aware for **upstream 0.3.0** (`main` @ `7cdf3fd`). The exact 0.3.0 hook spots, line by
  line, are in **`docs/UPSTREAM-0.3.0.md`**.
- **Design rule followed:** everything is additive and optional. Each feature has a settings toggle,
  all storage is local under `rc.addons.*.v1` keys, and no server change is required.
  (Text capture reuses `/api/extract`; review reuses `/api/drill` and `/api/drill/check`.)

---

## 1. Integration checklist (in order)

1. **Copy the modules:** `extension/src/addons/` (37 files) goes to upstream `extension/src/addons/`.
   `addons/types.ts` mirrors upstream `extension/src/types.ts` in its `Api*` block; you can replace that
   block with re-exports from `../types` (see UPSTREAM-0.3.0.md §2).
2. **Side panel hooks:** apply the 14 hook spots in **UPSTREAM-0.3.0.md §3** to upstream
   `extension/src/sidepanel.ts` (bottom of the file first, so line numbers stay valid). The 0.2.0
   version of the same patch is `INTEGRATION-sidepanel.diff` / `reference/patched/sidepanel.js`.
   In short:
   ```ts
   const addons = createAddons(ctx, host);           // ctx: AddonContext, host: HostBridge (index.ts)
   // capture():  if (!await addons.beforeCapture(tab)) return;
   //             const textImage = await addons.tryTextCapture(tab); if (textImage) { await processImage(textImage); return; }
   //             const image = await addons.transformImage(await downscale(raw)); if (!image) return; await processImage(image);
   // after /api/extract:     void addons.afterExtract(data.question);
   // after /api/explain:     void addons.afterExplain(data, picked, typedResponse);   // 0.3.0: pass "spr" + typed
   // after /api/drill/check: if (state.explained) void addons.afterDrillCheck(state.explained.attemptId, d.result.correct);
   // renderMain:  [renderHeader(), ...addons.renderAboveCapture(), renderCapture(), ...]
   //              question card: ...addons.renderQuestionExtras(q)   pick panel: ...addons.renderPickExtras()
   //              after the rule card: ...addons.renderAfterRuleCard()   before the footer: ...addons.renderBottom()
   //              inside the capture card: ...addons.renderInCapture()
   ```
3. **Background:** refactor the command handler body into `captureTab(tab)` and call
   `installBackgroundAddons({ captureTab })` (UPSTREAM-0.3.0.md §5, `INTEGRATION-background.diff`).
   This adds the Question Bank context menu, "Explain this question with Rulecard" on any site, the
   due-count toolbar badge, daily reminders and the welcome tab.
4. **Manifest and build** (§6): permissions `scripting`, `contextMenus`, `alarms`;
   `optional_permissions: ["notifications"]`; add `welcome: "extension/src/addons/welcome.ts"` to the
   build entry points; copy `extension/welcome.html` + `welcome.css`; link `extension/addons.css` after
   `sidepanel.css` (or concatenate it, as `scripts/build-preview-extension.mjs` does).
5. **Tests:** the suites in `extension/test/*.test.ts` use `node:test` + `node:assert/strict`.
   To run them under upstream vitest, change `import { test } from "node:test"` to
   `import { test } from "vitest"` (assert works unchanged) and fix the relative import paths.
   Real Question Bank fixture tests skip themselves when `extension/test/fixtures/local/` is absent.
6. **Leftovers inside the add-ons** (the only open items from UPSTREAM-0.3.0.md §4):
   - LaTeX in add-on panels (review drill, flashcards, redo, journal) shows as plain strings. Pass
     upstream's `mathEl()` through the host (e.g. `renderMath?(text): Node`) or use `plainMath()` from
     `export.ts`.
   - Everything else in §4 is **already done** in this repo: the `afterExplain(data, picked, typed)`
     signature, skipping grid-in drills in Review, the page-check and text-capture Math guards, the
     cross-check skip on Math, per-section timer pace (71 s R&W, 95 s Math), and the Math welcome copy.
7. **Don't build twice** (§7): upstream already fixed the drill `picked` class bug, has grid-in input
   and `parseSprEntry`, renders steps/shortcut, and has `mathEl()`. Drop those hunks.

---

## 2. Feature catalog (what, where, how it's wired)

All paths are under `extension/src/addons/` unless noted. "Wired" means `index.ts` (the controller
`createAddons`) already calls it; integrating the hooks in step 2 turns it on.

### Wave 1: core loop (commit 82615d2)

| Feature | What the student gets | Files | Wired via | Storage |
|---|---|---|---|---|
| Local attempt log | Every explained card saved on-device (rule, why, choices, timing, notes, stars, drills). Foundation for everything else. Math fields optional, old entries stay valid. | `log.ts` | `afterExplain` | `rc.addons.log.v1` (max 1500) |
| Spaced review by **rule** | Leitner boxes 1 to 6 (0/1/2/4/8/16/32 days; box 5 = mastered). A "Review N due rules" card runs fresh `/api/drill` questions per due rule. | `srs.ts`, `index.ts` (`renderReview`, `answerReview`) | `renderAboveCapture`, `startReview` | `rc.addons.srs.v1` |
| Progress dashboard | Accuracy, streak, 14-day chart, weakest skills/rules/difficulty, mastery, pacing vs test pace, insights, calibration table. | `stats.ts`, `progress.ts` | `renderBottom` | (derived) |
| Page check | On the Question Bank, reads the page text first: warns if the answer isn't revealed yet (saves a capture), then cross-checks the extracted question against the page. | `qbtext.ts` (`readQuestionBankPage`, `crossCheck`), `index.ts` (`beforeCapture`, `afterExtract`) | `beforeCapture`, `afterExtract` | none |
| Crop before send | Optional cropper on the screenshot before upload. | `crop.ts` | `transformImage` | prefs |
| Pacing timer | Clock between captures, turns amber over 71 s (R&W) / 95 s (Math); seconds saved per question. | `timer.ts` | `renderInCapture` | `rc.addons.timer.v1` |
| Keyboard shortcuts | 1 to 4 pick, C capture, G got it right, Enter explain, T test me, R review, / chat, Y copy card, ? help. | `hotkeys.ts` | installed in `ready` | prefs |
| Exports | Anki CSV, Markdown notes, printable study sheet (Save as PDF), JSON backup and restore, copy card as text. | `export.ts` | settings card | none |
| Background | "Capture this question with Rulecard" menu on Question Bank pages, toolbar badge with due-rule count (alarms), optional daily reminder notification, welcome tab on install. | `background.ts`, `welcome.ts`, `extension/welcome.html`, `extension/welcome.css` | `installBackgroundAddons` | reads log/srs/prefs |
| Settings | All toggles, daily goal, SAT date, reminder hour, text size (zoom). | `prefs.ts`, `index.ts` (`renderSettings`) | `renderBottom` | `rc.addons.prefs.v1` |

### Wave 2: capture quality and study habits (commit b79a652)

| Feature | What the student gets | Files | Wired via | Storage |
|---|---|---|---|---|
| Text capture | On Question Bank pages, the parsed page text is drawn to a clean PNG (OffscreenCanvas) and sent to the existing `/api/extract`. No screenshot and no icon click needed. Falls back to a screenshot on Math/media pages. | `qbtext.ts` (parser tolerant of PDF spacing quirks), `textcapture.ts` | `tryTextCapture` | none |
| Strategy cards | "How to attack this question type" for the 10 R&W skills, shown with the question. | `strategies.ts` | `renderQuestionExtras` | none |
| Practice sets | "Do 5/10/20": live progress strip, recap with accuracy, pace, minutes, rules to review. | `sets.ts`, `index.ts` (`renderSetStrip`, `renderRecap`) | `renderInCapture`, `renderAboveCapture` | `rc.addons.sets.v1` |
| Confidence calibration | Sure / Unsure / Guessed before explaining; stats show accuracy by confidence and "confidently wrong" misses. | `index.ts` (`renderPickExtras`), `stats.ts` | `renderPickExtras` | in log entries |
| Test-date countdown | Days to the SAT and a projection at this week's pace. | `stats.ts` (`countdown`), `progress.ts` | `renderBottom` | prefs.testDate |
| Share image | 1080x1350 progress PNG to download or share. | `share.ts` | Progress card + settings | none |
| Journal | Searchable list of saved cards with notes, stars, section filter, "review this rule". | `journal.ts` | `renderBottom` | in log entries |

### Wave 3: Math, offline practice, capture anywhere (commits f35bbf0, 266117b)

| Feature | What the student gets | Files | Wired via | Storage |
|---|---|---|---|---|
| Math / grid-in compatibility | Every module understands 0.3.0 Math: sections, grid-in entries (`format: "spr"`, typed and accepted answers), steps and shortcut in exports, per-section pace. | `types.ts`, `log.ts`, `stats.ts`, `export.ts`, ... | throughout | additive fields, no migration |
| Rule flashcards | Offline deck of due and weakest rules: flip, grade Again/Hard/Good (feeds the review schedule). | `flashcards.ts`, `practice-ui.ts` | Practice offline card in `renderAboveCapture` | srs |
| Redo my misses | Re-answer your own missed multiple-choice questions offline; tracks redo accuracy. | `redo.ts`, `practice-ui.ts` | same | `rc.addons.redo.v1` |
| Capture anywhere: selection | Select a question on any site, right-click, "Explain this question with Rulecard"; the panel lays the text out as an image and runs the normal flow. | `selection-bg.ts` (service worker), `selection.ts` (panel) | `installBackgroundAddons` + controller | `chrome.storage.session` `rc.addons.pendingSelection.v1` |
| Capture anywhere: paste / drop | "Paste a question" box: paste text or a screenshot, or drop an image file. | `paste.ts` | `renderInCapture` | none |
| Seen before | Banner when the question on screen is already in your log, with your old card. | `seen.ts` | `renderQuestionExtras` | none |
| Weekly report | Parent/tutor report (HTML to print, or text to paste): volume, accuracy, weak skills, rules mastered. | `report.ts` | settings card | none |

### Wave 4: coach (commit bb769fc)

| Feature | What the student gets | Files | Wired via | Storage |
|---|---|---|---|---|
| **Today's plan** | A daily checklist above Capture: (1) review the rules due, (2) N questions on the two weakest skills, from different domains, each with a suggested difficulty (step up to Hard after 80% on Medium, drop to Easy/Medium under 50%) and the exact Question Bank filter steps, (3) timed mixed sets that grow as the SAT date nears. Phases: build (>30 days), strengthen (15 to 30), sharpen (8 to 14), final week, day before (5-question warm-up, rest), test day (no new questions, checklist). Stats use only history before today so the plan doesn't reshuffle; today's work ticks the boxes. Start review / Open flashcards / Start a set buttons; Copy plan. | `plan.ts` (`buildPlan`, `renderPlan`, `planText`) | `renderAboveCapture` (`renderPlanCard` in index.ts) | none (reads log, srs, prefs) |
| **Badges** | 25 milestones: first card; 10/50/100/250/500 questions; 3/7/14/30-day streaks (longest ever, so they're never lost); 1/5/10/25 rules mastered; comeback (master a rule you missed twice); 5/25 review drills right; perfect set (5+); "sure means sure" (10 sure answers, 80%+ right); hard hitter; on the clock (25 at test pace); daily goal met; every R&W skill; every Math skill. Locked badges show progress ("36/50"). Toast when one is earned. First run backfills existing history quietly. | `achievements.ts` | `ready`, `afterExplain`, `answerReview`, flashcard grading, import; grid in `renderBottom` | `rc.addons.badges.v1` (`{id: earnedAt}`) |
| **Traps you fall for** | Sorts every miss into the kind of wrong answer that caught you (too extreme, not supported, half right, says the opposite, true but beside the point, wrong transition, comma splice, punctuation, agreement, tense, pronoun, modifier; Math: answered a different quantity, wrong setup, units/percent base, calculation slip; plus misread). Transparent weighted keyword rules over the card's "why your pick fails" text, gated by section/domain. Shows the top 4 with a tip for the biggest. | `traps.ts` (`classifyMiss`, `trapReport`, `renderTraps`) | `renderBottom` | none |
| Official SAT taxonomy | All 29 skills (10 R&W, 19 Math) with domains; tolerant matching ("Algebra: Linear functions", "ratios, rates & units", "vocab", "trig"); Question Bank filter steps. Use `normalizeSkill()` wherever skills are compared. | `taxonomy.ts` | used by plan, traps, badges | none |

New settings toggles in wave 4: **Today's plan** (`prefs.plan`) and **Badges** (`prefs.badges`), both on by default.

### Wave 5: Question Bank export quiz, skill map, word bank (commit after cd754ff, see `git log`)

| Feature | What the student gets | Files | Wired via | Storage |
|---|---|---|---|---|
| **Practice a Question Bank export** | Export questions from the official Question Bank as a PDF, select all, copy, paste. The box counts what it found ("Found 33 questions, 2 skipped") live while you paste. Start a 10/20/All question quiz, shuffled or in export order. One question at a time with a live clock (amber over 71 s R&W / 95 s Math), graded **offline with the export's own answer key**, the official rationale under each answer, keys 1 to 4 / A to D and Enter / Space, Esc to quit. Results: score, accuracy, average time against pace, questions over pace, minutes, a by-skill table (weakest first) and every miss with "Show the question" and **Explain with Rulecard**. That sends a clean render of the question through the normal `/api/extract`, preselects the wrong pick and explains it, while the quiz waits in a slim "Back to results" strip on top. The quiz's own time for that question goes into the log entry. Retry my misses. A quiz in progress survives closing the panel (the clock restarts on the open question). Tested on two real exports: 33/33 and 42/42 questions parsed. | `qbquiz.ts` (parser on top of `qbtext.ts`, quiz state machine, summary, storage), `qbquiz-ui.ts` (entry, quiz, results screens), `index.ts` (`renderQuizEntryCard`, `renderQuizSlot`, `setQuiz`, `pressQuizKey`, `explainQuizMiss`) | Entry: collapsed card in `renderBottom` after Progress. The running quiz and its results take over `renderAboveCapture` (like flashcards). Hotkeys via `hotkeyActions().raw`. `afterExtract` uses `state.quizSeconds` instead of a timer lap. | `rc.addons.qbquiz.v1` = `{active, history}` (history newest first, 20 kept) |
| **Skill map** | All official skills of the sections you practice (10 R&W tiles, plus 19 Math once you have Math cards), grouped by domain and colored by level: not yet, new (1 or 2 cards), then by accuracy under 50%, 50%+, 75%+, 90%+. A "slow" tag shows when your average time (3+ timed cards) is over pace. Click a tile for plain words ("Right on 4 of 7. Average 84 s, slower than the 71 s test pace.") and the exact Question Bank filter steps with a suggested difficulty. | `skillmap.ts` | `renderBottom` (collapsed card) | none (open state in module vars) |
| **Word bank** | Every Words in Context word from your own cards: the word, its meaning (first sentence of "why correct"), the passage sentence with the blank filled in and the word in bold, "Missed / you picked X", "seen N times". Search, a mix-ups line ("glowing" instead of "lukewarm"), and an Anki CSV export (front: the sentence with the word blanked out; back: "word : meaning"; tags rulecard, words_in_context, missed). | `vocab.ts` | `renderBottom` (collapsed card) | none |

New settings toggles in wave 5: **Question Bank export quiz** (`prefs.qbQuiz`, under Practice), and a new
**Coach** section holding Today's plan, **Skill map** (`prefs.skillMap`), **Word bank** (`prefs.wordBank`)
and Badges. All on by default. Styles for all three are in the "Wave 5" section at the end of `addons.css`.

---

### Wave 6 (raw modules, tested, NOT wired yet)

Built overnight on 2026-10-30. Each module is pure logic plus one render function, with 25 tests in `extension/test/wave6.test.ts`. None of them is imported by `index.ts` yet, and they have no CSS yet. The wiring recipe is in each file's header comment. You decide whether and how to wire them.

| Feature | Files | Suggested wiring | Storage |
|---|---|---|---|
| Word quiz ("Quiz me on my words"): 4-choice quiz from the Word bank, blank-the-sentence or match-the-meaning questions, your own past wrong picks as distractors, missed and weak words first | `wordquiz.ts`, `wordquiz-ui.ts` | Entry inside the Word bank card; running quiz replaces renderAboveCapture like the QB quiz; hotkeys via `wordQuizKey` | `rc.addons.wordquiz.v1` (per-word right/wrong/lastAt) |
| Activity calendar: 16-week GitHub-style heatmap against the daily goal, DST-safe, streaks, busiest day, best weekday | `calendar.ts` | `renderCalendar(activityModel(s.log, { now: Date.now(), dailyGoal: s.prefs.dailyGoal }))` in renderBottom after Progress | none |
| Error log export: tutor-style spreadsheet (CSV with BOM/CRLF for Excel, TSV for Google Sheets), formula-injection guard | `errorlog.ts` | Two buttons in Settings > Export next to "Anki deck (.csv)" (code in the file header) | none |

Needs: rc-wq-* and rc-cal-* CSS (not written), prefs toggles if you want them, and an Erase-data hook for `rc.addons.wordquiz.v1`. Test mode (a Bluebook-style timed module from a QB export) was planned but not started.

## 3. Storage keys (all local, nothing sent anywhere)

| Key | Area | Shape / owner |
|---|---|---|
| `rc.addons.log.v1` | local | `LogEntry[]`, newest first, max 1500 (`log.ts`) |
| `rc.addons.srs.v1` | local | `Record<ruleId, RuleSrs>` (`srs.ts`) |
| `rc.addons.prefs.v1` | local | `Partial<Prefs>`; missing keys fall back to `DEFAULT_PREFS` (`prefs.ts`) |
| `rc.addons.timer.v1` | local | `TimerState` (`timer.ts`) |
| `rc.addons.sets.v1` | local | `{active, recap}` (`sets.ts`) |
| `rc.addons.redo.v1` | local | `Record<attemptId, RedoAttempt[]>` (`redo.ts`) |
| `rc.addons.badges.v1` | local | `Record<badgeId, earnedAt>` (`achievements.ts`) |
| `rc.addons.qbquiz.v1` | local | `{active: QuizState \| null, history: QuizResult[]}` (`qbquiz.ts`); writes go through one queue |
| `rc.addons.pendingSelection.v1` | session | right-click selection handed from the worker to the panel (`selection-bg.ts`) |

"Erase local data" in settings wipes log, srs, redo, sets, badges and the quiz store.

## 4. Permissions

`scripting` (read Question Bank page text), `contextMenus` (both right-click items), `alarms` (badge
refresh every 30 min, daily reminder), optional `notifications` (requested only when the student turns
reminders on). No new host permissions.

## 5. How to see it running

```bash
cd ~/Documents/Rulecard-Addons
npm install              # once: esbuild, typescript, @types/chrome, @types/node
npm run typecheck        # tsc --noEmit
npm test                 # 150 tests (node:test); or: node scripts/run-tests.mjs extension/test/qbquiz.test.ts
npm run preview          # builds preview-extension/ (0.4.0, load unpacked in chrome://extensions) + demo/preview.js
python3 -m http.server 8765 &   # then open http://localhost:8765/demo/preview.html?s=coach
node scripts/screens.mjs # headless Chrome: every scenario -> demo/screens/<name>.png + console-error report
```

Preview scenarios (`?s=`): explain, screenshot, review, crop, help, pick, journal, settings, set,
setactive, empty, practice-flash, practice-redo, paste, seen, report, math, review-gridin, **coach**
(plan + traps + badges), **plan-final** (final-week plan), **badges** (earns "50 questions" live and
shows the toast), **quiz-entry** (paste box with the live count), **quiz** (a wrong answer with the
official explanation), **quiz-result** (3 of 5, pace, by skill, misses), **quiz-explain** (a miss sent to
Rulecard, explained, with the "Back to results" strip), **skillmap**, **wordbank**. The preview runs the real patched side panel on a mock `chrome.*` and a mock server
(`demo/mock.ts`); screenshots of each are in `demo/screens/`.

## 6. Repo map

```
docs/CLAUDE_HANDOFF.md      this file
docs/UPSTREAM-0.3.0.md      line-by-line hook map for upstream 0.3.0 (read with step 2)
docs/INVENTORY.md           generated: every module, line count, exports, tests, storage keys (node scripts/inventory.mjs)
docs/AGENT-CONTEXT.md       conventions used while building (CSS variables, style rules, no em dashes)
INTEGRATION-sidepanel.diff  the 0.2.0 side panel patch (model for the 0.3.0 hooks)
INTEGRATION-background.diff the 0.2.0 background patch (applies to 0.3.0 as is)
extension/src/addons/       all feature code (37 modules); index.ts is the controller
extension/addons.css        all add-on styles, upstream CSS variables only (works in dark mode)
extension/welcome.html/.css the install welcome page
extension/test/             11 suites, 150 tests; helpers.ts has made-up fixtures (no College Board text)
reference/v0.2.0/           the shipped 0.2.0 dist, for diffing
reference/patched/          0.2.0 dist with the hook calls added (what the preview runs)
preview-extension/          built, loadable 0.4.0 preview extension
demo/                       mock.ts (fake chrome + server), preview.html, screens/, samples/ (export samples)
scripts/                    run-tests, build-preview, build-preview-extension, screens, inventory
```

## 7. Known limitations and judgment calls

- **LaTeX in add-on panels** renders as plain text (see step 6).
- **Text capture** draws text to a PNG because 0.2.0's `/api/extract` only took images. 0.3.0 accepts
  `{text, source: "paste"}`, so a cheaper path is a `processText(text)` host method (UPSTREAM-0.3.0.md §7).
- **Traps** are keyword rules over the model's "why your pick fails" text, so their quality follows the
  card's wording. A server-side `trap` field on the card would be more accurate; `TrapId` is ready to
  receive one.
- **Today's plan** knows skills only from the local log. A student who practices elsewhere sees a
  sampler until Rulecard has history.
- **Perfect-set badge**: `sets.ts` keeps only the latest recap, so the badge is checked right when a
  set ends (already wired in `afterExplain`).
- **Badge backfill**: the first run after updating awards every badge the history already qualifies
  for, with no toast.
- **Printable sheet**: the extension CSP blocks inline `print()`, so the sheet shows a "Cmd/Ctrl+P,
  Save as PDF" hint.
- **Grid-in review drills** are skipped with a notice (no typed-answer drill UI in the add-ons yet);
  upstream's `parseSprEntry` plus an input would complete it.
- **QB export quiz**: the text is shown as pasted, so PDF word splits ("r ecent") stay; figures and
  tables aren't in copied PDF text; "Text 1 / Text 2" pairs are merged into one passage; grid-in
  questions are skipped (counted in "skipped"); skipped questions aren't in "Retry my misses". "Slow"
  uses 95 s for Math questions and 71 s for R&W. The misses list previews the passage, not the stem
  (R&W stems are all alike). `nextQuiz` ignores Enter until the question is answered. Explain with
  Rulecard costs one `/api/extract` and one `/api/explain` call, like a capture.
- **Skill map / word bank**: no storage; open state and search live in module variables. The word
  bank's sentence split is simple (handles Dr./initials); "most nearly means" questions have no blank,
  so they show the passage start. The Anki file name uses a UTC date (`stamp()`).
- `demo/samples/` were regenerated from made-up questions; the generic prompt "Which choice completes
  the text so that it conforms to the conventions of Standard English?" is kept on purpose.

## 8. Publishing note

The GitHub token connected to the coding agent is read-only (creating a branch or repo returns
`403 Resource not accessible by personal access token`), so this work lives only in this local git
repo. To publish it separately: `gh repo create rulecard-addons --private --source . --push`, or add a
remote and push. Nothing here should go into upstream `main` without review.
