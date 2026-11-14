-- Independent member records, protected member data, private record photos,
-- and trusted linking of a confirmed Auth account to an existing record.
-- Apply member-record-status-enum-migration.sql first and commit it.

alter table public.cell_group_members
  alter column user_id drop not null,
  add column if not exists full_name text,
  add column if not exists contact_email text,
  add column if not exists merged_record_data jsonb not null default '[]'::jsonb;

-- Preserve the row when a linked Auth profile is later deleted. Existing
-- membership rows and their IDs are retained; only the optional link is cleared.
alter table public.cell_group_members
  drop constraint if exists cell_group_members_user_id_fkey;
alter table public.cell_group_members
  add constraint cell_group_members_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

-- Existing linked members keep their profile and membership data.
update public.cell_group_members membership
set full_name = coalesce(nullif(trim(membership.full_name), ''), profile.full_name),
    contact_email = coalesce(nullif(trim(membership.contact_email), ''), profile.email)
from public.profiles profile
where membership.user_id = profile.id
  and (membership.full_name is null or membership.contact_email is null);

alter table public.cell_group_members
  alter column membership_status set default 'prospective';

create index if not exists idx_cell_group_members_contact_email
  on public.cell_group_members (cell_group_id, lower(trim(contact_email)))
  where user_id is null and contact_email is not null;

-- A non-admin may only read their own linked membership row. Prospective
-- records and other members' personal data remain available to authorized
-- administrators only. The existing restrictive group-scope policy remains in force.
drop policy if exists "cell_group_members_select" on public.cell_group_members;
create policy "cell_group_members_select"
on public.cell_group_members for select to authenticated
using (public.is_admin() or user_id = auth.uid());

-- Linking accepts neither a user ID nor an email from the caller. It derives
-- the identity from auth.uid() and the confirmed email in auth.users, and only
-- links a unique matching unlinked record in each group. It never
-- changes membership status. If a linked row already exists, it merges only
-- missing information into that row and removes the duplicate record.
create or replace function public.link_confirmed_member_records()
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  current_profile public.profiles%rowtype;
  confirmed_email text;
  candidate record;
  target public.cell_group_members%rowtype;
  linked_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select profile.* into current_profile
  from public.profiles profile
  where profile.id = auth.uid() and profile.is_active = true;
  if not found then
    raise exception 'An active profile is required.' using errcode = '42501';
  end if;

  select lower(trim(account.email)) into confirmed_email
  from auth.users account
  where account.id = auth.uid()
    and coalesce(account.email_confirmed_at, account.confirmed_at) is not null;
  if confirmed_email is null then return 0; end if;

  for candidate in
    select membership.*
    from public.cell_group_members membership
    where membership.user_id is null
      and lower(trim(membership.contact_email)) = confirmed_email
      and (
        select count(*)
        from public.cell_group_members match
        where match.user_id is null
          and match.cell_group_id = membership.cell_group_id
          and lower(trim(match.contact_email)) = confirmed_email
      ) = 1
  loop
    -- The Auth listener and initial session restore can both run at sign-in.
    -- Lock and recheck the candidate so a second call cannot delete a row the
    -- first call has just linked.
    perform 1
    from public.cell_group_members membership
    where membership.id = candidate.id
      and membership.user_id is null
      and lower(trim(membership.contact_email)) = confirmed_email
    for update;
    if not found then continue; end if;

    select * into target
    from public.cell_group_members membership
    where membership.cell_group_id = candidate.cell_group_id
      and membership.user_id = auth.uid()
    for update;

    if found then
      update public.cell_group_members linked
      set full_name = coalesce(nullif(trim(linked.full_name), ''), nullif(trim(candidate.full_name), ''), current_profile.full_name),
          contact_email = coalesce(nullif(trim(linked.contact_email), ''), candidate.contact_email, confirmed_email),
          date_of_birth = coalesce(linked.date_of_birth, candidate.date_of_birth),
          birth_day = coalesce(linked.birth_day, candidate.birth_day),
          birth_month = coalesce(linked.birth_month, candidate.birth_month),
          birth_year = coalesce(linked.birth_year, candidate.birth_year),
          departments = case when cardinality(linked.departments) = 0 then candidate.departments else linked.departments end,
          custom_department = coalesce(nullif(trim(linked.custom_department), ''), candidate.custom_department),
          favorite_food = coalesce(nullif(trim(linked.favorite_food), ''), candidate.favorite_food),
          joined_month = coalesce(linked.joined_month, candidate.joined_month),
          joined_year = coalesce(linked.joined_year, candidate.joined_year),
          joined_date = coalesce(linked.joined_date, candidate.joined_date),
          phone = coalesce(nullif(trim(linked.phone), ''), candidate.phone),
          gender = coalesce(nullif(trim(linked.gender), ''), candidate.gender),
          bio = coalesce(nullif(trim(linked.bio), ''), candidate.bio),
          notes = coalesce(nullif(trim(linked.notes), ''), candidate.notes),
          merged_record_data = coalesce(linked.merged_record_data, '[]'::jsonb) || jsonb_build_array(to_jsonb(candidate))
      where linked.id = target.id;

      delete from public.cell_group_members where id = candidate.id;
    else
      update public.cell_group_members
      set user_id = auth.uid(),
          full_name = coalesce(nullif(trim(full_name), ''), current_profile.full_name),
          contact_email = coalesce(nullif(trim(contact_email), ''), confirmed_email)
      where id = candidate.id;
    end if;
    linked_count := linked_count + 1;
  end loop;

  return linked_count;
end;
$$;

revoke all on function public.link_confirmed_member_records() from public, anon;
grant execute on function public.link_confirmed_member_records() to authenticated;

-- Keep recurring reminders for all people records with birthdays. Use the
-- membership row as the idempotency key so unlinked people are supported.
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
    user_id, notification_type, title, body, entity_table, entity_id, delivery_key
  )
  select distinct on (membership.id, recipient.id)
    recipient.id,
    'birthday_reminder'::public.notification_type,
    'Birthday today: ' || coalesce(nullif(trim(member.full_name), ''), nullif(trim(membership.full_name), ''), 'The City on A Hill member'),
    coalesce(nullif(trim(member.full_name), ''), nullif(trim(membership.full_name), ''), 'A member of The City on A Hill')
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
    'birthday:' || membership.id::text || ':'
      || extract(year from birthday_date.local_date)::integer::text || ':'
      || recipient.id::text
  from public.cell_group_members membership
  join public.cell_groups group_record on group_record.id = membership.cell_group_id
  left join public.profiles member on member.id = membership.user_id
  join public.profiles recipient on recipient.role = 'admin' and recipient.is_active = true
  left join public.notification_preferences preferences on preferences.user_id = recipient.id
  cross join lateral (
    select case
      when exists (select 1 from pg_timezone_names zone where zone.name = group_record.timezone)
        then (now() at time zone group_record.timezone)::date
      else (now() at time zone 'UTC')::date
    end as local_date
  ) birthday_date
  where membership.membership_status in ('active', 'new', 'temporarily_inactive', 'prospective', 'pending')
    and membership.birth_day is not null
    and membership.birth_month is not null
    and (member.id is null or member.is_active = true)
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
  order by membership.id, recipient.id, membership.created_at
  on conflict (delivery_key) where delivery_key is not null do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.deliver_birthday_reminders() from public, anon, authenticated;

-- Make newly-added columns and updated functions immediately visible to the API.
notify pgrst, 'reload schema';
