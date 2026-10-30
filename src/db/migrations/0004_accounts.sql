-- Accounts: email + password sign-in so anyone can use Rulecard with their own history.
-- Existing rows keep the owner's id; the owner claims it by signing up with the old passcode.
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  constraint users_email_lower_chk check (email = lower(email))
);
create unique index if not exists users_email_key on public.users (email);

-- One row per AI call (extract, explain, chat, drill), for the per-account daily limit.
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);
