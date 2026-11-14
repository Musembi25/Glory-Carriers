-- Permanently remove member accounts without deleting shared church content.
-- Apply after the existing Super Admin, cell-group, Bible Study, assignments,
-- and Fun Zone migrations.
begin;

-- Audit targets are historical identifiers. They must not depend on a profile
-- row that is intentionally removed during permanent account deletion.
alter table public.super_admin_audit_logs
  alter column target_user_id drop not null;
alter table public.super_admin_audit_logs
  drop constraint if exists super_admin_audit_logs_target_user_id_fkey;

do $$
begin
  if to_regclass('public.prayer_points') is not null then
    alter table public.prayer_points alter column created_by drop not null;
    alter table public.prayer_points drop constraint if exists prayer_points_created_by_fkey;
    alter table public.prayer_points
      add constraint prayer_points_created_by_fkey
      foreign key (created_by) references public.profiles(id) on delete set null;
  end if;

  if to_regclass('public.leadership_assignments') is not null then
    alter table public.leadership_assignments alter column leader_id drop not null;
    alter table public.leadership_assignments drop constraint if exists leadership_assignments_leader_id_fkey;
    alter table public.leadership_assignments
      add constraint leadership_assignments_leader_id_fkey
      foreign key (leader_id) references public.profiles(id) on delete set null;
  end if;

  if to_regclass('public.cell_group_activity_log') is not null then
    alter table public.cell_group_activity_log alter column performed_by drop not null;
    alter table public.cell_group_activity_log drop constraint if exists cell_group_activity_log_performed_by_fkey;
    alter table public.cell_group_activity_log
      add constraint cell_group_activity_log_performed_by_fkey
      foreign key (performed_by) references public.profiles(id) on delete set null;
  end if;

  if to_regclass('public.gc_pulse_activities') is not null then
    alter table public.gc_pulse_activities alter column created_by drop not null;
    alter table public.gc_pulse_activities drop constraint if exists gc_pulse_activities_created_by_fkey;
    alter table public.gc_pulse_activities
      add constraint gc_pulse_activities_created_by_fkey
      foreign key (created_by) references public.profiles(id) on delete set null;
  end if;

  if to_regclass('public.gc_pulse_activity_keys') is not null then
    alter table public.gc_pulse_activity_keys alter column created_by drop not null;
    alter table public.gc_pulse_activity_keys drop constraint if exists gc_pulse_activity_keys_created_by_fkey;
    alter table public.gc_pulse_activity_keys
      add constraint gc_pulse_activity_keys_created_by_fkey
      foreign key (created_by) references public.profiles(id) on delete set null;
  end if;

  if to_regclass('public.bible_study_partnerships') is not null then
    alter table public.bible_study_partnerships alter column created_by drop not null;
    alter table public.bible_study_partnerships drop constraint if exists bible_study_partnerships_created_by_fkey;
    alter table public.bible_study_partnerships
      add constraint bible_study_partnerships_created_by_fkey
      foreign key (created_by) references public.profiles(id) on delete set null;
  end if;

  if to_regclass('public.bible_study_partnership_members') is not null then
    alter table public.bible_study_partnership_members alter column invited_by drop not null;
    alter table public.bible_study_partnership_members drop constraint if exists bible_study_partnership_members_invited_by_fkey;
    alter table public.bible_study_partnership_members
      add constraint bible_study_partnership_members_invited_by_fkey
      foreign key (invited_by) references public.profiles(id) on delete set null;
  end if;

  if to_regclass('public.bible_study_partner_challenges') is not null then
    alter table public.bible_study_partner_challenges alter column created_by drop not null;
    alter table public.bible_study_partner_challenges drop constraint if exists bible_study_partner_challenges_created_by_fkey;
    alter table public.bible_study_partner_challenges
      add constraint bible_study_partner_challenges_created_by_fkey
      foreign key (created_by) references public.profiles(id) on delete set null;
  end if;

  if to_regclass('public.bible_study_partner_events') is not null then
    alter table public.bible_study_partner_events alter column actor_id drop not null;
    alter table public.bible_study_partner_events drop constraint if exists bible_study_partner_events_actor_id_fkey;
    alter table public.bible_study_partner_events
      add constraint bible_study_partner_events_actor_id_fkey
      foreign key (actor_id) references public.profiles(id) on delete set null;
  end if;
end;
$$;

create table if not exists public.super_admin_storage_deletion_queue (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null check (bucket_id in ('profile-photos', 'discipleship-submissions', 'bible-study-audio')),
  object_path text not null check (length(trim(object_path)) > 0 and position('..' in object_path) = 0),
  target_user_id uuid not null,
  requested_by uuid references public.profiles(id) on delete set null,
  queued_at timestamptz not null default timezone('utc', now()),
  unique (bucket_id, object_path)
);

alter table public.super_admin_storage_deletion_queue enable row level security;
revoke all on public.super_admin_storage_deletion_queue from public, anon, authenticated;

create or replace function public.super_admin_delete_members(target_user_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  requested_ids uuid[];
  existing_ids uuid[];
  storage_source record;
  selected_count integer := 0;
  deleted_count integer := 0;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Super Admin privileges are required.';
  end if;
  if target_user_ids is null or cardinality(target_user_ids) = 0 then
    raise exception 'Select at least one member to delete.';
  end if;
  if cardinality(target_user_ids) > 500 then
    raise exception 'A maximum of 500 member accounts can be deleted at once.';
  end if;
  if exists (select 1 from unnest(target_user_ids) as requested(id) where id is null) then
    raise exception 'The selected member list contains an invalid user id.';
  end if;

  select array_agg(distinct requested.id order by requested.id)
    into requested_ids
  from unnest(target_user_ids) as requested(id);

  if auth.uid() = any(requested_ids) then
    raise exception 'You cannot delete your own Super Admin account.';
  end if;

  perform 1
  from public.profiles
  where id = any(requested_ids)
     or (role = 'admin' and is_active = true)
  order by id
  for update;

  select coalesce(array_agg(member.id order by member.id), '{}'::uuid[])
    into existing_ids
  from public.profiles member
  where member.id = any(requested_ids);
  selected_count := cardinality(existing_ids);

  if exists (
    select 1 from public.super_admin_members
    where user_id = any(existing_ids)
  ) then
    raise exception 'A Super Admin account cannot be deleted here.';
  end if;

  if exists (
    select 1 from public.profiles
    where id = any(existing_ids) and role = 'admin' and is_active = true
  ) then
    if not exists (
      select 1 from public.profiles
      where role = 'admin' and is_active = true and not (id = any(existing_ids))
    ) then
      raise exception 'Keep at least one active admin account in the system.';
    end if;
  end if;

  if exists (
    select 1 from public.profiles member
    where member.id = any(existing_ids)
      and not exists (select 1 from auth.users auth_user where auth_user.id = member.id)
  ) then
    raise exception 'A selected profile has no matching authentication account; no members were deleted.';
  end if;

  if selected_count = 0 then
    return jsonb_build_object(
      'deleted_ids', '[]'::jsonb,
      'already_missing_count', cardinality(requested_ids),
      'storage_cleanup_queued', 0
    );
  end if;

  insert into public.super_admin_audit_logs (actor_id, action, target_user_id, metadata)
  select
    auth.uid(),
    'member_deleted',
    null,
    jsonb_build_object(
      'member_id', member.id,
      'member_name', member.full_name,
      'member_email', member.email
    )
  from public.profiles member
  where member.id = any(existing_ids);

  insert into public.super_admin_storage_deletion_queue (bucket_id, object_path, target_user_id, requested_by)
  select 'profile-photos', member.profile_photo_path, member.id, auth.uid()
  from public.profiles member
  where member.id = any(existing_ids)
    and member.profile_photo_path is not null
    and left(member.profile_photo_path, length(member.id::text) + 1) = member.id::text || '/'
    and position('..' in member.profile_photo_path) = 0
  on conflict (bucket_id, object_path) do nothing;

  for storage_source in
    select * from (values
      ('discipleship_assignment_submissions', 'file_path', 'discipleship-submissions'),
      ('discipleship_submission_history', 'file_path', 'discipleship-submissions'),
      ('bible_study_takeaways', 'audio_path', 'bible-study-audio'),
      ('bible_study_takeaway_replies', 'audio_path', 'bible-study-audio'),
      ('bible_study_questions', 'audio_path', 'bible-study-audio'),
      ('bible_study_question_answers', 'audio_path', 'bible-study-audio')
    ) as sources(table_name, path_column, bucket_id)
  loop
    if to_regclass(format('public.%I', storage_source.table_name)) is not null then
      if storage_source.bucket_id = 'discipleship-submissions' then
        execute format(
          'insert into public.super_admin_storage_deletion_queue (bucket_id, object_path, target_user_id, requested_by)
           select %L, %I, user_id, $2 from public.%I
           where user_id = any($1) and nullif(trim(%I), '''') is not null
             and position(''..'' in %I) = 0 and split_part(%I, ''/'', 3) = user_id::text
           on conflict (bucket_id, object_path) do nothing',
          storage_source.bucket_id,
          storage_source.path_column,
          storage_source.table_name,
          storage_source.path_column,
          storage_source.path_column,
          storage_source.path_column
        ) using existing_ids, auth.uid();
      else
        execute format(
          'insert into public.super_admin_storage_deletion_queue (bucket_id, object_path, target_user_id, requested_by)
           select %L, %I, user_id, $2 from public.%I
           where user_id = any($1) and nullif(trim(%I), '''') is not null
             and position(''..'' in %I) = 0 and (
               left(%I, length(user_id::text) + 1) = user_id::text || ''/''
               or left(%I, length(group_id::text || user_id::text) + 2) = group_id::text || ''/'' || user_id::text || ''/''
             )
           on conflict (bucket_id, object_path) do nothing',
          storage_source.bucket_id,
          storage_source.path_column,
          storage_source.table_name,
          storage_source.path_column,
          storage_source.path_column,
          storage_source.path_column,
          storage_source.path_column
        ) using existing_ids, auth.uid();
      end if;
    end if;
  end loop;

  if to_regclass('public.fun_zone_attempt_answers') is not null then
    execute 'delete from public.fun_zone_attempt_answers where user_id = any($1)' using existing_ids;
  end if;
  if to_regclass('public.fun_zone_attempts') is not null then
    execute 'delete from public.fun_zone_attempts where user_id = any($1)' using existing_ids;
  end if;
  if to_regclass('public.fun_zone_point_transactions') is not null then
    execute 'delete from public.fun_zone_point_transactions where user_id = any($1)' using existing_ids;
  end if;
  if to_regclass('public.fun_zone_member_achievements') is not null then
    execute 'delete from public.fun_zone_member_achievements where user_id = any($1)' using existing_ids;
  end if;

  delete from public.cell_group_members where user_id = any(existing_ids);

  delete from auth.users where id = any(existing_ids);
  get diagnostics deleted_count = row_count;
  if deleted_count <> selected_count then
    raise exception 'Not all selected authentication accounts were deleted; the transaction was rolled back.';
  end if;

  return jsonb_build_object(
    'deleted_ids', to_jsonb(existing_ids),
    'already_missing_count', cardinality(requested_ids) - selected_count,
    'storage_cleanup_queued',
      (select count(*) from public.super_admin_storage_deletion_queue where requested_by = auth.uid())::integer
  );
end;
$$;
revoke all on function public.super_admin_delete_members(uuid[]) from public, anon;
grant execute on function public.super_admin_delete_members(uuid[]) to authenticated;

create or replace function public.super_admin_get_pending_storage_deletions()
returns table (queue_id uuid, bucket_id text, object_path text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Super Admin privileges are required.';
  end if;

  return query
  select queue.id, queue.bucket_id, queue.object_path
  from public.super_admin_storage_deletion_queue queue
  order by queue.queued_at, queue.id;
end;
$$;
revoke all on function public.super_admin_get_pending_storage_deletions() from public, anon;
grant execute on function public.super_admin_get_pending_storage_deletions() to authenticated;

create or replace function public.super_admin_complete_storage_deletions(target_queue_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare completed_count integer := 0;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Super Admin privileges are required.';
  end if;
  if target_queue_ids is null or cardinality(target_queue_ids) = 0 then
    return 0;
  end if;

  delete from public.super_admin_storage_deletion_queue
  where id = any(target_queue_ids);
  get diagnostics completed_count = row_count;
  return completed_count;
end;
$$;
revoke all on function public.super_admin_complete_storage_deletions(uuid[]) from public, anon;
grant execute on function public.super_admin_complete_storage_deletions(uuid[]) to authenticated;

-- Keep the existing single-member RPC safe for any older client still using it.
create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.super_admin_delete_members(array[target_user_id]);
end;
$$;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

commit;
