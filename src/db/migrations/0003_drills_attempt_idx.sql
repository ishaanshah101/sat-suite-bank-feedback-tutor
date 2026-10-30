-- Covering index for the drills -> attempts foreign key (flagged by the Supabase performance advisor).
create index if not exists drills_attempt_idx on public.drills (attempt_id);
