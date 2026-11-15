-- The ACT: questions carry their test (sat | act), ACT sections (english, reading, science; math is shared),
-- a fifth choice E for older 5-choice ACT Math, and the letters printed on screen (ACT alternates A-D and F-J).
-- Idempotent: PGlite runs it on every start.
alter table public.questions add column if not exists exam text not null default 'sat';
alter table public.questions drop constraint if exists questions_exam_chk;
alter table public.questions add constraint questions_exam_chk check (exam in ('sat', 'act'));
alter table public.questions add column if not exists letter_style text;
alter table public.questions drop constraint if exists questions_letter_style_chk;
alter table public.questions add constraint questions_letter_style_chk check (letter_style is null or letter_style in ('abcd', 'fghj'));
alter table public.questions drop constraint if exists questions_section_chk;
alter table public.questions add constraint questions_section_chk check (section in ('rw', 'math', 'english', 'reading', 'science'));
alter table public.questions drop constraint if exists questions_correct_chk;
alter table public.questions add constraint questions_correct_chk check (correct is null or correct in ('A', 'B', 'C', 'D', 'E'));

alter table public.attempts drop constraint if exists attempts_picked_chk;
alter table public.attempts add constraint attempts_picked_chk check (picked in ('A', 'B', 'C', 'D', 'E', 'correct', 'spr', 'none'));
