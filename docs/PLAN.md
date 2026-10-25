# Build plan: SAT Question Bank feedback tutor (working name: Rulecard)

Written 2026-10-25 after a planning session with the owner (Ishaan). This file is the
contract for an autonomous overnight build. A fresh session should be able to execute it
end to end from this document plus `docs/research/brief.md` and `docs/research/findings.md`.

Read in this order: this file, then `docs/research/brief.md`, then skim
`docs/research/findings.md` for the topic you are implementing.

---

## 1. Context

Ishaan is a high-school senior studying for the Digital SAT Reading & Writing section
using College Board's official Question Bank (now at
`satsuiteeducatorquestionbank.collegeboard.org`). The official rationales are long,
confusing, and often explain things that do not matter. There is no way to say "I picked
C because X" and get feedback on the actual misconception. Most R&W questions, especially
Standard English Conventions, come down to a small number of learnable rules (for example:
two independent clauses can only be joined by a period, a semicolon, a comma plus FANBOYS,
a colon when the second clause explains the first, or a dash).

Goal: a small, seamless web app where he gets a question in with as little friction as
possible, says what he picked and why, and gets a rule-first explanation that is simpler
and more useful than College Board's, with a chat for follow-up and a light memory of which
rules he keeps missing. Not a bloated "AI study platform".

## 2. Decisions already made with the owner (do not re-ask)

| Topic | Decision |
|---|---|
| Lead input | A **Capture** button: browser share picker, owner picks the Question Bank tab once, each press grabs one still frame of that tab and sends it to the model. Nothing saved to disk. |
| Other inputs | Question Bank **PDF export** upload (bulk), **paste text**, **screenshot/photo upload** (lowest priority). Question-ID lookup via College Board's unofficial API: **not in v1** (fragile, scraping terms). |
| Scope | **Reading & Writing only.** Math later. |
| Device | Laptop/desktop browser (Chrome). Mobile must not break, but capture is desktop-only by nature. |
| Access | Live on the web, single user behind a **passcode**. Build it **auth-ready** (user_id everywhere, RLS on) so real accounts can be added later. |
| Memory | **Light memory**: every reviewed question saved with the rule it tested and what he picked; a "rules you keep missing" view; a browsable rule cheat sheet. No streaks, badges, dashboards, spaced repetition. |
| Explanation shape | **Rule first**: the one rule tested, why the right answer fits it, exactly why his pick breaks it, a one-line takeaway. Short by default; chat for more. |
| Follow-up check | **On demand only**: a "Test me" button writes one similar mini-question on the same rule. Never automatic. |
| AI backend | Provider-agnostic. Owner's stated order: OpenAI first, Anthropic as fallback when OpenAI runs out. In practice use whichever keys are present (see section 4). Automatic failover on quota/billing/auth errors. |
| Hosting | Vercel (Hobby plan, free). Owner thought Vercel required payment; it does not for Hobby. |
| Plan review | Owner said "I have full trust in you, don't show me the plan." Do not block on approvals. Deliver, then hand off. |

Decisions made on the owner's behalf (fine to change later, do not ask now):
- Working name **Rulecard**. The central artifact is a "rule card".
- Store the extracted question text (stem, choices, correct letter, official rationale) in
  the owner's private log so the history is reviewable. See the license risk in section 13;
  revisit before any multi-user or public version.
- Passcode is generated during the build, set as `APP_PASSCODE`, and given to the owner in
  the handoff. He can change it by editing the env var.

## 3. Repository and git rules

- Repo: `ishaanshah101/sat-suite-bank-feedback-tutor`. Work branch: `claude/wonderful-knuth-1clj6d`.
- Commit often with clear messages. Push with `git push -u origin claude/wonderful-knuth-1clj6d`
  (retry with backoff on network errors).
- **Never push to `main`** or any other branch without explicit permission. Deploy production
  directly from the work branch (section 11). Recommend a PR to `main` in the handoff.
- No secrets in the repo, ever. `.env*` in `.gitignore`. Ship `.env.example` with names only.
- Do not include model identifiers in commit messages, PR text or code comments.

## 4. Credentials and environment facts (names only, never values)

Verified on 2026-10-25 from the planning session's container:

- **OpenAI key**: stored as a *Network secret* in the Claude cloud environment for host
  `api.openai.com` (type Bearer). The proxy injects `Authorization` on requests from the
  container; the value is **not** available as an env var. Verified working: `GET /v1/models`
  200 (133 models) and a paid chat completion returned "ok". The key sees `gpt-6-luna`,
  `gpt-6-sol`, `gpt-6-astra`, `gpt-6.1-sol`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-4.1-mini`,
  `gpt-4o-mini`, and more. Balance is not readable with this key (needs `api.usage.read`).
- **Anthropic key**: the owner added it as a plain **environment variable** in the cloud
  environment at the end of the session. Expected name `ANTHROPIC_API_KEY`, but he may have
  named it differently: list env var *names* first (`env | cut -d= -f1 | sort`) and look for
  anything key-like. It was **not visible** in the planning session (env vars load at session
  start). **Test it first thing** with `GET https://api.anthropic.com/v1/models`
  (headers `x-api-key`, `anthropic-version: 2023-06-01`) and one tiny Messages call. Report
  pass/fail without printing the key.
- **Network**: outbound HTTPS goes through a proxy (`HTTPS_PROXY`, CA bundle
  `/root/.ccr/ca-bundle.crt`, notes in `/root/.ccr/README.md`). `api.openai.com` is reachable
  **only** through the proxy (secret injection). `api.anthropic.com` is in `NO_PROXY` and is
  reached directly. Node's `fetch` does not honor `HTTPS_PROXY` by default: for local OpenAI
  calls from Node, either route through an `undici` `ProxyAgent` with the CA bundle, or test
  OpenAI with curl and test the app's provider code against Anthropic. On Vercel there is no
  proxy and the SDK sends the key normally.
- **Vercel**: owner account `ishaanshah101-4212`, plan **hobby**, status active, default team
  `team_6PrRCfr1tg8jnoHL56xJtUkT` (scope slug `ishaanshah101-4212s-projects`). One existing
  project `athenianconnect` (leave it alone). GitHub import provider is connected
  (`importFlowGitNamespaceId` 123039113), so a Git-linked project should work. The Vercel MCP
  connection returned 403 for that team scope; `authorize_team_access` issued a consent link
  that the owner may or may not have approved. If project/deploy calls still 403, issue a new
  link with `mcp__Vercel__authorize_team_access` and put it in the handoff. There is **no**
  `VERCEL_TOKEN`; use the Vercel MCP tools, not the CLI.
- **Supabase**: org `lywhcrmsbfgnwbbpwebz` ("Ishaan's Org"), plan **free**. One existing
  project `pathways` (ref `oylvinkezjneemwcqhyz`, INACTIVE/paused). Do not touch it. Free plan
  allows two active projects, so creating one new project is fine. `create_project` needs the
  cost-confirmation flow even at $0.
- **GitHub**: the session has push access to the repo. Use `mcp__github__*` tools for PRs if
  needed; the `gh` CLI is not available in this environment.
- **Secret handling rule**: values set through MCP tool arguments (for example Vercel env vars)
  pass through the session transcript once. Acceptable for secrets the build generates
  (`APP_PASSCODE`, `SESSION_SECRET`, `CRON_SECRET`, `DATABASE_URL` with a generated password).
  For the owner's Anthropic key: set it in Vercel the same way only because no other
  autonomous path exists, and say so in the handoff with a one-line "rotate if you prefer".
  The OpenAI key value is unobtainable, so production OpenAI stays off until the owner adds
  `OPENAI_API_KEY` in the Vercel dashboard (free on Hobby; do not tick "Sensitive" if that is
  what showed him a paywall) or as a plain env var in the cloud environment.

## 5. Stack (versions verified in research; re-check with `npm view` before pinning)

- Next.js 16 (App Router, TypeScript, Turbopack default, `proxy.ts` replaces middleware and
  runs on Node). Tailwind v4. pnpm. Node 22 locally, Node 24 on Vercel.
- `ai@7`, `@ai-sdk/anthropic@4`, `@ai-sdk/openai@4`, `@ai-sdk/react@4`, `zod@4`.
  Use `generateText` + `Output.object` for extraction/explanation structured outputs (schemas
  use `.nullable()`, not `.optional()`); `streamText` + `createUIMessageStreamResponse` for
  chat; `useChat` with `DefaultChatTransport`. Never pass bare `"provider/model"` strings
  (they route to AI Gateway); always construct providers with `createAnthropic({apiKey})` /
  `createOpenAI({apiKey})`. Keep system text in `instructions`/`system`, never in `messages`.
- Before writing any Anthropic-specific code, load the `claude-api` skill (session rule) and
  confirm model IDs and pricing on the models overview page. Research says: Claude 5.5 models
  use native structured outputs and reject forced tool use; Sonnet 5.5 cannot disable
  thinking, Haiku 5.5 can.
- PDF parsing in the **browser**: `unpdf` (inlines the pdf.js worker) inside a Web Worker,
  dynamic import with `ssr: false`. Avoids Vercel's 4.5 MB body limit and worker-URL issues.
- Database: Supabase Postgres, accessed from the server with `drizzle-orm` + `postgres.js`
  over the Supavisor transaction pooler (port 6543, `prepare: false`). Reason: the Supabase
  MCP exposes publishable keys but not the secret key, and the anon key must never be used
  server-side without Auth. If an MCP tool for the secret key turns out to exist, supabase-js
  with the `sb_secret_` key in the `apikey` header is an acceptable alternative.
- Auth gate: `jose` HS256 cookie. Tests: `vitest` (unit), Playwright (e2e; Chromium is
  preinstalled at `/opt/pw-browsers/chromium`, do not run `playwright install`).

## 6. Models and provider chain

- Extraction (image or text to structured question): `claude-haiku-5-5` (vision, cheap,
  effort low/medium). OpenAI fallback: `gpt-5.4-mini` (or `gpt-6-luna` if docs confirm it is
  vision-capable and cheaper; the research brief lists gpt-6-luna at $0.10/$0.50 per MTok).
- Explanation, chat, "Test me": `claude-sonnet-5-5` with explicit effort. OpenAI fallback:
  `gpt-6-luna` or `gpt-5.4-mini`.
- One server module `lib/ai/providers.ts`: reads `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
  optional `AI_PROVIDER_ORDER` (default `openai,anthropic`), builds the ordered list of
  available providers. `withFailover(task)` tries providers in order; on HTTP 401/403/429
  (quota, billing, invalid key) or a provider-down 5xx it retries on the next provider and
  marks the failed provider cooled down for 10 minutes (in-memory per instance plus a row in
  `provider_status` so the health page can show it). Successful calls record the provider used.
- `/api/health` (behind the passcode): which keys are configured, last success/failure per
  provider, DB reachable, app version. The owner uses this to see "which provider is live".
- Images sent to models: downscale to long edge 1568 px, PNG or JPEG quality >= 0.85, image
  part before the text part. Anthropic limits: 10 MB per image, 32 MB per request.

## 7. Product spec

### Screens (keep it to these)
1. `/unlock` passcode page. Everything else redirects here without a valid cookie.
2. `/` **Review**: the main screen. Left/top: an input strip with four options in this order:
   **Capture tab**, **Upload PDF**, **Paste text**, **Upload image**. Below: the current
   question card(s). For PDF uploads, a compact list of parsed questions to pick from.
3. `/history`: list of reviewed questions (date, skill, rule, your pick, correct), click to
   reopen the card with its explanation and chat.
4. `/rules`: the rule cheat sheet, grouped by domain and skill, each rule showing a miss
   count ("missed 3 times"), sorted so the most-missed rules are at the top. This is the
   "rules you keep missing" view; do not build a separate dashboard.

### The question card flow
1. A question arrives (from any input) as a `ParsedQuestion` (section 8). Show stem, passage
   (collapsible if long), choices A to D, and metadata chips (domain, skill, difficulty) when
   known. If the correct answer is unknown (capture without the answer revealed), show a
   banner: "Reveal the answer on the Question Bank tab and capture again, or let me solve it
   (less reliable)". Solving without ground truth sets `answer_source = model` and the
   explanation must say so.
2. "Which did you pick?" four letter buttons plus "I got it right, but explain". Optional one
   line: "What was your thinking?" (free text, encouraged, not required).
3. **Explain** calls the explanation endpoint. Response renders as a rule card:
   - **Rule** (one line, with the rule ID's short name, linked to `/rules#id`)
   - **Why [correct] is right** (max 2 sentences)
   - **Why [your pick] fails** (max 2 sentences; names the specific trap)
   - **Kill the rest** (one line per remaining wrong choice, max 15 words each)
   - **Takeaway** (one line he could remember mid-test)
   Stream the text so it feels instant.
4. Below the card: chat input ("Ask about this question"). The chat has the question, the
   official rationale (if present), the rule card, and the student's stated reasoning in
   context. Streaming. Short answers by default.
5. **Test me** button: generates one new mini-question that tests the same rule in a fresh
   sentence (same format: stem, four choices, one correct). Student answers, gets a one-line
   check and, if wrong, a one-line fix. Not saved as a reviewed question; saved as a
   `drill` row for the miss count.
6. Everything is saved automatically (section 9). No "save" button.

### Capture (desktop Chrome/Edge)
- Feature-detect `navigator.mediaDevices.getDisplayMedia`; hide the button otherwise.
- First press: `getDisplayMedia({ video: { displaySurface: 'browser', width: { ideal: 3840 },
  height: { ideal: 2160 }, frameRate: { max: 5 } }, audio: false, selfBrowserSurface:
  'exclude', surfaceSwitching: 'include', monitorTypeSurfaces: 'exclude', preferCurrentTab:
  false })` with a fresh `CaptureController` per connect. Only ideal/max constraints (min and
  exact throw). Keep the stream alive in a hidden `<video>` that is playing.
- Each press after that: grab one frame via canvas `drawImage` after `await video.play()` and
  one `requestVideoFrameCallback`; optionally race `ImageCapture.grabFrame()` with a 1.5 s
  timeout as a fast path. Check `track.readyState === 'live'` and
  `track.getSettings().displaySurface === 'browser'` before each grab; listen for `ended`
  (the owner clicked "Stop sharing" or reloaded) and show **Reconnect**.
- Copy on the button: "Capture tab" first time, "Capture again" afterwards, with a small
  "sharing: <tab title if available>" indicator and a Stop link.
- The frame goes to `/api/extract` as a downscaled PNG/JPEG. Extraction returns the
  `ParsedQuestion`; if the rationale/answer panel is visible in the frame, the correct letter
  and official rationale are filled in too. Prompt the model to look for "Correct Answer" /
  "Choice X is the best answer" / the highlighted choice.
- Mobile/Safari/Firefox: show upload paths; a short note explains capture needs desktop Chrome.

### PDF export upload
- Parse entirely in the browser (Web Worker + unpdf), then POST the JSON list. Handles the
  "With correct answers and explanations" export. Port the regex approach from the existing
  reference script `/root/.claude/skills/synced/*/sat-mistake-review/scripts/parse_question_bank.py`
  (Question ID / Assessment-Test-Domain-Skill-Difficulty / Question / Answer / Correct Answer /
  Rationale) and extend it for the current layout: `Question ID:` with a colon, standalone
  `Question` and `Answer` labels, stray intra-word spaces, and exports where the
  "Correct Answer:" line is absent but the rationale says "Choice X is the best answer".
  Validate every parsed question (8-hex id, four choices, a correct letter from either
  source, rationale). Questions that fail validation are shown as "needs a look" and can be
  sent to the vision extractor by rasterizing that page in the worker.
- After upload, show the list; clicking a question opens its card. Bulk is not required for
  v1 beyond "pick one from the list" plus a "mark the ones I missed" checkbox mode that
  queues them in order.

### Paste text and image upload
- Paste: a textarea; the same text extractor (model) turns it into a `ParsedQuestion`.
- Image: file input accepting PNG/JPEG/WebP; same path as capture.

## 8. Data model (Postgres, Drizzle schema in `src/db/schema.ts`)

Conventions on every table: `id uuid primary key default gen_random_uuid()`,
`user_id uuid not null default '<OWNER_USER_ID constant>'` (no FK yet),
`created_at timestamptz default now()`, `updated_at timestamptz`, index on
`(user_id, created_at desc)`. Enable RLS on every table from day one with per-operation
policies `to authenticated using ((select auth.uid()) = user_id)`; the server connects as the
Postgres owner role, so RLS does not block it now. Cutover to real auth later is one UPDATE
of `user_id` plus adding the FK to `auth.users`.

- `questions`: `qb_id text` (8-hex, nullable), `source text` (capture | pdf | paste | image),
  `test text`, `domain text`, `skill text`, `difficulty text`, `stem text`, `passage text`,
  `choices jsonb` ({A,B,C,D}), `correct text` (A to D, nullable), `answer_source text`
  (official | model), `rationale text` (official, nullable), `raw jsonb` (extractor output).
  Unique on `(user_id, qb_id)` where `qb_id` is not null so re-captures reuse the row.
- `attempts`: `question_id`, `picked text` (A to D or `correct`), `reasoning text`,
  `explanation jsonb` (the rule card as returned), `rule_id text`, `provider text`,
  `model text`.
- `chat_messages`: `attempt_id`, `role`, `content text`.
- `drills`: `attempt_id`, `rule_id`, `question jsonb`, `picked`, `correct boolean`.
- `rule_stats` view (or query): per `rule_id` miss counts from `attempts` where
  `picked <> correct` plus `drills` where `correct = false`.
- `provider_status`: `provider text primary key`, `last_ok_at`, `last_error_at`,
  `last_error text`, `cooldown_until`.
- `unlock_attempts`: `ip text`, `created_at` (rate limiting the passcode page).

Type `ParsedQuestion` mirrors `questions` minus ids. Zod schema shared by the extractors and
the PDF parser.

## 9. AI layer details

- `POST /api/extract`: body is either `{ image: dataURL }` or `{ text }`. Returns
  `ParsedQuestion` via `Output.object`. Prompt: "This is a Digital SAT Reading and Writing
  question from the College Board Question Bank. Extract exactly..." Include a field
  `visible_answer_panel: boolean` and `correct` nullable. Never let the model invent a correct
  letter here; solving happens only in the explain step when `correct` is null and the user
  opted in.
- `POST /api/explain`: body `{ questionId, picked, reasoning }`. Server loads the question,
  picks the rule library slice for its skill (section 10), and asks for a structured rule card:
  `{ rule_id, rule_statement, why_correct, why_pick_fails, eliminations: [{letter, reason}],
  takeaway, confidence, solved_by_model: boolean }`. Stream it (use `streamText` with
  `Output.object` partial output if clean, otherwise `generateText` and render at once; the
  explanation is short so either is fine). System prompt principles: lead with the rule, no
  restating the passage, never more than two sentences per section, name the trap, use the
  student's stated reasoning to diagnose (misread vs rule gap vs careless), plain language a
  17-year-old would use, no jargon unless defined in the rule card, no em dashes.
- `POST /api/chat`: `streamText` with the question, rationale, rule card and attempt in the
  system prompt; messages from `useChat`. Persist both sides.
- `POST /api/drill`: generates one mini-question for a `rule_id`; `POST /api/drill/check`.
- `GET /api/health`: see section 6.
- `GET /api/cron/keepalive`: verifies `CRON_SECRET` with `timingSafeEqual`, runs one real
  query (select from `provider_status`), returns 200. Vercel cron once daily.

## 10. Rule library (the heart of the product; write it in `src/content/rules.ts`)

Each rule: `id`, `domain`, `skill`, `name` (3 to 6 words), `statement` (one sentence a
student can memorize), `spot_it` (how to recognize the question type), `test` (the quick
mechanical check), `trap` (the usual wrong-answer bait), `example` (one mini pair of
wrong/right). Rendered on `/rules` and injected into prompts for that skill only (plus a
general elimination block). The model must cite one `rule_id` from the list, or `GEN-*` if
none fits, and may propose a new rule name in `suggested_rule` for later curation.

Taxonomy (official, 4 domains, 10 skills): Information and Ideas (Central Ideas and Details;
Inferences; Command of Evidence), Craft and Structure (Words in Context; Text Structure and
Purpose; Cross-Text Connections), Expression of Ideas (Rhetorical Synthesis; Transitions),
Standard English Conventions (Boundaries; Form, Structure, and Sense).

Minimum rule set to ship (expand freely, keep each statement one sentence):

Boundaries (BND)
- BND-01 Two independent clauses: join only with period, semicolon, comma + FANBOYS, colon
  (second explains first), or dash. Comma alone = comma splice. Nothing = run-on.
- BND-02 Dependent clause first takes a comma after it; dependent clause second usually takes
  no comma (because/although/when/if/since clauses).
- BND-03 Colon must follow a complete sentence and introduces a list, example or explanation.
- BND-04 Semicolon joins two complete sentences or separates list items that contain commas.
- BND-05 Non-essential information is set off by a matching pair (two commas, two dashes, or
  parentheses); essential information gets nothing. Test: remove it, does the sentence still
  work and mean the same?
- BND-06 Never put one comma between a subject and its verb or a verb and its object.
- BND-07 Introductory phrase ends with a comma, then the subject it describes.
- BND-08 A sentence needs a finite verb: "-ing" or "to" forms alone make a fragment.
- BND-09 "Which/who" supplements take a comma before them; "that" clauses take none.
- BND-10 Question mark only for a direct question; an embedded question ends with a period.
- BND-11 Names and titles: "the author Toni Morrison" (no commas, name is essential) versus
  "Toni Morrison, the author, ..." (pair of commas, name is already known).

Form, Structure, and Sense (FSS)
- FSS-01 Subject-verb agreement: cross out prepositional phrases and interrupters, find the
  real subject, match number. "The number of X is", "a number of X are", "each/every/neither"
  singular, "A and B" plural.
- FSS-02 Pronoun agreement: singular noun takes it/its, plural takes they/their; the pronoun
  must have one clear antecedent.
- FSS-03 Verb tense stays consistent with the surrounding sentences unless a time word
  changes it; dates in the past take past tense.
- FSS-04 Modifiers: the noun right after an opening descriptive phrase must be the thing
  being described.
- FSS-05 Parallelism: items in a list or comparison share the same grammatical form.
- FSS-06 Possessives and plurals: its/it's, their/there/they're, whose/who's; apostrophe
  before s for singular owner, after s for plural owner.
- FSS-07 Comparisons compare like with like ("than that of", "than those of").
- FSS-08 Relative pronouns: who for people, which for things, where for places only.

Transitions (TRN)
- TRN-01 Decide the relationship between the two sentences before reading the choices:
  addition, contrast, cause to effect, example, restatement, sequence, emphasis, conclusion.
- TRN-02 Category words: addition (also, furthermore, moreover), contrast (however,
  nevertheless, in contrast, still), cause (therefore, thus, consequently, as a result),
  example (for example, for instance), restatement (in other words, that is), sequence
  (then, subsequently, meanwhile, finally), emphasis (indeed, in fact), concession
  (granted, admittedly). Two choices from the same category cannot both be right, so if two
  match, the relationship was misread.
- TRN-03 "For example" needs an actual example of the previous claim; "specifically" needs a
  narrowing; "similarly" needs a parallel case.

Rhetorical Synthesis (RHS)
- RHS-01 Underline the goal in the question (emphasize, compare, introduce, explain how,
  summarize for an audience). The right choice does that goal using only the notes;
  eliminate choices that do a different goal or use the notes for something else.
- RHS-02 Audience clue: "unfamiliar with X" means the choice must define or introduce X;
  "familiar with" means the choice can skip basics.

Words in Context (WIC)
- WIC-01 Cover the choices, predict a word from the sentence's own clue (contrast word,
  restatement, example), then match prediction to choices; check tone and part of speech.
- WIC-02 Beware the common-meaning trap: the tested word often uses a secondary meaning.

Text Structure and Purpose (TSP)
- TSP-01 Purpose asks why the author wrote it (verb first: to argue, describe, explain,
  question, illustrate); structure asks how it is built (claim then examples, question then
  answer, general to specific). Match the verb in the choice to what the text actually does.
- TSP-02 Underlined-sentence function: say what the sentence does for the sentences around
  it, not what it says.

Cross-Text Connections (CTC)
- CTC-01 Write each author's claim in five words; the right choice is true of both authors'
  positions, not just one.

Central Ideas and Details (CID)
- CID-01 The main idea is supported by the whole text; a detail is not a main idea.
- CID-02 Detail questions: find the line, paraphrase it, eliminate choices with words the
  text never supports (always, never, only, most).

Command of Evidence (COE)
- COE-01 Textual: identify the exact claim in the question; the right quotation or finding
  bears directly on that claim in the direction asked (support or weaken), not merely on
  the topic.
- COE-02 Quantitative: read the axis labels and units first; the right choice must be both
  true according to the table or graph and the piece that completes the sentence's logic.
  Eliminate "true but irrelevant" and "relevant but false".

Inferences (INF)
- INF-01 "Most logically completes" is a conclusion that follows from combining the stated
  premises; eliminate choices that add new information or overreach.

General (GEN)
- GEN-01 Extreme words (always, never, prove, impossible) are usually wrong on reading
  questions.
- GEN-02 Half-right is all wrong: a choice with one wrong clause is wrong.
- GEN-03 Answer the question asked, not a nearby question.

## 11. Security and the passcode gate

- `proxy.ts` (Node runtime) with a negative matcher (skip `/unlock`, `/api/cron/*`, static
  assets) verifies an HS256 JWT cookie (`jose`, httpOnly, secure, sameSite lax, 30 days,
  secret `SESSION_SECRET`). Redirect to `/unlock` on failure.
- `/unlock` Server Action: compare HMAC-SHA256 digests of the submitted passcode and
  `APP_PASSCODE` with `crypto.timingSafeEqual` (equal-length digests), rate limit via
  `unlock_attempts` (5 per 15 minutes per IP), set the cookie.
- `requireSession()` at the top of every Server Action and Route Handler. The proxy alone
  does not protect Server Functions.
- `CRON_SECRET` checked on the keepalive route. Headers: `Cache-Control: no-store` on all
  API routes. CSP is nice-to-have, not required for v1.
- Never enable system messages inside `messages`; keep all system text in `system`/
  `instructions` so pasted question text cannot inject instructions.
- HawkScan: the environment reports `HAWK_API_KEY=false`, so the DAST scan cannot run.
  Note this in the handoff instead of pretending.

## 12. Deployment steps (do them in this order)

1. Scaffold the app in the repo root (`pnpm create next-app` with TS, Tailwind, App Router,
   src dir). Commit.
2. Create the Supabase project with the MCP: org `lywhcrmsbfgnwbbpwebz`, name
   `rulecard`, region `us-west-1`, a generated strong DB password (keep it only in env vars).
   Wait for ACTIVE_HEALTHY. Apply the schema as a migration (`apply_migration`), enable RLS and
   policies. Build `DATABASE_URL` for the Supavisor transaction pooler (port 6543).
3. Build the app locally against that database. Run unit tests (PDF parser fixtures that
   mimic both export layouts, rule library integrity, provider failover with mocked errors)
   and Playwright e2e (unlock flow, paste flow with a stubbed extractor, PDF upload fixture,
   history and rules pages). Do one real model call per provider that has a key.
4. Create the Vercel project with the MCP, linked to the GitHub repo, framework Next.js,
   root directory `/`. If the MCP returns 403 for the team scope, call
   `authorize_team_access` and keep going with everything else; put the link in the handoff.
5. Set Vercel env vars for production and preview: `APP_PASSCODE`, `SESSION_SECRET`,
   `CRON_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY` (if available in this session),
   `AI_PROVIDER_ORDER=openai,anthropic`, `OWNER_USER_ID`. Leave `OPENAI_API_KEY` for the owner
   (section 4).
6. `vercel.json` with `crons: [{ path: '/api/cron/keepalive', schedule: '0 9 * * *' }]`
   (Hobby: once daily, production only).
7. Deploy **production from the work branch** (create a deployment with `target: production`
   from the branch's latest commit, or set the project's production branch to the work branch
   if the API allows). Do not push to `main`.
8. Smoke test the live URL with Playwright: unlock, health page shows DB ok and the providers,
   paste a question, get an explanation, chat once, `/rules` and `/history` render.
9. Write `docs/HANDOFF.md` and commit.

## 13. Risks and how to handle them

- **College Board terms**: the Educator Question Bank license restricts caching/reproducing
  questions and forbids scraping and test-prep business use. This is a personal, non-commercial
  study tool for one student, storing his own reviewed questions. Keep it that way; do not add
  the unofficial API; flag in the handoff that this must be revisited before multi-user or
  public use.
- **Supabase free-tier pausing** after about 7 days of inactivity: the daily cron keep-alive
  mitigates but is not guaranteed. Health page should detect a paused DB and show a one-line
  "database paused, open Supabase and click Restore" message rather than a blank error.
- **PDF layout drift**: parse both observed layouts, validate, and fall back to vision on
  failing pages.
- **Capture edge cases**: "Share this tab instead" retargets the stream silently (check
  `getSettings().displaySurface` each grab); reload kills the stream (offer Reconnect);
  a frame captured before the first paint is black (wait for `requestVideoFrameCallback`).
- **Model reads the wrong thing**: a frame can include two questions or a partially
  scrolled card. Extraction prompt says "the question whose answer choices are fully visible";
  the card shows what was extracted so the owner can see mistakes before explaining.
- **Cost**: Haiku for extraction, Sonnet for explanations, images downscaled; estimate under
  a cent per reviewed question.

## 14. Handoff deliverable (end of the build)

`docs/HANDOFF.md` plus a final chat message containing: the live URL, the passcode, a
30-second "how to use it" (open the Question Bank in another tab, click Capture tab, pick
that tab, miss a question, click Capture again, tap the letter you picked, read the rule
card), what was verified live, what was not, and the owner's morning list:
1. If a Vercel authorization link is pending, click it; then tell the session to redeploy.
2. Optional: add `OPENAI_API_KEY` in Vercel (Project, Settings, Environment Variables) to
   turn on the OpenAI provider in production; the app runs on Anthropic until then.
3. Optional: open a PR from `claude/wonderful-knuth-1clj6d` to `main`.
4. Rotate the Anthropic key later if he prefers, since it passed through the session once
   when it was set in Vercel.

## 15. Verification checklist (the build is not done until all are true)

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass locally.
- [ ] Playwright e2e passes locally against a dev server with a stubbed model.
- [ ] One real explanation produced with each provider that has a key, output matches the
      rule-card schema and cites a valid `rule_id`.
- [ ] PDF parser handles the fixture set (both layouts, missing "Correct Answer:" line,
      stray spaces) with 100% of fixture questions validated.
- [ ] Production deployment is live, passcode gate works, `/api/health` is green, cron is
      registered, a question can be pasted and explained on the live URL.
- [ ] No secret values in the repo, commit messages, or `docs/`.
- [ ] `docs/HANDOFF.md` written and committed; final message sent.
