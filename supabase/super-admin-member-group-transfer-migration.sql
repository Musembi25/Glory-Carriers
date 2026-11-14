-- Audited, transactional membership assignments between the three designated groups.
-- Apply after management-cell-groups-migration.sql and member-birthday-management-migration.sql.

create table if not exists public.cell_group_member_transfers (
  id bigint generated always as identity primary key,
  member_user_id uuid not null,
  member_record_id uuid not null,
  previous_group_id uuid,
  previous_group_name text,
  destination_group_id uuid not null,
  destination_group_name text not null,
  performed_by uuid not null,
  transfer_reason text,
  change_type text not null check (change_type in ('assignment', 'transfer')),
  transferred_at timestamptz not null default timezone('utc', now())
);

create index if not exists cell_group_member_transfers_member_time_idx
  on public.cell_group_member_transfers (member_user_id, transferred_at desc);

alter table public.cell_group_member_transfers enable row level security;
revoke all on public.cell_group_member_transfers from public, anon, authenticated;
grant select on public.cell_group_member_transfers to authenticated;
drop policy if exists cell_group_member_transfers_super_admin_read on public.cell_group_member_transfers;
create policy cell_group_member_transfers_super_admin_read
on public.cell_group_member_transfers
for select to authenticated
using (public.is_super_admin());

create or replace function public.super_admin_transfer_cell_group_members(
  p_member_user_ids uuid[],
  p_destination_group_id uuid,
  p_reason text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := auth.uid();
  destination_group public.cell_groups%rowtype;
  member_user_id uuid;
  member_record public.cell_group_members%rowtype;
  previous_group_id uuid;
  previous_group_name text;
  active_assignment_count bigint;
  transferred_count integer := 0;
  normalized_reason text := nullif(trim(p_reason), '');
begin
  if acting_user_id is null or not public.is_super_admin() then
    raise exception 'Only an authorised Super Admin can assign or transfer members.' using errcode = '42501';
  end if;

  if p_member_user_ids is null or cardinality(p_member_user_ids) = 0 then
    raise exception 'Select at least one member.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_member_user_ids) as requested(user_id)
    group by requested.user_id having count(*) > 1
  ) then
    raise exception 'The transfer selection contains duplicate members.' using errcode = '22023';
  end if;
  if length(normalized_reason) > 1000 then
    raise exception 'The transfer reason must be 1000 characters or fewer.' using errcode = '22023';
  end if;

  select * into destination_group
  from public.cell_groups
  where id = p_destination_group_id
    and (
      (is_primary and not management_only)
      or (management_only and system_key in ('management-cell-1', 'management-cell-2'))
    )
  for share;
  if not found then
    raise exception 'Choose one of the three designated cell groups.' using errcode = '22023';
  end if;

  for member_user_id in
    select requested.user_id
    from unnest(p_member_user_ids) as requested(user_id)
    order by requested.user_id
  loop
    perform 1 from public.profiles where id = member_user_id for update;
    if not found then
      raise exception 'A selected member account no longer exists.' using errcode = 'P0002';
    end if;

    select count(*) into active_assignment_count
    from public.cell_group_members membership
    join public.cell_groups member_group on member_group.id = membership.cell_group_id
    where membership.user_id = member_user_id
      and membership.membership_status in ('active', 'new', 'temporarily_inactive')
      and (
        (member_group.is_primary and not member_group.management_only)
        or (member_group.management_only and member_group.system_key in ('management-cell-1', 'management-cell-2'))
      );

    if active_assignment_count > 1 then
      raise exception 'A selected member has multiple active group assignments. Resolve those records before transferring.' using errcode = '23505';
    end if;

    if exists (
      select 1
      from public.cell_group_members membership
      join public.cell_groups member_group on member_group.id = membership.cell_group_id
      where membership.user_id = member_user_id
        and membership.membership_status in ('active', 'new', 'temporarily_inactive')
        and not (
          (member_group.is_primary and not member_group.management_only)
          or (member_group.management_only and member_group.system_key in ('management-cell-1', 'management-cell-2'))
        )
    ) then
      raise exception 'A selected member is assigned to a different cell group.' using errcode = '22023';
    end if;

    if active_assignment_count = 1 then
      select membership.* into member_record
      from public.cell_group_members membership
      join public.cell_groups member_group on member_group.id = membership.cell_group_id
      where membership.user_id = member_user_id
        and membership.membership_status in ('active', 'new', 'temporarily_inactive')
        and (
          (member_group.is_primary and not member_group.management_only)
          or (member_group.management_only and member_group.system_key in ('management-cell-1', 'management-cell-2'))
        )
      for update of membership;

      if not found then
        raise exception 'A member assignment changed while the transfer was starting. Refresh and try again.' using errcode = '40001';
      end if;

      if member_record.cell_group_id = p_destination_group_id then
        raise exception 'A selected member already belongs to %.', destination_group.name using errcode = '22023';
      end if;
      previous_group_id := member_record.cell_group_id;

      if exists (
        select 1 from public.cell_group_members
        where user_id = member_user_id and cell_group_id = p_destination_group_id
      ) then
        raise exception 'A selected member already has a record in %.', destination_group.name using errcode = '23505';
      end if;

      select name into previous_group_name
      from public.cell_groups where id = member_record.cell_group_id;

      update public.cell_group_members
      set cell_group_id = p_destination_group_id
      where id = member_record.id;
    else
      if exists (
        select 1 from public.cell_group_members
        where user_id = member_user_id and cell_group_id = p_destination_group_id
      ) then
        select * into member_record
        from public.cell_group_members
        where user_id = member_user_id and cell_group_id = p_destination_group_id
        for update;
        if not found then
          raise exception 'A member assignment changed while the transfer was starting. Refresh and try again.' using errcode = '40001';
        end if;
        update public.cell_group_members
        set membership_status = 'new'
        where id = member_record.id;
      else
        insert into public.cell_group_members (
          cell_group_id, user_id, membership_status, joined_month, joined_year
        ) values (
          p_destination_group_id,
          member_user_id,
          'new',
          extract(month from current_date)::smallint,
          extract(year from current_date)::smallint
        ) returning * into member_record;
      end if;
      previous_group_name := null;
      previous_group_id := null;
    end if;

    insert into public.cell_group_member_transfers (
      member_user_id,
      member_record_id,
      previous_group_id,
      previous_group_name,
      destination_group_id,
      destination_group_name,
      performed_by,
      transfer_reason,
      change_type
    ) values (
      member_user_id,
      member_record.id,
      previous_group_id,
      previous_group_name,
      p_destination_group_id,
      destination_group.name,
      acting_user_id,
      normalized_reason,
      case when active_assignment_count = 1 then 'transfer' else 'assignment' end
    );

    transferred_count := transferred_count + 1;
  end loop;

  return transferred_count;
end;
$$;

revoke all on function public.super_admin_transfer_cell_group_members(uuid[], uuid, text) from public, anon;
grant execute on function public.super_admin_transfer_cell_group_members(uuid[], uuid, text) to authenticated;
