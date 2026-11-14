-- Add a restricted, aggregate-only Bible streak report for authorized administrators. Apply after management-cell-groups,
-- bible-study, bible-study-personal, bible-study-management-upgrade,
-- bible-streak-system, bible-partner-experience, dashboard-birthday-experience,
-- and super-admin-security migrations.
-- No existing RLS policies or personal reading records are changed.

begin;

create or replace function public.bible_streak_admin_report(
  p_group_id uuid,
  p_range_start date,
  p_range_end date
)
returns jsonb
language plpgsql stable
security definer
set search_path = public, pg_temp
as $$
declare
  settings_row public.bible_streak_settings%rowtype;
  today_date date;
  from_date date;
  to_date date;
  week_start date;
  month_start date;
  member_row record;
  partnership_row record;
  history_start date;
  member_start_date date;
  range_start_for_member date;
  current_days integer;
  longest_days integer;
  current_start_date date;
  current_end_date date;
  completed_chapters integer;
  week_completed integer;
  month_completed integer;
  range_completed integer;
  range_missed integer;
  range_elapsed integer;
  member_calendar jsonb;
  month_calendar jsonb;
  member_json jsonb;
  members_json jsonb := '[]'::jsonb;
  partnerships_json jsonb := '[]'::jsonb;
  partnership_members jsonb;
  daily_activity jsonb;
  group_activity jsonb;
  group_daily_activity jsonb;
begin
  if auth.uid() is null or not (public.is_admin() or public.is_super_admin()) then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if p_group_id is null and not public.is_super_admin() then
    raise exception 'Only Super Admin may request the organization-wide report.' using errcode = '42501';
  end if;
  if p_group_id is not null and not public.user_can_access_cell_group(p_group_id, auth.uid()) then
    raise exception 'You do not have access to this cell group.' using errcode = '42501';
  end if;

  select * into settings_row from public.bible_streak_settings where id = 1;
  if not found then raise exception 'Bible streak settings are unavailable.' using errcode = 'P0002'; end if;
  today_date := (now() at time zone settings_row.application_timezone)::date;
  from_date := coalesce(p_range_start, date_trunc('month', today_date::timestamp)::date);
  to_date := least(coalesce(p_range_end, today_date), today_date);
  if from_date > to_date or to_date - from_date > 366 then
    raise exception 'Choose a date range of no more than 367 days ending today or earlier.' using errcode = '22023';
  end if;
  week_start := date_trunc('week', today_date::timestamp)::date;
  month_start := date_trunc('month', today_date::timestamp)::date;

  for member_row in
    select member.id, member.full_name, member.created_at
    from public.profiles member
    where member.is_active = true
      and (p_group_id is null or public.user_can_access_cell_group(p_group_id, member.id))
    order by coalesce(nullif(btrim(member.full_name), ''), member.email)
  loop
    select min((reading.completed_at at time zone settings_row.application_timezone)::date)
      into history_start
    from public.personal_bible_study_readings reading
    where reading.user_id = member_row.id
      and reading.status = 'completed' and reading.completed_at is not null;
    history_start := coalesce(history_start, today_date);
    member_start_date := (member_row.created_at at time zone settings_row.application_timezone)::date;

    with day_rows as (
      select local_date, qualified or protected as counts
      from public.bible_streak_calendar_rows(member_row.id, settings_row.application_timezone,
        settings_row.daily_requirement, history_start, today_date)
    ), numbered as (
      select local_date, local_date - row_number() over (order by local_date)::integer as run_key
      from day_rows where counts
    ), runs as (
      select min(local_date) as first_day, max(local_date) as last_day, count(*)::integer as run_days
      from numbered group by run_key
    )
    select coalesce(max(run_days) filter (where last_day in (today_date, today_date - 1)), 0)::integer,
      coalesce(max(run_days), 0)::integer,
      min(first_day) filter (where last_day in (today_date, today_date - 1)),
      max(last_day) filter (where last_day in (today_date, today_date - 1))
    into current_days, longest_days, current_start_date, current_end_date from runs;

    select count(*)::integer into completed_chapters
    from public.personal_bible_study_readings reading
    where reading.user_id = member_row.id and reading.status = 'completed' and reading.completed_at is not null;

    select count(*) filter (where qualified)::integer into week_completed
    from public.bible_streak_calendar_rows(member_row.id, settings_row.application_timezone,
      settings_row.daily_requirement, greatest(member_start_date, week_start), today_date);
    select count(*) filter (where qualified)::integer into month_completed
    from public.bible_streak_calendar_rows(member_row.id, settings_row.application_timezone,
      settings_row.daily_requirement, greatest(member_start_date, month_start), today_date);

    range_start_for_member := greatest(member_start_date, from_date);
    select count(*) filter (where qualified)::integer,
      count(*) filter (where day_state = 'missed')::integer,
      count(*)::integer
    into range_completed, range_missed, range_elapsed
    from public.bible_streak_calendar_rows(member_row.id, settings_row.application_timezone,
      settings_row.daily_requirement, range_start_for_member, to_date);

    select coalesce(jsonb_agg(jsonb_build_object(
      'date', local_date, 'status', day_state,
      'completed_count', completed_count, 'assigned_count', assigned_count
    ) order by local_date), '[]'::jsonb)
    into member_calendar
    from public.bible_streak_calendar_rows(member_row.id, settings_row.application_timezone,
      settings_row.daily_requirement, range_start_for_member, to_date);

    select coalesce(jsonb_agg(jsonb_build_object(
      'date', local_date, 'status', day_state,
      'completed_count', completed_count, 'assigned_count', assigned_count
    ) order by local_date), '[]'::jsonb)
    into month_calendar
    from public.bible_streak_calendar_rows(member_row.id, settings_row.application_timezone,
      settings_row.daily_requirement, greatest(member_start_date, month_start), today_date);

    member_json := jsonb_build_object(
      'user_id', member_row.id,
      'full_name', member_row.full_name,
      'current_streak', current_days,
      'current_streak_started_on', current_start_date,
      'current_streak_ends_on', current_end_date,
      'longest_streak', longest_days,
      'completed_chapters', completed_chapters,
      'weekly_completed', coalesce(week_completed, 0),
      'weekly_elapsed', greatest(0, today_date - greatest(member_start_date, week_start) + 1),
      'monthly_completed', coalesce(month_completed, 0),
      'monthly_elapsed', greatest(0, today_date - greatest(member_start_date, month_start) + 1),
      'range_completed_days', coalesce(range_completed, 0),
      'range_missed_days', coalesce(range_missed, 0),
      'range_elapsed_days', coalesce(range_elapsed, 0),
      'calendar', member_calendar,
      'month_calendar', month_calendar
    );
    members_json := members_json || jsonb_build_array(member_json);
  end loop;

  for partnership_row in
    select partnership.id, partnership.group_id, partnership.name
    from public.bible_study_partnerships partnership
    where partnership.status = 'active'
      and (p_group_id is null or partnership.group_id = p_group_id)
      and exists (select 1 from public.bible_study_partnership_members membership
        where membership.partnership_id = partnership.id and membership.status = 'active')
    order by partnership.created_at desc
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', member.user_id,
      'full_name', profile.full_name,
      'current_streak', coalesce((report.value->>'current_streak')::integer, 0),
      'current_streak_started_on', report.value->>'current_streak_started_on',
      'current_streak_ends_on', report.value->>'current_streak_ends_on',
      'longest_streak', coalesce((report.value->>'longest_streak')::integer, 0),
      'completed_chapters', coalesce((report.value->>'completed_chapters')::integer, 0),
      'weekly_completed', coalesce((report.value->>'weekly_completed')::integer, 0),
      'weekly_elapsed', coalesce((report.value->>'weekly_elapsed')::integer, 0),
      'monthly_completed', coalesce((report.value->>'monthly_completed')::integer, 0),
      'monthly_elapsed', coalesce((report.value->>'monthly_elapsed')::integer, 0),
      'range_completed_days', coalesce((report.value->>'range_completed_days')::integer, 0),
      'range_missed_days', coalesce((report.value->>'range_missed_days')::integer, 0),
      'range_elapsed_days', coalesce((report.value->>'range_elapsed_days')::integer, 0)
    ) order by coalesce(nullif(btrim(profile.full_name), ''), profile.email)), '[]'::jsonb)
    into partnership_members
    from public.bible_study_partnership_members member
    join public.profiles profile on profile.id = member.user_id and profile.is_active = true
    join lateral (
      select entry.value from jsonb_array_elements(members_json) entry(value)
      where entry.value->>'user_id' = member.user_id::text limit 1
    ) report on true
    where member.partnership_id = partnership_row.id and member.status = 'active';
    partnerships_json := partnerships_json || jsonb_build_array(jsonb_build_object(
      'id', partnership_row.id, 'group_id', partnership_row.group_id,
      'name', partnership_row.name, 'members', partnership_members
    ));
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'date', activity.local_date,
    'active_readers', activity.active_readers,
    'completed_chapters', activity.completed_chapters
  ) order by activity.local_date), '[]'::jsonb)
  into daily_activity
  from (
    select dates.local_date::date as local_date,
      coalesce(activity.active_readers, 0)::integer as active_readers,
      coalesce(activity.completed_chapters, 0)::integer as completed_chapters
    from generate_series(from_date, to_date, interval '1 day') as dates(local_date)
    left join lateral (
      select count(distinct reading.user_id)::integer as active_readers,
        count(*)::integer as completed_chapters
      from public.personal_bible_study_readings reading
      where reading.status = 'completed' and reading.completed_at is not null
        and (reading.completed_at at time zone settings_row.application_timezone)::date = dates.local_date::date
        and reading.user_id in (select (entry.value->>'user_id')::uuid from jsonb_array_elements(members_json) entry(value))
    ) activity on true
  ) activity;

  select jsonb_build_object(
    'planned_chapters', coalesce((
      select count(*)::integer
      from public.bible_study_readings reading
      where (p_group_id is null or reading.group_id = p_group_id)
        and reading.reading_date between from_date and to_date
        and reading.reading_date <= today_date
        and reading.status <> 'draft'
        and reading.deleted_at is null
    ), 0),
    'completed_entries', coalesce((
      select count(*)::integer
      from public.bible_study_completions completion
      join public.bible_study_readings reading on reading.id = completion.reading_id
      join public.profiles profile on profile.id = completion.user_id and profile.is_active = true
      where (p_group_id is null or reading.group_id = p_group_id)
        and (completion.completed_at at time zone settings_row.application_timezone)::date between from_date and to_date
        and public.user_can_access_cell_group(reading.group_id, completion.user_id)
    ), 0),
    'participating_members', coalesce((
      select count(distinct completion.user_id)::integer
      from public.bible_study_completions completion
      join public.bible_study_readings reading on reading.id = completion.reading_id
      join public.profiles profile on profile.id = completion.user_id and profile.is_active = true
      where (p_group_id is null or reading.group_id = p_group_id)
        and (completion.completed_at at time zone settings_row.application_timezone)::date between from_date and to_date
        and public.user_can_access_cell_group(reading.group_id, completion.user_id)
    ), 0)
  ) into group_activity;

  select coalesce(jsonb_agg(jsonb_build_object(
    'date', activity.local_date,
    'active_readers', activity.active_readers,
    'completed_entries', activity.completed_entries
  ) order by activity.local_date), '[]'::jsonb)
  into group_daily_activity
  from (
    select dates.local_date::date as local_date,
      coalesce(activity.active_readers, 0)::integer as active_readers,
      coalesce(activity.completed_entries, 0)::integer as completed_entries
    from generate_series(from_date, to_date, interval '1 day') as dates(local_date)
    left join lateral (
      select count(distinct completion.user_id)::integer as active_readers,
        count(*)::integer as completed_entries
      from public.bible_study_completions completion
      join public.bible_study_readings reading on reading.id = completion.reading_id
      join public.profiles profile on profile.id = completion.user_id and profile.is_active = true
      where (p_group_id is null or reading.group_id = p_group_id)
        and (completion.completed_at at time zone settings_row.application_timezone)::date = dates.local_date::date
        and public.user_can_access_cell_group(reading.group_id, completion.user_id)
    ) activity on true
  ) activity;

  return jsonb_build_object(
    'timezone', settings_row.application_timezone,
    'today', today_date,
    'range_start', from_date,
    'range_end', to_date,
    'members', members_json,
    'partnerships', partnerships_json,
    'daily_activity', daily_activity,
    'group_activity', group_activity,
    'group_daily_activity', group_daily_activity
  );
end;
$$;

revoke all on function public.bible_streak_admin_report(uuid, date, date) from public, anon;
grant execute on function public.bible_streak_admin_report(uuid, date, date) to authenticated;

commit;
