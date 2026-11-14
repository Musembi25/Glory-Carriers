-- Safe, additive birthday fields and recurring Admin/Super Admin reminders.
-- Apply birthday-notification-type-migration.sql first and commit it before
-- applying this migration so PostgreSQL can use the new enum value.

alter table public.cell_group_members
  add column if not exists birth_day smallint,
  add column if not exists birth_month smallint,
  add column if not exists birth_year smallint;

-- Preserve legacy complete dates by backfilling only rows that do not already
-- have the new birthday fields.
update public.cell_group_members
set birth_day = extract(day from date_of_birth)::smallint,
    birth_month = extract(month from date_of_birth)::smallint,
    birth_year = extract(year from date_of_birth)::smallint
where date_of_birth is not null
  and birth_day is null
  and birth_month is null
  and birth_year is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cell_group_members_birthday_parts_valid'
      and conrelid = 'public.cell_group_members'::regclass
  ) then
    alter table public.cell_group_members
      add constraint cell_group_members_birthday_parts_valid
      check (
        (birth_day is null and birth_month is null)
        or (
          birth_day between 1 and 31
          and birth_month between 1 and 12
          and birth_day <= case
            when birth_month = 2 then 29
            when birth_month in (4, 6, 9, 11) then 30
            else 31
          end
        )
      );
  end if;
end;
$$;

create index if not exists idx_cell_group_members_birthday
  on public.cell_group_members (birth_month, birth_day)
  where birth_day is not null and birth_month is not null;

alter table public.notification_preferences
  add column if not exists birthdays_enabled boolean not null default true;

alter table public.notifications
  add column if not exists delivery_key text;

create unique index if not exists idx_notifications_delivery_key
  on public.notifications (delivery_key)
  where delivery_key is not null;

-- Keep membership record changes Admin/Super Admin only. Group leaders may
-- still approve a pending join request, but cannot directly alter records.
create or replace function public.can_approve_cell_group_join_request(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_cell_group_leader(p_group_id)
    and exists (
      select 1
      from public.cell_group_join_requests request
      where request.cell_group_id = p_group_id
        and request.user_id = p_user_id
        and request.status = 'pending'
    );
$$;

revoke all on function public.can_approve_cell_group_join_request(uuid, uuid) from public, anon;
grant execute on function public.can_approve_cell_group_join_request(uuid, uuid) to authenticated;

drop policy if exists "cell_group_members_manage" on public.cell_group_members;
drop policy if exists "cell_group_members_admin_manage" on public.cell_group_members;
create policy "cell_group_members_admin_manage"
on public.cell_group_members
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "cell_group_members_leader_approval_insert" on public.cell_group_members;
create policy "cell_group_members_leader_approval_insert"
on public.cell_group_members
for insert to authenticated
with check (
  membership_status = 'new'
  and public.can_approve_cell_group_join_request(cell_group_id, user_id)
);

create or replace function public.deliver_birthday_reminders()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_count integer := 0;
begin
  insert into public.notifications (
    user_id,
    notification_type,
    title,
    body,
    entity_table,
    entity_id,
    delivery_key
  )
  select distinct on (membership.user_id, recipient.id)
    recipient.id,
    'birthday_reminder'::public.notification_type,
    'Birthday today: ' || coalesce(nullif(trim(member.full_name), ''), 'The City on A Hill member'),
    coalesce(nullif(trim(member.full_name), ''), 'A member of The City on A Hill')
      || ' has a birthday today. Birthday: '
      || to_char(make_date(2000, membership.birth_month, membership.birth_day), 'FMMonth FMDD')
      || case
        when membership.birth_year is not null
          and membership.birth_year <= extract(year from birthday_date.local_date)::integer then
          ' · Turning ' || (extract(year from birthday_date.local_date)::integer - membership.birth_year)::text || '.'
        else '.'
      end,
    'cell_group_members',
    membership.id,
    'birthday:' || membership.user_id::text || ':'
      || extract(year from birthday_date.local_date)::integer::text || ':'
      || recipient.id::text
  from public.cell_group_members membership
  join public.cell_groups group_record on group_record.id = membership.cell_group_id
  join public.profiles member on member.id = membership.user_id
  join public.profiles recipient on recipient.role = 'admin' and recipient.is_active = true
  left join public.notification_preferences preferences on preferences.user_id = recipient.id
  cross join lateral (
    select case
      when exists (select 1 from pg_timezone_names zone where zone.name = group_record.timezone)
        then (now() at time zone group_record.timezone)::date
      else (now() at time zone 'UTC')::date
    end as local_date
  ) birthday_date
  where membership.membership_status in ('active', 'new', 'temporarily_inactive')
    and membership.birth_day is not null
    and membership.birth_month is not null
    and member.is_active = true
    and coalesce(preferences.birthdays_enabled, true) = true
    and (
      (
        membership.birth_month = extract(month from birthday_date.local_date)::integer
        and membership.birth_day = extract(day from birthday_date.local_date)::integer
      )
      or (
        membership.birth_month = 2
        and membership.birth_day = 29
        and extract(month from birthday_date.local_date)::integer = 3
        and extract(day from birthday_date.local_date)::integer = 1
        and (
          extract(year from birthday_date.local_date)::integer % 4 <> 0
          or extract(year from birthday_date.local_date)::integer % 100 = 0
            and extract(year from birthday_date.local_date)::integer % 400 <> 0
        )
      )
    )
  order by membership.user_id, recipient.id, membership.created_at, membership.id
  on conflict (delivery_key) where delivery_key is not null do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.deliver_birthday_reminders() from public, anon, authenticated;

-- Supabase Cron is backed by pg_cron. The hourly check evaluates each group's
-- local date; notification delivery keys enforce one reminder per recipient,
-- member, and calendar year. February 29 is observed on March 1 in non-leap years.
create extension if not exists pg_cron;

do $$
declare
  scheduled_job record;
begin
  for scheduled_job in
    select jobid from cron.job where jobname = 'glory-carriers-birthday-reminders'
  loop
    perform cron.unschedule(scheduled_job.jobid);
  end loop;

  perform cron.schedule(
    'glory-carriers-birthday-reminders',
    '0 * * * *',
    'select public.deliver_birthday_reminders();'
  );
end;
$$;
