-- Rulecard base schema. Plain Postgres: applied to Supabase via the MCP and to PGlite in tests.
-- Conventions: uuid ids, user_id with the owner's id as default (no FK yet; auth-ready),
-- created_at/updated_at, index on (user_id, created_at desc).

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default '68311219-1a38-469e-ab48-b3bf632be848',
  qb_id text,
  source text not null,
  test text,
  domain text,
  skill text,
  difficulty text,
  stem text not null,
  passage text,
  choices jsonb not null,
  correct text,
  answer_source text,
  rationale text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint questions_source_chk check (source in ('capture', 'pdf', 'paste', 'image')),
  constraint questions_correct_chk check (correct is null or correct in ('A', 'B', 'C', 'D')),
  constraint questions_answer_source_chk check (answer_source is null or answer_source in ('official', 'model'))
);
create unique index if not exists questions_user_qb_id_key on public.questions (user_id, qb_id) where qb_id is not null;
create index if not exists questions_user_created_idx on public.questions (user_id, created_at desc);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default '68311219-1a38-469e-ab48-b3bf632be848',
  question_id uuid not null references public.questions (id) on delete cascade,
  picked text not null,
  reasoning text,
  explanation jsonb,
  rule_id text,
  provider text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint attempts_picked_chk check (picked in ('A', 'B', 'C', 'D', 'correct'))
);
create index if not exists attempts_user_created_idx on public.attempts (user_id, created_at desc);
create index if not exists attempts_question_idx on public.attempts (question_id);
create index if not exists attempts_user_rule_idx on public.attempts (user_id, rule_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default '68311219-1a38-469e-ab48-b3bf632be848',
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint chat_messages_role_chk check (role in ('user', 'assistant'))
);
create index if not exists chat_messages_user_created_idx on public.chat_messages (user_id, created_at desc);
create index if not exists chat_messages_attempt_idx on public.chat_messages (attempt_id, created_at);

create table if not exists public.drills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default '68311219-1a38-469e-ab48-b3bf632be848',
  attempt_id uuid references public.attempts (id) on delete cascade,
  rule_id text not null,
  question jsonb not null,
  picked text,
  correct boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint drills_picked_chk check (picked is null or picked in ('A', 'B', 'C', 'D'))
);
create index if not exists drills_user_created_idx on public.drills (user_id, created_at desc);
create index if not exists drills_user_rule_idx on public.drills (user_id, rule_id);

create table if not exists public.provider_status (
  provider text primary key,
  last_ok_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  cooldown_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.unlock_attempts (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists unlock_attempts_ip_created_idx on public.unlock_attempts (ip, created_at desc);

-- Miss counts per rule: wrong attempts plus failed drills.
create or replace view public.rule_stats with (security_invoker = true) as
select
  m.user_id,
  m.rule_id,
  (count(*) filter (where m.kind = 'attempt'))::int as attempt_misses,
  (count(*) filter (where m.kind = 'drill'))::int as drill_misses,
  count(*)::int as misses,
  max(m.created_at) as last_missed_at
from (
  select a.user_id, a.rule_id, 'attempt'::text as kind, a.created_at
  from public.attempts a
  join public.questions q on q.id = a.question_id
  where a.rule_id is not null
    and a.picked <> 'correct'
    and q.correct is not null
    and a.picked <> q.correct
  union all
  select d.user_id, d.rule_id, 'drill'::text as kind, d.created_at
  from public.drills d
  where d.correct = false
) m
group by m.user_id, m.rule_id;
