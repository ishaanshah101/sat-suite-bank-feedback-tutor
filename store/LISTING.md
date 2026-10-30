# Chrome Web Store listing for Rulecard

Everything the Chrome Web Store developer dashboard asks for, ready to paste. Upload `rulecard-extension-0.3.0.zip`
from this folder (rebuild it with `pnpm package:extension` after changing `extension/`).

## Store listing tab

- **Name:** Rulecard
- **Summary (132 characters max):** Learn the one rule behind each SAT Reading & Writing and Math miss: capture a Question Bank question, get the rule, practice it.
- **Category:** Education
- **Language:** English
- **Description:**

  Rulecard turns every missed Digital SAT question, Reading and Writing or Math, into the one rule it tested.

  How it works:
  1. Open a question in the SAT Suite Question Bank and reveal the answer.
  2. Click the Rulecard icon to open the side panel, then press Capture (or Alt+Shift+R).
  3. Tap the answer you picked, or type the answer you entered for a Math grid-in question, and, if you like, one line about your thinking.
  4. Get a short rule card: the rule, why the right answer follows it, why your answer breaks it, and a one-line takeaway. Reading and Writing cards show how to rule out the other choices; Math cards add the worked steps and a shortcut, often in the built-in Desmos calculator.
  5. Ask follow-up questions, or press Test me for a fresh practice question on the same rule. Math practice questions are checked by an independent second solve before you see them.

  Math support: equations and expressions shown as real math notation, graphs and tables read and described, student-produced response (grid-in) answers checked by the official entry rules (fractions, decimals, and accepted forms), and a rule library covering all 19 official Math skills alongside the 10 Reading and Writing skills.

  Your reviews are saved to a free Rulecard account (email and password), so your history and the rules you keep missing are there next time, in the extension and on the web app at rulecard.vercel.app.

  Rulecard is an independent study tool. It is not affiliated with or endorsed by College Board. SAT is a trademark of College Board.

- **Screenshots (1280x800):** `screenshot-1-capture.png`, `screenshot-2-rule.png`, `screenshot-3-account.png`, `screenshot-4-math.png`
- **Store icon (128x128):** `../extension/icons/icon128.png`
- **Homepage URL:** https://rulecard.vercel.app
- **Support URL:** https://github.com/ishaanshah101/sat-suite-bank-feedback-tutor/issues

## Privacy practices tab

- **Single purpose:** Explain SAT Reading and Writing and Math practice questions the user captures from the current tab, and save the user's review history.
- **Permission justifications:**
  - `sidePanel`: the whole interface lives in Chrome's side panel next to the Question Bank tab.
  - `activeTab`: after the user clicks the toolbar icon or presses the shortcut, take one screenshot of that tab so the question can be read. Nothing is captured without that action.
  - `storage`: keep the user's sign-in token and the last capture on this device.
  - Host permission `satsuiteeducatorquestionbank.collegeboard.org`, `satsuitequestionbank.collegeboard.org`: capture the Question Bank tab with the shortcut without an extra click.
  - Host permission `rulecard.vercel.app`: the Rulecard server that reads the question and writes the explanation.
  - Optional host permission `<all_urls>`: only requested if the user presses "Allow capturing on all sites" in the panel, to capture questions on other sites without clicking the icon first.
- **Remote code:** No, the extension does not run remote code. All JavaScript is in the package.
- **Data usage, check:** Personally identifiable information (email address), Authentication information (password, sent once to sign in; only a token is stored), Website content (the screenshot of the captured tab and the question text).
- **Certify:** data is not sold to third parties, not used or transferred for purposes unrelated to the single purpose, not used for creditworthiness or lending.
- **Privacy policy URL:** https://rulecard.vercel.app/privacy

## Distribution tab

- **Visibility:** Public (or Unlisted to share by link first).
- **Regions:** All regions.
- **Pricing:** Free.
