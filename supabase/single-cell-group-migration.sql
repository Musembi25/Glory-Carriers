-- Consolidate the existing workspace into the canonical City on a Hill group.
-- This migration keeps archived group rows, snapshots every linked record before
-- reassignment, and leaves historical transfer audit entries untouched.
-- Apply once in the project's Supabase SQL Editor after backing up the project.

begin;

alter table public.cell_groups
  add column if not exists archived_at timestamptz,
  add column if not exists canonical_group_id uuid references public.cell_groups(id) on delete restrict;

create table if not exists public.cell_group_consolidation_archive (
  source_group_id uuid primary key references public.cell_groups(id) on delete restrict,
  canonical_group_id uuid not null references public.cell_groups(id) on delete restrict,
  source_group_name text not null,
  archived_at timestamptz not null default timezone('utc', now()),
  original_primary_group jsonb not null,
  original_group jsonb not null,
  related_records jsonb not null default '{}'::jsonb
);

alter table public.cell_group_consolidation_archive enable row level security;
revoke all on public.cell_group_consolidation_archive from public, anon, authenticated, service_role;

do $$
declare
  canonical_id uuid;
  source_group public.cell_groups%rowtype;
  canonical_snapshot jsonb;
  reference record;
  related_snapshot jsonb;
  row_snapshot jsonb;
begin
  select id into canonical_id
  from public.cell_groups
  where is_primary = true and management_only = false and archived_at is null
  order by created_at, id
  limit 1
  for update;

  if canonical_id is null then
    raise exception 'The current primary cell group is missing. No records were changed.';
  end if;

  select to_jsonb(group_record) into canonical_snapshot
  from public.cell_groups group_record
  where group_record.id = canonical_id;

  if exists (
    select membership.user_id
    from public.cell_group_members membership
    join public.cell_groups member_group on member_group.id = membership.cell_group_id
    where membership.user_id is not null and member_group.archived_at is null
    group by membership.user_id
    having count(*) > 1
  ) then
    raise exception 'A member already has a canonical group record. Resolve duplicate memberships before consolidation.';
  end if;

  if exists (
    select 1
    from public.cell_group_admin_assignments assignment
    join public.cell_groups assignment_group on assignment_group.id = assignment.cell_group_id
    where assignment_group.archived_at is null
    group by assignment.admin_user_id
    having count(*) > 1
  ) then
    raise exception 'An administrator already has a canonical group assignment. Resolve duplicate assignments before consolidation.';
  end if;

  update public.cell_groups
  set name = 'City on a Hill',
      archived_at = null,
      canonical_group_id = null,
      updated_at = timezone('utc', now())
  where id = canonical_id;

  -- Group reassignment must not make unchanged membership profiles look edited.
  alter table public.cell_group_members disable trigger cell_group_members_updated_at;

  for source_group in
    select * from public.cell_groups
    where id <> canonical_id and archived_at is null
    order by created_at, id
    for update
  loop
    related_snapshot := '{}'::jsonb;

    for reference in
      select source_schema.nspname as schema_name,
             source_table.relname as table_name,
             source_column.attname as column_name
      from pg_constraint foreign_key
      join pg_class source_table on source_table.oid = foreign_key.conrelid
      join pg_namespace source_schema on source_schema.oid = source_table.relnamespace
      cross join lateral unnest(foreign_key.conkey, foreign_key.confkey)
        with ordinality as key_columns(source_attnum, target_attnum, ordinal_position)
      join pg_attribute source_column
        on source_column.attrelid = source_table.oid and source_column.attnum = key_columns.source_attnum
      join pg_attribute target_column
        on target_column.attrelid = foreign_key.confrelid and target_column.attnum = key_columns.target_attnum
      where foreign_key.contype = 'f'
        and foreign_key.confrelid = 'public.cell_groups'::regclass
        and target_column.attname = 'id'
        and source_table.oid not in (
          'public.cell_groups'::regclass,
          'public.cell_group_consolidation_archive'::regclass
        )
    loop
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(record_row)), ''[]''::jsonb) from %I.%I record_row where %I = $1',
        reference.schema_name,
        reference.table_name,
        reference.column_name
      ) into row_snapshot using source_group.id;

      if row_snapshot <> '[]'::jsonb then
        related_snapshot := jsonb_set(
          related_snapshot,
          array[reference.schema_name || '.' || reference.table_name || '.' || reference.column_name],
          row_snapshot,
          true
        );
      end if;
    end loop;

    insert into public.cell_group_consolidation_archive (
      source_group_id, canonical_group_id, source_group_name, original_primary_group, original_group, related_records
    ) values (
      source_group.id, canonical_id, source_group.name, canonical_snapshot, to_jsonb(source_group), related_snapshot
    ) on conflict (source_group_id) do nothing;

    for reference in
      select source_schema.nspname as schema_name,
             source_table.relname as table_name,
             source_column.attname as column_name
      from pg_constraint foreign_key
      join pg_class source_table on source_table.oid = foreign_key.conrelid
      join pg_namespace source_schema on source_schema.oid = source_table.relnamespace
      cross join lateral unnest(foreign_key.conkey, foreign_key.confkey)
        with ordinality as key_columns(source_attnum, target_attnum, ordinal_position)
      join pg_attribute source_column
        on source_column.attrelid = source_table.oid and source_column.attnum = key_columns.source_attnum
      join pg_attribute target_column
        on target_column.attrelid = foreign_key.confrelid and target_column.attnum = key_columns.target_attnum
      where foreign_key.contype = 'f'
        and foreign_key.confrelid = 'public.cell_groups'::regclass
        and target_column.attname = 'id'
        and source_table.oid not in (
          'public.cell_groups'::regclass,
          'public.cell_group_consolidation_archive'::regclass
        )
    loop
      execute format(
        'update %I.%I set %I = $1 where %I = $2',
        reference.schema_name,
        reference.table_name,
        reference.column_name,
        reference.column_name
      ) using canonical_id, source_group.id;
    end loop;

    update public.cell_groups
    set archived_at = timezone('utc', now()),
        canonical_group_id = canonical_id,
        updated_at = timezone('utc', now())
    where id = source_group.id;
  end loop;

  alter table public.cell_group_members enable trigger cell_group_members_updated_at;
end;
$$;

create or replace function public.primary_cell_group_id()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select id from public.cell_groups
  where is_primary = true and management_only = false and archived_at is null
  limit 1;
$$;

create or replace function public.ensure_default_cell_group()
returns public.cell_groups
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  canonical_group public.cell_groups%rowtype;
begin
  select * into canonical_group
  from public.cell_groups
  where is_primary = true and management_only = false and archived_at is null
  limit 1;

  if canonical_group.id is null then
    raise exception 'The City on a Hill group is not configured. Contact your system administrator.' using errcode = 'P0002';
  end if;
  return canonical_group;
end;
$$;

create or replace function public.user_can_access_cell_group(target_group_id uuid, target_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select target_user_id is not null
    and exists (
      select 1
      from public.cell_groups target_group
      join public.profiles account on account.id = target_user_id and account.is_active = true
      where target_group.id = target_group_id
        and target_group.is_primary = true
        and target_group.management_only = false
        and target_group.archived_at is null
    );
$$;

create or replace function public.prevent_additional_cell_groups()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    raise exception 'The City on a Hill workspace supports one cell group.' using errcode = '42501';
  end if;

  if old.is_primary is not true or old.archived_at is not null then
    raise exception 'Archived cell groups are read-only records.' using errcode = '42501';
  end if;

  if new.id is distinct from old.id
    or new.is_primary is distinct from true
    or new.management_only is distinct from false
    or new.archived_at is distinct from old.archived_at
    or new.canonical_group_id is distinct from old.canonical_group_id then
    raise exception 'The canonical cell group identity is fixed.' using errcode = '42501';
  end if;

  if new.name is distinct from old.name and new.name is distinct from 'City on a Hill' then
    raise exception 'The cell group name is fixed as City on a Hill.' using errcode = '42501';
  end if;

  new.name := 'City on a Hill';
  return new;
end;
$$;

drop trigger if exists prevent_additional_cell_groups on public.cell_groups;
create trigger prevent_additional_cell_groups
before insert or update on public.cell_groups
for each row execute function public.prevent_additional_cell_groups();

drop policy if exists cell_groups_insert_super_admin on public.cell_groups;
revoke insert, delete on public.cell_groups from public, anon, authenticated;
grant select, update on public.cell_groups to authenticated;

revoke all on function public.primary_cell_group_id() from public, anon;
revoke all on function public.ensure_default_cell_group() from public, anon;
revoke all on function public.can_access_cell_group(uuid) from public, anon;
revoke all on function public.can_manage_cell_group(uuid) from public, anon;
revoke all on function public.user_can_access_cell_group(uuid, uuid) from public, anon, authenticated;
grant execute on function public.primary_cell_group_id() to authenticated;
grant execute on function public.ensure_default_cell_group() to authenticated;
grant execute on function public.can_access_cell_group(uuid) to authenticated;
grant execute on function public.can_manage_cell_group(uuid) to authenticated;
grant execute on function public.user_can_access_cell_group(uuid, uuid) to service_role;

-- Keep the protected transfer table for history, but disable future client transfers.
revoke all on function public.super_admin_transfer_cell_group_members(uuid[], uuid, text) from public, anon, authenticated;

-- Keep birthday notifications on the canonical group's name and timezone.
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
  select distinct on (membership.user_id, recipient.id)
    recipient.id,
    'birthday_reminder'::public.notification_type,
    'Birthday today: ' || coalesce(nullif(trim(member.full_name), ''), 'City on a Hill member'),
    coalesce(nullif(trim(member.full_name), ''), 'A City on a Hill member')
      || ' has a birthday today. Birthday: '
      || to_char(make_date(2000, membership.birth_month, membership.birth_day), 'FMMonth FMDD')
      || case
        when membership.birth_year is not null
          and membership.birth_year <= extract(year from birthday_date.local_date)::integer then
          ' - Turning ' || (extract(year from birthday_date.local_date)::integer - membership.birth_year)::text || '.'
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
  where group_record.is_primary = true
    and group_record.management_only = false
    and group_record.archived_at is null
    and membership.membership_status in ('active', 'new', 'temporarily_inactive')
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

notify pgrst, 'reload schema';

commit;
