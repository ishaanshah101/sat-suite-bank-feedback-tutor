-- SAT Math: sections, grid-in (student-produced response) questions, figures, and graded attempts.
-- Idempotent: PGlite runs it on every start.
alter table public.questions add column if not exists section text not null default 'rw';
alter table public.questions add column if not exists format text not null default 'mcq';
alter table public.questions add column if not exists answers jsonb;
alter table public.questions add column if not exists figure text;
alter table public.questions alter column choices drop not null;
alter table public.questions drop constraint if exists questions_section_chk;
alter table public.questions add constraint questions_section_chk check (section in ('rw', 'math'));
alter table public.questions drop constraint if exists questions_format_chk;
alter table public.questions add constraint questions_format_chk check (format in ('mcq', 'spr'));
alter table public.questions drop constraint if exists questions_choices_chk;
alter table public.questions add constraint questions_choices_chk check (format = 'spr' or choices is not null);
create index if not exists questions_user_section_created_idx on public.questions (user_id, section, created_at desc);

alter table public.attempts add column if not exists response text;
alter table public.attempts add column if not exists is_correct boolean;
alter table public.attempts drop constraint if exists attempts_picked_chk;
alter table public.attempts add constraint attempts_picked_chk check (picked in ('A', 'B', 'C', 'D', 'correct', 'spr'));

alter table public.drills add column if not exists response text;
alter table public.drills drop constraint if exists drills_picked_chk;
alter table public.drills add constraint drills_picked_chk check (picked is null or picked in ('A', 'B', 'C', 'D', 'spr'));

-- A miss is an attempt graded wrong (is_correct), or for older rows a letter pick that differs from the answer.
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
      or (a.is_correct is null and a.picked not in ('correct', 'spr') and q.correct is not null and a.picked <> q.correct)
    )
  union all
  select d.user_id, d.rule_id, 'drill'::text as kind, d.created_at
  from public.drills d
  where d.correct = false
) m
group by m.user_id, m.rule_id;
