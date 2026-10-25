# Rulecard

A small, single-user web app for reviewing Digital SAT Reading & Writing questions from
College Board's Question Bank. Capture a question from the Question Bank tab, say which
answer you picked and why, and get a rule-first explanation plus a chat for follow-ups.

See `docs/PLAN.md` for the full build contract and `docs/HANDOFF.md` for how to use it.

## Local development

```bash
pnpm install
cp .env.example .env.local   # fill in values
pnpm dev
```

## Scripts

- `pnpm dev` / `pnpm build` / `pnpm start`
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (vitest), `pnpm test:e2e` (Playwright)

## Browser extension

`extension/` is a Chrome (Manifest V3) side panel that talks to the deployed app with a bearer token instead of the cookie.
It captures the active tab with `chrome.tabs.captureVisibleTab` (no screen-share picker), sends the picture to `/api/extract`,
and then runs the same pick → explain → chat → Test me flow against the same database.

Install it unpacked:

1. `pnpm build:extension` (the bundle in `extension/dist/` is committed, so this is only needed after editing `extension/src/`).
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, choose the `extension/` folder.
3. Click the Rulecard toolbar icon to open the side panel, enter the server (default `https://rulecard.vercel.app`) and the passcode.
4. On a Question Bank tab, press **Capture this tab** or the shortcut (default `Alt+Shift+R`, change it at `chrome://extensions/shortcuts`).

Server pieces the extension relies on: `POST /api/token` (passcode → token, same rate limit as `/unlock`), bearer-token sessions in
`src/lib/auth/session.ts` and `src/proxy.ts`, and CORS for `chrome-extension://` origins on `/api/*` (the token is the real gate; CORS only lets the browser read the response).

