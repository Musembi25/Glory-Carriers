-- GC Pulse: shared community activities with server-validated participation.
-- Apply this migration in the existing Supabase project before enabling activities.

create table if not exists public.gc_pulse_activities (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  activity_type text not null check (activity_type in (
    'this_or_that', 'would_you_rather', 'quick_quiz', 'riddle',
    'bible_challenge', 'surprise_poll'
  )),
  title text not null check (char_length(trim(title)) between 3 and 120),
  prompt text not null check (char_length(trim(prompt)) between 5 and 1000),
  options jsonb not null,
  starts_at timestamptz not null default timezone('utc', now()),
  closes_at timestamptz,
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint gc_pulse_activities_options_valid check (
    case when jsonb_typeof(options) = 'array'
      then jsonb_array_length(options) between 2 and 6
      else false
    end
  ),
  constraint gc_pulse_activities_close_after_start check (closes_at is null or closes_at > starts_at)
);
create index if not exists idx_gc_pulse_activities_status_created
  on public.gc_pulse_activities(status, created_at desc);

-- Correct answers are kept in a separate admin-only table.
create table if not exists public.gc_pulse_activity_keys (
  activity_id uuid primary key references public.gc_pulse_activities(id) on delete cascade,
  correct_option integer not null check (correct_option between 0 and 5),
  explanation text not null default '' check (char_length(explanation) <= 1000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.gc_pulse_activity_responses (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.gc_pulse_activities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  selected_option integer not null check (selected_option between 0 and 5),
  awarded_points integer not null default 0 check (awarded_points between 0 and 1),
  submitted_at timestamptz not null default timezone('utc', now()),
  unique (activity_id, user_id)
);
create index if not exists idx_gc_pulse_responses_activity
  on public.gc_pulse_activity_responses(activity_id, submitted_at);

grant select, insert, update, delete on public.gc_pulse_activities to authenticated;
grant select, insert, update, delete on public.gc_pulse_activity_keys to authenticated;
grant select on public.gc_pulse_activity_responses to authenticated;

alter table public.gc_pulse_activities enable row level security;
alter table public.gc_pulse_activity_keys enable row level security;
alter table public.gc_pulse_activity_responses enable row level security;

drop policy if exists "gc_pulse_activities_select_active" on public.gc_pulse_activities;
create policy "gc_pulse_activities_select_active" on public.gc_pulse_activities
  for select to authenticated using (public.is_active_user());
drop policy if exists "gc_pulse_activities_insert_admin" on public.gc_pulse_activities;
create policy "gc_pulse_activities_insert_admin" on public.gc_pulse_activities
  for insert to authenticated with check (public.is_admin() and created_by = auth.uid());
drop policy if exists "gc_pulse_activities_update_admin" on public.gc_pulse_activities;
create policy "gc_pulse_activities_update_admin" on public.gc_pulse_activities
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "gc_pulse_activities_delete_admin" on public.gc_pulse_activities;
create policy "gc_pulse_activities_delete_admin" on public.gc_pulse_activities
  for delete to authenticated using (public.is_admin());

drop policy if exists "gc_pulse_keys_select_admin" on public.gc_pulse_activity_keys;
create policy "gc_pulse_keys_select_admin" on public.gc_pulse_activity_keys
  for select to authenticated using (public.is_admin());
drop policy if exists "gc_pulse_keys_insert_admin" on public.gc_pulse_activity_keys;
create policy "gc_pulse_keys_insert_admin" on public.gc_pulse_activity_keys
  for insert to authenticated with check (public.is_admin() and created_by = auth.uid());
drop policy if exists "gc_pulse_keys_update_admin" on public.gc_pulse_activity_keys;
create policy "gc_pulse_keys_update_admin" on public.gc_pulse_activity_keys
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "gc_pulse_keys_delete_admin" on public.gc_pulse_activity_keys;
create policy "gc_pulse_keys_delete_admin" on public.gc_pulse_activity_keys
  for delete to authenticated using (public.is_admin());

drop policy if exists "gc_pulse_responses_select_own_or_final" on public.gc_pulse_activity_responses;
drop policy if exists "gc_pulse_responses_select_own_or_admin" on public.gc_pulse_activity_responses;
create policy "gc_pulse_responses_select_own_or_admin" on public.gc_pulse_activity_responses
  for select to authenticated using (
    public.is_active_user() and (public.is_admin() or user_id = auth.uid())
  );
-- Responses have no direct write policy. Submissions go through the validating RPC.

create or replace function public.submit_gc_pulse_response(
  target_activity_id uuid,
  selected_option integer
)
returns table (awarded_points integer)
language plpgsql security definer set search_path = public
as $$
declare
  activity_row public.gc_pulse_activities%rowtype;
  expected_option integer;
  score integer := 0;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Active membership is required.';
  end if;
  select * into activity_row from public.gc_pulse_activities
    where id = target_activity_id for update;
  if not found then raise exception 'Activity not found.'; end if;
  if activity_row.status <> 'open' then raise exception 'This activity is closed.'; end if;
  if activity_row.starts_at > now() then raise exception 'This activity has not started.'; end if;
  if activity_row.closes_at is not null and activity_row.closes_at <= now() then
    raise exception 'This activity has closed.';
  end if;
  if selected_option < 0 or selected_option >= jsonb_array_length(activity_row.options) then
    raise exception 'Choose one of the available answers.';
  end if;
  if activity_row.activity_type in ('quick_quiz', 'riddle', 'bible_challenge') then
    select correct_option into expected_option from public.gc_pulse_activity_keys
      where activity_id = target_activity_id;
    if expected_option is null then raise exception 'The answer key is unavailable.'; end if;
    score := case when selected_option = expected_option then 1 else 0 end;
  end if;
  insert into public.gc_pulse_activity_responses(activity_id, user_id, selected_option, awarded_points)
    values (target_activity_id, auth.uid(), selected_option, score);
  return query select score;
exception when unique_violation then
  raise exception 'You have already participated in this activity.';
end;
$$;
revoke all on function public.submit_gc_pulse_response(uuid, integer) from public;
grant execute on function public.submit_gc_pulse_response(uuid, integer) to authenticated;

create or replace function public.gc_pulse_activity_results(target_activity_id uuid)
returns table (selected_option integer, response_count bigint, points_awarded bigint)
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
    raise exception 'Results are available after the activity ends.';
  end if;
  return query select r.selected_option, count(*)::bigint, sum(r.awarded_points)::bigint
    from public.gc_pulse_activity_responses r
    where r.activity_id = target_activity_id
    group by r.selected_option
    order by r.selected_option;
end;
$$;
revoke all on function public.gc_pulse_activity_results(uuid) from public;
grant execute on function public.gc_pulse_activity_results(uuid) to authenticated;

create or replace function public.close_gc_pulse_activity(
  target_activity_id uuid,
  final_status text default 'completed'
)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  if final_status not in ('completed', 'cancelled') then
    raise exception 'Invalid final activity status.';
  end if;
  update public.gc_pulse_activities
    set status = final_status, updated_at = timezone('utc', now())
    where id = target_activity_id and status = 'open';
  if not found then raise exception 'Open activity not found.'; end if;
end;
$$;
revoke all on function public.close_gc_pulse_activity(uuid, text) from public;
grant execute on function public.close_gc_pulse_activity(uuid, text) to authenticated;

create or replace function public.reveal_gc_pulse_answer(target_activity_id uuid)
returns table (correct_option integer, explanation text)
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
  if activity_row.activity_type not in ('quick_quiz', 'riddle', 'bible_challenge') then
    raise exception 'This activity has no answer key.';
  end if;
  if activity_row.status = 'cancelled' or (
    activity_row.status = 'open' and (activity_row.closes_at is null or activity_row.closes_at > now())
  ) then raise exception 'The answer is available after the activity ends.'; end if;
  return query select k.correct_option, k.explanation
    from public.gc_pulse_activity_keys k where k.activity_id = target_activity_id;
end;
$$;
revoke all on function public.reveal_gc_pulse_answer(uuid) from public;
grant execute on function public.reveal_gc_pulse_answer(uuid) to authenticated;

drop trigger if exists set_gc_pulse_activities_updated_at on public.gc_pulse_activities;
create trigger set_gc_pulse_activities_updated_at before update on public.gc_pulse_activities
  for each row execute function public.set_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gc_pulse_activities'
  ) then
    alter publication supabase_realtime add table public.gc_pulse_activities;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gc_pulse_activity_responses'
  ) then
    alter publication supabase_realtime add table public.gc_pulse_activity_responses;
  end if;
end;
$$;
