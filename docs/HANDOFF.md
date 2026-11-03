# Rulecard handoff

Built overnight on 2026-10-25 from `docs/PLAN.md`. Live. Since 2026-10-30 it covers **both sections of the Digital SAT: Reading and Writing, and Math** (see the Math section below and `docs/MATH_PLAN.md`). Since 2026-10-26 anyone can create a free account (email and password, no Google sign-in); each account has its own saved history, shared between the web app and the Chrome extension.

## Where it is

| Thing | Value |
|---|---|
| Live app | https://rulecard.vercel.app (also `rulecard-ishaanshah101-4212s-projects.vercel.app`) |
| Accounts | Sign in or create an account at https://rulecard.vercel.app/signin or in the extension. Your history from before accounts belongs to whoever first creates an account with the old passcode (the `APP_PASSCODE` env var in Vercel) entered under "Used Rulecard with a passcode before?". Do that first. |
| Code | GitHub `ishaanshah101/sat-suite-bank-feedback-tutor`, branch `main` (work happened on `claude/vibrant-euler-a7y0s4`, merged through PR #1) |
| Vercel project | `rulecard` (id `prj_7wnHxsHjmOH15eIGeqRSPGmKMmAm`), team `ishaanshah101-4212s-projects`, Node 24, Hobby plan |
| Supabase project | `rulecard` (ref `ecidfvanammfndoudwua`), region us-west-1, org "Ishaan's Org", free plan |
| Database role | `rulecard_app` (owns the tables, connects through the Supavisor transaction pooler on port 6543) |
| Daily keep-alive | Vercel cron `0 9 * * *` hits `/api/cron/keepalive` so the free database stays awake |

## How to use it (30 seconds)

1. Open the SAT Suite Question Bank in one Chrome tab and work a question. Reveal the answer and explanation on that tab.
2. Open https://rulecard.vercel.app in another tab and sign in.
3. Click **Capture tab**. In Chrome's picker choose the **Chrome Tab** list, pick the Question Bank tab, check the preview, click Share. Nothing is recorded; one still picture is taken per press.
4. Tap the letter you picked (or "I got it right, but explain"), optionally type one line of your thinking, click **Explain**. For a Math grid-in question (no choices), type the answer you entered instead, the way the test accepts it (`7/2` or `3.5`, never `3 1/2`).
5. Read the rule card: the one rule tested, why the right answer fits it, why your pick breaks it, how to kill the rest, a takeaway. Math cards also show the worked steps and the fastest route (Desmos, backsolving, a pattern) when there is one.
6. Ask follow-ups in the chat under the card. Press **Test me** for a fresh mini-question on the same rule.
7. Next question: click **Capture again**. Everything is saved automatically. `History` lists every review; `Rules` is the cheat sheet, with the rules you keep missing at the top.

Other ways in: **Upload PDF** (the Question Bank export "With correct answers and explanations", parsed in your browser; pick one question or tick the ones you missed and review them in order), **Paste text**, **Upload image**.

## Accounts (added 2026-10-26)

- **Sign up / sign in:** `/signin` on the web, or the extension's side panel. Email + password (scrypt-hashed, at least 8 characters). No email verification and no password reset yet: a forgotten password means a new account.
- **Claiming your old history:** create your account with the old passcode in the "Used Rulecard with a passcode before?" box. Only one account can claim it. Until someone does, the old history stays where it was.
- **Limits:** each account gets `DAILY_AI_LIMIT` AI requests per rolling 24 hours (default 60; the account that claimed the old history has no limit). Sign-in is limited to 10 tries per 15 minutes per network address, new accounts to `SIGNUP_LIMIT_PER_HOUR` per address (default 20, since a whole school can share one address). Change either in Vercel env vars.
- **Account page:** `/account` shows the email and today's AI use, signs out, and deletes the account with all its data (needs the password).
- **Privacy policy:** `/privacy` (public, needed for the Chrome Web Store).
- **Extension ↔ web:** History and Rules buttons in the extension open the web app already signed in, through a one-minute code (`/api/auth/handoff`).
- **Old sessions:** passcode-era cookies and extension tokens stop working; everyone signs in once.
- **Verified on production (2026-10-26, commit 5f7b849):** 22 of 22 checks from a Vercel sandbox against https://rulecard.vercel.app: sign-in page, privacy page and the redirect are public; unknown account rejected; sign up; duplicate email refused; case-insensitive sign in; `/api/me`; paste → extract → explain with the real model (gateway, Gemini 2.5 Flash Lite, 4–6 s each); the recent list; a second account sees none of the first account's reviews and cannot drill its attempt (404); handoff link signs the browser in and lands on History, and refuses an off-site `next`; delete account needs the password, removes everything, and the old token stops working. The test accounts were deleted afterwards. Locally: 41 unit tests, 7 end-to-end tests and 15 of 15 extension checks in Chromium pass.
- **Database:** `0004_accounts.sql` is applied to Supabase. The Supabase advisor lists `users`, `ai_usage`, `unlock_attempts` and `provider_status` as "RLS enabled, no policy" (info level). That is intended: only the server's own database role reads them; the browser never talks to Supabase directly.

## SAT Math (added 2026-10-30)

- **Coverage:** the 4 official Math domains and 19 skills, the same labels the Question Bank uses. There are 66 Math rules, 2 to 5 per skill plus 4 strategy rules (MTH-01..04). The cheat sheet at `/rules?section=math` has its own tab.
- **Grid-ins** (student-produced responses, about a quarter of Math): the app checks what you typed against College Board's entry rules and grades it with code, not the model. Every accepted form counts (`3/17`, `.1764` and `.1765` for the same answer).
- **Equations and figures** render as real math (KaTeX to MathML) in the web app and the extension. Tables and graphs are read as a precise text description. Screenshots are still never stored.
- **Test me on Math:** a second, independent solve checks every drill before you see it. If the two disagree twice, you get "Could not double-check that question. Try again" instead of a possibly wrong question.
- **PDF exports:** Math blocks are detected and read with vision. Grid-in answers come from the "Correct Answer:" line.
- **Models:** Math uses a separate model setting with more thinking time. Optional overrides: `OPENAI_MATH_MODEL`, `ANTHROPIC_MATH_MODEL`, `GATEWAY_MATH_MODEL`. With no keys set, Math runs on the AI Gateway free tier like everything else; adding `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` is the best quality upgrade for hard Math.
- **Database:** `0005_math.sql` is applied to Supabase. Existing reviews read as Reading and Writing.
- **Verified on production (2026-10-30, commit 225ffe5):** `node scripts/check-production-math.mjs` passed 18 of 18 from a Vercel sandbox against https://rulecard.vercel.app with real model calls. It covers grid-in extraction and grading (right, wrong, and a refused mixed number), a Math multiple-choice card with steps and eliminations, a screenshot with a table, a verified drill, Math chat, a Reading and Writing regression check, and history across both sections. Locally: 74 unit tests, 8 end-to-end tests and 20 extension checks pass.

## Security review and hardening (2026-11-03, extension 0.6.0)

Six independent reviews (server auth and API, data layer, AI layer, extension core, extension add-ons, web client) were run over the whole codebase and every confirmed finding was fixed. The notable ones:

- **Database:** the Supabase pooler certificate is now verified against Supabase's published root CA (`src/db/supabase-ca.ts`, expires 2031-04-26; `DATABASE_SSL_INSECURE=1` is the escape hatch). Migration `0006_hardening.sql` (applied live): RLS on every tenant table, the public API roles (`anon`, `authenticated`) hold no table grants at all, and `user_id` has no default anywhere, so a missing one fails instead of filing a row under the owner. Every mutating query is scoped by `user_id` in the query layer, not just the route.
- **Accounts:** sign-in is limited per account (20 per 15 minutes) as well as per address, and a successful login no longer resets other accounts' counters; account deletion allows 5 password tries per 15 minutes; session tokens issued before an account was created are rejected; `SESSION_SECRET` must be at least 32 characters.
- **Handoff codes** (extension → web sign-in) can only be minted with a bearer token, are single-use, and never switch a browser that is already signed in as someone else.
- **Responses:** every page and API response carries a Content-Security-Policy, nosniff, frame denial, referrer and permissions policies, HSTS and COOP. Unexpected server errors, AI-provider errors and the health page no longer expose internal messages (full details stay in the server log; the owner account still sees the full health report). Postgres constraint errors map to 400/409, AI timeouts to 504.
- **AI cost and trust:** chat is capped at 24,000 characters and 30 messages per request, the Math drill verification loop has a 100-second budget, structured calls retry once at most, question fields have size caps, a pasted answer only counts as official when the pasted text actually shows one, stub mode cannot run on Vercel, and a transient "not available" from the gateway no longer blocks a model for the life of the instance.
- **Grading:** grid-in parsing normalizes every dash, rejects padded leading zeros, accepts "5.", and accepts an exact fraction when the listed answer is a rounded decimal. "I got it right" on a question whose answer is unknown is no longer graded as correct.
- **Extension:** custom servers must be HTTPS (localhost excepted); sign-out drops the custom-server permission and leftover captures; signing in as a different account wipes the previous student's local study data; requests and chat streams time out instead of hanging; captures are serialized; backup restore validates every field; the local log keeps itself under 4 MB; "Allow capturing on all sites" can be revoked from Settings; the pooled page read trusts only the top frame; no page hostname is drawn into capture images.
- **Web client:** the math splitter is linear (no hang on unclosed `\(`), KaTeX is 0.18.11 with `maxExpand`/`maxSize` limits, PDFs are capped at 40 MB / 400 pages / 5,000 text runs per page and never fall back to main-thread parsing after a timeout, error pages exist (`error.tsx`, `global-error.tsx`, `not-found.tsx`), the display-capture stream is released on failure, and inputs carry the server's length limits and labels.

- **Sessions (0.6.1):** signing out now revokes that token on the server (`revoked_sessions`, migration `0007_sessions.sql`, applied live), so a copy kept anywhere else stops working; the account page has **Sign out of all devices**, which refuses every token signed before that moment (`users.sessions_valid_from`). The extension calls the same sign-out endpoint.
- **Extension links (0.6.1):** a link from the extension opens a confirmation page (`/handoff`) and signs the browser in only when you press **Continue**; the form is accepted only from this site, and each code works once. So a link someone else sends can never plant their account in your browser.
- **Sign-in limits (0.6.1):** a right password no longer uses up the address's budget (a whole class may share one address), wrong guesses are refused before anything is written once the budget is spent, and the per-account cap is 60 per 15 minutes so a stranger cannot cheaply lock the real owner out. The caller's address is trusted only on Vercel (or with `RULECARD_TRUST_PROXY=1`).
- **Content-Security-Policy with a per-request nonce (0.6.1):** `src/proxy.ts` issues a fresh script nonce on every page request and Next.js stamps it on every script it emits, so an injected inline script cannot run (`'strict-dynamic'`, no `'unsafe-inline'` for scripts). All pages render per request (`dynamic = "force-dynamic"` in the root layout) so the nonce is always present. API responses carry `default-src 'none'`.

Verified after the changes: lint and typecheck clean, 290 unit tests, 10 of 10 Playwright tests (including checks that real pages load under the nonce policy with no console violations, that sign-out revokes the token, and that a handoff link needs one click and works once), 23 of 23 extension checks in Chromium, and the production Math check against the live site.

## Publishing the extension on the Chrome Web Store (only you can do this)

1. Register as a Chrome Web Store developer at https://chrome.google.com/webstore/devconsole with your Google account and pay the one-time $5 fee.
2. Click **New item** and upload `store/rulecard-extension-0.6.1.zip` from this repo (version 0.6.1: Reading and Writing plus Math, study tools in tabs, hardened). If the item already exists, open it, go to **Package**, click **Upload new package** and choose the new zip, then **Submit for review**.
3. Fill the tabs from `store/LISTING.md` (description, category, the five screenshots in `store/`, 1280×800, plus the two promo tiles, permission justifications, privacy policy URL `https://rulecard.vercel.app/privacy`).
4. Submit for review. Reviews usually take a few days. Choose **Unlisted** first if you want to share it by link before it is searchable.
5. To ship an update later: bump `version` in `extension/manifest.json`, run `pnpm package:extension`, upload the new zip.

Status (2026-11-03): 0.6.1 is uploaded to the store. The listing's extension id is `lhkjgpalkmpbpholdakoejpkhghplidi`, and `EXTENSION_IDS` in Vercel (Production and Preview) is set to exactly that id, so only the store build gets CORS headers on `/api`. An unpacked copy loaded from a folder has a different id and will be refused by the browser; to test unpacked, add its id to `EXTENSION_IDS` (comma separated) and redeploy, or pin the id with a `key` in the manifest. The owner has checked College Board's Question Bank terms and is satisfied that capturing is allowed.

## Your morning list

1. **AI: free tier only (since 2026-11-02).** At the owner's request the app never calls a paid key: `AI_DISABLED_PROVIDERS=openai,anthropic` is set in Vercel (Production and Preview), the stored Anthropic key value was wiped (the variable row remains with an empty value because Vercel cannot rename a sensitive variable), and no `.env` file in the repo or on the build machine carries the key. The key itself stays active at Anthropic because other projects use it; Rulecard simply has no copy of it. To re-enable a paid key later, set its real value and remove that provider from `AI_DISABLED_PROVIDERS`, then redeploy. History: Verified on production on 2026-10-25: with no API key set, the app falls back to Vercel AI Gateway on the account's free tier. The free tier blocks some models, so the app skips those and lands on one it may use (Google `gemini-2.5-flash` at the time of testing). Extraction, the rule card, chat and Test me all answered correctly. Optional upgrade for better or more reliable answers: add `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY`) in Vercel → project `rulecard` → Settings → Environment Variables (Production and Preview), then Redeploy. Your own key is always tried first. If the free gateway allowance ever runs out, Explain shows the gateway's message and that key fixes it.
2. Verified for you: the live database connection. `/api/ping` on production returns `db:true`. The project is served by the `aws-0-us-west-1` Supavisor cluster; the `aws-1` host (which the build first used) answers "Tenant or user not found". The cluster number cannot be derived from the region, so if you ever rebuild `DATABASE_URL`, copy the host from the Supabase dashboard (Connect → Transaction pooler).
3. Done: the work branch was merged into `main` through PR #1. Production deploys from `main`.
4. Optional: rotate secrets you want fresh. `APP_PASSCODE`, `SESSION_SECRET`, `CRON_SECRET` and the database role password were generated by the build and passed through the session once when they were set in Vercel. Changing `SESSION_SECRET` signs every browser and extension out. `APP_PASSCODE` now only matters for claiming the old history. To rotate the database password run `alter role rulecard_app password '...'` in the Supabase SQL editor and update `DATABASE_URL`.

## What was verified

- Unit tests (25): PDF parser on both export layouts (with and without the `Correct Answer:` line, stray intra-word spaces, print headers, questions spanning pages), rule library integrity, provider failover and cooldowns, session tokens and passcode comparison, the full data layer on PGlite including the miss-count view.
- End-to-end tests (5, Playwright against a production build with a stubbed model): passcode gate and redirects, wrong and right passcode, paste → explain → chat → Test me → history → rules, PDF export upload parsed in the browser, health and cron endpoints.
- Real model calls from the build container through OpenAI (`gpt-6-luna` for extraction, `gpt-6.1-sol` for the rule card, drill and chat): extraction, rule card, drill, drill check and streamed chat all worked, and the card correctly identified the nonessential-phrase rule on a test question.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` clean.
- An adversarial code review (five reviewers over the server, auth, client, PDF parser and AI layer, each finding checked by three independent verifiers) ran after the build. Everything it confirmed was fixed: the PDF "read with vision" fallback sent a source value the API rejected; provider failover ignored the SDK's retry wrapper, so quota and outage errors never fell over to the second provider; the passcode limiter skipped itself when the database was down and could be raced; sessions outlived a passcode change; a chat reply was dropped if the tab moved on mid-stream; an Explain result could overwrite a newer question; the "A." of a name initial in a passage was read as the first choice; wrapped stems, wrapped choices beginning with a letter, superscripts and repeated ID markers broke the parser; malformed history links crashed instead of 404ing; a drill could be answered twice; a model-worked answer was never saved; and more. Unit tests cover each parser case.
- Production deployment is live; `/unlock` renders from Vercel; the environment variables are set; the cron is registered from `vercel.json`.

## What was not verified

- **Tab capture on real desktop Chrome.** The build container has no display; the capture code follows the verified research (getDisplayMedia with the tab picker, hidden video + canvas grab, Reconnect on "Stop sharing"). Try it first thing; if the picker opens and a frame is extracted, it works.
- **A real Question Bank PDF export.** The parser was tuned on synthetic fixtures that mimic the two documented layouts. Upload one real export; anything it cannot parse shows up as "needs a look" with a "read page with vision" button.
- **Live database connectivity from Vercel**: verified. After switching `DATABASE_URL` to the `aws-0-us-west-1` pooler cluster, `/api/ping` on production reports `db:true`; the earlier `aws-1` host was rejected by Supavisor with "Tenant or user not found" (confirmed from a Vercel sandbox in the same region as the functions).
- **HawkScan** could not run: the environment reports no `HAWK_API_KEY`.

## Browser extension (Chrome side panel)

The same tutor, one click away from the Question Bank tab, no screen-share picker. Source in `extension/`, bundle committed in `extension/dist/`.

1. Open `chrome://extensions`, switch on **Developer mode**, click **Load unpacked**, pick the `extension` folder from a clone of the repo.
2. Pin Rulecard, click its icon: the side panel opens. Sign in or create an account (it keeps a 30-day token in extension storage). Recent reviews show under the Capture button.
3. On a Question Bank tab with the answer revealed, press **Capture this tab** (or `Alt+Shift+R`). Pick your letter, add a line of reasoning, **Explain**. Chat and **Test me** work exactly like the web app; History and Rules open the web app.
4. Chrome's rule for screenshots: an extension may read a tab only after you click its toolbar icon on that tab (or press its shortcut there), and that grant lasts until the tab navigates to another site. The Question Bank is a single-page app, so one click covers a whole session. If you would rather never think about it, press **Allow capturing on all sites** once in the panel.

How it works: `POST /api/auth/signin` or `/api/auth/signup` returns the same signed token the cookie carries; every API call sends it as `Authorization: Bearer`; the proxy answers CORS preflights only for `chrome-extension://` origins. Sign out in the panel forgets the token. Rebuild after editing `extension/src/` with `pnpm build:extension`; icons come from `pnpm icons:extension`.

Verified: `pnpm check:extension` loads the unpacked extension into headless Chromium against a local build and drives it end to end (service worker starts, unknown account rejected, account created, capture via `captureVisibleTab` → `/api/extract`, rule card with the rule name, streamed chat, Test me, the shortcut capture path, the recent-history list, History opening the web app signed in as the same account, sign out): 15 of 15 checks pass. The server side (token endpoint, bearer auth, CORS) was also exercised against production. Not automated: Chrome's native prompts, so the toolbar-icon `activeTab` grant and the "allow all sites" prompt were not clicked by a script; both are standard Chrome behaviour.

## Architecture in one screen

- Next.js 16 App Router, TypeScript, Tailwind v4, deployed on Vercel. `src/proxy.ts` checks a signed session (cookie, or bearer token from the extension) on every page and API route except `/signin`, `/privacy`, the sign-in/sign-up APIs, `/api/cron/*`, `/api/ping`. Accounts live in `src/lib/auth/accounts.ts`; tables `users` and `ai_usage` come from `0004_accounts.sql`.
- Data: Drizzle ORM over Postgres. Production uses Supabase through the transaction pooler; tests and local dev can use `DATABASE_URL=pglite://memory` (in-process Postgres). Schema in `src/db/migrations/0001_init.sql`; RLS policies and ownership in `0002_supabase_rls.sql` (already applied). Every row carries `user_id`, and every query filters by it, so accounts only ever see their own rows.
- AI: `src/lib/ai/providers.ts` builds the provider chain from `AI_PROVIDER_ORDER` (default `openai,anthropic`) and whichever keys exist, minus anything in `AI_DISABLED_PROVIDERS`, fails over on 401/402/403/429/5xx and cools the failed provider down for 10 minutes. Extraction, rule cards and drills use structured outputs; chat streams.
- Rule library: `src/content/rules.ts` (37 rules across the ten official Reading and Writing skills plus three general rules) and `src/content/math-rules.ts` (66 Math rules across the 19 official Math skills plus four strategy rules). The model must cite one id from the question's section; an unknown id, or one from the other section, falls back to a general rule (GEN-03 or MTH-02) and the model's suggestion is kept in `suggested_rule`.
- Inputs: capture (`src/lib/client/capture.ts`), PDF (`src/workers/pdf.worker.ts` + `src/lib/questions/pdf-parse.ts`, with a main-thread fallback and a vision fallback per page), paste, image.

## Running locally

```bash
pnpm install
cp .env.example .env.local   # DATABASE_URL=pglite://memory works with no database at all
pnpm dev
pnpm test        # unit
pnpm test:e2e    # Playwright, builds and starts the app with a stubbed model
```

## Risks to keep in mind

- College Board's Educator Question Bank license forbids caching or reproducing questions and any test-prep business use. It was built as a personal study tool. With accounts open to anyone and a public Chrome Web Store listing, each account stores the questions it captures. The student Question Bank (satsuitequestionbank.collegeboard.org) has its own terms; the owner read them on 2026-11-03 and found capturing for personal study is allowed. Keeping it free lowers the risk further.
- Supabase free projects pause after about a week without activity. The daily cron mitigates this; if it happens anyway, open the Supabase dashboard and click Restore, and `/health` will say so.
- Capture ends on a hard reload of the Rulecard tab (browser rule) and silently retargets if you click "Share this tab instead"; the app checks the surface type before each grab and offers Reconnect.
