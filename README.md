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
