# Chrome Web Store listing for Rulecard

Everything the Chrome Web Store developer dashboard asks for, ready to paste. Upload `rulecard-extension-0.9.1.zip`
from this folder (rebuild it with `pnpm package:extension` after changing `extension/`).

## Store listing tab

- **Name:** Rulecard
- **Summary (132 characters max):** Capture an SAT or ACT question on screen and get the answer plus the real rules behind it, in plain words.
- **Category:** Education
- **Language:** English
- **Description:**

  Rulecard explains SAT and ACT questions the simple way. Open a SAT Suite Question Bank PDF, a practice-test question you're reviewing in My Practice, or an ACT practice test, and press one button. The answer appears in about two seconds and the bullets right after, while Rulecard is still writing: the real rules behind the question, in plain words, instead of a long, confusing rationale. As many bullets as the question needs, no more.

  How it works:
  1. Open the question so the whole question and its answer choices are on screen: a Question Bank PDF, a missed question in My Practice after a Bluebook practice test, or a question from an ACT practice test (English, Math, Reading or Science).
  2. Click the Rulecard icon to open the side panel and press Capture this tab. (With the panel open, clicking the icon or pressing Alt+Shift+R captures too.)
  3. Read the answer and the bullets as they appear: the rule, said the way the best SAT and ACT cheat sheets say it, and how it picks the answer.
  4. Optional: tap the letter you picked (or type your grid-in answer) to see exactly why it's wrong. The letters work as soon as the answer shows, even before the card is finished.

  The bullets come from a rule library of over 300 rules: all 29 Digital SAT skills, and every part of the ACT (English, Math, Reading and Science), with the shortcuts and traps for each (Desmos moves, plugging in, transition words, punctuation rules, matrices and logarithms, reading graphs and experiments, and more). ACT questions keep the letters printed on screen (F G H J on even-numbered questions), and five-choice ACT Math questions work too.

  Math support: equations shown as real math notation, graphs and tables read from the screen, and grid-in answers checked by the official entry rules (fractions, decimals, every accepted form).

  Home is just the Capture button and your card. Everything else is one tap away:
  - Today's plan (at the bottom of Home): your due reviews, your weakest skills (with the exact Question Bank filters) and timed sets as your test date gets close.
  - Progress: an activity calendar, a skill map of all 29 official skills, the traps you fall for, and badges.
  - Practice: spaced review by rule, rule flashcards, Redo my misses, and a timed quiz from a pasted Question Bank export.
  - Words: a Words in Context word bank with a word quiz.
  - Exports: Anki deck, notes, a printable study sheet, an error log for Excel or Google Sheets, and backup and restore.

  Your reviews are saved to a free Rulecard account (email and password), so your history is there next time, in the extension and on the web app at rulecard.vercel.app.

  Rulecard is an independent study tool. It is not affiliated with or endorsed by College Board or ACT Education Corp. SAT is a trademark of College Board. ACT is a registered trademark of ACT Education Corp.

- **Graphic assets (all in this folder):**
  - Store icon (128x128): `store-icon-128.png` (96x96 artwork with 16px transparent padding, per Google's icon guidelines)
  - Screenshots (1280x800, 24-bit PNG, no alpha). Delete the old ones in the dashboard, then upload in this order:
    1. `screenshot-1-capture.png`
    2. `screenshot-2-sat-reading-and-writing.png`
    3. `screenshot-3-sat-math.png`
    4. `screenshot-4-act.png`
    5. `screenshot-5-study-plan.png`
  - Small promo tile (440x280): `small-promo-tile-440x280.png`
  - Marquee promo tile (1400x560): `marquee-promo-tile-1400x560.png`
  - Global promo video: optional, leave blank until there is a YouTube demo.
  - Regenerate all of these with `node scripts/store/panel-shots.mjs && node scripts/store/addon-shots.mjs && node scripts/store/compose-graphics.mjs`.
- **Homepage URL:** https://rulecard.vercel.app
- **Support URL:** https://github.com/ishaanshah101/sat-suite-bank-feedback-tutor/issues

## Privacy practices tab

- **Single purpose:** Help students learn from their SAT and ACT practice questions: when the student presses Capture, read the question on the tab they are looking at (a Question Bank PDF, a practice-test question, or an ACT practice question), and explain the answer in a few short rules, then help them practice those rules.
- **Permission justifications:**
  - `sidePanel`: the whole interface lives in Chrome's side panel next to the question.
  - `activeTab`: when the student clicks the Rulecard toolbar icon (or its shortcut) on a tab, take one screenshot of that tab so the question on it can be read. Only that tab, only then.
  - `scripting`: on My Practice (mypractice.collegeboard.org) only, when the student presses Capture, read the text of the open question dialog (question, choices, answer and rationale), which is more accurate than a screenshot for long passages. No other site is ever scripted.
  - `storage`: keep the student's sign-in token and study log on this device.
  - `alarms`: refresh the toolbar badge with the number of rules due for review, and schedule the optional daily study reminder.
  - Optional `notifications`: requested only when the student turns on the daily reminder in settings.
  - Host permission `rulecard.vercel.app`: the Rulecard server that reads the question and writes the explanation.
  - Host permission `mypractice.collegeboard.org`: read the open practice-test question when the student presses Capture on it.
  - Optional host permission `<all_urls>`: requested once, the first time the student presses Capture (Chrome's Allow box). It lets the Capture button screenshot the tab the student is looking at, only when pressed, so they don't have to click the toolbar icon first on every tab. Nothing is read in the background. The student can decline and click the toolbar icon instead.
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
