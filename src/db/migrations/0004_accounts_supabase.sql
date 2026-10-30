-- Supabase-only part of 0004: RLS on (no client policies; only the app role, as owner, reads these).
alter table public.users enable row level security;
alter table public.ai_usage enable row level security;
alter table public.users owner to rulecard_app;
alter table public.ai_usage owner to rulecard_app;
