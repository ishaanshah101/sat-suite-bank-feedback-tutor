# Research brief (verified 2026-10-25)

Produced by a research + adversarial fact-check pass before the build. Use only findings marked confirmed or corrected.

## Confirmed constraints

- Tab capture is Chrome/Edge desktop only; Firefox and Safari share windows or screens, iOS 27 whole screen only. https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/MediaDevices.json
- getDisplayMedia needs HTTPS and a click handler; permission cannot persist, so a hard reload ends capture, but re-grabbing frames never re-prompts. https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/screen_capture_api/using_screen_capture/index.md
- Only ideal/max constraints (min, exact, advanced throw TypeError). CaptureController is single use; setFocusBehavior must run in the same microtask; valid values are focus-capturing-application, focus-captured-surface, no-focus-change. https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/modules/mediastream/capture_controller.cc
- Region and Element Capture are self-capture only; crop on your own canvas. https://raw.githubusercontent.com/screen-share/element-capture/main/index.html
- Chrome's tab pane shows favicon plus title rows with one preview, not live thumbnails; tab capture needs no macOS Screen Recording permission. https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/media/webrtc/display_media_access_handler.cc
- The bank moved to satsuiteeducatorquestionbank.collegeboard.org; the modal title is "Question ID: xxxxxxxx" (8 lowercase hex) and navigation never changes the URL. https://satsuiteeducatorquestionbank.collegeboard.org/help
- The "With correct answers and explanations" PDF is text-based with Assessment/Test/Domain/Skill/Difficulty, answer and rationale, no 20-question cap. Current exports use "Question ID:" with a colon, standalone "Question" and "Answer" labels, and sometimes no "Correct Answer:" line; the text layer has stray intra-word spaces and TextItem fontSize reads about 0.1 x point size. https://raw.githubusercontent.com/iamraging123/module-builder/main/app.js
- Official R&W taxonomy: four domains, ten skills (Command of Evidence is one skill); difficulty Easy/Medium/Hard. https://satsuite.collegeboard.org/k12-educators/about/alignment/reading
- EQB license is "classroom teaching and internal reporting only" with no right to "cache, reproduce" questions; Student Legal Terms forbid scraping and test-prep business use. https://satsuite.collegeboard.org/k12-educators/educator-experience/student-data-privacy-agreement
- pdfjs-dist 6.4.299 is ESM-only, Node >=22.13.0, worker version must match exactly; unpdf 1.9.x inlines the worker. https://registry.npmjs.org/pdfjs-dist/6.4.299
- ai@7.0.153 is ESM-only, Node >=22, zod ^3.25.76 || ^4.1.8; generateObject and result.toUIMessageStreamResponse() are deprecated, not removed; system messages inside messages are rejected by default. https://registry.npmjs.org/ai
- Anthropic 5.5 models reject forced tool use and use native structured outputs; Sonnet 5.5 cannot disable thinking, Haiku 5.5 can at effort up to high. https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data
- claude-sonnet-5-5 $2/$10, claude-haiku-5-5 $0.10/$0.50, gpt-6-luna $0.10/$0.50 per MTok; all accept images, Claude models also accept PDFs. https://platform.claude.com/docs/en/models/overview
- Vision: 10 MB per image, 32 MB per request; raw 1080p costs 2,691 tokens versus 1,560 at long edge 1568 px; heavy JPEG compression hurts text. https://platform.claude.com/docs/en/build-with-claude/vision
- Vercel Hobby: 4.5 MB body (413), 300 s max duration (504), cron once daily with ±59 min jitter, production only; Node 24.x default, 20 deprecated 2026-10-01. https://vercel.com/docs/functions/limitations
- Next.js 16.4.3: Turbopack default, middleware renamed proxy, proxy runs Node only. https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- Supabase Free: two active projects, paused after about 7 days of low activity, 1-year restore window. https://supabase.com/docs/guides/platform/free-project-pausing
- sb_secret_ keys bypass RLS, go in the apikey header (not Bearer), refuse browsers; legacy keys retire end of 2026. https://supabase.com/docs/guides/api/api-keys
- timingSafeEqual needs equal byte length; crypto.argon2 needs Node >=24.7.0. https://nodejs.org/api/crypto.html

## Decisions

- Capture method: getDisplayMedia with video {displaySurface:'browser', width ideal 3840, height ideal 2160, frameRate max 5}, audio false, selfBrowserSurface 'exclude', surfaceSwitching 'include', monitorTypeSurfaces 'exclude', a fresh CaptureController per connect; feature-detect and show upload paths elsewhere. Only Chromium offers a tab pane.
- Frame grab: hidden playing video plus canvas drawImage after await play() and one requestVideoFrameCallback; grabFrame only as a 1.5 s timeout-raced fast path. Canvas cannot hang; grabFrame timing is unspecified.
- PDF parsing: in the browser (use client, dynamic ssr:false, unpdf inside a Web Worker), send parsed JSON to the server. Avoids the 4.5 MB cap and Turbopack worker-URL issues.
- AI SDK: ai@7, @ai-sdk/anthropic@4, @ai-sdk/openai@4, @ai-sdk/react@4, zod@4; generateText + Output.object (schemas use .nullable()) for extraction; streamText with instructions plus createUIMessageStreamResponse(toUIMessageStream({stream: result.stream})) for chat; useChat + DefaultChatTransport. The result stream methods are deprecated.
- Models: claude-haiku-5-5 at effort low/medium for extraction, claude-sonnet-5-5 with explicit effort for explanations and chat, gpt-6-luna as OpenAI fallback. Cheapest confirmed vision-capable options.
- Provider switching: one server module, createAnthropic({apiKey}) when ANTHROPIC_API_KEY is set else createOpenAI({apiKey}); never bare "provider/model" strings, which route to AI Gateway.
- Database: Supabase Free via supabase-js with sb_secret_ server-side; daily Vercel cron (0 9 * * *) hits /api/cron/keepalive, checks CRON_SECRET with timingSafeEqual, runs real queries. HTTPS to PostgREST avoids pooler and IPv6 issues; plain Postgres schema keeps Neon as a connection-string swap.
- Passcode gate: proxy.ts (Node) with a negative matcher verifies a jose HS256 cookie (httpOnly, secure, sameSite lax, 30 days); /unlock Server Action compares HMAC-SHA256 digests with timingSafeEqual; requireSession() at the top of every Server Action and Route Handler; one Hobby WAF rate-limit rule plus an unlock_attempts table. Proxy alone does not protect Server Functions.
- Schema: every table has id uuid, user_id uuid not null default OWNER_USER_ID (no FK yet), created_at, updated_at, index (user_id, created_at desc); RLS on from day one with per-operation policies to authenticated using (select auth.uid()) = user_id; store question id, taxonomy codes, pick, correct letter, rule label, explanation and source, not full question text. Cutover is one UPDATE plus adding the FK.

## Risks and mitigations

- License: storing or sending question text may count as caching or reproducing. Store minimal data, personal non-commercial use only, revisit before any multi-user or paid version.
- Supabase pause: the keep-alive is not guaranteed. Keep the owner email current, detect a paused project in the UI, restore via POST /v1/projects/{ref}/restore and poll for RESTORING or RESTORE_FAILED.
- PDF layout drift: two label layouts observed. Parse both, validate each question (8-hex id, four A to D lines, key or "Choice X is the best answer", rationale), rasterize failing pages for a vision fallback.
- Capture retargets silently on "Share this tab instead" and dies on reload. Check readyState and getSettings().displaySurface per capture, listen for ended, offer Reconnect.
- Text legibility and cost: downscale to long edge 1568 px, PNG/WebP or JPEG at 0.85 or higher, image part before text.
- Large PDFs for the model: above 4 MB, upload to Supabase Storage and pass a signed URL as the file part (Anthropic receives a url source).
- Unofficial qbank-api endpoints breach scrape terms and may break: skip in v1, or server-side only, cached, under 3 rps, labelled unofficial.
- Prompt injection: never enable allowSystemInMessages; keep system text in instructions.

## Must verify at implementation time

- One fresh export: label set, "Correct Answer:" presence, print header. The other two export formats are unverifiable; parse only "With correct answers and explanations".
- Whether the modal shows Domain/Skill/Difficulty is unverifiable; keep them optional and backfill from the PDF by id.
- Actual captured resolution via track.getSettings(); HiDPI auto-scaling is on by default but the 2.0x cap is unverified.
- OpenAI /v1/models behaviour at zero balance and the 401 error.code string are unverifiable; test from your own machine.
- vercel firewall rules add rate-limit CLI flags are unverified; configure the rule in the dashboard.
- Supabase MCP create_project requires confirm_cost_id even at $0 for non-form clients; Supabase's docs search still says 90-day restore, trust the live page.
- Whether partialOutputStream partial outputs are schema validated is unverified.
- Safari 17 system picker claim is unverified; irrelevant since Safari has no tab option.
