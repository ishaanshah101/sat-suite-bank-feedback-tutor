-- Quick cards: a captured question is explained before the student says what they picked (picked = 'none').
-- The pick comes later and replaces 'none'. Until then the attempt is neither a hit nor a miss.
-- Idempotent: PGlite runs it on every start.
alter table public.attempts drop constraint if exists attempts_picked_chk;
alter table public.attempts add constraint attempts_picked_chk check (picked in ('A', 'B', 'C', 'D', 'correct', 'spr', 'none'));

-- Same view as 0005, with 'none' left out of the older-row fallback (it is not a letter pick).
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
    and (
      a.is_correct = false
      or (a.is_correct is null and a.picked not in ('correct', 'spr', 'none') and q.correct is not null and a.picked <> q.correct)
    )
  union all
  select d.user_id, d.rule_id, 'drill'::text as kind, d.created_at
  from public.drills d
  where d.correct = false
) m
group by m.user_id, m.rule_id;
