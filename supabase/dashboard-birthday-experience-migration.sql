-- Dashboard birthday experience: limited upcoming birthday fields and a shared
-- one-time celebration marker. Apply after member-birthday-management-migration.sql.
-- The function exposes only active members' names, birthday day/month,
-- and days-until values to an authenticated group member (or existing admin).
-- Existing cell_group_members RLS policies remain unchanged.

alter table public.notification_preferences
  add column if not exists birthday_celebration_shown_on date;

drop function if exists public.get_dashboard_birthdays(uuid);

create function public.get_dashboard_birthdays(p_cell_group_id uuid)
returns table (
  user_id uuid,
  full_name text,
  birth_day smallint,
  birth_month smallint,
  days_until integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with group_day as (
    select group_record.id,
      (now() at time zone coalesce(nullif(group_record.timezone, ''), 'UTC'))::date as local_today
    from public.cell_groups group_record
    where group_record.id = p_cell_group_id
      and group_record.is_primary = true
      and group_record.management_only = false
      and group_record.archived_at is null
      and (public.is_admin() or public.is_cell_group_member(group_record.id))
  ), member_birthdays as (
    select membership.user_id,
      coalesce(nullif(btrim(profile.full_name), ''), nullif(btrim(membership.full_name), ''), 'Community member') as display_name,
      coalesce(membership.birth_day, extract(day from membership.date_of_birth)::smallint) as birthday_day,
      coalesce(membership.birth_month, extract(month from membership.date_of_birth)::smallint) as birthday_month,
      group_day.local_today
    from public.cell_group_members membership
    join group_day on group_day.id = membership.cell_group_id
    join public.profiles profile on profile.id = membership.user_id and profile.is_active = true
    where membership.user_id is not null
      and membership.membership_status in ('active', 'new', 'temporarily_inactive')
  ), valid_birthdays as (
    select *
    from member_birthdays
    where birthday_month between 1 and 12
      and birthday_day between 1 and case
        when birthday_month = 2 then 29
        when birthday_month in (4, 6, 9, 11) then 30
        else 31
      end
  ), this_year as (
    select *,
      case
        when birthday_month = 2 and birthday_day = 29
          and not (
            extract(year from local_today)::integer % 4 = 0
            and (extract(year from local_today)::integer % 100 <> 0
              or extract(year from local_today)::integer % 400 = 0)
          ) then make_date(extract(year from local_today)::integer, 3, 1)
        else make_date(extract(year from local_today)::integer, birthday_month::integer, birthday_day::integer)
      end as this_year_date
    from valid_birthdays
  ), next_occurrence as (
    select *,
      case when this_year_date < local_today then
        case
          when birthday_month = 2 and birthday_day = 29
            and not (
              (extract(year from local_today)::integer + 1) % 4 = 0
              and ((extract(year from local_today)::integer + 1) % 100 <> 0
                or (extract(year from local_today)::integer + 1) % 400 = 0)
            ) then make_date(extract(year from local_today)::integer + 1, 3, 1)
          else make_date(extract(year from local_today)::integer + 1, birthday_month::integer, birthday_day::integer)
        end
      else this_year_date end as next_date
    from this_year
  )
  select next_occurrence.user_id,
    next_occurrence.display_name,
    next_occurrence.birthday_day,
    next_occurrence.birthday_month,
    (next_occurrence.next_date - next_occurrence.local_today)::integer
  from next_occurrence
  where next_occurrence.next_date <= next_occurrence.local_today + 30
  order by next_occurrence.next_date, next_occurrence.display_name;
$$;

revoke all on function public.get_dashboard_birthdays(uuid) from public, anon;
grant execute on function public.get_dashboard_birthdays(uuid) to authenticated;

create or replace function public.claim_my_birthday_celebration()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  today_in_group date;
  member_month integer;
  member_day integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  select
    (now() at time zone coalesce(nullif(group_record.timezone, ''), 'UTC'))::date,
    coalesce(membership.birth_month, extract(month from membership.date_of_birth)::smallint)::integer,
    coalesce(membership.birth_day, extract(day from membership.date_of_birth)::smallint)::integer
  into today_in_group, member_month, member_day
  from public.cell_group_members membership
  join public.cell_groups group_record on group_record.id = membership.cell_group_id
  where membership.user_id = auth.uid()
    and membership.membership_status in ('active', 'new', 'temporarily_inactive')
    and group_record.is_primary = true
    and group_record.management_only = false
    and group_record.archived_at is null
  order by group_record.created_at
  limit 1;

  if today_in_group is null or member_month is null or member_day is null then
    return false;
  end if;

  if not (
    (member_month = extract(month from today_in_group)::integer
      and member_day = extract(day from today_in_group)::integer)
    or (member_month = 2 and member_day = 29
      and extract(month from today_in_group)::integer = 3
      and extract(day from today_in_group)::integer = 1
      and not (
        extract(year from today_in_group)::integer % 4 = 0
        and (extract(year from today_in_group)::integer % 100 <> 0
          or extract(year from today_in_group)::integer % 400 = 0)
      ))
  ) then
    return false;
  end if;

  insert into public.notification_preferences (user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;

  update public.notification_preferences
  set birthday_celebration_shown_on = today_in_group
  where user_id = auth.uid()
    and birthday_celebration_shown_on is distinct from today_in_group;

  return found;
end;
$$;

revoke all on function public.claim_my_birthday_celebration() from public, anon;
grant execute on function public.claim_my_birthday_celebration() to authenticated;
