-- Add explicit response privacy and secure creator deletion to GC Pulse activities.
-- Apply after gc-pulse-activities-migration.sql.
alter table public.gc_pulse_activities
  add column if not exists responses_anonymous boolean not null default true;

drop policy if exists "gc_pulse_activities_delete_admin" on public.gc_pulse_activities;
drop policy if exists "gc_pulse_activities_delete_owner_or_admin" on public.gc_pulse_activities;
create policy "gc_pulse_activities_delete_owner_or_admin" on public.gc_pulse_activities
  for delete to authenticated
  using (public.is_active_user() and (created_by = auth.uid() or public.is_admin()));

drop function if exists public.gc_pulse_activity_participants(uuid);
create function public.gc_pulse_activity_participants(target_activity_id uuid)
returns table (
  user_id uuid,
  full_name text,
  selected_option integer,
  awarded_points integer,
  submitted_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
declare
  activity_row public.gc_pulse_activities%rowtype;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Active membership is required.';
  end if;
  select * into activity_row from public.gc_pulse_activities where id = target_activity_id;
  if not found then raise exception 'Activity not found.'; end if;
  if activity_row.status = 'open' and (activity_row.closes_at is null or activity_row.closes_at > now()) then
    raise exception 'Participant details are available after the activity ends.';
  end if;
  if activity_row.responses_anonymous then
    return;
  end if;
  return query
    select response.user_id,
           member.full_name,
           response.selected_option,
           response.awarded_points,
           response.submitted_at
    from public.gc_pulse_activity_responses response
    join public.profiles member on member.id = response.user_id
    where response.activity_id = target_activity_id
    order by response.submitted_at;
end;
$$;
revoke all on function public.gc_pulse_activity_participants(uuid) from public;
grant execute on function public.gc_pulse_activity_participants(uuid) to authenticated;

create or replace function public.gc_pulse_activity_participant_count(target_activity_id uuid)
returns bigint
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Active membership is required.';
  end if;
  if not exists (select 1 from public.gc_pulse_activities where id = target_activity_id) then
    raise exception 'Activity not found.';
  end if;
  return (select count(*)::bigint from public.gc_pulse_activity_responses where activity_id = target_activity_id);
end;
$$;
revoke all on function public.gc_pulse_activity_participant_count(uuid) from public;
grant execute on function public.gc_pulse_activity_participant_count(uuid) to authenticated;
