-- Bible streaks derive from existing personal completion timestamps. This
-- migration adds protected settings, achievements, freeze usage and reminders
-- without changing or deleting personal or shared Bible Study history.
begin;

create table if not exists public.bible_streak_settings (
  id smallint primary key default 1 check (id = 1),
  application_timezone text not null default 'Africa/Nairobi',
  daily_requirement text not null default 'at_least_one'
    check (daily_requirement in ('at_least_one', 'all_assigned')),
  streak_freeze_enabled boolean not null default false,
  streak_freeze_auto_use boolean not null default false,
  freezes_per_member smallint not null default 1 check (freezes_per_member between 0 and 10),
  group_completion_percent smallint not null default 50 check (group_completion_percent between 1 and 100),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.bible_streak_settings(id) values (1) on conflict (id) do nothing;

create table if not exists public.bible_streak_reminder_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  reminder_time time not null default '19:00',
  delivery_channel text not null default 'in_app'
    check (delivery_channel in ('in_app', 'in_app_and_push')),
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '07:00',
  last_sent_on date,
  updated_at timestamptz not null default now()
);

create table if not exists public.bible_streak_freeze_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  source text not null check (source in ('manual', 'automatic')),
  used_at timestamptz not null default now(),
  primary key (user_id, local_date)
);

create table if not exists public.bible_streak_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  milestone_days smallint not null
    check (milestone_days in (1, 3, 7, 14, 21, 30, 60, 90, 100, 180, 365)),
  earned_on date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, milestone_days)
);

create index if not exists personal_bible_readings_completed_at_idx
  on public.personal_bible_study_readings(user_id, completed_at)
  where completed_at is not null;
create index if not exists bible_streak_freeze_usage_user_idx
  on public.bible_streak_freeze_usage(user_id, local_date desc);
create index if not exists bible_streak_achievements_user_idx
  on public.bible_streak_achievements(user_id, milestone_days);

alter table public.bible_streak_settings enable row level security;
alter table public.bible_streak_reminder_preferences enable row level security;
alter table public.bible_streak_freeze_usage enable row level security;
alter table public.bible_streak_achievements enable row level security;

drop policy if exists bible_streak_settings_read_active on public.bible_streak_settings;
drop policy if exists bible_streak_settings_super_admin_update on public.bible_streak_settings;
create policy bible_streak_settings_read_active on public.bible_streak_settings
  for select to authenticated using (public.is_active_user());
create policy bible_streak_settings_super_admin_update on public.bible_streak_settings
  for update to authenticated using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists bible_streak_reminders_read_own on public.bible_streak_reminder_preferences;
drop policy if exists bible_streak_reminders_insert_own on public.bible_streak_reminder_preferences;
drop policy if exists bible_streak_reminders_update_own on public.bible_streak_reminder_preferences;
create policy bible_streak_reminders_read_own on public.bible_streak_reminder_preferences
  for select to authenticated using (public.is_active_user() and user_id = auth.uid());
create policy bible_streak_reminders_insert_own on public.bible_streak_reminder_preferences
  for insert to authenticated with check (public.is_active_user() and user_id = auth.uid());
create policy bible_streak_reminders_update_own on public.bible_streak_reminder_preferences
  for update to authenticated using (public.is_active_user() and user_id = auth.uid())
  with check (public.is_active_user() and user_id = auth.uid());

drop policy if exists bible_streak_freezes_read_own on public.bible_streak_freeze_usage;
create policy bible_streak_freezes_read_own on public.bible_streak_freeze_usage
  for select to authenticated using (public.is_active_user() and user_id = auth.uid());

drop policy if exists bible_streak_achievements_read_own on public.bible_streak_achievements;
create policy bible_streak_achievements_read_own on public.bible_streak_achievements
  for select to authenticated using (public.is_active_user() and user_id = auth.uid());

revoke all on public.bible_streak_settings, public.bible_streak_reminder_preferences,
  public.bible_streak_freeze_usage, public.bible_streak_achievements from anon;
revoke all on public.bible_streak_settings, public.bible_streak_reminder_preferences,
  public.bible_streak_freeze_usage, public.bible_streak_achievements from authenticated;
grant select, update on public.bible_streak_settings to authenticated;
grant select, insert, update on public.bible_streak_reminder_preferences to authenticated;
grant select on public.bible_streak_freeze_usage, public.bible_streak_achievements to authenticated;

create or replace function public.set_bible_streak_settings_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.application_timezone) then
    raise exception 'Choose a valid application timezone.' using errcode = '22023';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
revoke all on function public.set_bible_streak_settings_updated_at() from public, anon, authenticated;
drop trigger if exists set_bible_streak_settings_updated_at on public.bible_streak_settings;
create trigger set_bible_streak_settings_updated_at before update on public.bible_streak_settings
  for each row execute function public.set_bible_streak_settings_updated_at();

create or replace function public.guard_bible_streak_reminder_delivery_state()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('app.bible_streak_reminder_delivery', true), 'false') <> 'true'
    and ((tg_op = 'INSERT' and new.last_sent_on is not null)
      or (tg_op = 'UPDATE' and new.last_sent_on is distinct from old.last_sent_on)) then
    raise exception 'Reminder delivery dates are managed by the system.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.guard_bible_streak_reminder_delivery_state() from public, anon, authenticated;
drop trigger if exists guard_bible_streak_reminder_delivery_state on public.bible_streak_reminder_preferences;
create trigger guard_bible_streak_reminder_delivery_state
  before insert or update on public.bible_streak_reminder_preferences
  for each row execute function public.guard_bible_streak_reminder_delivery_state();

create or replace function public.bible_streak_get_settings()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'Active membership is required.'; end if;
  select to_jsonb(settings) into result from public.bible_streak_settings settings where id = 1;
  return result;
end;
$$;

create or replace function public.bible_streak_day_qualifies(target_user uuid, target_date date)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  app_timezone text;
  requirement text;
  completed_count integer;
  assigned_count integer;
  assigned_completed_count integer;
begin
  select application_timezone, daily_requirement into app_timezone, requirement
  from public.bible_streak_settings where id = 1;
  select count(*) filter (where reading.status = 'completed'
      and reading.completed_at is not null
      and (reading.completed_at at time zone app_timezone)::date = target_date),
    count(*) filter (where reading.reading_date = target_date),
    count(*) filter (where reading.reading_date = target_date
      and reading.status = 'completed' and reading.completed_at is not null
      and (reading.completed_at at time zone app_timezone)::date = target_date)
  into completed_count, assigned_count, assigned_completed_count
  from public.personal_bible_study_readings reading
  where reading.user_id = target_user
    and (reading.reading_date = target_date or
      (reading.completed_at >= (target_date::timestamp at time zone app_timezone)
       and reading.completed_at < ((target_date + 1)::timestamp at time zone app_timezone)));
  if requirement = 'all_assigned' and assigned_count > 0 then
    return assigned_completed_count = assigned_count;
  end if;
  return completed_count > 0;
end;
$$;

create or replace function public.process_bible_streak_auto_freezes()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  settings_row public.bible_streak_settings%rowtype;
  today_date date;
  member record;
  used_count integer;
  protected_count integer := 0;
begin
  select * into settings_row from public.bible_streak_settings where id = 1;
  if not settings_row.streak_freeze_enabled or not settings_row.streak_freeze_auto_use
    or settings_row.freezes_per_member = 0 then return 0; end if;
  today_date := (now() at time zone settings_row.application_timezone)::date;
  for member in select id from public.profiles where is_active = true loop
    if exists (select 1 from public.bible_streak_freeze_usage
        where user_id = member.id and local_date = today_date - 1)
      or public.bible_streak_day_qualifies(member.id, today_date - 1)
      or not public.bible_streak_day_qualifies(member.id, today_date - 2) then
      continue;
    end if;
    select count(*)::integer into used_count from public.bible_streak_freeze_usage
      where user_id = member.id and local_date >= date_trunc('month', today_date::timestamp)::date;
    if used_count >= settings_row.freezes_per_member then continue; end if;
    insert into public.bible_streak_freeze_usage(user_id, local_date, source)
      values (member.id, today_date - 1, 'automatic') on conflict (user_id, local_date) do nothing;
    if found then protected_count := protected_count + 1; end if;
  end loop;
  return protected_count;
end;
$$;

create or replace function public.bible_streak_calendar_rows(
  target_user uuid, app_timezone text, requirement text, first_date date, last_date date
)
returns table (
  local_date date, completed_count integer, assigned_count integer,
  assigned_completed_count integer, in_progress_count integer,
  qualified boolean, protected boolean, day_state text
)
language sql stable security definer set search_path = public, pg_temp as $$
  with dates as (
    select generate_series(first_date, last_date, interval '1 day')::date as day
  ), metrics as (
    select dates.day,
      coalesce(readings.completed_count, 0)::integer as completed_count,
      coalesce(readings.assigned_count, 0)::integer as assigned_count,
      coalesce(readings.assigned_completed_count, 0)::integer as assigned_completed_count,
      coalesce(readings.in_progress_count, 0)::integer as in_progress_count,
      exists (select 1 from public.bible_streak_freeze_usage frozen_day
        where frozen_day.user_id = target_user and frozen_day.local_date = dates.day) as protected
    from dates
    left join lateral (
      select
        count(*) filter (where reading.status = 'completed' and reading.completed_at is not null
          and (reading.completed_at at time zone app_timezone)::date = dates.day) as completed_count,
        count(*) filter (where reading.reading_date = dates.day) as assigned_count,
        count(*) filter (where reading.reading_date = dates.day and reading.status = 'completed'
          and reading.completed_at is not null
          and (reading.completed_at at time zone app_timezone)::date = dates.day) as assigned_completed_count,
        count(*) filter (where reading.reading_date = dates.day and reading.status = 'in_progress') as in_progress_count
      from public.personal_bible_study_readings reading
      where reading.user_id = target_user and (
        reading.reading_date = dates.day or
        (reading.completed_at >= (dates.day::timestamp at time zone app_timezone)
         and reading.completed_at < ((dates.day + 1)::timestamp at time zone app_timezone)))
    ) readings on true
  ), qualified_days as (
    select metrics.*,
      case when requirement = 'all_assigned' and assigned_count > 0
        then assigned_completed_count = assigned_count
        else completed_count > 0 end as qualified
    from metrics
  )
  select day, completed_count, assigned_count, assigned_completed_count, in_progress_count,
    qualified, protected,
    case
      when day > (now() at time zone app_timezone)::date then
        case when assigned_count > 0 then 'scheduled' else 'future' end
      when day = (now() at time zone app_timezone)::date then
        case when qualified then 'completed'
          when completed_count > 0 or in_progress_count > 0 then 'in_progress'
          else 'pending' end
      when qualified then 'completed'
      when protected then 'protected'
      else 'missed'
    end as day_state
  from qualified_days order by day;
$$;

create or replace function public.guard_personal_bible_streak_completion()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'completed' and current_user = 'authenticated' then
      raise exception 'Completed personal readings are preserved in your Bible history.' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status = 'completed' then
    raise exception 'Completed personal readings are preserved in your Bible history.' using errcode = '42501';
  end if;
  if new.status = 'completed'
    and coalesce(current_setting('app.bible_streak_completion', true), 'false') <> 'true' then
    raise exception 'Complete a personal reading through the Bible Study completion action.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_personal_bible_streak_completion() from public, anon, authenticated;
drop trigger if exists guard_personal_bible_streak_completion on public.personal_bible_study_readings;
create trigger guard_personal_bible_streak_completion before insert or update or delete
  on public.personal_bible_study_readings for each row
  execute function public.guard_personal_bible_streak_completion();

create or replace function public.bible_streak_my_summary()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  member_id uuid := auth.uid();
  settings_row public.bible_streak_settings%rowtype;
  today_date date;
  start_date date;
  anchor_date date;
  current_days integer := 0;
  longest_days integer := 0;
  today_completed integer := 0;
  today_assigned integer := 0;
  today_required integer := 1;
  week_start date;
  week_completed integer := 0;
  week_elapsed integer := 0;
  month_start date;
  month_completed integer := 0;
  month_elapsed integer := 0;
  best_week integer := 0;
  next_milestone integer;
  days_to_milestone integer;
  freeze_used integer := 0;
  freeze_balance integer := 0;
  eligible_freeze_date date;
  last_reading jsonb;
  calendar_data jsonb;
  result jsonb;
begin
  if member_id is null or not public.is_active_user() then raise exception 'Active membership is required.'; end if;
  select * into settings_row from public.bible_streak_settings where id = 1;
  today_date := (now() at time zone settings_row.application_timezone)::date;

  select count(*)::integer into freeze_used from public.bible_streak_freeze_usage
    where user_id = member_id and local_date >= date_trunc('month', today_date::timestamp)::date;
  if settings_row.streak_freeze_enabled and settings_row.streak_freeze_auto_use
    and freeze_used < settings_row.freezes_per_member
    and not exists (select 1 from public.bible_streak_freeze_usage where user_id = member_id and local_date = today_date - 1)
    and not public.bible_streak_day_qualifies(member_id, today_date - 1)
    and public.bible_streak_day_qualifies(member_id, today_date - 2) then
      insert into public.bible_streak_freeze_usage(user_id, local_date, source)
      values (member_id, today_date - 1, 'automatic') on conflict (user_id, local_date) do nothing;
      select count(*)::integer into freeze_used from public.bible_streak_freeze_usage
        where user_id = member_id and local_date >= date_trunc('month', today_date::timestamp)::date;
  end if;

  select coalesce(min((reading.completed_at at time zone settings_row.application_timezone)::date), today_date)
    into start_date from public.personal_bible_study_readings reading
    where reading.user_id = member_id and reading.status = 'completed' and reading.completed_at is not null;

  select coalesce(max(run_days) filter (where last_day = today_date),
                  max(run_days) filter (where last_day = today_date - 1), 0)::integer
    into current_days
  from (
    with day_rows as (
      select local_date as day, (qualified or protected) as counts
      from public.bible_streak_calendar_rows(member_id, settings_row.application_timezone,
        settings_row.daily_requirement, start_date, today_date)
    ), numbered as (
      select day, day - row_number() over (order by day)::integer as run_key
      from day_rows where counts
    )
    select min(day) as first_day, max(day) as last_day, count(*)::integer as run_days
    from numbered group by run_key
  ) runs;

  select coalesce(max(run_days), 0)::integer into longest_days
  from (
    with day_rows as (
      select local_date as day, (qualified or protected) as counts
      from public.bible_streak_calendar_rows(member_id, settings_row.application_timezone,
        settings_row.daily_requirement, start_date, today_date)
    ), numbered as (
      select day, day - row_number() over (order by day)::integer as run_key
      from day_rows where counts
    )
    select count(*)::integer as run_days from numbered group by run_key
  ) runs;

  insert into public.bible_streak_achievements(user_id, milestone_days, earned_on)
  with day_rows as (
    select local_date as day, (qualified or protected) as counts
    from public.bible_streak_calendar_rows(member_id, settings_row.application_timezone,
      settings_row.daily_requirement, start_date, today_date)
  ), numbered as (
    select day, day - row_number() over (order by day)::integer as run_key
    from day_rows where counts
  ), streaks as (
    select min(day) as first_day, count(*)::integer as run_days
    from numbered group by run_key
  ), milestones(days) as (
    values (1), (3), (7), (14), (21), (30), (60), (90), (100), (180), (365)
  )
  select member_id, milestones.days, streaks.first_day + milestones.days - 1
  from streaks join milestones on streaks.run_days >= milestones.days
  on conflict (user_id, milestone_days) do nothing;

  select local_date, completed_count, assigned_count into anchor_date, today_completed, today_assigned
  from public.bible_streak_calendar_rows(member_id, settings_row.application_timezone,
    settings_row.daily_requirement, today_date, today_date);
  if settings_row.daily_requirement = 'all_assigned' and today_assigned > 0 then
    today_required := today_assigned;
  end if;

  week_start := date_trunc('week', today_date::timestamp)::date;
  week_elapsed := today_date - week_start + 1;
  select count(*)::integer into week_completed
  from public.bible_streak_calendar_rows(member_id, settings_row.application_timezone,
    settings_row.daily_requirement, week_start, today_date)
  where qualified;

  month_start := date_trunc('month', today_date::timestamp)::date;
  month_elapsed := today_date - month_start + 1;
  select count(*)::integer into month_completed
  from public.bible_streak_calendar_rows(member_id, settings_row.application_timezone,
    settings_row.daily_requirement, month_start, today_date)
  where qualified;

  select coalesce(max(week_count), 0)::integer into best_week
  from (
    select date_trunc('week', local_date::timestamp)::date as week_of, count(*)::integer as week_count
    from public.bible_streak_calendar_rows(member_id, settings_row.application_timezone,
      settings_row.daily_requirement, start_date, today_date)
    where qualified group by 1
  ) weeks;

  select min(days) into next_milestone from
    (values (1), (3), (7), (14), (21), (30), (60), (90), (100), (180), (365)) milestones(days)
  where days > current_days;
  days_to_milestone := case when next_milestone is null then null else greatest(next_milestone - current_days, 0) end;
  freeze_balance := greatest(settings_row.freezes_per_member - freeze_used, 0);
  if settings_row.streak_freeze_enabled and not settings_row.streak_freeze_auto_use and freeze_balance > 0
    and not public.bible_streak_day_qualifies(member_id, today_date - 1)
    and not exists (select 1 from public.bible_streak_freeze_usage where user_id = member_id and local_date = today_date - 1)
    and public.bible_streak_day_qualifies(member_id, today_date - 2) then
    eligible_freeze_date := today_date - 1;
  end if;

  select jsonb_build_object('book', reading.book, 'chapter', reading.chapter,
      'completed_at', reading.completed_at,
      'local_date', (reading.completed_at at time zone settings_row.application_timezone)::date)
    into last_reading
  from public.personal_bible_study_readings reading
  where reading.user_id = member_id and reading.status = 'completed' and reading.completed_at is not null
  order by reading.completed_at desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
      'date', local_date, 'status', day_state, 'completed_count', completed_count,
      'assigned_count', assigned_count, 'assigned_completed_count', assigned_completed_count,
      'in_progress_count', in_progress_count, 'qualified', qualified, 'protected', protected
    ) order by local_date), '[]'::jsonb)
    into calendar_data
  from public.bible_streak_calendar_rows(member_id, settings_row.application_timezone,
    settings_row.daily_requirement, start_date, today_date + 31);

  result := jsonb_build_object(
    'timezone', settings_row.application_timezone,
    'daily_requirement', settings_row.daily_requirement,
    'today', today_date,
    'current_streak', current_days,
    'longest_streak', longest_days,
    'today_complete', public.bible_streak_day_qualifies(member_id, today_date),
    'today_completed_count', today_completed,
    'today_assigned_count', today_assigned,
    'today_required_count', today_required,
    'today_status', case when public.bible_streak_day_qualifies(member_id, today_date) then 'completed'
      when today_completed > 0 then 'in_progress' else 'pending' end,
    'weekly_completed', week_completed,
    'weekly_elapsed', week_elapsed,
    'weekly_percentage', case when week_elapsed > 0 then round(week_completed * 100.0 / week_elapsed)::integer else 0 end,
    'monthly_completed', month_completed,
    'monthly_elapsed', month_elapsed,
    'monthly_percentage', case when month_elapsed > 0 then round(month_completed * 100.0 / month_elapsed)::integer else 0 end,
    'best_weekly_days', best_week,
    'next_milestone', next_milestone,
    'days_to_milestone', days_to_milestone,
    'last_reading', last_reading,
    'freeze_enabled', settings_row.streak_freeze_enabled,
    'freeze_auto_use', settings_row.streak_freeze_auto_use,
    'freezes_available', freeze_balance,
    'freeze_eligible_date', eligible_freeze_date,
    'calendar', calendar_data
  );
  return result;
end;
$$;

create or replace function public.complete_personal_bible_reading(
  target_reading_id uuid default null, target_book text default null, target_chapter integer default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  member_id uuid := auth.uid();
  app_timezone text;
  today_date date;
  max_chapters integer;
  selected public.personal_bible_study_readings%rowtype;
  old_awards smallint[];
  new_awards smallint[];
  summary_data jsonb;
  completed_now boolean := false;
begin
  if member_id is null or not public.is_active_user() then raise exception 'Active membership is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(member_id::text, 0));
  select application_timezone into app_timezone from public.bible_streak_settings where id = 1;
  today_date := (now() at time zone app_timezone)::date;

  if target_reading_id is not null then
    select * into selected from public.personal_bible_study_readings
      where id = target_reading_id and user_id = member_id for update;
    if selected.id is null then raise exception 'That personal reading is unavailable.' using errcode = 'P0002'; end if;
    target_book := selected.book;
    target_chapter := selected.chapter;
  end if;

  max_chapters := case target_book
    when 'Genesis' then 50 when 'Exodus' then 40 when 'Leviticus' then 27 when 'Numbers' then 36
    when 'Deuteronomy' then 34 when 'Joshua' then 24 when 'Judges' then 21 when 'Ruth' then 4
    when '1 Samuel' then 31 when '2 Samuel' then 24 when '1 Kings' then 22 when '2 Kings' then 25
    when '1 Chronicles' then 29 when '2 Chronicles' then 36 when 'Ezra' then 10 when 'Nehemiah' then 13
    when 'Esther' then 10 when 'Job' then 42 when 'Psalms' then 150 when 'Proverbs' then 31
    when 'Ecclesiastes' then 12 when 'Song of Solomon' then 8 when 'Isaiah' then 66 when 'Jeremiah' then 52
    when 'Lamentations' then 5 when 'Ezekiel' then 48 when 'Daniel' then 12 when 'Hosea' then 14
    when 'Joel' then 3 when 'Amos' then 9 when 'Obadiah' then 1 when 'Jonah' then 4 when 'Micah' then 7
    when 'Nahum' then 3 when 'Habakkuk' then 3 when 'Zephaniah' then 3 when 'Haggai' then 2
    when 'Zechariah' then 14 when 'Malachi' then 4 when 'Matthew' then 28 when 'Mark' then 16
    when 'Luke' then 24 when 'John' then 21 when 'Acts' then 28 when 'Romans' then 16
    when '1 Corinthians' then 16 when '2 Corinthians' then 13 when 'Galatians' then 6
    when 'Ephesians' then 6 when 'Philippians' then 4 when 'Colossians' then 4
    when '1 Thessalonians' then 5 when '2 Thessalonians' then 3 when '1 Timothy' then 6
    when '2 Timothy' then 4 when 'Titus' then 3 when 'Philemon' then 1 when 'Hebrews' then 13
    when 'James' then 5 when '1 Peter' then 5 when '2 Peter' then 3 when '1 John' then 5
    when '2 John' then 1 when '3 John' then 1 when 'Jude' then 1 when 'Revelation' then 22
    else null end;
  if max_chapters is null or target_chapter is null or target_chapter < 1 or target_chapter > max_chapters then
    raise exception 'Choose a valid Bible book and chapter.' using errcode = '22023';
  end if;

  select coalesce(array_agg(milestone_days order by milestone_days), '{}'::smallint[]) into old_awards
  from public.bible_streak_achievements where user_id = member_id;
  if selected.id is null or selected.status = 'completed' or selected.reading_date <> today_date then
    insert into public.personal_bible_study_readings(user_id, book, chapter, reading_date, status)
    values (member_id, target_book, target_chapter, today_date, 'planned')
    on conflict (user_id, book, chapter, reading_date) do nothing;
    select * into selected from public.personal_bible_study_readings
      where user_id = member_id and book = target_book and chapter = target_chapter and reading_date = today_date
      for update;
  end if;

  if selected.status <> 'completed' then
    perform set_config('app.bible_streak_completion', 'true', true);
    update public.personal_bible_study_readings set status = 'completed'
      where id = selected.id and user_id = member_id and status <> 'completed'
      returning * into selected;
    completed_now := found;
  end if;

  summary_data := public.bible_streak_my_summary();
  select coalesce(array_agg(milestone_days order by milestone_days), '{}'::smallint[]) into new_awards
  from public.bible_streak_achievements
  where user_id = member_id and not (milestone_days = any(old_awards));
  return jsonb_build_object('reading', to_jsonb(selected), 'summary', summary_data,
    'newly_earned_milestones', to_jsonb(new_awards), 'completed_now', completed_now);
end;
$$;

create or replace function public.use_bible_streak_freeze(target_date date)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  member_id uuid := auth.uid();
  settings_row public.bible_streak_settings%rowtype;
  today_date date;
  freeze_count integer;
begin
  if member_id is null or not public.is_active_user() then raise exception 'Active membership is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(member_id::text, 0));
  select * into settings_row from public.bible_streak_settings where id = 1;
  today_date := (now() at time zone settings_row.application_timezone)::date;
  select count(*)::integer into freeze_count from public.bible_streak_freeze_usage
    where user_id = member_id and local_date >= date_trunc('month', today_date::timestamp)::date;
  if not settings_row.streak_freeze_enabled then raise exception 'Streak Freeze is currently disabled.'; end if;
  if settings_row.streak_freeze_auto_use then raise exception 'Streak Freeze is set to automatic use.'; end if;
  if target_date <> today_date - 1 then raise exception 'A freeze can protect only yesterday.'; end if;
  if freeze_count >= settings_row.freezes_per_member then raise exception 'You have no Streak Freezes available.'; end if;
  if public.bible_streak_day_qualifies(member_id, target_date)
    or not public.bible_streak_day_qualifies(member_id, target_date - 1) then
    raise exception 'That day is not eligible for a Streak Freeze.';
  end if;
  insert into public.bible_streak_freeze_usage(user_id, local_date, source)
    values (member_id, target_date, 'manual') on conflict (user_id, local_date) do nothing;
  if not found then raise exception 'A Streak Freeze was already used for that day.'; end if;
  return public.bible_streak_my_summary();
end;
$$;

create or replace function public.deliver_bible_streak_reminders()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sent_count integer := 0;
begin
  perform set_config('app.bible_streak_reminder_delivery', 'true', true);
  insert into public.notifications(user_id, notification_type, title, body, entity_table, delivery_key)
  select preference.user_id,
    'bible_study_reminder'::public.notification_type,
    'Your time in the Word is waiting',
    case (extract(day from now())::integer % 3)
      when 0 then 'Take a moment for today’s Bible reading. Every meaningful journey begins with one day.'
      when 1 then 'You’re building a beautiful rhythm of consistency. Continue your reading journey today.'
      else 'A little time in Scripture is waiting for you today. Read at your own pace.' end,
    'bible_study_streaks',
    'bible-streak:' || preference.user_id::text || ':' || local_clock.local_date::text
  from public.bible_streak_reminder_preferences preference
  join public.profiles member on member.id = preference.user_id and member.is_active = true
  cross join lateral (
    select (now() at time zone settings.application_timezone)::date as local_date,
      (now() at time zone settings.application_timezone)::time as local_time
    from public.bible_streak_settings settings where settings.id = 1
  ) local_clock
  join public.bible_streak_settings settings on settings.id = 1
  where preference.enabled
    and local_clock.local_time >= preference.reminder_time
    and preference.last_sent_on is distinct from local_clock.local_date
    and not public.bible_streak_day_qualifies(preference.user_id, local_clock.local_date)
    and not (preference.quiet_hours_enabled and (
      (preference.quiet_hours_start <= preference.quiet_hours_end
        and local_clock.local_time >= preference.quiet_hours_start
        and local_clock.local_time < preference.quiet_hours_end)
      or (preference.quiet_hours_start > preference.quiet_hours_end
        and (local_clock.local_time >= preference.quiet_hours_start
          or local_clock.local_time < preference.quiet_hours_end))))
  on conflict (delivery_key) where delivery_key is not null do nothing;

  get diagnostics sent_count = row_count;
  update public.bible_streak_reminder_preferences preference
    set last_sent_on = (now() at time zone settings.application_timezone)::date,
        updated_at = now()
  from public.bible_streak_settings settings
  where settings.id = 1 and preference.enabled
    and (now() at time zone settings.application_timezone)::time >= preference.reminder_time
    and preference.last_sent_on is distinct from (now() at time zone settings.application_timezone)::date
    and exists (select 1 from public.notifications notification
      where notification.delivery_key = 'bible-streak:' || preference.user_id::text || ':'
        || (now() at time zone settings.application_timezone)::date::text);
  return sent_count;
end;
$$;

alter table public.personal_bible_study_readings enable row level security;
alter table public.notifications add column if not exists delivery_key text;
create unique index if not exists idx_notifications_delivery_key
  on public.notifications(delivery_key) where delivery_key is not null;
alter table public.notification_preferences add column if not exists bible_study_enabled boolean not null default true;

revoke all on function public.bible_streak_get_settings() from public, anon;
revoke all on function public.bible_streak_day_qualifies(uuid, date) from public, anon, authenticated;
revoke all on function public.process_bible_streak_auto_freezes() from public, anon, authenticated;
revoke all on function public.bible_streak_calendar_rows(uuid, text, text, date, date) from public, anon, authenticated;
revoke all on function public.bible_streak_my_summary() from public, anon;
revoke all on function public.complete_personal_bible_reading(uuid, text, integer) from public, anon;
revoke all on function public.use_bible_streak_freeze(date) from public, anon;
revoke all on function public.deliver_bible_streak_reminders() from public, anon, authenticated;
grant execute on function public.bible_streak_get_settings() to authenticated;
grant execute on function public.bible_streak_my_summary() to authenticated;
grant execute on function public.complete_personal_bible_reading(uuid, text, integer) to authenticated;
grant execute on function public.use_bible_streak_freeze(date) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'bible_streak_achievements') then
      alter publication supabase_realtime add table public.bible_streak_achievements;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'bible_streak_settings') then
      alter publication supabase_realtime add table public.bible_streak_settings;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'bible_streak_freeze_usage') then
      alter publication supabase_realtime add table public.bible_streak_freeze_usage;
    end if;
  end if;
end;
$$;

create extension if not exists pg_cron;
do $$
declare scheduled_job record;
begin
  for scheduled_job in select jobid from cron.job where jobname = 'city-on-a-hill-bible-streak-reminders' loop
    perform cron.unschedule(scheduled_job.jobid);
  end loop;
  perform cron.schedule('city-on-a-hill-bible-streak-reminders', '*/15 * * * *',
    'select public.deliver_bible_streak_reminders();');
  for scheduled_job in select jobid from cron.job where jobname = 'city-on-a-hill-bible-streak-auto-freezes' loop
    perform cron.unschedule(scheduled_job.jobid);
  end loop;
  perform cron.schedule('city-on-a-hill-bible-streak-auto-freezes', '*/15 * * * *',
    'select public.process_bible_streak_auto_freezes();');
end;
$$;

notify pgrst, 'reload schema';
commit;
