# Chrome Web Store listing for Rulecard

Everything the Chrome Web Store developer dashboard asks for, ready to paste. Upload `rulecard-extension-0.8.1.zip`
from this folder (rebuild it with `pnpm package:extension` after changing `extension/`).

## Store listing tab

- **Name:** Rulecard
- **Summary (132 characters max):** Capture an SAT question on screen (a Question Bank PDF or a practice test) and get the answer plus the 2 or 3 rules behind it.
- **Category:** Education
- **Language:** English
- **Description:**

  Rulecard explains SAT questions the simple way. Open a SAT Suite Question Bank PDF, or a practice-test question you're reviewing in My Practice, and press one button. You get the answer and 2 or 3 short bullets with the real rules behind it, in plain words, instead of College Board's long, confusing rationale. Reading and Writing or Math.

  How it works:
  1. Open the question so the whole question and its answer choices are on screen: a Question Bank PDF, or a missed question in My Practice after a Bluebook practice test.
  2. Click the Rulecard icon to open the side panel and press Capture this tab. (With the panel open, clicking the icon or pressing Alt+Shift+R captures too.)
  3. Read the answer and the 2 or 3 bullets: the rule, said the way the best SAT cheat sheets say it, and how it picks the answer.
  4. Optional: tap the letter you picked (or type your grid-in answer) to see exactly why it's wrong.

  The bullets come from a rule library built for the Digital SAT: all 10 Reading and Writing skills and all 19 Math skills, with the shortcuts and traps for each (Desmos moves, plugging in, transition words, punctuation rules and more).

  Math support: equations shown as real math notation, graphs and tables read from the screen, and grid-in answers checked by the official entry rules (fractions, decimals, every accepted form).

  Home is just the Capture button and your card. Everything else is one tap away:
  - Plan: today's checklist with your due reviews, your weakest skills (with the exact Question Bank filters) and timed sets as your test date gets close.
  - Progress: an activity calendar, a skill map of all 29 official skills, the traps you fall for, and badges.
  - Practice: spaced review by rule, rule flashcards, Redo my misses, and a timed quiz from a pasted Question Bank export.
  - Words: a Words in Context word bank with a word quiz.
  - Exports: Anki deck, notes, a printable study sheet, an error log for Excel or Google Sheets, and backup and restore.

  Your reviews are saved to a free Rulecard account (email and password), so your history is there next time, in the extension and on the web app at rulecard.vercel.app.

  Rulecard is an independent study tool. It is not affiliated with or endorsed by College Board. SAT is a trademark of College Board.

- **Graphic assets (all in this folder):**
  - Store icon (128x128): `store-icon-128.png` (96x96 artwork with 16px transparent padding, per Google's icon guidelines)
  - Screenshots (1280x800, 24-bit PNG, no alpha). Delete the old ones in the dashboard, then upload in this order:
    1. `screenshot-1-capture.png`
    2. `screenshot-2-reading-and-writing.png`
    3. `screenshot-3-math.png`
    4. `screenshot-4-grid-ins.png`
    5. `screenshot-5-study-plan.png`
  - Small promo tile (440x280): `small-promo-tile-440x280.png`
  - Marquee promo tile (1400x560): `marquee-promo-tile-1400x560.png`
  - Global promo video: optional, leave blank until there is a YouTube demo.
  - Regenerate all of these with `node scripts/store/panel-shots.mjs && node scripts/store/addon-shots.mjs && node scripts/store/compose-graphics.mjs`.
- **Homepage URL:** https://rulecard.vercel.app
- **Support URL:** https://github.com/ishaanshah101/sat-suite-bank-feedback-tutor/issues

## Privacy practices tab

- **Single purpose:** Help students learn from their SAT practice questions: when the student presses Capture, read the question on the tab they are looking at (a Question Bank PDF or a practice-test question), and explain the answer in 2 or 3 short rules, then help them practice those rules.
- **Permission justifications:**
  - `sidePanel`: the whole interface lives in Chrome's side panel next to the question.
  - `activeTab`: when the student clicks the Rulecard toolbar icon (or its shortcut) on a tab, take one screenshot of that tab so the question on it can be read. Only that tab, only then.
  - `scripting`: on My Practice (mypractice.collegeboard.org) only, when the student presses Capture, read the text of the open question dialog (question, choices, answer and rationale), which is more accurate than a screenshot for long passages. No other site is ever scripted.
  - `storage`: keep the student's sign-in token and study log on this device.
  - `alarms`: refresh the toolbar badge with the number of rules due for review, and schedule the optional daily study reminder.
  - Optional `notifications`: requested only when the student turns on the daily reminder in settings.
  - Host permission `rulecard.vercel.app`: the Rulecard server that reads the question and writes the explanation.
  - Host permission `mypractice.collegeboard.org`: read the open practice-test question when the student presses Capture on it.
  - Optional host permission `<all_urls>`: requested only if Chrome refuses a capture because the student opened the panel on a different tab. It lets the Capture button screenshot the tab on screen, only when pressed. The student can decline and click the toolbar icon instead.
  - Optional host permission `https://*/*`: only requested if the student points the extension at their own Rulecard server in settings, for that one server's address.
- **Narrow page access:** Rulecard looks at a tab only when the student presses Capture (or clicks its toolbar icon), and only that tab, at that moment. It never reads pages in the background.
- **Remote code:** No, the extension does not run remote code. All JavaScript is in the package.
- **Data usage, check:** Personally identifiable information (email address), Authentication information (password, sent once to sign in; only a token is stored), Website content (a screenshot or the text of the one question the student captures).
- **Certify:** data is not sold to third parties, not used or transferred for purposes unrelated to the single purpose, not used for creditworthiness or lending.
- **Privacy policy URL:** https://rulecard.vercel.app/privacy

## Distribution tab

- **Visibility:** Public (or Unlisted to share by link first).
- **Regions:** All regions.
- **Pricing:** Free.
