-- Hardening: RLS on questions too, no implicit owner on user_id, and no client-role access to app tables.
-- Idempotent: PGlite runs it on every start. The Supabase-only part is skipped where the anon role does not exist.
alter table public.questions enable row level security;

-- Every insert names its account; a missing user_id is a bug, not the owner's row.
alter table public.questions alter column user_id drop default;
alter table public.attempts alter column user_id drop default;
alter table public.chat_messages alter column user_id drop default;
alter table public.drills alter column user_id drop default;

-- Supabase-only: the app reaches the database as its own role, never through the API roles.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    begin
      execute 'revoke all on all tables in schema public from anon, authenticated';
    exception when others then
      raise notice 'skipped table revoke: %', sqlerrm;
    end;
    begin
      execute 'revoke all on public.rule_stats from anon, authenticated';
    exception when others then
      raise notice 'skipped rule_stats revoke: %', sqlerrm;
    end;
    begin
      execute 'alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated';
    exception when others then
      raise notice 'skipped default privileges: %', sqlerrm;
    end;
  end if;
end
$$;
