# Chrome Web Store listing for Rulecard

Everything the Chrome Web Store developer dashboard asks for, ready to paste. Upload `rulecard-extension-0.6.1.zip`
from this folder (rebuild it with `pnpm package:extension` after changing `extension/`).

## Store listing tab

- **Name:** Rulecard
- **Summary (132 characters max):** Learn the rules behind your SAT misses: open a Question Bank PDF or a missed practice-test question, get 1 to 3 clear rules.
- **Category:** Education
- **Language:** English
- **Description:**

  Rulecard is built for two places your SAT questions live: SAT Suite Question Bank PDF exports, and the missed questions of a Bluebook practice test in My Practice. It turns College Board's long, confusing explanations into the 1 to 3 rules you actually need, Reading and Writing or Math.

  How it works:
  1. In the SAT Suite Question Bank, export the questions you worked as a PDF (with answers and explanations if you can).
  2. Click the Rulecard icon to open the side panel, then Open your Question Bank PDF. The PDF is read on your computer.
  3. Pick a question by its ID, then tap the answer you picked (or type your grid-in answer).
  4. Get a short card, one of two kinds:
     - The PDF has the official explanation: Rulecard translates it into 1 to 3 plain rules. Nothing else.
     - The PDF has no answer or explanation: Rulecard explains the question simply, then gives the 1 to 3 rules.
     The longer detail (why your pick fails, the other choices, Math steps and a Desmos shortcut) is one tap away under More detail.
  Practice tests: after a Bluebook practice test, open a missed question in My Practice (mypractice.collegeboard.org), tick "Show correct answer and explanation", and press "Read my practice test question". Rulecard reads that question, your answer and the official rationale, and your pick is filled in for you.
  5. Ask follow-up questions, or press Test me for a fresh practice question on the same rule. Math practice questions are checked by an independent second solve before you see them.

  Math support: equations and expressions shown as real math notation, graphs and tables read and described, student-produced response (grid-in) answers checked by the official entry rules (fractions, decimals, and accepted forms), and a rule library covering all 19 official Math skills alongside the 10 Reading and Writing skills.

  The panel opens on Home: your PDF's questions, the rule card and today's plan. Everything else sits one tap away in the tab bar (Progress, Practice, Words, Settings).

  Study tools built in (they work offline, from a study log kept on your device):
  - Today's plan: a daily checklist with your due reviews, your two weakest skills (with the exact Question Bank filters) and timed sets as your test date gets close.
  - Spaced review by rule, rule flashcards, and Redo my misses.
  - Practice a Question Bank export: paste an exported Question Bank PDF and take it as a timed quiz graded with the official answer key, then explain any miss with Rulecard.
  - Progress, an activity calendar, a skill map of all 29 official skills, the traps you fall for, a Words in Context word bank with a word quiz, and badges.
  - A pacing timer (71 seconds Reading and Writing, 95 seconds Math) and keyboard shortcuts.
  - Exports: Anki deck, notes, a printable study sheet, a tutor-style error log for Excel or Google Sheets, a weekly report, and backup and restore.

  Your reviews are saved to a free Rulecard account (email and password), so your history is there next time, in the extension and on the web app at rulecard.vercel.app.

  Rulecard is an independent study tool. It is not affiliated with or endorsed by College Board. SAT is a trademark of College Board.

- **Graphic assets (all in this folder):**
  - Store icon (128x128): `store-icon-128.png` (96x96 artwork with 16px transparent padding, per Google's icon guidelines)
  - Screenshots (1280x800, 24-bit PNG, no alpha), upload in this order:
    1. `screenshot-1-reading-and-writing.png`
    2. `screenshot-2-math.png`
    3. `screenshot-3-grid-ins.png`
    4. `screenshot-4-test-me.png`
    5. `screenshot-5-study-coach.png`
  - Small promo tile (440x280): `small-promo-tile-440x280.png`
  - Marquee promo tile (1400x560): `marquee-promo-tile-1400x560.png`
  - Global promo video: optional, leave blank until there is a YouTube demo.
  - Regenerate all of these with `node scripts/store/panel-shots.mjs && node scripts/store/compose-graphics.mjs`.
- **Homepage URL:** https://rulecard.vercel.app
- **Support URL:** https://github.com/ishaanshah101/sat-suite-bank-feedback-tutor/issues

## Privacy practices tab

- **Single purpose:** Help students learn from their SAT practice questions: read the Question Bank PDF export the user opens, or the missed practice-test question the user opens in My Practice, turn the official explanation into the rules the student needs (or explain the question simply when there is none), and help them practice those rules.
- **Permission justifications:**
  - `sidePanel`: the whole interface lives in Chrome's side panel next to the Question Bank tab.
  - `storage`: keep the user's sign-in token and study log on this device, and the PDF the user opened for the rest of the browser session (in memory only, cleared on sign-out).
  - `scripting`: on My Practice (mypractice.collegeboard.org) only, when the user presses "Read my practice test question", read the text of the question dialog that is open (question, choices, the user's answer, the correct answer and the rationale). No other site is ever read.
  - `activeTab`: only for a practice-test question that has a graph or picture: after the user clicks the toolbar icon on that tab, take one picture of it so the graph can be read. Never used otherwise.
  - `alarms`: refresh the toolbar badge with the number of rules due for review, and schedule the optional daily study reminder.
  - Optional `notifications`: requested only when the user turns on the daily reminder in settings.
  - Host permission `rulecard.vercel.app`: the Rulecard server that reads the question and writes the explanation.
  - Host permission `mypractice.collegeboard.org`: read the open practice-test question when the user presses "Read my practice test question".
  - Optional host permission `https://*/*`: only requested if the user points the extension at their own Rulecard server in settings, for that one server's address.
- **Narrow page access:** Rulecard reads no web page except the My Practice question the user asks it to read. Its other input is a PDF file the user chooses.
- **Remote code:** No, the extension does not run remote code. All JavaScript is in the package.
- **Data usage, check:** Personally identifiable information (email address), Authentication information (password, sent once to sign in; only a token is stored), Website content (the text of the one question the user picks from their PDF or reads from My Practice, or for Math and graphs a picture of it).
- **Certify:** data is not sold to third parties, not used or transferred for purposes unrelated to the single purpose, not used for creditworthiness or lending.
- **Privacy policy URL:** https://rulecard.vercel.app/privacy

## Distribution tab

- **Visibility:** Public (or Unlisted to share by link first).
- **Regions:** All regions.
- **Pricing:** Free.
