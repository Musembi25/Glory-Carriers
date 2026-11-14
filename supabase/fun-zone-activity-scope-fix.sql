-- Fix the group-scope trigger for GC Pulse parent activities.
-- Apply after management-cell-groups-migration.sql and fun-zone-migration.sql.
begin;

create or replace function public.assign_gc_pulse_activity_scope()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.group_id is distinct from old.group_id then
    raise exception 'Group ownership cannot be changed.' using errcode = '42501';
  end if;

  if new.group_id is null then
    new.group_id := public.primary_cell_group_id();
  end if;
  if new.group_id is null then
    raise exception 'A cell group is required.';
  end if;

  return new;
end;
$$;
revoke all on function public.assign_gc_pulse_activity_scope() from public, anon, authenticated;

drop trigger if exists assign_cell_group_scope on public.gc_pulse_activities;
create trigger assign_cell_group_scope
  before insert or update on public.gc_pulse_activities
  for each row execute function public.assign_gc_pulse_activity_scope();

notify pgrst, 'reload schema';
commit;
