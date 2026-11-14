-- Private management groups and group-level isolation for the existing single-group app.
-- Apply after schema.sql, cell-group-management-migration.sql,
-- super-admin-security-migration.sql, bible-study-migration.sql,
-- bible-study-audio-migration.sql, bible-study-voice-notes-migration.sql,
-- gc-pulse-activities-migration.sql, prayer-replies-migration.sql,
-- announcements-community-migration.sql, and assignments-migration.sql.

alter table public.cell_groups
  add column if not exists is_primary boolean not null default false,
  add column if not exists management_only boolean not null default false,
  add column if not exists system_key text;

select public.ensure_default_cell_group();

with primary_group as (
  select id from public.cell_groups
  where management_only = false
  order by created_at, id limit 1
)
update public.cell_groups
set is_primary = (id = (select id from primary_group));

create unique index if not exists cell_groups_single_primary_idx
  on public.cell_groups (is_primary) where is_primary;
create unique index if not exists cell_groups_system_key_idx
  on public.cell_groups (system_key) where system_key is not null;

insert into public.cell_groups (name, description, visibility, management_only, system_key)
values
  ('Management Cell Group 1', 'Private management workspace.', 'private', true, 'management-cell-1'),
  ('Management Cell Group 2', 'Private management workspace.', 'private', true, 'management-cell-2')
on conflict do nothing;

create table if not exists public.cell_group_admin_assignments (
  cell_group_id uuid not null references public.cell_groups(id) on delete cascade,
  admin_user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default timezone('utc', now()),
  primary key (cell_group_id, admin_user_id)
);

alter table public.cell_group_admin_assignments enable row level security;
revoke all on public.cell_group_admin_assignments from anon, authenticated;
grant select, insert, delete on public.cell_group_admin_assignments to authenticated;
revoke update on public.cell_group_admin_assignments from authenticated;
drop policy if exists cell_group_admin_assignments_super_admin on public.cell_group_admin_assignments;
create policy cell_group_admin_assignments_super_admin
on public.cell_group_admin_assignments for all to authenticated
using (public.is_super_admin())
with check (
  public.is_super_admin()
  and exists (select 1 from public.profiles where id = admin_user_id and role = 'admin' and is_active = true)
  and exists (select 1 from public.cell_groups where id = cell_group_id)
);
drop policy if exists cell_group_admin_assignments_select_self on public.cell_group_admin_assignments;
create policy cell_group_admin_assignments_select_self
on public.cell_group_admin_assignments for select to authenticated
using (public.is_super_admin() or admin_user_id = auth.uid());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'cell_group_admin_assignments'
    ) then
    alter publication supabase_realtime add table public.cell_group_admin_assignments;
  end if;
end $$;

create or replace function public.primary_cell_group_id()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select id from public.cell_groups where is_primary = true limit 1;
$$;

create or replace function public.ensure_default_cell_group()
returns public.cell_groups
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  existing_group public.cell_groups%rowtype;
  default_leader uuid;
begin
  select * into existing_group from public.cell_groups where is_primary = true limit 1;
  if existing_group.id is not null then return existing_group; end if;
  select id into default_leader from public.profiles
  where role = 'admin' and is_active = true order by created_at limit 1;
  insert into public.cell_groups (name, description, leader_id, is_primary, management_only)
  values ('Cell Group', 'Our cell group community', default_leader, true, false)
  returning * into existing_group;
  return existing_group;
end;
$$;

create or replace function public.user_can_access_cell_group(target_group_id uuid, target_user_id uuid)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  target_group public.cell_groups%rowtype;
  account_role public.app_role;
begin
  if target_user_id is null then return false; end if;
  select * into target_group from public.cell_groups where id = target_group_id;
  if not found then return false; end if;
  select role into account_role from public.profiles where id = target_user_id and is_active = true;
  if not found then return false; end if;
  if account_role = 'admin' and exists (
    select 1 from public.super_admin_members where user_id = target_user_id
  ) then return true; end if;

  if target_group.management_only then
    return account_role = 'admin' and exists (
      select 1 from public.cell_group_admin_assignments
      where cell_group_id = target_group_id and admin_user_id = target_user_id
    );
  end if;
  if target_group.is_primary then return true; end if;
  if account_role = 'admin' then
    return target_group.leader_id = target_user_id or exists (
      select 1 from public.cell_group_admin_assignments
      where cell_group_id = target_group_id and admin_user_id = target_user_id
    );
  end if;
  return exists (
    select 1 from public.cell_group_members
    where cell_group_id = target_group_id and user_id = target_user_id
      and membership_status in ('active','new','temporarily_inactive')
  );
end;
$$;

create or replace function public.can_access_cell_group(target_group_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and public.is_active_user()
    and public.user_can_access_cell_group(target_group_id, auth.uid());
$$;

create or replace function public.guard_cell_group_kind()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if (new.is_primary is distinct from old.is_primary)
    or (new.management_only is distinct from old.management_only)
    or (new.system_key is distinct from old.system_key) then
    if not public.is_super_admin() then
      raise exception 'Cell group access classification is controlled by Super Admin.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_cell_group_kind on public.cell_groups;
create trigger guard_cell_group_kind before update on public.cell_groups
for each row execute function public.guard_cell_group_kind();

create or replace function public.can_manage_cell_group(p_group_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_active_user() and (
    public.is_super_admin()
    or (public.is_admin() and public.can_access_cell_group(p_group_id))
    or (
      not public.is_admin()
      and exists (
        select 1 from public.cell_groups
        where id = p_group_id and management_only = false and leader_id = auth.uid()
      )
    )
  );
$$;

create or replace function public.can_receive_cell_group_message(target_group_id uuid, target_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.can_access_cell_group(target_group_id)
    and public.user_can_access_cell_group(target_group_id, target_user_id);
$$;

revoke all on function public.primary_cell_group_id() from public, anon;
revoke all on function public.can_access_cell_group(uuid) from public, anon;
revoke all on function public.can_manage_cell_group(uuid) from public, anon;
grant execute on function public.primary_cell_group_id() to authenticated;
grant execute on function public.can_access_cell_group(uuid) to authenticated;
grant execute on function public.can_manage_cell_group(uuid) to authenticated;
revoke all on function public.can_receive_cell_group_message(uuid,uuid) from public, anon;
grant execute on function public.can_receive_cell_group_message(uuid,uuid) to authenticated;
revoke all on function public.user_can_access_cell_group(uuid,uuid) from public, anon, authenticated;
grant execute on function public.user_can_access_cell_group(uuid,uuid) to service_role;

create or replace function public.filter_notification_group_recipient()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.group_id is not null
    and not public.user_can_access_cell_group(new.group_id, new.user_id) then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function public.filter_notification_group_recipient() from public, anon, authenticated;
drop trigger if exists gc_filter_notification_group_recipient on public.notifications;
create trigger gc_filter_notification_group_recipient
before insert or update on public.notifications
for each row execute function public.filter_notification_group_recipient();

revoke all on function public.create_notification(uuid, public.notification_type, text, text, text, uuid) from public, anon, authenticated;

create or replace function public.toggle_task_completion(target_task uuid, next_status public.task_status)
returns public.tasks
language plpgsql security definer set search_path = public, pg_temp
as $$
declare updated_task public.tasks;
begin
  update public.tasks
  set status = next_status, updated_at = timezone('utc', now())
  where id = target_task
    and public.is_active_user()
    and public.can_access_cell_group(group_id)
    and (public.is_admin() or assignee_id = auth.uid())
  returning * into updated_task;
  if updated_task.id is null then raise exception 'You do not have permission to update this task.' using errcode = '42501'; end if;
  return updated_task;
end;
$$;
revoke all on function public.toggle_task_completion(uuid,public.task_status) from public, anon;
grant execute on function public.toggle_task_completion(uuid,public.task_status) to authenticated;

create or replace function public.log_cell_group_activity(
  p_group_id uuid,
  p_action_type text,
  p_description text,
  p_affected_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.can_manage_cell_group(p_group_id) then
    raise exception 'You cannot log activity for this cell group.' using errcode = '42501';
  end if;
  insert into public.cell_group_activity_log(cell_group_id,action_type,description,affected_user_id,performed_by,metadata)
  values(p_group_id,p_action_type,p_description,p_affected_user_id,auth.uid(),coalesce(p_metadata,'{}'::jsonb));
end;
$$;
revoke all on function public.log_cell_group_activity(uuid,text,text,uuid,jsonb) from public, anon;
grant execute on function public.log_cell_group_activity(uuid,text,text,uuid,jsonb) to authenticated;

-- Existing records are retained and attached to the established general group.
do $$
declare
  table_name text;
  scoped_tables text[] := array[
    'events','event_ideas','idea_votes','tasks','rsvps','event_check_ins',
    'messages','prayer_points','prayer_point_replies','prayer_reminders',
    'resources','notifications','announcements','announcement_replies',
    'leadership_assignments','virtual_meetings','virtual_meeting_attendance',
    'reactions','discipleship_classes','discipleship_class_sessions',
    'discipleship_enrollments','discipleship_lessons','discipleship_lesson_completions',
    'discipleship_member_notes','discipleship_session_attendance',
    'discipleship_discussions','discipleship_assignment_submissions',
    'discipleship_submission_history','bible_study_readings','bible_study_completions',
    'bible_study_takeaways','bible_study_takeaway_reactions',
    'bible_study_takeaway_replies','bible_study_questions',
    'bible_study_question_answers','bible_study_mentions',
    'bible_study_partner_streaks','gc_pulse_activities','gc_pulse_activity_keys',
    'gc_pulse_activity_responses'
  ];
begin
  foreach table_name in array scoped_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I add column if not exists group_id uuid references public.cell_groups(id) on delete cascade', table_name);
      execute format('update public.%I set group_id = coalesce(group_id, public.primary_cell_group_id())', table_name);
      execute format('alter table public.%I alter column group_id set not null', table_name);
      execute format('create index if not exists %I on public.%I (group_id)', 'idx_' || table_name || '_group', table_name);
      execute format('alter table public.%I enable row level security', table_name);
      execute format('drop policy if exists gc_group_scope on public.%I', table_name);
      execute format('create policy gc_group_scope on public.%I as restrictive for all to authenticated using (public.can_access_cell_group(group_id)) with check (public.can_access_cell_group(group_id))', table_name);
    end if;
  end loop;
end $$;

-- Leadership rotations may now occur independently on the same date per group.
alter table public.leadership_assignments
  drop constraint if exists leadership_assignments_assignment_type_assignment_date_key;
create unique index if not exists leadership_assignments_group_type_date_unique
  on public.leadership_assignments(group_id, assignment_type, assignment_date);

drop policy if exists gc_message_recipient_scope on public.messages;
create policy gc_message_recipient_scope on public.messages as restrictive
for insert to authenticated
with check (public.can_receive_cell_group_message(group_id, recipient_id));
drop policy if exists gc_message_recipient_update_scope on public.messages;
create policy gc_message_recipient_update_scope on public.messages as restrictive
for update to authenticated
using (public.can_receive_cell_group_message(group_id, recipient_id))
with check (public.can_receive_cell_group_message(group_id, recipient_id));

-- Preserve current Bible reading IDs and records while enabling separate group plans.
do $$
begin
  if to_regclass('public.bible_study_readings') is not null then
    alter table public.bible_study_readings drop constraint if exists bible_study_readings_reading_date_key;
    alter table public.bible_study_readings drop constraint if exists bible_study_readings_sort_order_key;
    alter table public.bible_study_readings drop constraint if exists bible_study_readings_book_chapter_reading_date_key;
    create unique index if not exists bible_study_readings_group_date_unique on public.bible_study_readings(group_id, reading_date);
    create unique index if not exists bible_study_readings_group_order_unique on public.bible_study_readings(group_id, sort_order);
    create unique index if not exists bible_study_readings_group_book_chapter_date_unique on public.bible_study_readings(group_id, book, chapter, reading_date);
  end if;
end $$;

-- Keep simultaneous Bible Study partner streaks separate across groups.
drop index if exists public.bible_partner_streak_one_active_pair;
create unique index if not exists bible_partner_streak_one_active_pair_group
  on public.bible_study_partner_streaks(group_id, member_one_id, member_two_id)
  where status in ('pending','active');
drop policy if exists gc_bible_partner_participants_scope on public.bible_study_partner_streaks;
create policy gc_bible_partner_participants_scope on public.bible_study_partner_streaks as restrictive
for all to authenticated
using (
  public.can_receive_cell_group_message(group_id, member_one_id)
  and public.can_receive_cell_group_message(group_id, member_two_id)
)
with check (
  public.can_receive_cell_group_message(group_id, member_one_id)
  and public.can_receive_cell_group_message(group_id, member_two_id)
);

-- Accept both the existing user-prefixed audio paths and the new group/user paths.
alter table public.bible_study_takeaways drop constraint if exists bible_study_takeaways_content_check;
alter table public.bible_study_takeaways add constraint bible_study_takeaways_content_check
  check (
    (content is null or char_length(trim(content)) <= 3000)
    and (nullif(trim(content), '') is not null or audio_path is not null)
    and (audio_path is null or (
      position('..' in audio_path) = 0
      and audio_mime_type is not null
      and audio_mime_type in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/aac')
      and (audio_path like (group_id::text || '/' || user_id::text || '/%') or audio_path like (user_id::text || '/%'))
    ))
    and (audio_duration_seconds is null or audio_duration_seconds between 1 and 900)
  ) not valid;

alter table public.bible_study_takeaway_replies drop constraint if exists bible_study_takeaway_replies_content_check;
alter table public.bible_study_takeaway_replies add constraint bible_study_takeaway_replies_content_check
  check (
    (content is null or char_length(trim(content)) between 1 and 2000)
    and (nullif(trim(content), '') is not null or audio_path is not null)
    and (audio_path is null or (
      position('..' in audio_path) = 0
      and audio_mime_type is not null
      and audio_mime_type in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/aac')
      and (audio_path like (group_id::text || '/' || user_id::text || '/%') or audio_path like (user_id::text || '/%'))
    ))
    and (audio_mime_type is null or audio_mime_type in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/aac'))
    and (audio_duration_seconds is null or audio_duration_seconds between 1 and 900)
  ) not valid;

alter table public.bible_study_questions drop constraint if exists bible_study_questions_content_check;
alter table public.bible_study_questions add constraint bible_study_questions_content_check
  check (
    (content is null or char_length(trim(content)) between 1 and 3000)
    and (nullif(trim(content), '') is not null or audio_path is not null)
    and (audio_path is null or (
      position('..' in audio_path) = 0
      and audio_mime_type is not null
      and audio_mime_type in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/aac')
      and (audio_path like (group_id::text || '/' || user_id::text || '/%') or audio_path like (user_id::text || '/%'))
    ))
    and (audio_mime_type is null or audio_mime_type in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/aac'))
    and (audio_duration_seconds is null or audio_duration_seconds between 1 and 900)
  ) not valid;

alter table public.bible_study_question_answers drop constraint if exists bible_study_question_answers_content_check;
alter table public.bible_study_question_answers add constraint bible_study_question_answers_content_check
  check (
    (content is null or char_length(trim(content)) between 1 and 3000)
    and (nullif(trim(content), '') is not null or audio_path is not null)
    and (audio_path is null or (
      position('..' in audio_path) = 0
      and audio_mime_type is not null
      and audio_mime_type in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/aac')
      and (audio_path like (group_id::text || '/' || user_id::text || '/%') or audio_path like (user_id::text || '/%'))
    ))
    and (audio_mime_type is null or audio_mime_type in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/aac'))
    and (audio_duration_seconds is null or audio_duration_seconds between 1 and 900)
  ) not valid;

-- Resolve dependent rows from their parent on insert. Clients cannot attach child rows
-- to another group's content by changing the submitted group_id.
create or replace function public.assign_cell_group_scope()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  resolved_group uuid;
  row_data jsonb := to_jsonb(new);
  row_group text := row_data ->> 'group_id';
  parent_id uuid;
  parent_partnership_id uuid;
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) ->> 'group_id') is distinct from (to_jsonb(old) ->> 'group_id') then
      raise exception 'Group ownership cannot be changed.' using errcode = '42501';
    end if;
  end if;

  case tg_table_name
    when 'event_ideas' then select group_id into resolved_group from public.events where id = (row_data->>'event_id')::uuid;
    when 'tasks' then select group_id into resolved_group from public.events where id = (row_data->>'event_id')::uuid;
    when 'rsvps' then select group_id into resolved_group from public.events where id = (row_data->>'event_id')::uuid;
    when 'event_check_ins' then select group_id into resolved_group from public.events where id = (row_data->>'event_id')::uuid;
    when 'idea_votes' then select event.group_id into resolved_group from public.event_ideas idea join public.events event on event.id = idea.event_id where idea.id = (row_data->>'idea_id')::uuid;
    when 'prayer_point_replies' then select group_id into resolved_group from public.prayer_points where id = (row_data->>'prayer_point_id')::uuid;
    when 'prayer_reminders' then select group_id into resolved_group from public.prayer_points where id = (row_data->>'prayer_point_id')::uuid;
    when 'announcement_replies' then select group_id into resolved_group from public.announcements where id = (row_data->>'announcement_id')::uuid;
    when 'virtual_meeting_attendance' then select group_id into resolved_group from public.virtual_meetings where id = (row_data->>'meeting_id')::uuid;
    when 'discipleship_class_sessions' then select group_id into resolved_group from public.discipleship_classes where id = (row_data->>'class_id')::uuid;
    when 'discipleship_enrollments' then select group_id into resolved_group from public.discipleship_classes where id = (row_data->>'class_id')::uuid;
    when 'discipleship_lessons' then select group_id into resolved_group from public.discipleship_classes where id = (row_data->>'class_id')::uuid;
    when 'discipleship_lesson_completions' then select class_item.group_id into resolved_group from public.discipleship_lessons lesson join public.discipleship_classes class_item on class_item.id = lesson.class_id where lesson.id = (row_data->>'lesson_id')::uuid;
    when 'discipleship_member_notes' then select class_item.group_id into resolved_group from public.discipleship_lessons lesson join public.discipleship_classes class_item on class_item.id = lesson.class_id where lesson.id = (row_data->>'lesson_id')::uuid;
    when 'discipleship_discussions' then select group_id into resolved_group from public.discipleship_classes where id = (row_data->>'class_id')::uuid;
    when 'discipleship_assignment_submissions' then select class_item.group_id into resolved_group from public.discipleship_lessons lesson join public.discipleship_classes class_item on class_item.id = lesson.class_id where lesson.id = (row_data->>'lesson_id')::uuid;
    when 'discipleship_submission_history' then select group_id into resolved_group from public.discipleship_assignment_submissions where id = (row_data->>'submission_id')::uuid;
    when 'discipleship_session_attendance' then select class_item.group_id into resolved_group from public.discipleship_class_sessions session join public.discipleship_classes class_item on class_item.id = session.class_id where session.id = (row_data->>'session_id')::uuid;
    when 'bible_study_completions' then select group_id into resolved_group from public.bible_study_readings where id = (row_data->>'reading_id')::uuid;
    when 'bible_study_takeaways' then select group_id into resolved_group from public.bible_study_readings where id = (row_data->>'reading_id')::uuid;
    when 'bible_study_takeaway_replies' then select group_id into resolved_group from public.bible_study_takeaways where id = (row_data->>'takeaway_id')::uuid;
    when 'bible_study_question_answers' then select group_id into resolved_group from public.bible_study_questions where id = (row_data->>'question_id')::uuid;
    when 'bible_study_takeaway_reactions' then
      case row_data->>'content_type'
        when 'takeaway' then select group_id into resolved_group from public.bible_study_takeaways where id = (row_data->>'content_id')::uuid;
        when 'takeaway_reply' then select group_id into resolved_group from public.bible_study_takeaway_replies where id = (row_data->>'content_id')::uuid;
        when 'question' then select group_id into resolved_group from public.bible_study_questions where id = (row_data->>'content_id')::uuid;
        when 'question_answer' then select group_id into resolved_group from public.bible_study_question_answers where id = (row_data->>'content_id')::uuid;
        else resolved_group := nullif(row_group, '')::uuid;
      end case;
    when 'bible_study_mentions' then
      case row_data->>'content_type'
        when 'takeaway' then select reading.group_id into resolved_group from public.bible_study_takeaways post join public.bible_study_readings reading on reading.id = post.reading_id where post.id = (row_data->>'content_id')::uuid;
        when 'takeaway_reply' then select group_id into resolved_group from public.bible_study_takeaway_replies where id = (row_data->>'content_id')::uuid;
        when 'question' then select group_id into resolved_group from public.bible_study_questions where id = (row_data->>'content_id')::uuid;
        when 'question_answer' then select group_id into resolved_group from public.bible_study_question_answers where id = (row_data->>'content_id')::uuid;
        else resolved_group := nullif(row_group, '')::uuid;
      end case;
    when 'gc_pulse_activities' then resolved_group := nullif(row_group, '')::uuid;
    when 'gc_pulse_activity_keys' then select group_id into resolved_group from public.gc_pulse_activities where id = (row_data->>'activity_id')::uuid;
    when 'gc_pulse_activity_responses' then select group_id into resolved_group from public.gc_pulse_activities where id = (row_data->>'activity_id')::uuid;
    when 'reactions' then
      parent_id := (row_data->>'entity_id')::uuid;
      case row_data->>'entity_table'
        when 'events' then select group_id into resolved_group from public.events where id = parent_id;
        when 'announcements' then select group_id into resolved_group from public.announcements where id = parent_id;
        when 'announcement_replies' then select group_id into resolved_group from public.announcement_replies where id = parent_id;
        when 'prayer_points' then select group_id into resolved_group from public.prayer_points where id = parent_id;
        when 'prayer_point_replies' then select group_id into resolved_group from public.prayer_point_replies where id = parent_id;
        when 'event_ideas' then select group_id into resolved_group from public.event_ideas where id = parent_id;
        when 'virtual_meetings' then select group_id into resolved_group from public.virtual_meetings where id = parent_id;
        when 'messages' then select group_id into resolved_group from public.messages where id = parent_id;
        when 'leadership_assignments' then select group_id into resolved_group from public.leadership_assignments where id = parent_id;
        when 'resources' then select group_id into resolved_group from public.resources where id = parent_id;
        when 'discipleship_classes' then select group_id into resolved_group from public.discipleship_classes where id = parent_id;
        when 'discipleship_discussions' then select group_id into resolved_group from public.discipleship_discussions where id = parent_id;
        when 'gc_pulse_activities' then select group_id into resolved_group from public.gc_pulse_activities where id = parent_id;
        when 'bible_study_partner_events' then
          select partnership.group_id, activity.partnership_id into resolved_group, parent_partnership_id
          from public.bible_study_partner_events activity
          join public.bible_study_partnerships partnership on partnership.id = activity.partnership_id
          where activity.id = parent_id and partnership.status = 'active';
        when 'bible_study_partner_messages' then
          select partnership.group_id, message.partnership_id into resolved_group, parent_partnership_id
          from public.bible_study_partner_messages message
          join public.bible_study_partnerships partnership on partnership.id = message.partnership_id
          where message.id = parent_id and partnership.status = 'active';
        when 'bible_study_partner_challenges' then
          select partnership.group_id, challenge.partnership_id into resolved_group, parent_partnership_id
          from public.bible_study_partner_challenges challenge
          join public.bible_study_partnerships partnership on partnership.id = challenge.partnership_id
          where challenge.id = parent_id and partnership.status = 'active';
        when 'bible_study_partnerships' then
          select group_id, id into resolved_group, parent_partnership_id
          from public.bible_study_partnerships where id = parent_id and status = 'active';
        else
          raise exception 'This reaction target is not supported.' using errcode = '23514';
      end case;
      if parent_partnership_id is not null and not exists (
        select 1 from public.bible_study_partnership_members member
        where member.partnership_id = parent_partnership_id
          and member.user_id = auth.uid() and member.status = 'active'
      ) then
        raise exception 'Active partnership membership is required to react to this activity.' using errcode = '42501';
      end if;
      if row_data->>'entity_table' like 'bible_study_partner_%' and parent_partnership_id is null then
        raise exception 'This partnership activity is unavailable.' using errcode = '42501';
      end if;
    when 'notifications' then
      parent_id := nullif(row_data->>'entity_id', '')::uuid;
      case row_data->>'entity_table'
        when 'events' then select group_id into resolved_group from public.events where id = parent_id;
        when 'event_ideas' then select group_id into resolved_group from public.event_ideas where id = parent_id;
        when 'tasks' then select group_id into resolved_group from public.tasks where id = parent_id;
        when 'messages' then select group_id into resolved_group from public.messages where id = parent_id;
        when 'prayer_points' then select group_id into resolved_group from public.prayer_points where id = parent_id;
        when 'prayer_point_replies' then select group_id into resolved_group from public.prayer_point_replies where id = parent_id;
        when 'cell_group_members' then select cell_group_id into resolved_group from public.cell_group_members where id = parent_id;
        when 'announcements' then select group_id into resolved_group from public.announcements where id = parent_id;
        when 'announcement_replies' then select group_id into resolved_group from public.announcement_replies where id = parent_id;
        when 'resources' then select group_id into resolved_group from public.resources where id = parent_id;
        when 'leadership_assignments' then select group_id into resolved_group from public.leadership_assignments where id = parent_id;
        when 'virtual_meetings' then select group_id into resolved_group from public.virtual_meetings where id = parent_id;
        when 'virtual_meeting_attendance' then select group_id into resolved_group from public.virtual_meeting_attendance where meeting_id = parent_id limit 1;
        when 'discipleship_classes' then select group_id into resolved_group from public.discipleship_classes where id = parent_id;
        when 'discipleship_class_sessions' then select group_id into resolved_group from public.discipleship_class_sessions where id = parent_id;
        when 'discipleship_enrollments' then select group_id into resolved_group from public.discipleship_enrollments where class_id = parent_id limit 1;
        when 'discipleship_lessons' then select group_id into resolved_group from public.discipleship_lessons where id = parent_id;
        when 'discipleship_lesson_completions' then select group_id into resolved_group from public.discipleship_lesson_completions where lesson_id = parent_id limit 1;
        when 'discipleship_member_notes' then select group_id into resolved_group from public.discipleship_member_notes where id = parent_id;
        when 'discipleship_discussions' then select group_id into resolved_group from public.discipleship_discussions where id = parent_id;
        when 'discipleship_assignment_submissions' then select group_id into resolved_group from public.discipleship_assignment_submissions where id = parent_id;
        when 'discipleship_submission_history' then select group_id into resolved_group from public.discipleship_submission_history where id = parent_id;
        when 'bible_study_readings' then select group_id into resolved_group from public.bible_study_readings where id = parent_id;
        when 'bible_study_takeaway' then select reading.group_id into resolved_group from public.bible_study_takeaways post join public.bible_study_readings reading on reading.id = post.reading_id where post.id = parent_id;
        when 'bible_study_question' then select group_id into resolved_group from public.bible_study_questions where id = parent_id;
        when 'bible_study_question_answer' then select group_id into resolved_group from public.bible_study_question_answers where id = parent_id;
        when 'bible_study_takeaway_reply' then select group_id into resolved_group from public.bible_study_takeaway_replies where id = parent_id;
        when 'bible_study_daily_content' then select group_id into resolved_group from public.bible_study_daily_content where id = parent_id;
        when 'bible_study_daily_content_response' then select group_id into resolved_group from public.bible_study_daily_content_responses where id = parent_id;
        when 'bible_study_takeaways' then select group_id into resolved_group from public.bible_study_takeaways where id = parent_id;
        when 'bible_study_takeaway_replies' then select group_id into resolved_group from public.bible_study_takeaway_replies where id = parent_id;
        when 'bible_study_questions' then select group_id into resolved_group from public.bible_study_questions where id = parent_id;
        when 'bible_study_question_answers' then select group_id into resolved_group from public.bible_study_question_answers where id = parent_id;
        when 'gc_pulse_activities' then select group_id into resolved_group from public.gc_pulse_activities where id = parent_id;
        when 'bible_study_partner_streaks' then select group_id into resolved_group from public.bible_study_partner_streaks where id = parent_id;
        else resolved_group := null;
      end case;
    else resolved_group := nullif(row_group, '')::uuid;
  end case;

  if tg_table_name = 'notifications'
    and nullif(row_data->>'entity_table', '') is not null
    and resolved_group is null
    and tg_op = 'INSERT' then
    raise exception 'The notification group could not be verified.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if resolved_group is not null and resolved_group <> (row_data->>'group_id')::uuid then
      raise exception 'A record cannot be moved away from its parent group.' using errcode = '42501';
    end if;
    return new;
  end if;

  if resolved_group is null and row_group is not null then resolved_group := row_group::uuid; end if;
  if resolved_group is null then resolved_group := public.primary_cell_group_id(); end if;
  if resolved_group is null then raise exception 'A cell group is required.'; end if;
  new := jsonb_populate_record(new, jsonb_build_object('group_id', resolved_group));
  return new;
end;
$$;

do $$
declare
  table_name text;
  scoped_tables text[] := array[
    'events','event_ideas','idea_votes','tasks','rsvps','event_check_ins',
    'messages','prayer_points','prayer_point_replies','prayer_reminders',
    'resources','notifications','announcements','announcement_replies',
    'leadership_assignments','virtual_meetings','virtual_meeting_attendance',
    'reactions','discipleship_classes','discipleship_class_sessions',
    'discipleship_enrollments','discipleship_lessons','discipleship_lesson_completions',
    'discipleship_member_notes','discipleship_session_attendance',
    'discipleship_discussions','discipleship_assignment_submissions',
    'discipleship_submission_history','bible_study_readings','bible_study_completions',
    'bible_study_takeaways','bible_study_takeaway_reactions',
    'bible_study_takeaway_replies','bible_study_questions',
    'bible_study_question_answers','bible_study_mentions',
    'bible_study_partner_streaks','gc_pulse_activities','gc_pulse_activity_keys',
    'gc_pulse_activity_responses'
  ];
begin
  foreach table_name in array scoped_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('drop trigger if exists assign_cell_group_scope on public.%I', table_name);
      execute format('create trigger assign_cell_group_scope before insert or update on public.%I for each row execute function public.assign_cell_group_scope()', table_name);
    end if;
  end loop;
end $$;

-- Only Super Admins may rename or configure management-only groups.
drop policy if exists "cell_groups_select" on public.cell_groups;
drop policy if exists "cell_groups_manage" on public.cell_groups;
drop policy if exists cell_groups_select_authorized on public.cell_groups;
drop policy if exists cell_groups_insert_super_admin on public.cell_groups;
drop policy if exists cell_groups_update_authorized on public.cell_groups;
create policy cell_groups_select_authorized on public.cell_groups
for select to authenticated using (public.can_access_cell_group(id));
create policy cell_groups_insert_super_admin on public.cell_groups
for insert to authenticated with check (public.is_super_admin());
create policy cell_groups_update_authorized on public.cell_groups
for update to authenticated
using (public.can_manage_cell_group(id))
with check (public.can_manage_cell_group(id) and (not management_only or public.is_super_admin()));

-- Keep group administrator grants visible only to Super Admin, with a database audit.
do $$
begin
  if to_regclass('public.super_admin_audit_logs') is not null then
    alter table public.super_admin_audit_logs drop constraint if exists super_admin_audit_logs_action_check;
    alter table public.super_admin_audit_logs add constraint super_admin_audit_logs_action_check
      check (action in ('admin_role_granted','admin_role_revoked','member_paused','member_restored','admin_bootstrap_granted','super_admin_bootstrapped','member_deleted','cell_group_admin_assigned','cell_group_admin_revoked'));
  end if;
end $$;

create or replace function public.audit_cell_group_admin_assignment()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and to_regclass('public.super_admin_audit_logs') is not null then
    insert into public.super_admin_audit_logs(actor_id, action, target_user_id, metadata)
    values (
      auth.uid(),
      case when tg_op = 'INSERT' then 'cell_group_admin_assigned' else 'cell_group_admin_revoked' end,
      case when tg_op = 'INSERT' then new.admin_user_id else old.admin_user_id end,
      jsonb_build_object(
        'cell_group_id', case when tg_op = 'INSERT' then new.cell_group_id else old.cell_group_id end,
        'admin_user_id', case when tg_op = 'INSERT' then new.admin_user_id else old.admin_user_id end
      )
    );
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists audit_cell_group_admin_assignment on public.cell_group_admin_assignments;
create trigger audit_cell_group_admin_assignment after insert or delete on public.cell_group_admin_assignments
for each row execute function public.audit_cell_group_admin_assignment();

-- Tighten the existing cell-group management policies without removing their
-- owner/leader checks or weakening the database's role model.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'cell_group_members','cell_group_join_requests','cell_group_invitations',
    'cell_group_rules','cell_group_activity_log'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('drop policy if exists gc_group_scope on public.%I', table_name);
      execute format('create policy gc_group_scope on public.%I as restrictive for all to authenticated using (public.can_access_cell_group(cell_group_id)) with check (public.can_access_cell_group(cell_group_id))', table_name);
    end if;
  end loop;
end $$;

-- Profile rows are shared across groups, but admins can only discover or edit
-- profiles tied to a group they can access (plus their own profile).
create or replace function public.can_view_profile_in_accessible_group(target_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and public.is_active_user() and (
    auth.uid() = target_user_id
    or public.is_super_admin()
    or exists (
      select 1 from public.cell_group_members membership
      where membership.user_id = target_user_id
        and public.can_access_cell_group(membership.cell_group_id)
    )
    or exists (
      select 1 from public.cell_groups accessible_group
      where accessible_group.leader_id = target_user_id
        and public.can_access_cell_group(accessible_group.id)
    )
    or exists (
      select 1 from public.cell_group_admin_assignments group_admin
      where group_admin.admin_user_id = target_user_id
        and public.can_access_cell_group(group_admin.cell_group_id)
    )
  );
$$;
revoke all on function public.can_view_profile_in_accessible_group(uuid) from public, anon;
grant execute on function public.can_view_profile_in_accessible_group(uuid) to authenticated;

drop policy if exists gc_profiles_cell_group_scope on public.profiles;
create policy gc_profiles_cell_group_scope on public.profiles as restrictive
for select to authenticated
using (public.can_view_profile_in_accessible_group(id));
drop policy if exists gc_profiles_update_cell_group_scope on public.profiles;
create policy gc_profiles_update_cell_group_scope on public.profiles as restrictive
for update to authenticated
using (public.can_view_profile_in_accessible_group(id))
with check (public.can_view_profile_in_accessible_group(id));

create or replace function public.cell_group_storage_access(object_name text, require_owner boolean default false)
returns boolean
language plpgsql stable security definer
set search_path = public, storage, pg_temp
as $$
declare
  folders text[] := storage.foldername(object_name);
  target_group uuid;
begin
  if cardinality(folders) >= 2 and folders[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    target_group := folders[1]::uuid;
    return public.can_access_cell_group(target_group)
      and (not require_owner or folders[2] = auth.uid()::text or public.can_manage_cell_group(target_group));
  end if;
  return cardinality(folders) = 1
    and public.can_access_cell_group(public.primary_cell_group_id())
    and (not require_owner or folders[1] = auth.uid()::text or public.can_manage_cell_group(public.primary_cell_group_id()));
end;
$$;

revoke all on function public.cell_group_storage_access(text, boolean) from public, anon;
grant execute on function public.cell_group_storage_access(text, boolean) to authenticated;

drop policy if exists "bible_audio_read_active" on storage.objects;
drop policy if exists "bible_audio_insert_owner" on storage.objects;
drop policy if exists "bible_audio_update_owner" on storage.objects;
drop policy if exists "bible_audio_delete_owner" on storage.objects;
drop policy if exists "bible_audio_read_cell_group" on storage.objects;
drop policy if exists "bible_audio_insert_cell_group_owner" on storage.objects;
drop policy if exists "bible_audio_update_cell_group_owner" on storage.objects;
drop policy if exists "bible_audio_delete_cell_group_owner" on storage.objects;
create policy "bible_audio_read_cell_group" on storage.objects for select to authenticated
using (bucket_id = 'bible-study-audio' and public.cell_group_storage_access(name, false));
create policy "bible_audio_insert_cell_group_owner" on storage.objects for insert to authenticated
with check (
  bucket_id = 'bible-study-audio'
  and public.cell_group_storage_access(name, true)
  and cardinality(storage.foldername(name)) >= 2
  and (storage.foldername(name))[2] = auth.uid()::text
);
create policy "bible_audio_update_cell_group_owner" on storage.objects for update to authenticated
using (bucket_id = 'bible-study-audio' and public.cell_group_storage_access(name, true))
with check (bucket_id = 'bible-study-audio' and public.cell_group_storage_access(name, true));
create policy "bible_audio_delete_cell_group_owner" on storage.objects for delete to authenticated
using (bucket_id = 'bible-study-audio' and public.cell_group_storage_access(name, true));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('announcement-images', 'announcement-images', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "announcement_images_upload_own" on storage.objects;
drop policy if exists "announcement_images_update_own" on storage.objects;
drop policy if exists "announcement_images_delete_own_or_admin" on storage.objects;
drop policy if exists announcement_images_read_group on storage.objects;
drop policy if exists announcement_images_upload_group on storage.objects;
drop policy if exists announcement_images_update_group on storage.objects;
drop policy if exists announcement_images_delete_group on storage.objects;
create policy announcement_images_read_group on storage.objects for select to authenticated
using (bucket_id = 'announcement-images' and public.cell_group_storage_access(name, false));
create policy announcement_images_upload_group on storage.objects for insert to authenticated
with check (
  bucket_id = 'announcement-images'
  and public.cell_group_storage_access(name, true)
  and cardinality(storage.foldername(name)) >= 2
  and (storage.foldername(name))[2] = auth.uid()::text
);
create policy announcement_images_update_group on storage.objects for update to authenticated
using (bucket_id = 'announcement-images' and public.cell_group_storage_access(name, true))
with check (bucket_id = 'announcement-images' and public.cell_group_storage_access(name, true));
create policy announcement_images_delete_group on storage.objects for delete to authenticated
using (bucket_id = 'announcement-images' and public.cell_group_storage_access(name, true));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resources', 'resources', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "resources_select_all" on storage.objects;
drop policy if exists "resources_admin_insert" on storage.objects;
drop policy if exists "resources_admin_update" on storage.objects;
drop policy if exists "resources_admin_delete" on storage.objects;
drop policy if exists resources_read_cell_group on storage.objects;
drop policy if exists resources_upload_cell_group on storage.objects;
drop policy if exists resources_update_cell_group on storage.objects;
drop policy if exists resources_delete_cell_group on storage.objects;
create policy resources_read_cell_group on storage.objects for select to authenticated
using (bucket_id = 'resources' and public.cell_group_storage_access(name, false));
create policy resources_upload_cell_group on storage.objects for insert to authenticated
with check (
  bucket_id = 'resources'
  and public.is_admin()
  and public.cell_group_storage_access(name, true)
  and cardinality(storage.foldername(name)) >= 2
  and (storage.foldername(name))[2] = auth.uid()::text
);
create policy resources_update_cell_group on storage.objects for update to authenticated
using (bucket_id = 'resources' and public.is_admin() and public.cell_group_storage_access(name, true))
with check (bucket_id = 'resources' and public.is_admin() and public.cell_group_storage_access(name, true));
create policy resources_delete_cell_group on storage.objects for delete to authenticated
using (bucket_id = 'resources' and public.is_admin() and public.cell_group_storage_access(name, true));

create or replace function public.discipleship_storage_access(object_name text, access_mode text default 'group')
returns boolean
language plpgsql stable security definer
set search_path = public, storage, pg_temp
as $$
declare
  folders text[] := storage.foldername(object_name);
  class_id uuid;
  class_group_id uuid;
begin
  if cardinality(folders) < 1
    or folders[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  if access_mode not in ('group','manage','submission') then return false; end if;
  class_id := folders[1]::uuid;
  select group_id into class_group_id from public.discipleship_classes where id = class_id;
  if class_group_id is null or not public.can_access_cell_group(class_group_id) then return false; end if;
  if access_mode = 'manage' then return public.can_manage_discipleship_class(class_id); end if;
  if access_mode = 'submission' then
    return public.can_manage_discipleship_class(class_id)
      or (
        cardinality(folders) >= 3
        and folders[3] = auth.uid()::text
        and public.is_enrolled_in_discipleship_class(class_id)
      );
  end if;
  return true;
end;
$$;
revoke all on function public.discipleship_storage_access(text,text) from public, anon;
grant execute on function public.discipleship_storage_access(text,text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('discipleship-materials', 'discipleship-materials', false, 15728640,
  array['application/pdf','image/png','image/jpeg','image/webp','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/zip'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "discipleship_materials_select_all" on storage.objects;
drop policy if exists "discipleship_materials_insert" on storage.objects;
drop policy if exists "discipleship_materials_update" on storage.objects;
drop policy if exists "discipleship_materials_delete" on storage.objects;
drop policy if exists discipleship_materials_read_group on storage.objects;
drop policy if exists discipleship_materials_upload_group on storage.objects;
drop policy if exists discipleship_materials_update_group on storage.objects;
drop policy if exists discipleship_materials_delete_group on storage.objects;
create policy discipleship_materials_read_group on storage.objects for select to authenticated
using (bucket_id = 'discipleship-materials' and public.discipleship_storage_access(name, 'group'));
create policy discipleship_materials_upload_group on storage.objects for insert to authenticated
with check (bucket_id = 'discipleship-materials' and public.discipleship_storage_access(name, 'manage'));
create policy discipleship_materials_update_group on storage.objects for update to authenticated
using (bucket_id = 'discipleship-materials' and public.discipleship_storage_access(name, 'manage'))
with check (bucket_id = 'discipleship-materials' and public.discipleship_storage_access(name, 'manage'));
create policy discipleship_materials_delete_group on storage.objects for delete to authenticated
using (bucket_id = 'discipleship-materials' and public.discipleship_storage_access(name, 'manage'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('discipleship-submissions', 'discipleship-submissions', false, 26214400,
  array['application/pdf','image/png','image/jpeg','image/webp','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/zip'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "discipleship_submissions_select" on storage.objects;
drop policy if exists "discipleship_submissions_insert" on storage.objects;
drop policy if exists "discipleship_submissions_update" on storage.objects;
drop policy if exists "discipleship_submissions_delete" on storage.objects;
drop policy if exists discipleship_submissions_read_group on storage.objects;
drop policy if exists discipleship_submissions_upload_group on storage.objects;
drop policy if exists discipleship_submissions_update_group on storage.objects;
drop policy if exists discipleship_submissions_delete_group on storage.objects;
create policy discipleship_submissions_read_group on storage.objects for select to authenticated
using (bucket_id = 'discipleship-submissions' and public.discipleship_storage_access(name, 'submission'));
create policy discipleship_submissions_upload_group on storage.objects for insert to authenticated
with check (bucket_id = 'discipleship-submissions' and public.discipleship_storage_access(name, 'submission'));
create policy discipleship_submissions_update_group on storage.objects for update to authenticated
using (bucket_id = 'discipleship-submissions' and public.discipleship_storage_access(name, 'submission'))
with check (bucket_id = 'discipleship-submissions' and public.discipleship_storage_access(name, 'submission'));
create policy discipleship_submissions_delete_group on storage.objects for delete to authenticated
using (bucket_id = 'discipleship-submissions' and public.discipleship_storage_access(name, 'submission'));

-- Security-definer activity RPCs must repeat the group check; they bypass table RLS.
create or replace function public.submit_gc_pulse_response(target_activity_id uuid, selected_option integer)
returns table (awarded_points integer)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  activity_row public.gc_pulse_activities%rowtype;
  expected_option integer;
  score integer := 0;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'Active membership is required.'; end if;
  select * into activity_row from public.gc_pulse_activities where id = target_activity_id for update;
  if not found or not public.can_access_cell_group(activity_row.group_id) then raise exception 'Activity is unavailable.'; end if;
  if activity_row.status <> 'open' then raise exception 'This activity is closed.'; end if;
  if activity_row.starts_at > now() then raise exception 'This activity has not started.'; end if;
  if activity_row.closes_at is not null and activity_row.closes_at <= now() then raise exception 'This activity has closed.'; end if;
  if selected_option < 0 or selected_option >= jsonb_array_length(activity_row.options) then raise exception 'Choose one of the available answers.'; end if;
  if activity_row.activity_type in ('quick_quiz','riddle','bible_challenge') then
    select correct_option into expected_option from public.gc_pulse_activity_keys where activity_id = target_activity_id;
    if expected_option is null then raise exception 'The answer key is unavailable.'; end if;
    score := case when selected_option = expected_option then 1 else 0 end;
  end if;
  insert into public.gc_pulse_activity_responses(activity_id,user_id,selected_option,awarded_points)
  values (target_activity_id, auth.uid(), selected_option, score);
  return query select score;
exception when unique_violation then raise exception 'You have already participated in this activity.';
end;
$$;

create or replace function public.gc_pulse_activity_results(target_activity_id uuid)
returns table (selected_option integer, response_count bigint, points_awarded bigint)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare activity_row public.gc_pulse_activities%rowtype;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'Active membership is required.'; end if;
  select * into activity_row from public.gc_pulse_activities where id = target_activity_id;
  if not found or not public.can_access_cell_group(activity_row.group_id) then raise exception 'Activity is unavailable.'; end if;
  if activity_row.status = 'open' and (activity_row.closes_at is null or activity_row.closes_at > now()) then raise exception 'Results are available after the activity ends.'; end if;
  return query select response.selected_option, count(*)::bigint, sum(response.awarded_points)::bigint
  from public.gc_pulse_activity_responses response where response.activity_id = target_activity_id
  group by response.selected_option order by response.selected_option;
end;
$$;

drop function if exists public.gc_pulse_activity_participants(uuid);
create function public.gc_pulse_activity_participants(target_activity_id uuid)
returns table (user_id uuid, full_name text, selected_option integer, awarded_points integer, submitted_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare activity_row public.gc_pulse_activities%rowtype;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'Active membership is required.'; end if;
  select * into activity_row from public.gc_pulse_activities where id = target_activity_id;
  if not found or not public.can_access_cell_group(activity_row.group_id) then raise exception 'Activity is unavailable.'; end if;
  if activity_row.status = 'open' and (activity_row.closes_at is null or activity_row.closes_at > now()) then raise exception 'Participant details are available after the activity ends.'; end if;
  if activity_row.responses_anonymous then return; end if;
  return query select response.user_id, member.full_name, response.selected_option, response.awarded_points, response.submitted_at
  from public.gc_pulse_activity_responses response join public.profiles member on member.id = response.user_id
  where response.activity_id = target_activity_id order by response.submitted_at;
end;
$$;

create or replace function public.gc_pulse_activity_participant_count(target_activity_id uuid)
returns bigint language plpgsql security definer set search_path = public, pg_temp
as $$
declare activity_group_id uuid;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'Active membership is required.'; end if;
  select group_id into activity_group_id from public.gc_pulse_activities where id = target_activity_id;
  if activity_group_id is null or not public.can_access_cell_group(activity_group_id) then raise exception 'Activity is unavailable.'; end if;
  return (select count(*)::bigint from public.gc_pulse_activity_responses where activity_id = target_activity_id);
end;
$$;

create or replace function public.close_gc_pulse_activity(target_activity_id uuid, final_status text default 'completed')
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare activity_group_id uuid;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'Active membership is required.'; end if;
  select group_id into activity_group_id from public.gc_pulse_activities where id = target_activity_id;
  if activity_group_id is null or not public.can_manage_cell_group(activity_group_id) then raise exception 'Administrator access to this group is required.'; end if;
  if final_status not in ('completed','cancelled') then raise exception 'Invalid final activity status.'; end if;
  update public.gc_pulse_activities set status = final_status, updated_at = timezone('utc', now())
  where id = target_activity_id and status = 'open';
  if not found then raise exception 'Open activity not found.'; end if;
end;
$$;

create or replace function public.reveal_gc_pulse_answer(target_activity_id uuid)
returns table (correct_option integer, explanation text)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare activity_row public.gc_pulse_activities%rowtype;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'Active membership is required.'; end if;
  select * into activity_row from public.gc_pulse_activities where id = target_activity_id;
  if not found or not public.can_access_cell_group(activity_row.group_id) then raise exception 'Activity is unavailable.'; end if;
  if activity_row.activity_type not in ('quick_quiz','riddle','bible_challenge') then raise exception 'This activity has no answer key.'; end if;
  if activity_row.status = 'cancelled' or (activity_row.status = 'open' and (activity_row.closes_at is null or activity_row.closes_at > now())) then raise exception 'The answer is available after the activity ends.'; end if;
  return query select key.correct_option, key.explanation from public.gc_pulse_activity_keys key where key.activity_id = target_activity_id;
end;
$$;

revoke all on function public.submit_gc_pulse_response(uuid,integer) from public, anon;
revoke all on function public.gc_pulse_activity_results(uuid) from public, anon;
revoke all on function public.gc_pulse_activity_participants(uuid) from public, anon;
revoke all on function public.gc_pulse_activity_participant_count(uuid) from public, anon;
revoke all on function public.close_gc_pulse_activity(uuid,text) from public, anon;
revoke all on function public.reveal_gc_pulse_answer(uuid) from public, anon;
grant execute on function public.submit_gc_pulse_response(uuid,integer) to authenticated;
grant execute on function public.gc_pulse_activity_results(uuid) to authenticated;
grant execute on function public.gc_pulse_activity_participants(uuid) to authenticated;
grant execute on function public.gc_pulse_activity_participant_count(uuid) to authenticated;
grant execute on function public.close_gc_pulse_activity(uuid,text) to authenticated;
grant execute on function public.reveal_gc_pulse_answer(uuid) to authenticated;

create or replace function public.respond_to_bible_partner_streak(streak_id uuid, response text)
returns public.bible_study_partner_streaks language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  result public.bible_study_partner_streaks;
  target_group_id uuid;
begin
  if response not in ('active','declined') then raise exception 'Invalid response.'; end if;
  select streak.group_id into target_group_id from public.bible_study_partner_streaks streak
  where streak.id = streak_id and streak.status = 'pending' and streak.invited_user_id = auth.uid();
  if target_group_id is null or not public.can_access_cell_group(target_group_id) then raise exception 'Invitation is unavailable.'; end if;
  update public.bible_study_partner_streaks set status = response, responded_at = timezone('utc', now()),
    started_on = case when response = 'active' then coalesce((select min(reading.reading_date) from public.bible_study_readings reading where reading.group_id = target_group_id and reading.reading_date >= current_date), current_date) else null end,
    updated_at = timezone('utc', now())
  where id = streak_id and status = 'pending' and invited_user_id = auth.uid()
    and group_id = target_group_id
  returning * into result;
  if result.id is null then raise exception 'Invitation is unavailable.'; end if;
  return result;
end;
$$;

create or replace function public.end_bible_partner_streak(streak_id uuid)
returns public.bible_study_partner_streaks language plpgsql security definer set search_path = public, pg_temp
as $$
declare result public.bible_study_partner_streaks;
begin
  update public.bible_study_partner_streaks set status = 'ended', ended_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where id = streak_id and status = 'active' and auth.uid() in (member_one_id, member_two_id)
    and public.can_access_cell_group(group_id)
  returning * into result;
  if result.id is null then raise exception 'Streak is unavailable.'; end if;
  return result;
end;
$$;

create or replace function public.send_bible_partner_encouragement(streak_id uuid, message text)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  partner_id uuid;
  partner_group_id uuid;
begin
  select case when member_one_id = auth.uid() then member_two_id else member_one_id end, group_id
  into partner_id, partner_group_id
  from public.bible_study_partner_streaks
  where id = streak_id and status = 'active' and auth.uid() in (member_one_id, member_two_id)
    and public.can_access_cell_group(group_id);
  if partner_id is null then raise exception 'Streak is unavailable.'; end if;
  insert into public.notifications(user_id,notification_type,title,body,entity_table,entity_id,group_id)
  values(partner_id,'bible_study_takeaway_reply'::public.notification_type,'Partner Streak encouragement',left(message,180),'bible_study_partner_streaks',streak_id,partner_group_id);
end;
$$;

revoke all on function public.respond_to_bible_partner_streak(uuid,text) from public, anon;
revoke all on function public.end_bible_partner_streak(uuid) from public, anon;
revoke all on function public.send_bible_partner_encouragement(uuid,text) from public, anon;
grant execute on function public.respond_to_bible_partner_streak(uuid,text) to authenticated;
grant execute on function public.end_bible_partner_streak(uuid) to authenticated;
grant execute on function public.send_bible_partner_encouragement(uuid,text) to authenticated;

create or replace function public.recommend_next_leader(
  target_type public.leadership_type,
  target_group_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  recommended_user_id uuid;
begin
  if auth.uid() is null or not public.is_active_user()
    or not public.can_manage_cell_group(target_group_id) then
    raise exception 'Administrator access to this group is required.' using errcode = '42501';
  end if;

  select candidate.id into recommended_user_id
  from public.profiles candidate
  where candidate.is_active = true
    and public.user_can_access_cell_group(target_group_id, candidate.id)
  order by (
    select max(assignment.assignment_date)
    from public.leadership_assignments assignment
    where assignment.leader_id = candidate.id
      and assignment.assignment_type = target_type
      and assignment.group_id = target_group_id
  ) asc nulls first, candidate.id asc
  limit 1;

  return recommended_user_id;
end;
$$;

create or replace function public.recommend_next_leader(target_type public.leadership_type)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return public.recommend_next_leader(target_type, public.primary_cell_group_id());
end;
$$;

revoke all on function public.recommend_next_leader(public.leadership_type, uuid) from public, anon;
revoke all on function public.recommend_next_leader(public.leadership_type) from public, anon;
grant execute on function public.recommend_next_leader(public.leadership_type, uuid) to authenticated;
grant execute on function public.recommend_next_leader(public.leadership_type) to authenticated;

