-- Supabase-only: RLS, per-operation policies for a future authenticated user, and ownership
-- of every table by the app role (which bypasses RLS as owner). Not applied to PGlite in tests.
-- Applied to the live project through the Supabase MCP on 2026-10-25.
grant usage, create on schema public to rulecard_app;
alter table public.attempts enable row level security;
alter table public.chat_messages enable row level security;
alter table public.drills enable row level security;
alter table public.provider_status enable row level security;
alter table public.unlock_attempts enable row level security;

grant select, insert, update, delete on public.questions, public.attempts, public.chat_messages, public.drills to authenticated;
grant select on public.rule_stats to authenticated;

create policy questions_select_own on public.questions for select to authenticated using ((select auth.uid()) = user_id);
create policy questions_insert_own on public.questions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy questions_update_own on public.questions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy questions_delete_own on public.questions for delete to authenticated using ((select auth.uid()) = user_id);

create policy attempts_select_own on public.attempts for select to authenticated using ((select auth.uid()) = user_id);
create policy attempts_insert_own on public.attempts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy attempts_update_own on public.attempts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy attempts_delete_own on public.attempts for delete to authenticated using ((select auth.uid()) = user_id);

create policy chat_messages_select_own on public.chat_messages for select to authenticated using ((select auth.uid()) = user_id);
create policy chat_messages_insert_own on public.chat_messages for insert to authenticated with check ((select auth.uid()) = user_id);
create policy chat_messages_update_own on public.chat_messages for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy chat_messages_delete_own on public.chat_messages for delete to authenticated using ((select auth.uid()) = user_id);

create policy drills_select_own on public.drills for select to authenticated using ((select auth.uid()) = user_id);
create policy drills_insert_own on public.drills for insert to authenticated with check ((select auth.uid()) = user_id);
create policy drills_update_own on public.drills for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy drills_delete_own on public.drills for delete to authenticated using ((select auth.uid()) = user_id);

alter table public.questions owner to rulecard_app;
alter table public.attempts owner to rulecard_app;
alter table public.chat_messages owner to rulecard_app;
alter table public.drills owner to rulecard_app;
alter table public.provider_status owner to rulecard_app;
alter table public.unlock_attempts owner to rulecard_app;
alter view public.rule_stats owner to rulecard_app;
