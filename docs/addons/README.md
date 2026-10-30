# Extension add-ons (0.4.0)

The study tools around the core "explain the rule" flow live in `extension/src/addons/`. goose wrote the raw
modules (its brief is `goose-handoff.md`, the original hook map is `goose-upstream-0.3.0.md`). Claude reviewed them,
fixed what follows, wired them into the 0.3.0 side panel and shipped them as extension 0.4.0.

## How it plugs in

- `extension/src/addons/index.ts` exports `createAddons(ctx, host)`. `extension/src/sidepanel.ts` creates it once
  (bottom of the file) and calls its hooks: `beforeCapture`, `tryTextCapture`, `transformImage` (capture),
  `afterExtract` (processImage and pendingQuestion), `afterExplain`, `afterDrillCheck`, and the render slots
  `renderAboveCapture`, `renderInCapture`, `renderQuestionExtras`, `renderPickExtras`, `renderAfterRuleCard`,
  `renderBottom`.
- `extension/src/background.ts` pulls the capture body into `captureTab(tab)` and calls
  `installBackgroundAddons({ captureTab })`: right-click items, due-count badge, optional reminder, welcome tab.
- Styles: `extension/addons.css`, linked after `sidepanel.css`. Welcome page: `extension/welcome.html` and
  `welcome.css`, built from `extension/src/addons/welcome.ts`.
- Every feature has a toggle under Export & settings (`prefs.ts`). All add-on data stays on the device under
  `rc.addons.*.v1` keys in `chrome.storage.local`. Nothing new is sent to the server.
- New permissions: `scripting`, `contextMenus`, `alarms`, optional `notifications`. Justifications are in
  `store/LISTING.md`.

## What changed from goose's raw version

- Local log: every write goes through one queue (no lost note or drill when two saves overlap), and every read
  and restore drops malformed entries and drill records, so a bad backup file can't break the panel.
- `afterExplain`, `afterDrillCheck` and quiz saves catch storage errors instead of leaving rejected promises.
- Privacy: the right-click selection image names only the site, never the tab title (it can be an email subject).
- Notes: typing in a note no longer reverts when the panel re-renders inside the save delay.
- Keyboard: Enter and Space on a focused button keep their normal behaviour.
- Welcome page: "Open the side panel" keeps the click's user gesture.
- Printable sheet and image blob URLs are revoked after a minute.
- Wave 6 wired in: the activity calendar (under Progress), the error log export (Excel CSV and Google Sheets),
  and "Quiz me on my words" inside the Word bank, with styles, a settings toggle and Erase data support.
- Tests moved to `tests/unit/addons/` and run under vitest with the rest (`pnpm test`).

## Checks

- `pnpm typecheck`, `pnpm lint`, `pnpm test` (add-on suites included).
- `BASE=http://localhost:3100 node scripts/check-extension.mjs` drives the real panel against a local server.
- `node scripts/store/addon-shots.mjs` loads the extension with a made-up history and screenshots the add-on
  screens, failing loudly on console errors.

## Known limits (from goose, still true)

- Traps are keyword rules over the card's wording; Today's plan only knows skills from the local log.
- The Question Bank export quiz skips grid-in questions and figures, and PDF text can split words.
- Review drills skip grid-in rules (use Test me on the card for those).
