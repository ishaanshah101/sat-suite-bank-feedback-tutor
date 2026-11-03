-- Session revocation: sign-out kills that token; "sign out of all devices" refuses every token signed before now.
-- Idempotent: runs on every PGlite boot and once on Supabase.
alter table public.users add column if not exists sessions_valid_from timestamptz;
update public.users set sessions_valid_from = created_at where sessions_valid_from is null;
alter table public.users alter column sessions_valid_from set not null;
alter table public.users alter column sessions_valid_from set default now();

create table if not exists public.revoked_sessions (
  jti text primary key,
  user_id uuid not null,
  expires_at timestamptz not null
);
create index if not exists revoked_sessions_expires_idx on public.revoked_sessions (expires_at);
alter table public.revoked_sessions enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'rulecard_app') then
    execute 'alter table public.revoked_sessions owner to rulecard_app';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    begin
      execute 'revoke all on public.revoked_sessions from anon, authenticated';
    exception when others then null;
    end;
  end if;
end $$;
