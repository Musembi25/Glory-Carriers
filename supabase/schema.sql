create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'user');
  end if;

  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum ('pending', 'completed');
  end if;

  if not exists (select 1 from pg_type where typname = 'rsvp_status') then
    create type public.rsvp_status as enum ('going', 'not_going');
  end if;

  if not exists (select 1 from pg_type where typname = 'prayer_status') then
    create type public.prayer_status as enum ('open', 'prayed', 'answered');
  end if;

  if not exists (select 1 from pg_type where typname = 'resource_type') then
    create type public.resource_type as enum ('note', 'pdf', 'link');
  end if;

  if not exists (select 1 from pg_type where typname = 'leadership_type') then
    create type public.leadership_type as enum ('prayer_session', 'bible_study');
  end if;

  if not exists (select 1 from pg_type where typname = 'notification_type') then
    create type public.notification_type as enum ('task_assigned', 'event_created', 'new_message');
  end if;

  if not exists (select 1 from pg_type where typname = 'reaction_type') then
    create type public.reaction_type as enum ('like', 'pray', 'love');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.notification_type'::regtype
      and enumlabel = 'prayer_reminder'
  ) then
    alter type public.notification_type add value 'prayer_reminder';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.notification_type'::regtype
      and enumlabel = 'event_reminder'
  ) then
    alter type public.notification_type add value 'event_reminder';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.notification_type'::regtype
      and enumlabel = 'announcement_posted'
  ) then
    alter type public.notification_type add value 'announcement_posted';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.notification_type'::regtype
      and enumlabel = 'virtual_meeting_scheduled'
  ) then
    alter type public.notification_type add value 'virtual_meeting_scheduled';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.notification_type'::regtype
      and enumlabel = 'virtual_meeting_reminder'
  ) then
    alter type public.notification_type add value 'virtual_meeting_reminder';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.notification_type'::regtype
      and enumlabel = 'virtual_meeting_starting'
  ) then
    alter type public.notification_type add value 'virtual_meeting_starting';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.notification_type'::regtype
      and enumlabel = 'discipleship_class_created'
  ) then
    alter type public.notification_type add value 'discipleship_class_created';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.notification_type'::regtype
      and enumlabel = 'discipleship_class_reminder'
  ) then
    alter type public.notification_type add value 'discipleship_class_reminder';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.notification_type'::regtype
      and enumlabel = 'discipleship_class_starting'
  ) then
    alter type public.notification_type add value 'discipleship_class_starting';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.notification_type'::regtype
      and enumlabel = 'discipleship_lesson_added'
  ) then
    alter type public.notification_type add value 'discipleship_lesson_added';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.notification_type'::regtype
      and enumlabel = 'discipleship_enrollment_approved'
  ) then
    alter type public.notification_type add value 'discipleship_enrollment_approved';
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'discipleship_class_status') then
    create type public.discipleship_class_status as enum ('draft', 'upcoming', 'ongoing', 'completed');
  end if;

  if not exists (select 1 from pg_type where typname = 'discipleship_enrollment_status') then
    create type public.discipleship_enrollment_status as enum ('pending', 'approved', 'rejected');
  end if;

  if not exists (select 1 from pg_type where typname = 'discipleship_lesson_type') then
    create type public.discipleship_lesson_type as enum (
      'note', 'pdf', 'link', 'video', 'assignment', 'discussion', 'project'
    );
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.discipleship_lesson_type'::regtype
      and enumlabel = 'project'
  ) then
    alter type public.discipleship_lesson_type add value 'project';
  end if;

  if not exists (select 1 from pg_type where typname = 'discipleship_attendance_status') then
    create type public.discipleship_attendance_status as enum ('present', 'absent', 'late');
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  role public.app_role not null default 'user',
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles
add column if not exists avatar_url text;

alter table public.profiles
add column if not exists last_seen_at timestamptz;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) > 0),
  description text not null default '',
  location text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.event_ideas (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 1000),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.idea_votes (
  idea_id uuid not null references public.event_ideas (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (idea_id, user_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  details text not null default '',
  assignee_id uuid references public.profiles (id) on delete set null,
  status public.task_status not null default 'pending',
  due_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.rsvps (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.rsvp_status not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (event_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid references public.profiles (id) on delete cascade,
  reply_to_message_id uuid references public.messages (id) on delete set null,
  title text not null default '',
  content text not null check (char_length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.messages
add column if not exists reply_to_message_id uuid references public.messages (id) on delete set null;

create table if not exists public.prayer_points (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 160),
  details text not null default '',
  created_by uuid not null references public.profiles (id) on delete cascade,
  is_anonymous boolean not null default false,
  status public.prayer_status not null default 'open',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text not null default '',
  resource_type public.resource_type not null,
  note_content text not null default '',
  external_url text,
  file_path text,
  file_name text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  notification_type public.notification_type not null,
  title text not null,
  body text not null default '',
  entity_table text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 180),
  body text not null default '' check (char_length(trim(body)) between 1 and 2500),
  pinned boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.prayer_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  prayer_point_id uuid not null references public.prayer_points (id) on delete cascade,
  frequency text not null check (frequency in ('daily', 'weekly')),
  remind_at time not null default '08:00:00',
  day_of_week integer check (day_of_week between 0 and 6),
  is_active boolean not null default true,
  last_sent_at timestamptz,
  last_prayed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, prayer_point_id, frequency)
);

create table if not exists public.leadership_assignments (
  id uuid primary key default gen_random_uuid(),
  assignment_type public.leadership_type not null,
  assignment_date date not null,
  leader_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default '',
  notes text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (assignment_type, assignment_date)
);

create table if not exists public.virtual_meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text not null default '',
  meet_url text not null check (char_length(trim(meet_url)) between 8 and 2048),
  starts_at timestamptz not null,
  ends_at timestamptz,
  leader_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_at is null or ends_at > starts_at)
);

create table if not exists public.virtual_meeting_attendance (
  meeting_id uuid not null references public.virtual_meetings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default timezone('utc', now()),
  primary key (meeting_id, user_id)
);

create table if not exists public.discipleship_classes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text not null default '',
  leader_id uuid references public.profiles (id) on delete set null,
  banner_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  meet_url text,
  status public.discipleship_class_status not null default 'upcoming',
  requires_approval boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.discipleship_class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.discipleship_classes (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz,
  meet_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_at is null or ends_at > starts_at)
);

create table if not exists public.discipleship_enrollments (
  class_id uuid not null references public.discipleship_classes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.discipleship_enrollment_status not null default 'approved',
  enrolled_at timestamptz not null default timezone('utc', now()),
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  primary key (class_id, user_id)
);

create table if not exists public.discipleship_lessons (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.discipleship_classes (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text not null default '',
  module_label text not null default '',
  sort_order integer not null default 0,
  lesson_type public.discipleship_lesson_type not null default 'note',
  note_content text not null default '',
  external_url text,
  video_url text,
  file_path text,
  file_name text,
  assignment_prompt text not null default '',
  discussion_topic text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.discipleship_lesson_completions (
  lesson_id uuid not null references public.discipleship_lessons (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  completed_at timestamptz not null default timezone('utc', now()),
  primary key (lesson_id, user_id)
);

create table if not exists public.discipleship_member_notes (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.discipleship_lessons (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null default '' check (char_length(trim(content)) between 0 and 5000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (lesson_id, user_id)
);

create table if not exists public.discipleship_session_attendance (
  session_id uuid not null references public.discipleship_class_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.discipleship_attendance_status not null default 'present',
  checked_in_at timestamptz not null default timezone('utc', now()),
  marked_by uuid references public.profiles (id) on delete set null,
  primary key (session_id, user_id)
);

create table if not exists public.discipleship_discussions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.discipleship_classes (id) on delete cascade,
  lesson_id uuid references public.discipleship_lessons (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 2000),
  reply_to_id uuid references public.discipleship_discussions (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  entity_table text not null check (char_length(trim(entity_table)) between 1 and 80),
  entity_id uuid not null,
  reaction public.reaction_type not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, entity_table, entity_id, reaction)
);

create table if not exists public.event_check_ins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  location_label text not null default '',
  latitude double precision,
  longitude double precision,
  checked_in_at timestamptz not null default timezone('utc', now()),
  unique (event_id, user_id)
);

create index if not exists idx_events_starts_at on public.events (starts_at);
create index if not exists idx_event_ideas_event_id on public.event_ideas (event_id);
create index if not exists idx_event_ideas_user_id on public.event_ideas (user_id);
create index if not exists idx_tasks_event_id on public.tasks (event_id);
create index if not exists idx_tasks_assignee_id on public.tasks (assignee_id);
create index if not exists idx_rsvps_event_id on public.rsvps (event_id);
create index if not exists idx_messages_recipient_id on public.messages (recipient_id);
create index if not exists idx_messages_sender_id on public.messages (sender_id);
create index if not exists idx_messages_created_at on public.messages (created_at desc);
create index if not exists idx_messages_reply_to_message_id on public.messages (reply_to_message_id);
create index if not exists idx_profiles_last_seen_at on public.profiles (last_seen_at desc);
create index if not exists idx_prayer_points_created_at on public.prayer_points (created_at desc);
create index if not exists idx_prayer_points_status on public.prayer_points (status);
create index if not exists idx_resources_type on public.resources (resource_type);
create index if not exists idx_resources_created_at on public.resources (created_at desc);
create index if not exists idx_notifications_user_created_at on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_user_read_at on public.notifications (user_id, read_at);
create index if not exists idx_announcements_created_at on public.announcements (created_at desc);
create index if not exists idx_announcements_pinned_created_at on public.announcements (pinned desc, created_at desc);
create index if not exists idx_leadership_assignments_date on public.leadership_assignments (assignment_date);
create index if not exists idx_leadership_assignments_leader_id on public.leadership_assignments (leader_id);
create index if not exists idx_event_check_ins_event_id on public.event_check_ins (event_id);
create index if not exists idx_event_check_ins_user_id on public.event_check_ins (user_id);
create index if not exists idx_prayer_reminders_user_id on public.prayer_reminders (user_id);
create index if not exists idx_prayer_reminders_prayer_point_id on public.prayer_reminders (prayer_point_id);
create index if not exists idx_virtual_meetings_starts_at on public.virtual_meetings (starts_at);
create index if not exists idx_virtual_meetings_leader_id on public.virtual_meetings (leader_id);
create index if not exists idx_virtual_meeting_attendance_meeting_id on public.virtual_meeting_attendance (meeting_id);
create index if not exists idx_virtual_meeting_attendance_user_id on public.virtual_meeting_attendance (user_id);
create index if not exists idx_reactions_entity on public.reactions (entity_table, entity_id);
create index if not exists idx_reactions_user_id on public.reactions (user_id);
create index if not exists idx_discipleship_classes_starts_at on public.discipleship_classes (starts_at);
create index if not exists idx_discipleship_classes_status on public.discipleship_classes (status);
create index if not exists idx_discipleship_classes_leader_id on public.discipleship_classes (leader_id);
create index if not exists idx_discipleship_class_sessions_class_id on public.discipleship_class_sessions (class_id);
create index if not exists idx_discipleship_class_sessions_starts_at on public.discipleship_class_sessions (starts_at);
create index if not exists idx_discipleship_enrollments_user_id on public.discipleship_enrollments (user_id);
create index if not exists idx_discipleship_enrollments_class_id on public.discipleship_enrollments (class_id);
create index if not exists idx_discipleship_lessons_class_id on public.discipleship_lessons (class_id);
create index if not exists idx_discipleship_lesson_completions_user_id on public.discipleship_lesson_completions (user_id);
create index if not exists idx_discipleship_member_notes_lesson_id on public.discipleship_member_notes (lesson_id);
create index if not exists idx_discipleship_session_attendance_session_id on public.discipleship_session_attendance (session_id);
create index if not exists idx_discipleship_discussions_class_id on public.discipleship_discussions (class_id);
create index if not exists idx_discipleship_discussions_lesson_id on public.discipleship_discussions (lesson_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and is_active = true
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and is_active = true
  );
$$;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
  limit 1;
$$;

create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select is_active
      from public.profiles
      where id = auth.uid()
      limit 1
    ),
    false
  );
$$;

create or replace function public.ensure_admin_exists()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  bootstrap_admin uuid;
begin
  if exists (
    select 1
    from public.profiles
    where role = 'admin'
      and is_active = true
  ) then
    return;
  end if;

  select id
  into bootstrap_admin
  from public.profiles
  where is_active = true
  order by created_at asc, id asc
  limit 1;

  if bootstrap_admin is null then
    select id
    into bootstrap_admin
    from public.profiles
    order by created_at asc, id asc
    limit 1;
  end if;

  if bootstrap_admin is not null then
    update public.profiles
    set role = 'admin',
        is_active = true,
        updated_at = timezone('utc', now())
    where id = bootstrap_admin;
  end if;
end;
$$;

create or replace function public.backfill_profiles_from_auth()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  inserted_count integer := 0;
begin
  insert into public.profiles (id, email, full_name, role, is_active)
  select
    auth_user.id,
    coalesce(auth_user.email, ''),
    coalesce(
      auth_user.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(auth_user.email, ''), '@', 1)
    ),
    'user'::public.app_role,
    true
  from auth.users auth_user
  where not exists (
    select 1
    from public.profiles profile
    where profile.id = auth_user.id
  );

  get diagnostics inserted_count = row_count;

  perform public.ensure_admin_exists();
  return inserted_count;
end;
$$;

create or replace function public.ensure_current_user_profile()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  auth_user auth.users%rowtype;
  ensured_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  perform pg_advisory_xact_lock(20260421::bigint);

  select *
  into auth_user
  from auth.users
  where id = auth.uid();

  if auth_user.id is null then
    raise exception 'Authenticated user record not found.';
  end if;

  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    auth_user.id,
    coalesce(auth_user.email, ''),
    coalesce(
      auth_user.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(auth_user.email, ''), '@', 1)
    ),
    case
      when exists (
        select 1
        from public.profiles
        where role = 'admin'
          and is_active = true
          and id <> auth.uid()
      ) then 'user'::public.app_role
      else 'admin'::public.app_role
    end,
    true
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        is_active = true,
        updated_at = timezone('utc', now())
  returning * into ensured_profile;

  perform public.ensure_admin_exists();

  select *
  into ensured_profile
  from public.profiles
  where id = auth.uid();

  return to_jsonb(ensured_profile);
end;
$$;

create or replace function public.claim_admin_if_no_active_admin()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  perform pg_advisory_xact_lock(20260422::bigint);

  update public.profiles
  set role = 'admin',
      is_active = true,
      updated_at = timezone('utc', now())
  where id = auth.uid()
    and not exists (
      select 1
      from public.profiles
      where role = 'admin'
        and is_active = true
        and id <> auth.uid()
    )
  returning * into claimed_profile;

  if claimed_profile.id is null then
    select *
    into claimed_profile
    from public.profiles
    where id = auth.uid();
  end if;

  return to_jsonb(claimed_profile);
end;
$$;

create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  if not public.is_admin() then
    raise exception 'Admin privileges are required.';
  end if;

  if target_user_id is null then
    raise exception 'A target user id is required.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'Use another admin account before deleting your own user.';
  end if;

  select *
  into target_profile
  from public.profiles
  where id = target_user_id
  limit 1;

  if target_profile.id is null then
    raise exception 'The selected user was not found.';
  end if;

  if target_profile.role = 'admin'
     and (
       select count(*)
       from public.profiles
       where role = 'admin'
         and is_active = true
     ) <= 1 then
    raise exception 'Keep at least one active admin account in the system.';
  end if;

  delete from auth.users
  where id = target_user_id;

  if not found then
    raise exception 'The selected auth user was not found.';
  end if;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    case
      when exists (
        select 1
        from public.profiles
        where role = 'admin'
          and is_active = true
      ) then 'user'::public.app_role
      else 'admin'::public.app_role
    end
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name;

  perform public.ensure_admin_exists();

  return new;
end;
$$;

create or replace function public.sync_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    email = coalesce(new.email, old.email),
    full_name = coalesce(new.raw_user_meta_data ->> 'full_name', public.profiles.full_name),
    updated_at = timezone('utc', now())
  where id = new.id;

  return new;
end;
$$;

create or replace function public.toggle_task_completion(target_task uuid, next_status public.task_status)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_task public.tasks;
begin
  update public.tasks
  set status = next_status,
      updated_at = timezone('utc', now())
  where id = target_task
    and (public.is_admin() or assignee_id = auth.uid())
  returning * into updated_task;

  if updated_task.id is null then
    raise exception 'You do not have permission to update this task.';
  end if;

  return updated_task;
end;
$$;

create or replace function public.create_notification(
  target_user_id uuid,
  target_type public.notification_type,
  target_title text,
  target_body text,
  target_entity_table text default null,
  target_entity_id uuid default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (
    user_id,
    notification_type,
    title,
    body,
    entity_table,
    entity_id
  )
  values (
    target_user_id,
    target_type,
    target_title,
    target_body,
    target_entity_table,
    target_entity_id
  );
$$;

create or replace function public.handle_event_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (
    user_id,
    notification_type,
    title,
    body,
    entity_table,
    entity_id
  )
  select
    profiles.id,
    'event_created'::public.notification_type,
    'New event created',
    coalesce(new.title, 'A new event') || ' • ' || to_char(new.starts_at, 'DD Mon YYYY HH24:MI'),
    'events',
    new.id
  from public.profiles
  where profiles.is_active = true;

  return new;
end;
$$;

create or replace function public.handle_task_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assignee_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' or old.assignee_id is distinct from new.assignee_id then
    perform public.create_notification(
      new.assignee_id,
      'task_assigned',
      'You were assigned a task',
      coalesce(new.title, 'A task') || ' is now assigned to you.',
      'tasks',
      new.id
    );
  end if;

  return new;
end;
$$;

create or replace function public.handle_message_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.recipient_id is not null then
    if new.recipient_id <> new.sender_id then
      perform public.create_notification(
        new.recipient_id,
        'new_message',
        'You have a new message',
        coalesce(new.title, left(new.content, 80), 'New message'),
        'messages',
        new.id
      );
    end if;

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
  select
    profiles.id,
    'new_message'::public.notification_type,
    'You have a new message',
    coalesce(new.title, left(new.content, 80), 'New message'),
    'messages',
    new.id
  from public.profiles
  where profiles.is_active = true
    and profiles.id <> new.sender_id;

  return new;
end;
$$;

create or replace function public.handle_announcement_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (
    user_id,
    notification_type,
    title,
    body,
    entity_table,
    entity_id
  )
  select
    profiles.id,
    'announcement_posted'::public.notification_type,
    'New announcement posted',
    coalesce(new.title, 'Announcement'),
    'announcements',
    new.id
  from public.profiles
  where profiles.is_active = true
    and profiles.id is distinct from new.created_by;

  return new;
end;
$$;

create or replace function public.handle_virtual_meeting_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (
    user_id,
    notification_type,
    title,
    body,
    entity_table,
    entity_id
  )
  select
    profiles.id,
    'virtual_meeting_scheduled'::public.notification_type,
    'New virtual meeting scheduled',
    coalesce(new.title, 'Virtual meeting') || ' • ' || to_char(new.starts_at, 'DD Mon YYYY HH24:MI'),
    'virtual_meetings',
    new.id
  from public.profiles
  where profiles.is_active = true
    and profiles.id is distinct from new.created_by;

  return new;
end;
$$;

create or replace function public.create_scheduled_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  created_count integer := 0;
  newly_inserted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  with due_prayer_reminders as (
    select
      reminder.id as reminder_id,
      reminder.user_id,
      reminder.prayer_point_id,
      prayer.title as prayer_title
    from public.prayer_reminders reminder
    join public.prayer_points prayer on prayer.id = reminder.prayer_point_id
    where reminder.user_id = auth.uid()
      and reminder.is_active = true
      and prayer.status <> 'answered'
      and (
        (reminder.frequency = 'daily' and timezone('utc', now())::time >= reminder.remind_at)
        or (
          reminder.frequency = 'weekly'
          and extract(dow from timezone('utc', now()))::int = coalesce(reminder.day_of_week, 0)
          and timezone('utc', now())::time >= reminder.remind_at
        )
      )
      and (
        reminder.last_sent_at is null
        or date(reminder.last_sent_at at time zone 'utc') < date(timezone('utc', now()))
      )
  ),
  inserted_prayer as (
    insert into public.notifications (
      user_id,
      notification_type,
      title,
      body,
      entity_table,
      entity_id
    )
    select
      due.user_id,
      'prayer_reminder'::public.notification_type,
      'You have a prayer reminder',
      coalesce(due.prayer_title, 'Remember to pray today.'),
      'prayer_points',
      due.prayer_point_id
    from due_prayer_reminders due
    returning entity_id
  )
  update public.prayer_reminders reminder
  set last_sent_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where reminder.id in (select due_prayer_reminders.reminder_id from due_prayer_reminders);

  get diagnostics created_count = row_count;

  insert into public.notifications (
    user_id,
    notification_type,
    title,
    body,
    entity_table,
    entity_id
  )
  select
    auth.uid(),
    'event_reminder'::public.notification_type,
    'Upcoming event reminder',
    coalesce(event_item.title, 'An event') || ' starts at '
      || to_char(event_item.starts_at, 'DD Mon YYYY HH24:MI'),
    'events',
    event_item.id
  from public.events event_item
  where event_item.starts_at > timezone('utc', now())
    and event_item.starts_at <= timezone('utc', now()) + interval '24 hours'
    and not exists (
      select 1
      from public.notifications notification
      where notification.user_id = auth.uid()
        and notification.notification_type = 'event_reminder'
        and notification.entity_table = 'events'
        and notification.entity_id = event_item.id
        and notification.created_at > timezone('utc', now()) - interval '26 hours'
    );

  get diagnostics newly_inserted = row_count;
  created_count := created_count + newly_inserted;

  insert into public.notifications (
    user_id,
    notification_type,
    title,
    body,
    entity_table,
    entity_id
  )
  select
    auth.uid(),
    'virtual_meeting_reminder'::public.notification_type,
    'Virtual meeting reminder',
    coalesce(meeting.title, 'A virtual meeting') || ' starts at '
      || to_char(meeting.starts_at, 'DD Mon YYYY HH24:MI'),
    'virtual_meetings',
    meeting.id
  from public.virtual_meetings meeting
  where meeting.starts_at > timezone('utc', now())
    and meeting.starts_at <= timezone('utc', now()) + interval '2 hours'
    and not exists (
      select 1
      from public.notifications notification
      where notification.user_id = auth.uid()
        and notification.notification_type = 'virtual_meeting_reminder'
        and notification.entity_table = 'virtual_meetings'
        and notification.entity_id = meeting.id
        and notification.created_at > timezone('utc', now()) - interval '4 hours'
    );

  get diagnostics newly_inserted = row_count;
  created_count := created_count + newly_inserted;

  insert into public.notifications (
    user_id,
    notification_type,
    title,
    body,
    entity_table,
    entity_id
  )
  select
    auth.uid(),
    'virtual_meeting_starting'::public.notification_type,
    'Meeting is starting now',
    coalesce(meeting.title, 'A virtual meeting') || ' is live now.',
    'virtual_meetings',
    meeting.id
  from public.virtual_meetings meeting
  where meeting.starts_at <= timezone('utc', now())
    and meeting.starts_at > timezone('utc', now()) - interval '10 minutes'
    and not exists (
      select 1
      from public.notifications notification
      where notification.user_id = auth.uid()
        and notification.notification_type = 'virtual_meeting_starting'
        and notification.entity_table = 'virtual_meetings'
        and notification.entity_id = meeting.id
        and notification.created_at > timezone('utc', now()) - interval '2 hours'
    );

  get diagnostics newly_inserted = row_count;
  created_count := created_count + newly_inserted;

  insert into public.notifications (
    user_id,
    notification_type,
    title,
    body,
    entity_table,
    entity_id
  )
  select
    auth.uid(),
    'discipleship_class_reminder'::public.notification_type,
    'Discipleship session reminder',
    coalesce(session_item.title, 'Class session') || ' starts at '
      || to_char(session_item.starts_at, 'DD Mon YYYY HH24:MI'),
    'discipleship_classes',
    session_item.class_id
  from public.discipleship_class_sessions session_item
  join public.discipleship_enrollments enrollment
    on enrollment.class_id = session_item.class_id
  where enrollment.user_id = auth.uid()
    and enrollment.status = 'approved'
    and session_item.starts_at > timezone('utc', now())
    and session_item.starts_at <= timezone('utc', now()) + interval '2 hours'
    and not exists (
      select 1
      from public.notifications notification
      where notification.user_id = auth.uid()
        and notification.notification_type = 'discipleship_class_reminder'
        and notification.entity_table = 'discipleship_classes'
        and notification.entity_id = session_item.class_id
        and notification.body like '%' || session_item.title || '%'
        and notification.created_at > timezone('utc', now()) - interval '4 hours'
    );

  get diagnostics newly_inserted = row_count;
  created_count := created_count + newly_inserted;

  insert into public.notifications (
    user_id,
    notification_type,
    title,
    body,
    entity_table,
    entity_id
  )
  select
    auth.uid(),
    'discipleship_class_starting'::public.notification_type,
    'Discipleship session is live',
    coalesce(session_item.title, 'Class session') || ' is starting now.',
    'discipleship_classes',
    session_item.class_id
  from public.discipleship_class_sessions session_item
  join public.discipleship_enrollments enrollment
    on enrollment.class_id = session_item.class_id
  where enrollment.user_id = auth.uid()
    and enrollment.status = 'approved'
    and session_item.starts_at <= timezone('utc', now())
    and session_item.starts_at > timezone('utc', now()) - interval '15 minutes'
    and not exists (
      select 1
      from public.notifications notification
      where notification.user_id = auth.uid()
        and notification.notification_type = 'discipleship_class_starting'
        and notification.entity_table = 'discipleship_classes'
        and notification.entity_id = session_item.class_id
        and notification.created_at > timezone('utc', now()) - interval '2 hours'
    );

  get diagnostics newly_inserted = row_count;
  created_count := created_count + newly_inserted;

  return created_count;
end;
$$;

create or replace function public.recommend_next_leader(target_type public.leadership_type)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with active_users as (
    select id
    from public.profiles
    where is_active = true
  ),
  ranked as (
    select
      active_users.id,
      max(leadership.assignment_date) as last_assigned_date
    from active_users
    left join public.leadership_assignments leadership
      on leadership.leader_id = active_users.id
      and leadership.assignment_type = target_type
    group by active_users.id
  )
  select ranked.id
  from ranked
  order by ranked.last_assigned_date asc nulls first, ranked.id asc
  limit 1;
$$;

grant execute on function public.toggle_task_completion(uuid, public.task_status) to authenticated;
grant execute on function public.ensure_current_user_profile() to authenticated;
grant execute on function public.claim_admin_if_no_active_admin() to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.create_scheduled_reminders() to authenticated;
grant execute on function public.recommend_next_leader(public.leadership_type) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  1048576,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resources',
  'resources',
  true,
  10485760,
  array['application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at
before update on public.events
for each row
execute function public.set_updated_at();

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
before update on public.tasks
for each row
execute function public.set_updated_at();

drop trigger if exists set_rsvps_updated_at on public.rsvps;
create trigger set_rsvps_updated_at
before update on public.rsvps
for each row
execute function public.set_updated_at();

drop trigger if exists set_messages_updated_at on public.messages;
create trigger set_messages_updated_at
before update on public.messages
for each row
execute function public.set_updated_at();

drop trigger if exists set_prayer_points_updated_at on public.prayer_points;
create trigger set_prayer_points_updated_at
before update on public.prayer_points
for each row
execute function public.set_updated_at();

drop trigger if exists set_resources_updated_at on public.resources;
create trigger set_resources_updated_at
before update on public.resources
for each row
execute function public.set_updated_at();

drop trigger if exists set_leadership_assignments_updated_at on public.leadership_assignments;
create trigger set_leadership_assignments_updated_at
before update on public.leadership_assignments
for each row
execute function public.set_updated_at();

drop trigger if exists set_announcements_updated_at on public.announcements;
create trigger set_announcements_updated_at
before update on public.announcements
for each row
execute function public.set_updated_at();

drop trigger if exists set_virtual_meetings_updated_at on public.virtual_meetings;
create trigger set_virtual_meetings_updated_at
before update on public.virtual_meetings
for each row
execute function public.set_updated_at();

drop trigger if exists set_prayer_reminders_updated_at on public.prayer_reminders;
create trigger set_prayer_reminders_updated_at
before update on public.prayer_reminders
for each row
execute function public.set_updated_at();

drop trigger if exists on_event_created_notify on public.events;
create trigger on_event_created_notify
after insert on public.events
for each row
execute function public.handle_event_notification();

drop trigger if exists on_task_created_notify on public.tasks;
create trigger on_task_created_notify
after insert or update on public.tasks
for each row
execute function public.handle_task_notification();

drop trigger if exists on_message_created_notify on public.messages;
create trigger on_message_created_notify
after insert on public.messages
for each row
execute function public.handle_message_notification();

drop trigger if exists on_announcement_created_notify on public.announcements;
create trigger on_announcement_created_notify
after insert on public.announcements
for each row
execute function public.handle_announcement_notification();

drop trigger if exists on_virtual_meeting_created_notify on public.virtual_meetings;
create trigger on_virtual_meeting_created_notify
after insert on public.virtual_meetings
for each row
execute function public.handle_virtual_meeting_notification();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update on auth.users
for each row
execute function public.sync_auth_user();

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_ideas enable row level security;
alter table public.idea_votes enable row level security;
alter table public.tasks enable row level security;
alter table public.rsvps enable row level security;
alter table public.messages enable row level security;
alter table public.prayer_points enable row level security;
alter table public.resources enable row level security;
alter table public.notifications enable row level security;
alter table public.announcements enable row level security;
alter table public.leadership_assignments enable row level security;
alter table public.event_check_ins enable row level security;
alter table public.prayer_reminders enable row level security;
alter table public.virtual_meetings enable row level security;
alter table public.virtual_meeting_attendance enable row level security;
alter table public.reactions enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
on public.profiles
for select
to authenticated
using (public.is_active_user());

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin"
on public.profiles
for update
to authenticated
using (auth.uid() = id or public.is_admin())
with check (
  public.is_admin()
  or (
    auth.uid() = id
    and role = public.current_user_role()
    and is_active = public.current_user_is_active()
  )
);

drop policy if exists "events_select" on public.events;
create policy "events_select"
on public.events
for select
to authenticated
using (public.is_active_user());

drop policy if exists "events_admin_insert" on public.events;
create policy "events_admin_insert"
on public.events
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "events_admin_update" on public.events;
create policy "events_admin_update"
on public.events
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "events_admin_delete" on public.events;
create policy "events_admin_delete"
on public.events
for delete
to authenticated
using (public.is_admin());

drop policy if exists "ideas_select" on public.event_ideas;
create policy "ideas_select"
on public.event_ideas
for select
to authenticated
using (public.is_active_user());

drop policy if exists "ideas_insert" on public.event_ideas;
create policy "ideas_insert"
on public.event_ideas
for insert
to authenticated
with check (public.is_active_user() and auth.uid() = user_id);

drop policy if exists "ideas_update_owner_or_admin" on public.event_ideas;
create policy "ideas_update_owner_or_admin"
on public.event_ideas
for update
to authenticated
using (public.is_admin() or auth.uid() = user_id)
with check (public.is_admin() or auth.uid() = user_id);

drop policy if exists "ideas_delete_owner_or_admin" on public.event_ideas;
create policy "ideas_delete_owner_or_admin"
on public.event_ideas
for delete
to authenticated
using (public.is_admin() or auth.uid() = user_id);

drop policy if exists "votes_select" on public.idea_votes;
create policy "votes_select"
on public.idea_votes
for select
to authenticated
using (public.is_active_user());

drop policy if exists "votes_insert" on public.idea_votes;
create policy "votes_insert"
on public.idea_votes
for insert
to authenticated
with check (public.is_active_user() and auth.uid() = user_id);

drop policy if exists "votes_delete_own" on public.idea_votes;
create policy "votes_delete_own"
on public.idea_votes
for delete
to authenticated
using (public.is_admin() or auth.uid() = user_id);

drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select"
on public.tasks
for select
to authenticated
using (public.is_active_user());

drop policy if exists "tasks_admin_insert" on public.tasks;
create policy "tasks_admin_insert"
on public.tasks
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "tasks_admin_update" on public.tasks;
create policy "tasks_admin_update"
on public.tasks
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "tasks_admin_delete" on public.tasks;
create policy "tasks_admin_delete"
on public.tasks
for delete
to authenticated
using (public.is_admin());

drop policy if exists "rsvps_select" on public.rsvps;
create policy "rsvps_select"
on public.rsvps
for select
to authenticated
using (public.is_active_user());

drop policy if exists "rsvps_insert_own" on public.rsvps;
create policy "rsvps_insert_own"
on public.rsvps
for insert
to authenticated
with check (public.is_active_user() and auth.uid() = user_id);

drop policy if exists "rsvps_update_own" on public.rsvps;
create policy "rsvps_update_own"
on public.rsvps
for update
to authenticated
using (public.is_admin() or auth.uid() = user_id)
with check (public.is_admin() or auth.uid() = user_id);

drop policy if exists "rsvps_delete_own_or_admin" on public.rsvps;
create policy "rsvps_delete_own_or_admin"
on public.rsvps
for delete
to authenticated
using (public.is_admin() or auth.uid() = user_id);

drop policy if exists "messages_select" on public.messages;
create policy "messages_select"
on public.messages
for select
to authenticated
using (
  public.is_active_user()
  and (
    public.is_admin()
    or recipient_id = auth.uid()
    or recipient_id is null
    or sender_id = auth.uid()
  )
);

drop policy if exists "messages_admin_insert" on public.messages;
drop policy if exists "messages_insert_authenticated" on public.messages;
create policy "messages_insert_authenticated"
on public.messages
for insert
to authenticated
with check (
  public.is_active_user()
  and sender_id = auth.uid()
  and (
    recipient_id is null
    or recipient_id in (
      select id
      from public.profiles
      where is_active = true
    )
  )
);

drop policy if exists "messages_admin_update" on public.messages;
drop policy if exists "messages_update_owner_or_admin" on public.messages;
create policy "messages_update_owner_or_admin"
on public.messages
for update
to authenticated
using (public.is_admin() or sender_id = auth.uid())
with check (public.is_admin() or sender_id = auth.uid());

drop policy if exists "messages_admin_delete" on public.messages;
drop policy if exists "messages_delete_owner_or_admin" on public.messages;
create policy "messages_delete_owner_or_admin"
on public.messages
for delete
to authenticated
using (public.is_admin() or sender_id = auth.uid());

drop policy if exists "prayer_points_select" on public.prayer_points;
create policy "prayer_points_select"
on public.prayer_points
for select
to authenticated
using (public.is_active_user());

drop policy if exists "prayer_points_insert" on public.prayer_points;
create policy "prayer_points_insert"
on public.prayer_points
for insert
to authenticated
with check (public.is_active_user() and created_by = auth.uid());

drop policy if exists "prayer_points_update" on public.prayer_points;
create policy "prayer_points_update"
on public.prayer_points
for update
to authenticated
using (public.is_active_user())
with check (public.is_active_user());

drop policy if exists "prayer_points_delete" on public.prayer_points;
create policy "prayer_points_delete"
on public.prayer_points
for delete
to authenticated
using (public.is_admin() or created_by = auth.uid());

drop policy if exists "resources_select" on public.resources;
create policy "resources_select"
on public.resources
for select
to authenticated
using (public.is_active_user());

drop policy if exists "resources_admin_insert" on public.resources;
create policy "resources_admin_insert"
on public.resources
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "resources_admin_update" on public.resources;
create policy "resources_admin_update"
on public.resources
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "resources_admin_delete" on public.resources;
create policy "resources_admin_delete"
on public.resources
for delete
to authenticated
using (public.is_admin());

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
on public.notifications
for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
on public.notifications
for update
to authenticated
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
on public.notifications
for delete
to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "announcements_select" on public.announcements;
create policy "announcements_select"
on public.announcements
for select
to authenticated
using (public.is_active_user());

drop policy if exists "announcements_admin_insert" on public.announcements;
create policy "announcements_admin_insert"
on public.announcements
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "announcements_admin_update" on public.announcements;
create policy "announcements_admin_update"
on public.announcements
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "announcements_admin_delete" on public.announcements;
create policy "announcements_admin_delete"
on public.announcements
for delete
to authenticated
using (public.is_admin());

drop policy if exists "prayer_reminders_select_own" on public.prayer_reminders;
create policy "prayer_reminders_select_own"
on public.prayer_reminders
for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "prayer_reminders_insert_own" on public.prayer_reminders;
create policy "prayer_reminders_insert_own"
on public.prayer_reminders
for insert
to authenticated
with check (auth.uid() = user_id and public.is_active_user());

drop policy if exists "prayer_reminders_update_own" on public.prayer_reminders;
create policy "prayer_reminders_update_own"
on public.prayer_reminders
for update
to authenticated
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "prayer_reminders_delete_own" on public.prayer_reminders;
create policy "prayer_reminders_delete_own"
on public.prayer_reminders
for delete
to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "leadership_assignments_select" on public.leadership_assignments;
create policy "leadership_assignments_select"
on public.leadership_assignments
for select
to authenticated
using (public.is_active_user());

drop policy if exists "leadership_assignments_admin_insert" on public.leadership_assignments;
create policy "leadership_assignments_admin_insert"
on public.leadership_assignments
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "leadership_assignments_admin_update" on public.leadership_assignments;
create policy "leadership_assignments_admin_update"
on public.leadership_assignments
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "leadership_assignments_admin_delete" on public.leadership_assignments;
create policy "leadership_assignments_admin_delete"
on public.leadership_assignments
for delete
to authenticated
using (public.is_admin());

drop policy if exists "virtual_meetings_select" on public.virtual_meetings;
create policy "virtual_meetings_select"
on public.virtual_meetings
for select
to authenticated
using (public.is_active_user());

drop policy if exists "virtual_meetings_admin_insert" on public.virtual_meetings;
create policy "virtual_meetings_admin_insert"
on public.virtual_meetings
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "virtual_meetings_admin_update" on public.virtual_meetings;
create policy "virtual_meetings_admin_update"
on public.virtual_meetings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "virtual_meetings_admin_delete" on public.virtual_meetings;
create policy "virtual_meetings_admin_delete"
on public.virtual_meetings
for delete
to authenticated
using (public.is_admin());

drop policy if exists "virtual_meeting_attendance_select" on public.virtual_meeting_attendance;
create policy "virtual_meeting_attendance_select"
on public.virtual_meeting_attendance
for select
to authenticated
using (public.is_active_user());

drop policy if exists "virtual_meeting_attendance_insert_self" on public.virtual_meeting_attendance;
create policy "virtual_meeting_attendance_insert_self"
on public.virtual_meeting_attendance
for insert
to authenticated
with check (public.is_active_user() and auth.uid() = user_id);

drop policy if exists "virtual_meeting_attendance_update_self_or_admin" on public.virtual_meeting_attendance;
create policy "virtual_meeting_attendance_update_self_or_admin"
on public.virtual_meeting_attendance
for update
to authenticated
using (public.is_admin() or auth.uid() = user_id)
with check (public.is_admin() or auth.uid() = user_id);

drop policy if exists "virtual_meeting_attendance_delete_self_or_admin" on public.virtual_meeting_attendance;
create policy "virtual_meeting_attendance_delete_self_or_admin"
on public.virtual_meeting_attendance
for delete
to authenticated
using (public.is_admin() or auth.uid() = user_id);

drop policy if exists "reactions_select" on public.reactions;
create policy "reactions_select"
on public.reactions
for select
to authenticated
using (public.is_active_user());

drop policy if exists "reactions_insert_self" on public.reactions;
create policy "reactions_insert_self"
on public.reactions
for insert
to authenticated
with check (public.is_active_user() and auth.uid() = user_id);

drop policy if exists "reactions_delete_self_or_admin" on public.reactions;
create policy "reactions_delete_self_or_admin"
on public.reactions
for delete
to authenticated
using (public.is_admin() or auth.uid() = user_id);

drop policy if exists "event_check_ins_select" on public.event_check_ins;
create policy "event_check_ins_select"
on public.event_check_ins
for select
to authenticated
using (public.is_active_user());

drop policy if exists "event_check_ins_insert_own" on public.event_check_ins;
create policy "event_check_ins_insert_own"
on public.event_check_ins
for insert
to authenticated
with check (public.is_active_user() and user_id = auth.uid());

drop policy if exists "event_check_ins_update_own" on public.event_check_ins;
create policy "event_check_ins_update_own"
on public.event_check_ins
for update
to authenticated
using (public.is_admin() or user_id = auth.uid())
with check (public.is_admin() or user_id = auth.uid());

drop policy if exists "event_check_ins_delete_own" on public.event_check_ins;
create policy "event_check_ins_delete_own"
on public.event_check_ins
for delete
to authenticated
using (public.is_admin() or user_id = auth.uid());

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "resources_select_all" on storage.objects;
create policy "resources_select_all"
on storage.objects
for select
to authenticated
using (bucket_id = 'resources');

drop policy if exists "resources_admin_insert" on storage.objects;
create policy "resources_admin_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'resources' and public.is_admin());

drop policy if exists "resources_admin_update" on storage.objects;
create policy "resources_admin_update"
on storage.objects
for update
to authenticated
using (bucket_id = 'resources' and public.is_admin())
with check (bucket_id = 'resources' and public.is_admin());

drop policy if exists "resources_admin_delete" on storage.objects;
create policy "resources_admin_delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'resources' and public.is_admin());

create or replace function public.can_manage_discipleship_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.discipleship_classes class_item
      where class_item.id = p_class_id
        and class_item.leader_id = auth.uid()
    );
$$;

create or replace function public.is_enrolled_in_discipleship_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.discipleship_enrollments enrollment
    where enrollment.class_id = p_class_id
      and enrollment.user_id = auth.uid()
      and enrollment.status = 'approved'
  );
$$;

create or replace function public.can_access_discipleship_class_content(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_discipleship_class(p_class_id)
    or public.is_enrolled_in_discipleship_class(p_class_id);
$$;

create or replace function public.handle_discipleship_class_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'draft' then
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
  select
    profiles.id,
    'discipleship_class_created'::public.notification_type,
    'New discipleship class available',
    coalesce(new.title, 'Discipleship class')
      || coalesce(' • ' || to_char(new.starts_at, 'DD Mon YYYY HH24:MI'), ''),
    'discipleship_classes',
    new.id
  from public.profiles
  where profiles.is_active = true
    and profiles.id is distinct from new.created_by;

  return new;
end;
$$;

create or replace function public.handle_discipleship_lesson_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
    'discipleship_lesson_added'::public.notification_type,
    'New lesson material uploaded',
    coalesce(new.title, 'New lesson'),
    'discipleship_classes',
    new.class_id
  from public.discipleship_enrollments enrollment
  where enrollment.class_id = new.class_id
    and enrollment.status = 'approved'
    and enrollment.user_id is distinct from new.created_by;

  return new;
end;
$$;

create or replace function public.handle_discipleship_enrollment_approved_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'approved' or old.status = 'approved' then
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
  select
    new.user_id,
    'discipleship_enrollment_approved'::public.notification_type,
    'Enrollment approved',
    coalesce(class_item.title, 'Your discipleship class'),
    'discipleship_classes',
    new.class_id
  from public.discipleship_classes class_item
  where class_item.id = new.class_id;

  return new;
end;
$$;

drop trigger if exists set_discipleship_classes_updated_at on public.discipleship_classes;
create trigger set_discipleship_classes_updated_at
before update on public.discipleship_classes
for each row
execute function public.set_updated_at();

drop trigger if exists set_discipleship_class_sessions_updated_at on public.discipleship_class_sessions;
create trigger set_discipleship_class_sessions_updated_at
before update on public.discipleship_class_sessions
for each row
execute function public.set_updated_at();

drop trigger if exists set_discipleship_lessons_updated_at on public.discipleship_lessons;
create trigger set_discipleship_lessons_updated_at
before update on public.discipleship_lessons
for each row
execute function public.set_updated_at();

drop trigger if exists set_discipleship_member_notes_updated_at on public.discipleship_member_notes;
create trigger set_discipleship_member_notes_updated_at
before update on public.discipleship_member_notes
for each row
execute function public.set_updated_at();

drop trigger if exists set_discipleship_discussions_updated_at on public.discipleship_discussions;
create trigger set_discipleship_discussions_updated_at
before update on public.discipleship_discussions
for each row
execute function public.set_updated_at();

drop trigger if exists on_discipleship_class_created_notify on public.discipleship_classes;
create trigger on_discipleship_class_created_notify
after insert on public.discipleship_classes
for each row
execute function public.handle_discipleship_class_notification();

drop trigger if exists on_discipleship_lesson_created_notify on public.discipleship_lessons;
create trigger on_discipleship_lesson_created_notify
after insert on public.discipleship_lessons
for each row
execute function public.handle_discipleship_lesson_notification();

drop trigger if exists on_discipleship_enrollment_approved_notify on public.discipleship_enrollments;
create trigger on_discipleship_enrollment_approved_notify
after update on public.discipleship_enrollments
for each row
execute function public.handle_discipleship_enrollment_approved_notification();

alter table public.discipleship_classes enable row level security;
alter table public.discipleship_class_sessions enable row level security;
alter table public.discipleship_enrollments enable row level security;
alter table public.discipleship_lessons enable row level security;
alter table public.discipleship_lesson_completions enable row level security;
alter table public.discipleship_member_notes enable row level security;
alter table public.discipleship_session_attendance enable row level security;
alter table public.discipleship_discussions enable row level security;

drop policy if exists "discipleship_classes_select" on public.discipleship_classes;
create policy "discipleship_classes_select"
on public.discipleship_classes
for select
to authenticated
using (
  public.is_active_user()
  and (
    status <> 'draft'
    or public.is_admin()
    or leader_id = auth.uid()
  )
);

drop policy if exists "discipleship_classes_admin_insert" on public.discipleship_classes;
create policy "discipleship_classes_admin_insert"
on public.discipleship_classes
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "discipleship_classes_manage_update" on public.discipleship_classes;
create policy "discipleship_classes_manage_update"
on public.discipleship_classes
for update
to authenticated
using (public.can_manage_discipleship_class(id))
with check (public.can_manage_discipleship_class(id));

drop policy if exists "discipleship_classes_admin_delete" on public.discipleship_classes;
create policy "discipleship_classes_admin_delete"
on public.discipleship_classes
for delete
to authenticated
using (public.is_admin());

drop policy if exists "discipleship_class_sessions_select" on public.discipleship_class_sessions;
create policy "discipleship_class_sessions_select"
on public.discipleship_class_sessions
for select
to authenticated
using (
  public.is_active_user()
  and public.can_access_discipleship_class_content(class_id)
);

drop policy if exists "discipleship_class_sessions_manage_insert" on public.discipleship_class_sessions;
create policy "discipleship_class_sessions_manage_insert"
on public.discipleship_class_sessions
for insert
to authenticated
with check (public.can_manage_discipleship_class(class_id));

drop policy if exists "discipleship_class_sessions_manage_update" on public.discipleship_class_sessions;
create policy "discipleship_class_sessions_manage_update"
on public.discipleship_class_sessions
for update
to authenticated
using (public.can_manage_discipleship_class(class_id))
with check (public.can_manage_discipleship_class(class_id));

drop policy if exists "discipleship_class_sessions_manage_delete" on public.discipleship_class_sessions;
create policy "discipleship_class_sessions_manage_delete"
on public.discipleship_class_sessions
for delete
to authenticated
using (public.can_manage_discipleship_class(class_id));

drop policy if exists "discipleship_enrollments_select" on public.discipleship_enrollments;
create policy "discipleship_enrollments_select"
on public.discipleship_enrollments
for select
to authenticated
using (
  public.is_active_user()
  and (
    user_id = auth.uid()
    or public.can_manage_discipleship_class(class_id)
  )
);

drop policy if exists "discipleship_enrollments_insert_self" on public.discipleship_enrollments;
create policy "discipleship_enrollments_insert_self"
on public.discipleship_enrollments
for insert
to authenticated
with check (
  public.is_active_user()
  and user_id = auth.uid()
  and status in ('pending', 'approved')
);

drop policy if exists "discipleship_enrollments_manage_update" on public.discipleship_enrollments;
create policy "discipleship_enrollments_manage_update"
on public.discipleship_enrollments
for update
to authenticated
using (public.can_manage_discipleship_class(class_id) or user_id = auth.uid())
with check (public.can_manage_discipleship_class(class_id) or user_id = auth.uid());

drop policy if exists "discipleship_enrollments_delete" on public.discipleship_enrollments;
create policy "discipleship_enrollments_delete"
on public.discipleship_enrollments
for delete
to authenticated
using (public.can_manage_discipleship_class(class_id) or user_id = auth.uid());

drop policy if exists "discipleship_lessons_select" on public.discipleship_lessons;
create policy "discipleship_lessons_select"
on public.discipleship_lessons
for select
to authenticated
using (
  public.is_active_user()
  and public.can_access_discipleship_class_content(class_id)
);

drop policy if exists "discipleship_lessons_manage_insert" on public.discipleship_lessons;
create policy "discipleship_lessons_manage_insert"
on public.discipleship_lessons
for insert
to authenticated
with check (public.can_manage_discipleship_class(class_id));

drop policy if exists "discipleship_lessons_manage_update" on public.discipleship_lessons;
create policy "discipleship_lessons_manage_update"
on public.discipleship_lessons
for update
to authenticated
using (public.can_manage_discipleship_class(class_id))
with check (public.can_manage_discipleship_class(class_id));

drop policy if exists "discipleship_lessons_manage_delete" on public.discipleship_lessons;
create policy "discipleship_lessons_manage_delete"
on public.discipleship_lessons
for delete
to authenticated
using (public.can_manage_discipleship_class(class_id));

drop policy if exists "discipleship_lesson_completions_select" on public.discipleship_lesson_completions;
create policy "discipleship_lesson_completions_select"
on public.discipleship_lesson_completions
for select
to authenticated
using (
  public.is_active_user()
  and (
    user_id = auth.uid()
    or exists (
      select 1
      from public.discipleship_lessons lesson
      where lesson.id = lesson_id
        and public.can_manage_discipleship_class(lesson.class_id)
    )
  )
);

drop policy if exists "discipleship_lesson_completions_insert_self" on public.discipleship_lesson_completions;
create policy "discipleship_lesson_completions_insert_self"
on public.discipleship_lesson_completions
for insert
to authenticated
with check (
  public.is_active_user()
  and user_id = auth.uid()
  and exists (
    select 1
    from public.discipleship_lessons lesson
    where lesson.id = lesson_id
      and public.can_access_discipleship_class_content(lesson.class_id)
  )
);

drop policy if exists "discipleship_lesson_completions_delete_self" on public.discipleship_lesson_completions;
create policy "discipleship_lesson_completions_delete_self"
on public.discipleship_lesson_completions
for delete
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "discipleship_member_notes_select" on public.discipleship_member_notes;
create policy "discipleship_member_notes_select"
on public.discipleship_member_notes
for select
to authenticated
using (
  public.is_active_user()
  and (
    user_id = auth.uid()
    or exists (
      select 1
      from public.discipleship_lessons lesson
      where lesson.id = lesson_id
        and public.can_manage_discipleship_class(lesson.class_id)
    )
  )
);

drop policy if exists "discipleship_member_notes_upsert_self" on public.discipleship_member_notes;
create policy "discipleship_member_notes_insert_self"
on public.discipleship_member_notes
for insert
to authenticated
with check (
  public.is_active_user()
  and user_id = auth.uid()
  and exists (
    select 1
    from public.discipleship_lessons lesson
    where lesson.id = lesson_id
      and public.can_access_discipleship_class_content(lesson.class_id)
  )
);

drop policy if exists "discipleship_member_notes_update_self" on public.discipleship_member_notes;
create policy "discipleship_member_notes_update_self"
on public.discipleship_member_notes
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "discipleship_member_notes_delete_self" on public.discipleship_member_notes;
create policy "discipleship_member_notes_delete_self"
on public.discipleship_member_notes
for delete
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "discipleship_session_attendance_select" on public.discipleship_session_attendance;
create policy "discipleship_session_attendance_select"
on public.discipleship_session_attendance
for select
to authenticated
using (
  public.is_active_user()
  and (
    user_id = auth.uid()
    or exists (
      select 1
      from public.discipleship_class_sessions session_item
      where session_item.id = session_id
        and public.can_manage_discipleship_class(session_item.class_id)
    )
  )
);

drop policy if exists "discipleship_session_attendance_manage" on public.discipleship_session_attendance;
create policy "discipleship_session_attendance_insert"
on public.discipleship_session_attendance
for insert
to authenticated
with check (
  public.is_active_user()
  and (
    exists (
      select 1
      from public.discipleship_class_sessions session_item
      where session_item.id = session_id
        and public.can_manage_discipleship_class(session_item.class_id)
    )
    or (
      user_id = auth.uid()
      and exists (
        select 1
        from public.discipleship_class_sessions session_item
        join public.discipleship_enrollments enrollment
          on enrollment.class_id = session_item.class_id
        where session_item.id = session_id
          and enrollment.user_id = auth.uid()
          and enrollment.status = 'approved'
      )
    )
  )
);

drop policy if exists "discipleship_session_attendance_update" on public.discipleship_session_attendance;
create policy "discipleship_session_attendance_update"
on public.discipleship_session_attendance
for update
to authenticated
using (
  exists (
    select 1
    from public.discipleship_class_sessions session_item
    where session_item.id = session_id
      and public.can_manage_discipleship_class(session_item.class_id)
  )
  or user_id = auth.uid()
)
with check (
  exists (
    select 1
    from public.discipleship_class_sessions session_item
    where session_item.id = session_id
      and public.can_manage_discipleship_class(session_item.class_id)
  )
  or user_id = auth.uid()
);

drop policy if exists "discipleship_session_attendance_delete" on public.discipleship_session_attendance;
create policy "discipleship_session_attendance_delete"
on public.discipleship_session_attendance
for delete
to authenticated
using (
  exists (
    select 1
    from public.discipleship_class_sessions session_item
    where session_item.id = session_id
      and public.can_manage_discipleship_class(session_item.class_id)
  )
  or user_id = auth.uid()
);

drop policy if exists "discipleship_discussions_select" on public.discipleship_discussions;
create policy "discipleship_discussions_select"
on public.discipleship_discussions
for select
to authenticated
using (
  public.is_active_user()
  and public.can_access_discipleship_class_content(class_id)
);

drop policy if exists "discipleship_discussions_insert" on public.discipleship_discussions;
create policy "discipleship_discussions_insert"
on public.discipleship_discussions
for insert
to authenticated
with check (
  public.is_active_user()
  and user_id = auth.uid()
  and public.can_access_discipleship_class_content(class_id)
);

drop policy if exists "discipleship_discussions_update" on public.discipleship_discussions;
create policy "discipleship_discussions_update"
on public.discipleship_discussions
for update
to authenticated
using (user_id = auth.uid() or public.can_manage_discipleship_class(class_id))
with check (user_id = auth.uid() or public.can_manage_discipleship_class(class_id));

drop policy if exists "discipleship_discussions_delete" on public.discipleship_discussions;
create policy "discipleship_discussions_delete"
on public.discipleship_discussions
for delete
to authenticated
using (user_id = auth.uid() or public.can_manage_discipleship_class(class_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'discipleship-materials',
  'discipleship-materials',
  true,
  15728640,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "discipleship_materials_select_all" on storage.objects;
create policy "discipleship_materials_select_all"
on storage.objects
for select
to authenticated
using (bucket_id = 'discipleship-materials');

drop policy if exists "discipleship_materials_insert" on storage.objects;
create policy "discipleship_materials_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'discipleship-materials'
  and (
    public.is_admin()
    or public.can_manage_discipleship_class(((storage.foldername(name))[1])::uuid)
  )
);

drop policy if exists "discipleship_materials_update" on storage.objects;
create policy "discipleship_materials_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'discipleship-materials'
  and (
    public.is_admin()
    or public.can_manage_discipleship_class(((storage.foldername(name))[1])::uuid)
  )
)
with check (
  bucket_id = 'discipleship-materials'
  and (
    public.is_admin()
    or public.can_manage_discipleship_class(((storage.foldername(name))[1])::uuid)
  )
);

drop policy if exists "discipleship_materials_delete" on storage.objects;
create policy "discipleship_materials_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'discipleship-materials'
  and (
    public.is_admin()
    or public.can_manage_discipleship_class(((storage.foldername(name))[1])::uuid)
  )
);

select public.backfill_profiles_from_auth();
select public.ensure_admin_exists();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_ideas'
  ) then
    alter publication supabase_realtime add table public.event_ideas;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'idea_votes'
  ) then
    alter publication supabase_realtime add table public.idea_votes;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rsvps'
  ) then
    alter publication supabase_realtime add table public.rsvps;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'prayer_points'
  ) then
    alter publication supabase_realtime add table public.prayer_points;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'resources'
  ) then
    alter publication supabase_realtime add table public.resources;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'leadership_assignments'
  ) then
    alter publication supabase_realtime add table public.leadership_assignments;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_check_ins'
  ) then
    alter publication supabase_realtime add table public.event_check_ins;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'announcements'
  ) then
    alter publication supabase_realtime add table public.announcements;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'prayer_reminders'
  ) then
    alter publication supabase_realtime add table public.prayer_reminders;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'virtual_meetings'
  ) then
    alter publication supabase_realtime add table public.virtual_meetings;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'virtual_meeting_attendance'
  ) then
    alter publication supabase_realtime add table public.virtual_meeting_attendance;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reactions'
  ) then
    alter publication supabase_realtime add table public.reactions;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'discipleship_classes'
  ) then
    alter publication supabase_realtime add table public.discipleship_classes;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'discipleship_class_sessions'
  ) then
    alter publication supabase_realtime add table public.discipleship_class_sessions;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'discipleship_enrollments'
  ) then
    alter publication supabase_realtime add table public.discipleship_enrollments;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'discipleship_lessons'
  ) then
    alter publication supabase_realtime add table public.discipleship_lessons;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'discipleship_lesson_completions'
  ) then
    alter publication supabase_realtime add table public.discipleship_lesson_completions;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'discipleship_member_notes'
  ) then
    alter publication supabase_realtime add table public.discipleship_member_notes;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'discipleship_session_attendance'
  ) then
    alter publication supabase_realtime add table public.discipleship_session_attendance;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'discipleship_discussions'
  ) then
    alter publication supabase_realtime add table public.discipleship_discussions;
  end if;
end $$;