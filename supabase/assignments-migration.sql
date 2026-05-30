-- =============================================================================
-- Discipleship Assignments & Projects — run once in Supabase SQL Editor
-- Fixes: "Could not find the table public.discipleship_assignment_submissions"
-- Safe to re-run (uses IF NOT EXISTS / DROP IF EXISTS where possible)
-- =============================================================================

-- 1) Notification enum values
do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumtypid = 'public.notification_type'::regtype
      and enumlabel = 'discipleship_assignment_posted'
  ) then
    alter type public.notification_type add value 'discipleship_assignment_posted';
  end if;

  if not exists (
    select 1 from pg_enum
    where enumtypid = 'public.notification_type'::regtype
      and enumlabel = 'discipleship_assignment_due'
  ) then
    alter type public.notification_type add value 'discipleship_assignment_due';
  end if;

  if not exists (
    select 1 from pg_enum
    where enumtypid = 'public.notification_type'::regtype
      and enumlabel = 'discipleship_assignment_feedback'
  ) then
    alter type public.notification_type add value 'discipleship_assignment_feedback';
  end if;

  if not exists (
    select 1 from pg_enum
    where enumtypid = 'public.notification_type'::regtype
      and enumlabel = 'discipleship_assignment_approved'
  ) then
    alter type public.notification_type add value 'discipleship_assignment_approved';
  end if;

  if not exists (
    select 1 from pg_enum
    where enumtypid = 'public.notification_type'::regtype
      and enumlabel = 'discipleship_assignment_revision'
  ) then
    alter type public.notification_type add value 'discipleship_assignment_revision';
  end if;
end $$;

-- 2) Submission status enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'discipleship_submission_status') then
    create type public.discipleship_submission_status as enum (
      'submitted',
      'under_review',
      'reviewed',
      'completed',
      'revision_requested'
    );
  end if;
end $$;

-- 3) Extra columns on discipleship_lessons
alter table public.discipleship_lessons
  add column if not exists instructions text not null default '';

alter table public.discipleship_lessons
  add column if not exists due_at timestamptz;

alter table public.discipleship_lessons
  add column if not exists max_score integer check (max_score is null or max_score > 0);

alter table public.discipleship_lessons
  add column if not exists attached_resources jsonb not null default '[]'::jsonb;

-- 4) Tables
create table if not exists public.discipleship_assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.discipleship_lessons (id) on delete cascade,
  class_id uuid not null references public.discipleship_classes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.discipleship_submission_status not null default 'submitted',
  file_path text,
  file_name text,
  file_size bigint,
  submitted_at timestamptz not null default timezone('utc', now()),
  score numeric(6, 2) check (score is null or score >= 0),
  feedback text not null default '',
  encouragement text not null default '',
  revision_notes text not null default '',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (lesson_id, user_id)
);

create table if not exists public.discipleship_submission_history (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.discipleship_assignment_submissions (id) on delete cascade,
  lesson_id uuid not null references public.discipleship_lessons (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.discipleship_submission_status not null,
  file_path text,
  file_name text,
  submitted_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_discipleship_assignment_submissions_lesson_id
  on public.discipleship_assignment_submissions (lesson_id);
create index if not exists idx_discipleship_assignment_submissions_class_id
  on public.discipleship_assignment_submissions (class_id);
create index if not exists idx_discipleship_assignment_submissions_user_id
  on public.discipleship_assignment_submissions (user_id);
create index if not exists idx_discipleship_submission_history_submission_id
  on public.discipleship_submission_history (submission_id);

-- 5) Trigger functions
create or replace function public.handle_discipleship_lesson_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  notify_title text;
  notify_body text;
  notify_type public.notification_type;
begin
  if new.lesson_type in ('assignment', 'project') then
    notify_type := 'discipleship_assignment_posted'::public.notification_type;
    notify_title := case
      when new.lesson_type = 'project' then 'New class project posted'
      else 'New assignment posted'
    end;
    notify_body := coalesce(new.title, 'New coursework')
      || coalesce(' • Due ' || to_char(new.due_at, 'DD Mon YYYY HH24:MI'), '');
  else
    notify_type := 'discipleship_lesson_added'::public.notification_type;
    notify_title := 'New lesson material uploaded';
    notify_body := coalesce(new.title, 'New lesson');
  end if;

  insert into public.notifications (
    user_id,
    notification_type,
    title,
    body,
    entity_table,
    entity_id
  )
  select
    enrollment.user_id,
    notify_type,
    notify_title,
    notify_body,
    'discipleship_classes',
    new.class_id
  from public.discipleship_enrollments enrollment
  where enrollment.class_id = new.class_id
    and enrollment.status = 'approved'
    and enrollment.user_id is distinct from new.created_by;

  return new;
end;
$$;

create or replace function public.sync_discipleship_submission_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' then
    insert into public.discipleship_lesson_completions (lesson_id, user_id)
    values (new.lesson_id, new.user_id)
    on conflict (lesson_id, user_id) do nothing;
  elsif old.status = 'completed' and new.status <> 'completed' then
    delete from public.discipleship_lesson_completions
    where lesson_id = new.lesson_id
      and user_id = new.user_id;
  end if;

  return new;
end;
$$;

create or replace function public.handle_discipleship_submission_review_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lesson_title text;
  notify_type public.notification_type;
  notify_title text;
  notify_body text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.status is not distinct from new.status
    and old.feedback is not distinct from new.feedback
    and old.score is not distinct from new.score then
    return new;
  end if;

  select coalesce(lesson.title, 'Assignment')
  into lesson_title
  from public.discipleship_lessons lesson
  where lesson.id = new.lesson_id;

  if new.status = 'revision_requested' then
    notify_type := 'discipleship_assignment_revision'::public.notification_type;
    notify_title := 'Revision requested';
    notify_body := lesson_title || coalesce(' — ' || nullif(trim(new.revision_notes), ''), '');
  elsif new.status = 'completed' then
    notify_type := 'discipleship_assignment_approved'::public.notification_type;
    notify_title := 'Assignment approved';
    notify_body := lesson_title || coalesce(' • Score: ' || new.score::text, '');
  elsif new.feedback is distinct from old.feedback
    or new.encouragement is distinct from old.encouragement
    or new.score is distinct from old.score then
    notify_type := 'discipleship_assignment_feedback'::public.notification_type;
    notify_title := 'Feedback on your submission';
    notify_body := lesson_title;
  else
    return new;
  end if;

  insert into public.notifications (
    user_id,
    notification_type,
    title,
    body,
    entity_table,
    entity_id
  )
  values (
    new.user_id,
    notify_type,
    notify_title,
    notify_body,
    'discipleship_classes',
    new.class_id
  );

  return new;
end;
$$;

-- 6) Triggers
drop trigger if exists set_discipleship_assignment_submissions_updated_at on public.discipleship_assignment_submissions;
create trigger set_discipleship_assignment_submissions_updated_at
before update on public.discipleship_assignment_submissions
for each row
execute function public.set_updated_at();

drop trigger if exists on_discipleship_submission_sync_completion on public.discipleship_assignment_submissions;
create trigger on_discipleship_submission_sync_completion
after insert or update of status on public.discipleship_assignment_submissions
for each row
execute function public.sync_discipleship_submission_completion();

drop trigger if exists on_discipleship_submission_review_notify on public.discipleship_assignment_submissions;
create trigger on_discipleship_submission_review_notify
after update on public.discipleship_assignment_submissions
for each row
execute function public.handle_discipleship_submission_review_notification();

-- 7) RLS
alter table public.discipleship_assignment_submissions enable row level security;
alter table public.discipleship_submission_history enable row level security;

drop policy if exists "discipleship_assignment_submissions_select" on public.discipleship_assignment_submissions;
create policy "discipleship_assignment_submissions_select"
on public.discipleship_assignment_submissions
for select to authenticated
using (
  public.is_active_user()
  and (user_id = auth.uid() or public.can_manage_discipleship_class(class_id))
);

drop policy if exists "discipleship_assignment_submissions_insert" on public.discipleship_assignment_submissions;
create policy "discipleship_assignment_submissions_insert"
on public.discipleship_assignment_submissions
for insert to authenticated
with check (
  public.is_active_user()
  and user_id = auth.uid()
  and public.is_enrolled_in_discipleship_class(class_id)
  and exists (
    select 1 from public.discipleship_lessons lesson
    where lesson.id = lesson_id
      and lesson.class_id = class_id
      and lesson.lesson_type in ('assignment', 'project')
  )
);

drop policy if exists "discipleship_assignment_submissions_update_self" on public.discipleship_assignment_submissions;
create policy "discipleship_assignment_submissions_update_self"
on public.discipleship_assignment_submissions
for update to authenticated
using (
  public.is_active_user()
  and user_id = auth.uid()
  and public.is_enrolled_in_discipleship_class(class_id)
)
with check (
  user_id = auth.uid()
  and public.is_enrolled_in_discipleship_class(class_id)
);

drop policy if exists "discipleship_assignment_submissions_update_manage" on public.discipleship_assignment_submissions;
create policy "discipleship_assignment_submissions_update_manage"
on public.discipleship_assignment_submissions
for update to authenticated
using (public.can_manage_discipleship_class(class_id))
with check (public.can_manage_discipleship_class(class_id));

drop policy if exists "discipleship_assignment_submissions_delete" on public.discipleship_assignment_submissions;
create policy "discipleship_assignment_submissions_delete"
on public.discipleship_assignment_submissions
for delete to authenticated
using (user_id = auth.uid() or public.can_manage_discipleship_class(class_id));

drop policy if exists "discipleship_submission_history_select" on public.discipleship_submission_history;
create policy "discipleship_submission_history_select"
on public.discipleship_submission_history
for select to authenticated
using (
  public.is_active_user()
  and (
    user_id = auth.uid()
    or exists (
      select 1 from public.discipleship_assignment_submissions submission
      where submission.id = submission_id
        and public.can_manage_discipleship_class(submission.class_id)
    )
  )
);

drop policy if exists "discipleship_submission_history_insert" on public.discipleship_submission_history;
create policy "discipleship_submission_history_insert"
on public.discipleship_submission_history
for insert to authenticated
with check (
  user_id = auth.uid()
  or exists (
    select 1 from public.discipleship_assignment_submissions submission
    where submission.id = submission_id
      and (
        submission.user_id = auth.uid()
        or public.can_manage_discipleship_class(submission.class_id)
      )
  )
);

-- 8) Storage bucket for student submissions (private)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'discipleship-submissions',
  'discipleship-submissions',
  false,
  26214400,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Extend discipleship-materials for leader resource uploads
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip'
]
where id = 'discipleship-materials';

drop policy if exists "discipleship_submissions_select" on storage.objects;
create policy "discipleship_submissions_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'discipleship-submissions'
  and (
    public.is_admin()
    or (storage.foldername(name))[3] = auth.uid()::text
    or public.can_manage_discipleship_class(((storage.foldername(name))[1])::uuid)
  )
);

drop policy if exists "discipleship_submissions_insert" on storage.objects;
create policy "discipleship_submissions_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'discipleship-submissions'
  and (
    (
      (storage.foldername(name))[3] = auth.uid()::text
      and public.is_enrolled_in_discipleship_class(((storage.foldername(name))[1])::uuid)
    )
    or public.can_manage_discipleship_class(((storage.foldername(name))[1])::uuid)
    or public.is_admin()
  )
);

drop policy if exists "discipleship_submissions_update" on storage.objects;
create policy "discipleship_submissions_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'discipleship-submissions'
  and (
    public.is_admin()
    or (storage.foldername(name))[3] = auth.uid()::text
    or public.can_manage_discipleship_class(((storage.foldername(name))[1])::uuid)
  )
)
with check (
  bucket_id = 'discipleship-submissions'
  and (
    public.is_admin()
    or (storage.foldername(name))[3] = auth.uid()::text
    or public.can_manage_discipleship_class(((storage.foldername(name))[1])::uuid)
  )
);

drop policy if exists "discipleship_submissions_delete" on storage.objects;
create policy "discipleship_submissions_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'discipleship-submissions'
  and (
    public.is_admin()
    or (storage.foldername(name))[3] = auth.uid()::text
    or public.can_manage_discipleship_class(((storage.foldername(name))[1])::uuid)
  )
);

-- 9) Realtime (optional but recommended)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'discipleship_assignment_submissions'
  ) then
    alter publication supabase_realtime add table public.discipleship_assignment_submissions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'discipleship_submission_history'
  ) then
    alter publication supabase_realtime add table public.discipleship_submission_history;
  end if;
end $$;

-- Done. Refresh the app (hard reload). If the API still caches old schema, wait ~1 min or
-- Dashboard → Settings → API → "Reload schema" if available on your plan.
