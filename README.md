# Rulecard

A small web app and Chrome extension for reviewing Digital SAT questions, both Reading & Writing and Math, from
College Board's Question Bank. Anyone can create a free account (email and password); each account keeps its own history. Capture a question from the Question Bank tab, say which
answer you picked and why, and get a rule-first explanation plus a chat for follow-ups.

Math works the same way, plus grid-in answers, worked steps, shortcuts and verified practice questions.

See `docs/PLAN.md` for the full build contract, `docs/MATH_PLAN.md` for the Math design, and `docs/HANDOFF.md` for how to use it.

## Local development

```bash
pnpm install
cp .env.example .env.local   # fill in values
pnpm dev
```

## Scripts

- `pnpm dev` / `pnpm build` / `pnpm start`
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (vitest), `pnpm test:e2e` (Playwright)
- `node scripts/check-production-math.mjs`: an end-to-end check against the live app with real model calls (creates and deletes a throwaway account; `BASE=` targets another deployment)

## Browser extension

`extension/` is a Chrome (Manifest V3) side panel that talks to the deployed app with a bearer token instead of the cookie.
It captures the active tab with `chrome.tabs.captureVisibleTab` (no screen-share picker), sends the picture to `/api/extract`,
and then runs the same pick → explain → chat → Test me flow against the same database.

Install it unpacked:

1. `pnpm build:extension` (the bundle in `extension/dist/` is committed, so this is only needed after editing `extension/src/`).
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, choose the `extension/` folder.
3. Click the Rulecard toolbar icon to open the side panel and sign in or create an account (the server defaults to `https://rulecard.vercel.app`; another one can be set under "Use a different server").
4. On the Question Bank tab, click the Rulecard icon once (Chrome's `activeTab` grant), then press **Capture this tab** in the panel or the shortcut (default `Alt+Shift+R`, change it at `chrome://extensions/shortcuts`). The panel offers a one-time "allow all sites" button if you would rather skip the icon click.

`pnpm package:extension` writes `store/rulecard-extension-<version>.zip` for the Chrome Web Store; `store/LISTING.md` has the listing text and
`pnpm exec node scripts/store-screenshots.mjs` regenerates the screenshots.

`pnpm check:extension` (with the app running on `http://localhost:3100` in stub mode, as `pnpm test:e2e` starts it) loads the unpacked extension into Chromium and drives the whole flow.

Server pieces the extension relies on: `POST /api/auth/signin` and `/api/auth/signup` (email + password → token, rate limited per address),
`GET /api/attempts` (recent reviews), `POST /api/auth/handoff` (a one-minute code so History and Rules open the web app already signed in), bearer-token sessions in
`src/lib/auth/session.ts` and `src/proxy.ts`, and CORS for `chrome-extension://` origins on `/api/*` (the token is the real gate; CORS only lets the browser read the response).

