-- Personal Bible Study is stored independently from the shared group plan.
-- This migration is additive: existing group readings, completions, reflections,
-- and uploaded media remain untouched.

begin;

create table if not exists public.personal_bible_study_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  book text not null check (char_length(trim(book)) between 1 and 40),
  chapter smallint not null check (chapter between 1 and 150),
  reading_date date not null default current_date,
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'completed')),
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint personal_bible_study_completion_timestamp_check
    check ((status = 'completed') = (completed_at is not null)),
  constraint personal_bible_study_reading_unique
    unique (user_id, book, chapter, reading_date)
);

create table if not exists public.personal_bible_study_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  book text not null check (char_length(trim(book)) between 1 and 40),
  chapter smallint not null check (chapter between 1 and 150),
  verse_reference text check (verse_reference is null or char_length(verse_reference) <= 80),
  note_type text not null default 'reflection'
    check (note_type in ('observation', 'lesson', 'important_verse', 'reflection', 'takeaway', 'question', 'prayer', 'application')),
  content text not null check (char_length(trim(content)) between 1 and 6000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists personal_bible_study_readings_user_date_idx
  on public.personal_bible_study_readings (user_id, reading_date, created_at);
create index if not exists personal_bible_study_notes_user_created_idx
  on public.personal_bible_study_notes (user_id, created_at desc);
create index if not exists personal_bible_study_notes_reference_idx
  on public.personal_bible_study_notes (user_id, book, chapter, created_at desc);

-- A completion timestamp is recorded by the database when a member marks a
-- chapter complete. Clients cannot backdate it or change it after completion.
create or replace function public.set_personal_bible_reading_timestamps()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.status = 'completed' then
    if tg_op = 'INSERT' then
      new.completed_at := now();
    elsif old.status <> 'completed' then
      new.completed_at := now();
    else
      new.completed_at := old.completed_at;
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists set_personal_bible_reading_timestamps on public.personal_bible_study_readings;
create trigger set_personal_bible_reading_timestamps
  before insert or update on public.personal_bible_study_readings
  for each row execute function public.set_personal_bible_reading_timestamps();

alter table public.personal_bible_study_readings enable row level security;
alter table public.personal_bible_study_notes enable row level security;

drop policy if exists personal_bible_readings_select_own on public.personal_bible_study_readings;
drop policy if exists personal_bible_readings_insert_own on public.personal_bible_study_readings;
drop policy if exists personal_bible_readings_update_own on public.personal_bible_study_readings;
drop policy if exists personal_bible_readings_delete_own on public.personal_bible_study_readings;
create policy personal_bible_readings_select_own
  on public.personal_bible_study_readings for select to authenticated
  using (public.is_active_user() and user_id = auth.uid());
create policy personal_bible_readings_insert_own
  on public.personal_bible_study_readings for insert to authenticated
  with check (public.is_active_user() and user_id = auth.uid());
create policy personal_bible_readings_update_own
  on public.personal_bible_study_readings for update to authenticated
  using (public.is_active_user() and user_id = auth.uid())
  with check (public.is_active_user() and user_id = auth.uid());
create policy personal_bible_readings_delete_own
  on public.personal_bible_study_readings for delete to authenticated
  using (public.is_active_user() and user_id = auth.uid());

drop policy if exists personal_bible_notes_select_own on public.personal_bible_study_notes;
drop policy if exists personal_bible_notes_insert_own on public.personal_bible_study_notes;
drop policy if exists personal_bible_notes_update_own on public.personal_bible_study_notes;
drop policy if exists personal_bible_notes_delete_own on public.personal_bible_study_notes;
create policy personal_bible_notes_select_own
  on public.personal_bible_study_notes for select to authenticated
  using (public.is_active_user() and user_id = auth.uid());
create policy personal_bible_notes_insert_own
  on public.personal_bible_study_notes for insert to authenticated
  with check (public.is_active_user() and user_id = auth.uid());
create policy personal_bible_notes_update_own
  on public.personal_bible_study_notes for update to authenticated
  using (public.is_active_user() and user_id = auth.uid())
  with check (public.is_active_user() and user_id = auth.uid());
create policy personal_bible_notes_delete_own
  on public.personal_bible_study_notes for delete to authenticated
  using (public.is_active_user() and user_id = auth.uid());

revoke all on public.personal_bible_study_readings, public.personal_bible_study_notes from anon;
grant select, insert, update, delete on public.personal_bible_study_readings, public.personal_bible_study_notes to authenticated;

-- Keep personal activity synchronized on the member's other signed-in devices.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'personal_bible_study_readings'
    ) then
      execute 'alter publication supabase_realtime add table public.personal_bible_study_readings';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'personal_bible_study_notes'
    ) then
      execute 'alter publication supabase_realtime add table public.personal_bible_study_notes';
    end if;
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
