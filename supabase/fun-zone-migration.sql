-- Fun Zone extends the existing GC Pulse activity records in place.
-- No Arena activities, submissions, answer keys, or history are deleted.
begin;

do $$
begin
  if to_regclass('public.gc_pulse_activities') is null
     or to_regclass('public.gc_pulse_activity_responses') is null
     or to_regclass('public.cell_groups') is null
     or to_regprocedure('public.primary_cell_group_id()') is null
     or to_regprocedure('public.can_access_cell_group(uuid)') is null
     or to_regprocedure('public.can_manage_cell_group(uuid)') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'gc_pulse_activities' and column_name = 'group_id'
     )
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'gc_pulse_activity_responses' and column_name = 'group_id'
     ) then
    raise exception 'Apply the existing GC Pulse and single-cell-group migrations before Fun Zone.';
  end if;
end;
$$;

alter table public.gc_pulse_activities
  add column if not exists description text not null default '',
  add column if not exists category text not null default 'general_knowledge',
  add column if not exists difficulty text not null default 'steady',
  add column if not exists estimated_minutes smallint not null default 5,
  add column if not exists max_points integer not null default 1,
  add column if not exists participation_points smallint not null default 0,
  add column if not exists feedback_mode text not null default 'after_completion',
  add column if not exists responses_anonymous boolean not null default true;
alter table public.gc_pulse_activities
  alter column difficulty set default 'medium';

update public.gc_pulse_activities
set description = coalesce(nullif(trim(description), ''), prompt),
    category = case
      when activity_type in ('bible_challenge', 'bible_quiz', 'scripture_challenge') then 'bible_scripture'
      when activity_type in ('riddle', 'brain_teaser') then 'brain_teasers'
      when activity_type = 'word_game' then 'word_games'
      when activity_type in ('would_you_rather', 'this_or_that', 'surprise_poll', 'fellowship') then 'fellowship'
      when activity_type = 'daily_challenge' then 'daily_challenges'
      else 'general_knowledge'
    end,
    difficulty = case when difficulty in ('easy', 'medium', 'challenging') then difficulty else 'medium' end,
    estimated_minutes = greatest(1, least(coalesce(estimated_minutes, 5), 90)),
    max_points = greatest(0, least(coalesce(max_points, 1), 2000)),
    participation_points = greatest(0, least(coalesce(participation_points, 0), 100))
where description = ''
   or category not in ('bible_scripture', 'word_games', 'brain_teasers', 'general_knowledge', 'fellowship', 'daily_challenges')
   or difficulty not in ('easy', 'medium', 'challenging')
   or estimated_minutes not between 1 and 90
   or max_points not between 0 and 2000
   or participation_points not between 0 and 100;

alter table public.gc_pulse_activities
  drop constraint if exists gc_pulse_activities_activity_type_check,
  drop constraint if exists gc_pulse_activities_status_check,
  drop constraint if exists gc_pulse_activities_options_valid,
  drop constraint if exists gc_pulse_activities_fun_zone_category_check,
  drop constraint if exists gc_pulse_activities_fun_zone_difficulty_check,
  drop constraint if exists gc_pulse_activities_fun_zone_minutes_check,
  drop constraint if exists gc_pulse_activities_fun_zone_points_check;

alter table public.gc_pulse_activities
  add constraint gc_pulse_activities_activity_type_check
    check (activity_type in (
      'this_or_that', 'would_you_rather', 'quick_quiz', 'riddle',
      'bible_challenge', 'surprise_poll', 'bible_quiz',
      'scripture_challenge', 'word_game', 'brain_teaser',
      'general_knowledge', 'fellowship', 'daily_challenge'
    )),
  add constraint gc_pulse_activities_status_check
    check (status in ('draft', 'open', 'completed', 'cancelled')),
  add constraint gc_pulse_activities_options_valid
    check (
      case when jsonb_typeof(options) = 'array'
        then jsonb_array_length(options) between 0 and 6
        else false
      end
    ),
  add constraint gc_pulse_activities_fun_zone_category_check
    check (category in (
      'bible_scripture', 'word_games', 'brain_teasers',
      'general_knowledge', 'fellowship', 'daily_challenges'
    )),
  add constraint gc_pulse_activities_fun_zone_difficulty_check
    check (difficulty in ('easy', 'medium', 'challenging')),
  add constraint gc_pulse_activities_fun_zone_minutes_check
    check (estimated_minutes between 1 and 90),
  add constraint gc_pulse_activities_fun_zone_points_check
    check (max_points between 0 and 2000 and participation_points between 0 and 100);

create index if not exists idx_gc_pulse_fun_zone_group_status_start
  on public.gc_pulse_activities(group_id, status, starts_at);

-- New activities can have many questions; answer keys are stored separately.
create table if not exists public.fun_zone_questions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.gc_pulse_activities(id) on delete restrict,
  group_id uuid not null references public.cell_groups(id) on delete restrict,
  position smallint not null check (position between 1 and 20),
  prompt text not null check (char_length(trim(prompt)) between 5 and 1200),
  answer_mode text not null check (answer_mode in ('choice', 'short_text', 'reflection')),
  options jsonb not null default '[]'::jsonb,
  points smallint not null default 0 check (points between 0 and 100),
  created_at timestamptz not null default timezone('utc', now()),
  unique (activity_id, position),
  check (
    case
      when answer_mode = 'choice' then
        jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6
      else jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 0
    end
  )
);
create index if not exists idx_fun_zone_questions_activity
  on public.fun_zone_questions(activity_id, position);

create table if not exists public.fun_zone_question_keys (
  question_id uuid primary key references public.fun_zone_questions(id) on delete cascade,
  group_id uuid not null references public.cell_groups(id) on delete restrict,
  correct_option smallint,
  accepted_answers text[] not null default '{}',
  explanation text not null default '' check (char_length(explanation) <= 1200),
  created_at timestamptz not null default timezone('utc', now()),
  check (
    (correct_option is not null and cardinality(accepted_answers) = 0)
    or (correct_option is null and cardinality(accepted_answers) between 1 and 10)
  )
);

create table if not exists public.fun_zone_attempts (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.gc_pulse_activities(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  group_id uuid not null references public.cell_groups(id) on delete restrict,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  total_points integer not null default 0 check (total_points between 0 and 2000),
  max_points integer not null default 0 check (max_points between 0 and 2000),
  unique (activity_id, user_id),
  check (completed_at is null or completed_at >= started_at)
);
create index if not exists idx_fun_zone_attempts_member
  on public.fun_zone_attempts(group_id, user_id, completed_at desc);
create index if not exists idx_fun_zone_attempts_activity
  on public.fun_zone_attempts(group_id, activity_id, completed_at);

create table if not exists public.fun_zone_attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.fun_zone_attempts(id) on delete restrict,
  question_id uuid not null references public.fun_zone_questions(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  group_id uuid not null references public.cell_groups(id) on delete restrict,
  selected_option smallint,
  response_text text check (response_text is null or char_length(response_text) <= 2000),
  is_correct boolean,
  points_awarded smallint not null default 0 check (points_awarded between 0 and 100),
  is_hidden boolean not null default false,
  submitted_at timestamptz not null default timezone('utc', now()),
  unique (attempt_id, question_id),
  check (
    (selected_option is not null and response_text is null)
    or (selected_option is null and response_text is not null)
  )
);
create index if not exists idx_fun_zone_answers_attempt
  on public.fun_zone_attempt_answers(group_id, attempt_id, submitted_at);

create table if not exists public.fun_zone_point_transactions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.gc_pulse_activities(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  group_id uuid not null references public.cell_groups(id) on delete restrict,
  amount integer not null check (amount between 1 and 2000),
  reason text not null default 'activity_completion' check (reason = 'activity_completion'),
  created_at timestamptz not null default timezone('utc', now()),
  unique (activity_id, user_id, reason)
);
create index if not exists idx_fun_zone_points_leaderboard
  on public.fun_zone_point_transactions(group_id, created_at desc, user_id);

create table if not exists public.fun_zone_achievement_definitions (
  code text primary key,
  name text not null,
  description text not null,
  metric_key text not null check (metric_key in (
    'activities_completed', 'bible_activities_completed', 'fellowship_responses'
  )),
  threshold_count integer not null check (threshold_count > 0),
  sort_order smallint not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

insert into public.fun_zone_achievement_definitions
  (code, name, description, metric_key, threshold_count, sort_order)
values
  ('first-game', 'First Game', 'Complete your first Fun Zone activity.', 'activities_completed', 1, 1),
  ('curious-mind', 'Curious Mind', 'Complete five Fun Zone activities.', 'activities_completed', 5, 2),
  ('bible-explorer', 'Bible Explorer', 'Complete three Bible and Scripture activities.', 'bible_activities_completed', 3, 3),
  ('fellowship-builder', 'Fellowship Builder', 'Share three fellowship reflections.', 'fellowship_responses', 3, 4)
on conflict (code) do update
set name = excluded.name, description = excluded.description,
    metric_key = excluded.metric_key, threshold_count = excluded.threshold_count,
    sort_order = excluded.sort_order;

create table if not exists public.fun_zone_member_achievements (
  user_id uuid not null references public.profiles(id) on delete restrict,
  group_id uuid not null references public.cell_groups(id) on delete restrict,
  achievement_code text not null references public.fun_zone_achievement_definitions(code) on delete restrict,
  earned_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, achievement_code)
);
create index if not exists idx_fun_zone_member_achievements_group
  on public.fun_zone_member_achievements(group_id, earned_at desc);

-- This safe, group-readable revision row lets members refresh aggregate results
-- without exposing other people's private written answers through Realtime.
create table if not exists public.fun_zone_live_activity_updates (
  activity_id uuid primary key references public.gc_pulse_activities(id) on delete restrict,
  group_id uuid not null references public.cell_groups(id) on delete restrict,
  revision bigint not null default 1,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.gc_pulse_activities enable row level security;
alter table public.fun_zone_questions enable row level security;
alter table public.fun_zone_question_keys enable row level security;
alter table public.fun_zone_attempts enable row level security;
alter table public.fun_zone_attempt_answers enable row level security;
alter table public.fun_zone_point_transactions enable row level security;
alter table public.fun_zone_achievement_definitions enable row level security;
alter table public.fun_zone_member_achievements enable row level security;
alter table public.fun_zone_live_activity_updates enable row level security;

drop policy if exists gc_pulse_activities_select_active on public.gc_pulse_activities;
create policy gc_pulse_activities_select_active on public.gc_pulse_activities
  for select to authenticated using (
    public.is_active_user()
    and public.can_access_cell_group(group_id)
    and (status <> 'draft' or public.can_manage_cell_group(group_id))
  );

-- Fun Zone manages activities through checked RPCs; deletion stays disabled so
-- existing quizzes, submissions and history cannot disappear from the UI.
drop policy if exists gc_pulse_activities_delete_admin on public.gc_pulse_activities;
drop policy if exists gc_pulse_activities_delete_owner_or_admin on public.gc_pulse_activities;
revoke all privileges on public.gc_pulse_activities from public, anon, authenticated;
grant select on public.gc_pulse_activities to authenticated;

drop policy if exists fun_zone_questions_read on public.fun_zone_questions;
create policy fun_zone_questions_read on public.fun_zone_questions
  for select to authenticated using (
    public.is_active_user()
    and public.can_access_cell_group(group_id)
    and exists (
      select 1 from public.gc_pulse_activities activity
      where activity.id = activity_id
        and (activity.status <> 'draft' or public.can_manage_cell_group(activity.group_id))
    )
  );

drop policy if exists fun_zone_question_keys_admin_read on public.fun_zone_question_keys;
create policy fun_zone_question_keys_admin_read on public.fun_zone_question_keys
  for select to authenticated using (
    public.is_active_user() and public.can_manage_cell_group(group_id)
  );

drop policy if exists fun_zone_attempts_owner_or_admin_read on public.fun_zone_attempts;
create policy fun_zone_attempts_owner_or_admin_read on public.fun_zone_attempts
  for select to authenticated using (
    public.is_active_user()
    and public.can_access_cell_group(group_id)
    and (user_id = auth.uid() or public.can_manage_cell_group(group_id))
  );

drop policy if exists fun_zone_answers_owner_or_admin_read on public.fun_zone_attempt_answers;
create policy fun_zone_answers_owner_or_admin_read on public.fun_zone_attempt_answers
  for select to authenticated using (
    public.is_active_user()
    and public.can_access_cell_group(group_id)
    and ((user_id = auth.uid() and not is_hidden) or public.can_manage_cell_group(group_id))
  );
drop policy if exists fun_zone_answers_admin_moderate on public.fun_zone_attempt_answers;
create policy fun_zone_answers_admin_moderate on public.fun_zone_attempt_answers
  for update to authenticated using (
    public.is_active_user() and public.can_manage_cell_group(group_id)
  ) with check (
    public.is_active_user() and public.can_manage_cell_group(group_id)
  );

drop policy if exists fun_zone_points_group_read on public.fun_zone_point_transactions;
create policy fun_zone_points_group_read on public.fun_zone_point_transactions
  for select to authenticated using (
    public.is_active_user() and public.can_access_cell_group(group_id)
  );

drop policy if exists fun_zone_achievement_definitions_read on public.fun_zone_achievement_definitions;
create policy fun_zone_achievement_definitions_read on public.fun_zone_achievement_definitions
  for select to authenticated using (public.is_active_user());

drop policy if exists fun_zone_member_achievements_group_read on public.fun_zone_member_achievements;
create policy fun_zone_member_achievements_group_read on public.fun_zone_member_achievements
  for select to authenticated using (
    public.is_active_user() and public.can_access_cell_group(group_id)
  );

drop policy if exists fun_zone_live_activity_updates_group_read on public.fun_zone_live_activity_updates;
create policy fun_zone_live_activity_updates_group_read on public.fun_zone_live_activity_updates
  for select to authenticated using (
    public.is_active_user() and public.can_access_cell_group(group_id)
  );

revoke all privileges on public.fun_zone_questions, public.fun_zone_question_keys,
  public.fun_zone_attempts, public.fun_zone_attempt_answers,
  public.fun_zone_point_transactions, public.fun_zone_achievement_definitions,
  public.fun_zone_member_achievements, public.fun_zone_live_activity_updates
  from public, anon, authenticated;
grant select on public.fun_zone_questions, public.fun_zone_attempts,
  public.fun_zone_point_transactions, public.fun_zone_achievement_definitions,
  public.fun_zone_member_achievements, public.fun_zone_live_activity_updates
  to authenticated;
grant select (
  id, attempt_id, question_id, user_id, group_id, selected_option,
  response_text, points_awarded, is_hidden, submitted_at
) on public.fun_zone_attempt_answers to authenticated;
grant select on public.fun_zone_question_keys to authenticated;
grant update (is_hidden) on public.fun_zone_attempt_answers to authenticated;

create or replace function public.set_fun_zone_question_group()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare activity_group uuid;
begin
  select group_id into activity_group
  from public.gc_pulse_activities where id = new.activity_id;
  if activity_group is null then raise exception 'The Fun Zone activity is unavailable.'; end if;
  if new.group_id is not null and new.group_id <> activity_group then
    raise exception 'Question group must match its activity.';
  end if;
  new.group_id := activity_group;
  return new;
end;
$$;

create or replace function public.set_fun_zone_key_group()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare question_group uuid;
begin
  select group_id into question_group
  from public.fun_zone_questions where id = new.question_id;
  if question_group is null then raise exception 'The Fun Zone question is unavailable.'; end if;
  if new.group_id is not null and new.group_id <> question_group then
    raise exception 'Answer key group must match its question.';
  end if;
  new.group_id := question_group;
  return new;
end;
$$;

drop trigger if exists set_fun_zone_question_group on public.fun_zone_questions;
create trigger set_fun_zone_question_group
  before insert or update on public.fun_zone_questions
  for each row execute function public.set_fun_zone_question_group();
drop trigger if exists set_fun_zone_key_group on public.fun_zone_question_keys;
create trigger set_fun_zone_key_group
  before insert or update on public.fun_zone_question_keys
  for each row execute function public.set_fun_zone_key_group();

create or replace function public.bump_fun_zone_activity_revision()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare target_attempt public.fun_zone_attempts%rowtype;
begin
  if tg_op = 'DELETE' then
    select * into target_attempt from public.fun_zone_attempts where id = old.attempt_id;
  else
    select * into target_attempt from public.fun_zone_attempts where id = new.attempt_id;
  end if;
  if target_attempt.id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  insert into public.fun_zone_live_activity_updates(activity_id, group_id, revision, updated_at)
  values (target_attempt.activity_id, target_attempt.group_id, 1, timezone('utc', now()))
  on conflict (activity_id) do update
    set revision = public.fun_zone_live_activity_updates.revision + 1,
        updated_at = timezone('utc', now());
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists bump_fun_zone_activity_revision on public.fun_zone_attempt_answers;
create trigger bump_fun_zone_activity_revision
  after insert or update or delete on public.fun_zone_attempt_answers
  for each row execute function public.bump_fun_zone_activity_revision();

create or replace function public.bump_fun_zone_attempt_revision()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into public.fun_zone_live_activity_updates(activity_id, group_id, revision, updated_at)
  values (new.activity_id, new.group_id, 1, timezone('utc', now()))
  on conflict (activity_id) do update
    set revision = public.fun_zone_live_activity_updates.revision + 1,
        updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists bump_fun_zone_attempt_revision on public.fun_zone_attempts;
create trigger bump_fun_zone_attempt_revision
  after insert on public.fun_zone_attempts
  for each row execute function public.bump_fun_zone_attempt_revision();

create or replace function public.bump_fun_zone_legacy_response_revision()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into public.fun_zone_live_activity_updates(activity_id, group_id, revision, updated_at)
  values (new.activity_id, new.group_id, 1, timezone('utc', now()))
  on conflict (activity_id) do update
    set revision = public.fun_zone_live_activity_updates.revision + 1,
        updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists bump_fun_zone_legacy_response_revision on public.gc_pulse_activity_responses;
create trigger bump_fun_zone_legacy_response_revision
  after insert on public.gc_pulse_activity_responses
  for each row execute function public.bump_fun_zone_legacy_response_revision();

create or replace function public.save_fun_zone_activity(
  target_activity_id uuid,
  activity_data jsonb,
  questions_data jsonb
)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  group_key uuid;
  activity_key uuid;
  activity_type_value text;
  activity_category text;
  activity_title text;
  activity_description text;
  activity_difficulty text;
  activity_minutes integer;
  activity_status text;
  feedback_value text;
  participation_value integer;
  starts_value timestamptz;
  closes_value timestamptz;
  anonymous_value boolean;
  scored_value boolean;
  question_item jsonb;
  answers_json jsonb;
  question_key uuid;
  question_position integer := 0;
  question_prompt text;
  answer_mode_value text;
  question_options jsonb;
  point_value integer;
  correct_value integer;
  answers_value text[];
  explanation_value text;
  points_value integer := 0;
  parent_prompt text;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Active membership is required.';
  end if;
  group_key := public.primary_cell_group_id();
  if group_key is null or not public.can_manage_cell_group(group_key) then
    raise exception 'Administrator access to Fun Zone is required.';
  end if;
  if jsonb_typeof(activity_data) is distinct from 'object'
     or jsonb_typeof(questions_data) is distinct from 'array' then
    raise exception 'Activity details and questions are required.';
  end if;
  if jsonb_array_length(questions_data) not between 1 and 20 then
    raise exception 'Add between 1 and 20 questions.';
  end if;

  activity_type_value := activity_data->>'activity_type';
  activity_title := trim(coalesce(activity_data->>'title', ''));
  activity_description := trim(coalesce(activity_data->>'description', ''));
  activity_difficulty := coalesce(activity_data->>'difficulty', 'easy');
  activity_minutes := coalesce(nullif(activity_data->>'estimated_minutes', '')::integer, 5);
  activity_status := coalesce(activity_data->>'status', 'open');
  feedback_value := coalesce(activity_data->>'feedback_mode', 'after_completion');
  participation_value := coalesce(nullif(activity_data->>'participation_points', '')::integer, 0);
  starts_value := nullif(activity_data->>'starts_at', '')::timestamptz;
  closes_value := nullif(activity_data->>'closes_at', '')::timestamptz;
  anonymous_value := coalesce((activity_data->>'responses_anonymous')::boolean, true);

  if char_length(activity_title) not between 3 and 120 then raise exception 'Activity title must be 3 to 120 characters.'; end if;
  if activity_type_value is null or activity_type_value not in (
    'this_or_that', 'would_you_rather', 'quick_quiz', 'riddle',
    'bible_challenge', 'surprise_poll', 'bible_quiz',
    'scripture_challenge', 'word_game', 'brain_teaser',
    'general_knowledge', 'fellowship', 'daily_challenge'
  ) then raise exception 'Choose a supported Fun Zone activity type.'; end if;
  if activity_difficulty not in ('easy', 'medium', 'challenging') then raise exception 'Choose a valid difficulty.'; end if;
  if activity_minutes not between 1 and 90 then raise exception 'Estimated duration must be 1 to 90 minutes.'; end if;
  if participation_value not between 0 and 100 then raise exception 'Participation points must be between 0 and 100.'; end if;
  if feedback_value not in ('immediate', 'after_completion') then raise exception 'Choose a valid feedback setting.'; end if;
  if starts_value is null or (closes_value is not null and closes_value <= starts_value) then
    raise exception 'The closing time must be after the start time.';
  end if;
  if activity_status not in ('draft', 'open') then raise exception 'New activities must be drafts or published.'; end if;

  activity_category := case
    when activity_type_value in ('bible_challenge', 'bible_quiz', 'scripture_challenge') then 'bible_scripture'
    when activity_type_value in ('riddle', 'brain_teaser') then 'brain_teasers'
    when activity_type_value = 'word_game' then 'word_games'
    when activity_type_value in ('would_you_rather', 'this_or_that', 'surprise_poll', 'fellowship') then 'fellowship'
    when activity_type_value = 'daily_challenge' then 'daily_challenges'
    else 'general_knowledge'
  end;
  scored_value := activity_type_value in (
    'quick_quiz', 'riddle', 'bible_challenge', 'bible_quiz',
    'scripture_challenge', 'word_game', 'brain_teaser',
    'general_knowledge', 'daily_challenge'
  );
  if activity_type_value in ('this_or_that', 'would_you_rather', 'surprise_poll')
     and jsonb_array_length(questions_data) <> 1 then
    raise exception 'Poll activities use one question.';
  end if;
  if activity_type_value = 'fellowship' and jsonb_array_length(questions_data) <> 1 then
    raise exception 'Fellowship activities use one conversation prompt.';
  end if;

  if target_activity_id is not null then
    select id into activity_key from public.gc_pulse_activities
    where id = target_activity_id and group_id = group_key
      and public.can_manage_cell_group(group_id)
    for update;
    if activity_key is null then raise exception 'Activity not found or access is restricted.'; end if;
    if exists (select 1 from public.fun_zone_attempts where activity_id = activity_key)
       or exists (select 1 from public.gc_pulse_activity_responses where activity_id = activity_key) then
      raise exception 'This activity already has participation. Its questions are locked to preserve the results.';
    end if;
    delete from public.fun_zone_questions where activity_id = activity_key;
  end if;

  for question_item in
    select items.value from jsonb_array_elements(questions_data) as items(value)
  loop
    question_position := question_position + 1;
    question_prompt := trim(coalesce(question_item->>'prompt', ''));
    answer_mode_value := coalesce(question_item->>'answer_mode', 'choice');
    question_options := coalesce(question_item->'options', '[]'::jsonb);
    point_value := coalesce(nullif(question_item->>'points', '')::integer, 0);
    explanation_value := trim(coalesce(question_item->>'explanation', ''));
    if char_length(question_prompt) not between 5 and 1200 then raise exception 'Each question must be 5 to 1200 characters.'; end if;
    if answer_mode_value not in ('choice', 'short_text', 'reflection') then raise exception 'Choose a valid answer format.'; end if;
    if point_value not between 0 and 100 then raise exception 'Question points must be between 0 and 100.'; end if;
    if scored_value and answer_mode_value = 'reflection' then raise exception 'Scored activities need answerable questions.'; end if;
    if not scored_value and point_value <> 0 then raise exception 'Poll and fellowship questions cannot award answer points.'; end if;
    if activity_type_value = 'fellowship' and answer_mode_value <> 'reflection' then
      raise exception 'Fellowship prompts use written responses.';
    end if;
    if activity_type_value in ('this_or_that', 'would_you_rather', 'surprise_poll')
       and answer_mode_value <> 'choice' then
      raise exception 'Poll activities use answer choices.';
    end if;
    if answer_mode_value = 'choice' then
      if jsonb_typeof(question_options) <> 'array' then
        raise exception 'Choice questions need an answer options list.';
      end if;
      if jsonb_array_length(question_options) not between 2 and 6 then
        raise exception 'Choice questions need 2 to 6 answer options.';
      end if;
      if exists (
        select 1 from jsonb_array_elements(question_options) as option_item(value)
        where jsonb_typeof(option_item.value) <> 'string'
          or char_length(trim(option_item.value #>> '{}')) not between 1 and 240
      ) then
        raise exception 'Each choice must be 1 to 240 characters.';
      end if;
      if activity_type_value in ('this_or_that', 'would_you_rather')
         and jsonb_array_length(question_options) <> 2 then
        raise exception 'Would You Rather and This or That activities need exactly two choices.';
      end if;
    else
      if jsonb_typeof(question_options) <> 'array' then
        raise exception 'Written questions cannot include choice options.';
      end if;
      if jsonb_array_length(question_options) <> 0 then
        raise exception 'Written questions cannot include choice options.';
      end if;
    end if;
    if scored_value and point_value < 1 then raise exception 'Scored questions need at least one point.'; end if;
    if point_value > 0 then points_value := points_value + point_value; end if;
    if points_value + participation_value > 2000 then raise exception 'The activity point total is too high.'; end if;
  end loop;

  if activity_type_value = 'fellowship'
     and (select questions_data->0->>'answer_mode') <> 'reflection' then
    raise exception 'Fellowship activities need a written conversation prompt.';
  end if;

  parent_prompt := coalesce(
    nullif(activity_description, ''),
    left(trim(questions_data->0->>'prompt'), 1000)
  );
  if char_length(parent_prompt) not between 5 and 1000 then
    raise exception 'The activity description or first question must be 5 to 1000 characters.';
  end if;
  activity_description := coalesce(nullif(activity_description, ''), parent_prompt);

  if target_activity_id is null then
    insert into public.gc_pulse_activities (
      group_id, created_by, activity_type, title, prompt, description, options,
      starts_at, closes_at, status, responses_anonymous, category, difficulty,
      estimated_minutes, max_points, participation_points, feedback_mode
    ) values (
      group_key, auth.uid(), activity_type_value, activity_title, parent_prompt,
      activity_description, coalesce(questions_data->0->'options', '[]'::jsonb),
      starts_value, closes_value, activity_status, anonymous_value, activity_category,
      activity_difficulty, activity_minutes, points_value + participation_value,
      participation_value, feedback_value
    ) returning id into activity_key;
  else
    update public.gc_pulse_activities
    set activity_type = activity_type_value,
        title = activity_title,
        prompt = parent_prompt,
        description = activity_description,
        options = coalesce(questions_data->0->'options', '[]'::jsonb),
        starts_at = starts_value,
        closes_at = closes_value,
        status = activity_status,
        responses_anonymous = anonymous_value,
        category = activity_category,
        difficulty = activity_difficulty,
        estimated_minutes = activity_minutes,
        max_points = points_value + participation_value,
        participation_points = participation_value,
        feedback_mode = feedback_value,
        updated_at = timezone('utc', now())
    where id = activity_key;
  end if;

  question_position := 0;
  points_value := 0;
  for question_item in
    select items.value from jsonb_array_elements(questions_data) as items(value)
  loop
    question_position := question_position + 1;
    answer_mode_value := coalesce(question_item->>'answer_mode', 'choice');
    question_options := coalesce(question_item->'options', '[]'::jsonb);
    point_value := coalesce(nullif(question_item->>'points', '')::integer, 0);
    insert into public.fun_zone_questions (
      activity_id, group_id, position, prompt, answer_mode, options, points
    ) values (
      activity_key, group_key, question_position, trim(question_item->>'prompt'),
      answer_mode_value, question_options, point_value
    ) returning id into question_key;

    if scored_value and answer_mode_value = 'choice' then
      correct_value := nullif(question_item->>'correct_option', '')::integer;
      if correct_value is null or correct_value < 0 or correct_value >= jsonb_array_length(question_options) then
        raise exception 'Select the correct answer for every choice question.';
      end if;
      insert into public.fun_zone_question_keys(
        question_id, group_id, correct_option, accepted_answers, explanation
      ) values (question_key, group_key, correct_value, '{}', explanation_value);
    elsif scored_value and answer_mode_value = 'short_text' then
      answers_json := coalesce(question_item->'accepted_answers', '[]'::jsonb);
      if jsonb_typeof(answers_json) <> 'array' then
        raise exception 'Accepted answers must be supplied as a list.';
      end if;
      select array_agg(lower(regexp_replace(trim(answer.value), '\s+', ' ', 'g')))
        into answers_value
      from jsonb_array_elements_text(answers_json) as answer(value)
      where trim(answer.value) <> '';
      if coalesce(cardinality(answers_value), 0) not between 1 and 10 then
        raise exception 'Add at least one accepted answer for every written question.';
      end if;
      insert into public.fun_zone_question_keys(
        question_id, group_id, correct_option, accepted_answers, explanation
      ) values (question_key, group_key, null, answers_value, explanation_value);
    end if;
  end loop;
  return activity_key;
end;
$$;

-- Legacy Arena records remain playable, but the old one-answer RPC cannot be
-- used to bypass a new multi-question activity or award a second score.
create or replace function public.submit_gc_pulse_response(
  target_activity_id uuid,
  selected_option integer
)
returns table (awarded_points integer)
language plpgsql security definer set search_path = public, pg_temp
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
  where id = target_activity_id and group_id = public.primary_cell_group_id()
  for update;
  if not found then raise exception 'Activity is unavailable.'; end if;
  if not public.can_access_cell_group(activity_row.group_id) then raise exception 'Activity is unavailable.'; end if;
  if exists (select 1 from public.fun_zone_questions question where question.activity_id = target_activity_id) then
    raise exception 'This is a multi-question activity. Use its activity session.';
  end if;
  if activity_row.status <> 'open' then raise exception 'This activity is closed.'; end if;
  if activity_row.starts_at > now() then raise exception 'This activity has not started.'; end if;
  if activity_row.closes_at is not null and activity_row.closes_at <= now() then
    raise exception 'This activity has closed.';
  end if;
  if selected_option is null or selected_option < 0
     or selected_option >= jsonb_array_length(activity_row.options) then
    raise exception 'Choose one of the available answers.';
  end if;
  if activity_row.activity_type in ('quick_quiz', 'riddle', 'bible_challenge') then
    select correct_option into expected_option from public.gc_pulse_activity_keys
    where activity_id = target_activity_id;
    if expected_option is null then raise exception 'The answer key is unavailable.'; end if;
    score := case when selected_option = expected_option then 1 else 0 end;
  end if;
  insert into public.gc_pulse_activity_responses(
    activity_id, user_id, group_id, selected_option, awarded_points
  ) values (
    target_activity_id, auth.uid(), activity_row.group_id, selected_option, score
  );
  return query select score;
exception when unique_violation then
  raise exception 'You have already participated in this activity.';
end;
$$;

create or replace function public.set_fun_zone_activity_status(
  target_activity_id uuid,
  next_status text
)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  group_key uuid;
  current_status text;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Active membership is required.';
  end if;
  select group_id, status into group_key, current_status from public.gc_pulse_activities
  where id = target_activity_id and group_id = public.primary_cell_group_id();
  if group_key is null or not public.can_manage_cell_group(group_key) then
    raise exception 'Administrator access to this activity is required.';
  end if;
  if next_status not in ('draft', 'open', 'completed', 'cancelled') then
    raise exception 'Choose a valid activity status.';
  end if;
  if current_status in ('completed', 'cancelled') and next_status <> current_status then
    raise exception 'Closed activities are kept as historical records and cannot be reopened.';
  end if;
  if current_status = 'open' and next_status = 'draft' then
    raise exception 'A published activity cannot be returned to draft.';
  end if;
  if current_status = 'draft' and next_status in ('completed', 'cancelled') then
    raise exception 'Publish the activity before closing it.';
  end if;
  update public.gc_pulse_activities
  set status = next_status, updated_at = timezone('utc', now())
  where id = target_activity_id;
end;
$$;

create or replace function public.fun_zone_start_attempt(target_activity_id uuid)
returns table (
  attempt_id uuid,
  max_points integer,
  completed_at timestamptz,
  question_count integer
)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  activity_row public.gc_pulse_activities%rowtype;
  group_key uuid := public.primary_cell_group_id();
  existing_attempt public.fun_zone_attempts%rowtype;
  question_total integer;
  point_total integer;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'Active membership is required.'; end if;
  select * into activity_row from public.gc_pulse_activities where id = target_activity_id;
  if not found or activity_row.group_id <> group_key
     or not public.can_access_cell_group(group_key) then raise exception 'Activity is unavailable.'; end if;
  select * into existing_attempt from public.fun_zone_attempts
  where activity_id = target_activity_id and user_id = auth.uid();
  if found then
    select count(*)::integer into question_total from public.fun_zone_questions
    where activity_id = target_activity_id;
    return query select existing_attempt.id, existing_attempt.max_points, existing_attempt.completed_at, question_total;
    return;
  end if;
  if activity_row.status <> 'open' or activity_row.starts_at > now()
     or (activity_row.closes_at is not null and activity_row.closes_at <= now()) then
    raise exception 'This activity is not open right now.';
  end if;
  select count(*)::integer, coalesce(sum(points), 0)::integer
    into question_total, point_total
  from public.fun_zone_questions where activity_id = target_activity_id;
  if question_total = 0 then raise exception 'This activity has no published questions.'; end if;
  insert into public.fun_zone_attempts(
    activity_id, user_id, group_id, max_points
  ) values (
    target_activity_id, auth.uid(), activity_row.group_id,
    point_total + activity_row.participation_points
  )
  on conflict (activity_id, user_id) do nothing
  returning id into attempt_id;
  if attempt_id is null then
    select * into existing_attempt from public.fun_zone_attempts attempt
    where attempt.activity_id = target_activity_id and attempt.user_id = auth.uid();
    return query select existing_attempt.id, existing_attempt.max_points, existing_attempt.completed_at, question_total;
  else
    max_points := point_total + activity_row.participation_points;
    completed_at := null;
    question_count := question_total;
    return next;
  end if;
end;
$$;

create or replace function public.fun_zone_submit_answer(
  target_attempt_id uuid,
  target_question_id uuid,
  selected_option integer default null,
  response_text text default null
)
returns table (
  question_is_correct boolean,
  points_awarded integer,
  total_points integer,
  max_points integer,
  completed boolean,
  explanation text
)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  attempt_row public.fun_zone_attempts%rowtype;
  activity_row public.gc_pulse_activities%rowtype;
  question_row public.fun_zone_questions%rowtype;
  answer_key public.fun_zone_question_keys%rowtype;
  saved_answer public.fun_zone_attempt_answers%rowtype;
  answer_correct boolean;
  answer_points integer := 0;
  answered_count integer;
  question_total integer;
  earned_total integer;
  did_complete boolean;
  answer_body text;
  member_reflection_count integer;
  bible_completion_count integer;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'Active membership is required.'; end if;
  select * into attempt_row from public.fun_zone_attempts
  where id = target_attempt_id and user_id = auth.uid()
  for update;
  if not found or attempt_row.group_id <> public.primary_cell_group_id()
     or not public.can_access_cell_group(attempt_row.group_id) then
    raise exception 'Your activity session is unavailable.';
  end if;
  select * into activity_row from public.gc_pulse_activities where id = attempt_row.activity_id;
  select * into question_row from public.fun_zone_questions
  where id = target_question_id and activity_id = attempt_row.activity_id;
  if not found then raise exception 'This question does not belong to your activity.'; end if;

  select * into saved_answer from public.fun_zone_attempt_answers
  where attempt_id = attempt_row.id and question_id = question_row.id;
  if found then
    select * into answer_key from public.fun_zone_question_keys where question_id = question_row.id;
    return query select
      case when activity_row.feedback_mode = 'immediate' or attempt_row.completed_at is not null
        then saved_answer.is_correct else null end,
      saved_answer.points_awarded::integer,
      attempt_row.total_points,
      attempt_row.max_points,
      attempt_row.completed_at is not null,
      case when activity_row.feedback_mode = 'immediate' or attempt_row.completed_at is not null
        then answer_key.explanation else null end;
    return;
  end if;
  if attempt_row.completed_at is not null then raise exception 'This activity session is already complete.'; end if;
  if activity_row.status <> 'open' or activity_row.starts_at > now()
     or (activity_row.closes_at is not null and activity_row.closes_at <= now()) then
    raise exception 'This activity is no longer accepting answers.';
  end if;

  answer_body := nullif(trim(coalesce(response_text, '')), '');
  if question_row.answer_mode = 'choice' then
    if selected_option is null or selected_option < 0
       or selected_option >= jsonb_array_length(question_row.options) or answer_body is not null then
      raise exception 'Choose one of the available answers.';
    end if;
    select * into answer_key from public.fun_zone_question_keys where question_id = question_row.id;
    if found then
      answer_correct := selected_option = answer_key.correct_option;
      if answer_correct then answer_points := question_row.points; end if;
    else
      answer_correct := null;
    end if;
  elsif question_row.answer_mode = 'short_text' then
    if selected_option is not null or answer_body is null or char_length(answer_body) > 2000 then
      raise exception 'Enter an answer of up to 2000 characters.';
    end if;
    select * into answer_key from public.fun_zone_question_keys where question_id = question_row.id;
    if not found then raise exception 'This written question has no answer key.'; end if;
    answer_correct := lower(regexp_replace(answer_body, '\s+', ' ', 'g')) = any(answer_key.accepted_answers);
    if answer_correct then answer_points := question_row.points; end if;
  else
    if selected_option is not null or answer_body is null or char_length(answer_body) > 2000 then
      raise exception 'Share a response of up to 2000 characters.';
    end if;
    answer_correct := null;
    answer_points := 0;
  end if;

  insert into public.fun_zone_attempt_answers(
    attempt_id, question_id, user_id, group_id, selected_option,
    response_text, is_correct, points_awarded
  ) values (
    attempt_row.id, question_row.id, auth.uid(), attempt_row.group_id,
    selected_option, answer_body, answer_correct, answer_points
  )
  on conflict (attempt_id, question_id) do nothing
  returning * into saved_answer;
  if saved_answer.id is null then
    select * into saved_answer from public.fun_zone_attempt_answers
    where attempt_id = attempt_row.id and question_id = question_row.id;
    answer_points := saved_answer.points_awarded;
    answer_correct := saved_answer.is_correct;
  end if;

  select count(*)::integer into question_total
    from public.fun_zone_questions where activity_id = attempt_row.activity_id;
  select count(*)::integer into answered_count
    from public.fun_zone_attempt_answers where attempt_id = attempt_row.id;
  did_complete := answered_count >= question_total;
  if did_complete then
    earned_total := coalesce((
      select sum(answer.points_awarded)::integer
      from public.fun_zone_attempt_answers answer
      where answer.attempt_id = attempt_row.id and not answer.is_hidden
    ), 0) + activity_row.participation_points;
    update public.fun_zone_attempts
    set total_points = earned_total, completed_at = timezone('utc', now())
    where id = attempt_row.id;
    if earned_total > 0 then
      insert into public.fun_zone_point_transactions(
        activity_id, user_id, group_id, amount, reason
      ) values (
        attempt_row.activity_id, auth.uid(), attempt_row.group_id,
        earned_total, 'activity_completion'
      ) on conflict (activity_id, user_id, reason) do nothing;
    end if;

    select count(*)::integer into bible_completion_count
    from public.fun_zone_attempts attempt
    join public.gc_pulse_activities activity on activity.id = attempt.activity_id
    where attempt.user_id = auth.uid() and attempt.group_id = attempt_row.group_id
      and attempt.completed_at is not null and activity.category = 'bible_scripture';
    select count(*)::integer into member_reflection_count
    from public.fun_zone_attempt_answers answer
    join public.fun_zone_questions question on question.id = answer.question_id
    where answer.user_id = auth.uid() and answer.group_id = attempt_row.group_id
      and question.answer_mode = 'reflection' and not answer.is_hidden;

    insert into public.fun_zone_member_achievements(user_id, group_id, achievement_code)
    select auth.uid(), attempt_row.group_id, definition.code
    from public.fun_zone_achievement_definitions definition
    where (definition.code = 'first-game' and (
      select count(*) from public.fun_zone_attempts attempt
      where attempt.user_id = auth.uid() and attempt.completed_at is not null
    ) >= definition.threshold_count)
    or (definition.code = 'curious-mind' and (
      select count(*) from public.fun_zone_attempts attempt
      where attempt.user_id = auth.uid() and attempt.completed_at is not null
    ) >= definition.threshold_count)
    or (definition.code = 'bible-explorer' and bible_completion_count >= definition.threshold_count)
    or (definition.code = 'fellowship-builder' and member_reflection_count >= definition.threshold_count)
    on conflict (user_id, achievement_code) do nothing;
    attempt_row.total_points := earned_total;
    attempt_row.completed_at := timezone('utc', now());
  end if;

  select * into answer_key from public.fun_zone_question_keys where question_id = question_row.id;
  return query select
    case when activity_row.feedback_mode = 'immediate' or did_complete
      then answer_correct else null end,
    answer_points,
    attempt_row.total_points,
    attempt_row.max_points,
    did_complete,
    case when activity_row.feedback_mode = 'immediate' or did_complete
      then answer_key.explanation else null end;
end;
$$;

create or replace function public.fun_zone_attempt_review(target_attempt_id uuid)
returns table (
  question_id uuid,
  question_prompt text,
  answer_mode text,
  selected_option integer,
  response_text text,
  is_correct boolean,
  points_awarded integer,
  explanation text,
  correct_option integer,
  accepted_answers text[]
)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare attempt_row public.fun_zone_attempts%rowtype;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Active membership is required.';
  end if;
  select * into attempt_row from public.fun_zone_attempts
  where id = target_attempt_id and user_id = auth.uid();
  if not found or attempt_row.group_id <> public.primary_cell_group_id()
     or not public.can_access_cell_group(attempt_row.group_id)
     or attempt_row.completed_at is null then
    raise exception 'Review is available after you finish this activity.';
  end if;
  return query
  select question.id, question.prompt, question.answer_mode,
    answer.selected_option, answer.response_text, answer.is_correct,
    answer.points_awarded::integer, key.explanation,
    key.correct_option, key.accepted_answers
  from public.fun_zone_questions question
  join public.fun_zone_attempt_answers answer
    on answer.question_id = question.id and answer.attempt_id = attempt_row.id
  left join public.fun_zone_question_keys key on key.question_id = question.id
  where question.activity_id = attempt_row.activity_id and not answer.is_hidden
  order by question.position;
end;
$$;

create or replace function public.reveal_gc_pulse_answer(target_activity_id uuid)
returns table (correct_option integer, explanation text)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare activity_row public.gc_pulse_activities%rowtype;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Active membership is required.';
  end if;
  select * into activity_row from public.gc_pulse_activities
  where id = target_activity_id and group_id = public.primary_cell_group_id();
  if not found or not public.can_access_cell_group(activity_row.group_id) then
    raise exception 'Activity is unavailable.';
  end if;
  if exists (select 1 from public.fun_zone_questions question where question.activity_id = target_activity_id) then
    raise exception 'Answer review is available in the completed activity session.';
  end if;
  if activity_row.activity_type not in ('quick_quiz', 'riddle', 'bible_challenge') then
    raise exception 'This activity has no answer key.';
  end if;
  if activity_row.status = 'cancelled' or (
    activity_row.status = 'open'
    and (activity_row.closes_at is null or activity_row.closes_at > now())
  ) then
    raise exception 'The answer is available after the activity ends.';
  end if;
  return query select key.correct_option, key.explanation
  from public.gc_pulse_activity_keys key
  where key.activity_id = target_activity_id;
end;
$$;

create or replace function public.fun_zone_set_activity_status(
  target_activity_id uuid,
  next_status text
)
returns void language sql security definer set search_path = public, pg_temp
as $$
  select public.set_fun_zone_activity_status(target_activity_id, next_status);
$$;

create or replace function public.fun_zone_activity_overview()
returns table (
  activity_id uuid,
  participant_count bigint,
  completed_count bigint,
  question_count bigint
)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare group_key uuid := public.primary_cell_group_id();
begin
  if auth.uid() is null or not public.is_active_user()
     or group_key is null or not public.can_access_cell_group(group_key) then
    raise exception 'Active membership is required.';
  end if;
  return query
  select activity.id,
    case when question_totals.question_count > 0 then coalesce(attempt_totals.participant_count, 0)
         else coalesce(legacy_totals.participant_count, 0) end,
    case when question_totals.question_count > 0 then coalesce(attempt_totals.completed_count, 0)
         else coalesce(legacy_totals.participant_count, 0) end,
    question_totals.question_count
  from public.gc_pulse_activities activity
  left join lateral (
    select count(*)::bigint as question_count
    from public.fun_zone_questions question where question.activity_id = activity.id
  ) question_totals on true
  left join lateral (
    select count(*)::bigint as participant_count,
           count(*) filter (where attempt.completed_at is not null)::bigint as completed_count
    from public.fun_zone_attempts attempt where attempt.activity_id = activity.id
  ) attempt_totals on true
  left join lateral (
    select count(*)::bigint as participant_count
    from public.gc_pulse_activity_responses response where response.activity_id = activity.id
  ) legacy_totals on true
  where activity.group_id = group_key
    and (activity.status <> 'draft' or public.can_manage_cell_group(group_key));
end;
$$;

create or replace function public.fun_zone_activity_results(target_activity_id uuid)
returns table (
  question_id uuid,
  selected_option integer,
  response_count bigint,
  total_responses bigint
)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  activity_row public.gc_pulse_activities%rowtype;
  has_questions boolean;
  reveal_scored boolean;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'Active membership is required.'; end if;
  select * into activity_row from public.gc_pulse_activities where id = target_activity_id;
  if not found or activity_row.group_id <> public.primary_cell_group_id()
     or not public.can_access_cell_group(activity_row.group_id) then raise exception 'Activity is unavailable.'; end if;
  select exists(select 1 from public.fun_zone_questions question where question.activity_id = target_activity_id)
    into has_questions;
  reveal_scored := activity_row.status <> 'open'
    or (activity_row.closes_at is not null and activity_row.closes_at <= now());
  if activity_row.category <> 'fellowship' and not reveal_scored then
    raise exception 'Quiz results are available after the activity closes.';
  end if;
  if has_questions then
    return query
    with totals as (
      select answer.question_id, answer.selected_option, count(*)::bigint as response_count
      from public.fun_zone_attempt_answers answer
      where answer.group_id = activity_row.group_id
        and answer.question_id in (
          select question.id from public.fun_zone_questions question
          where question.activity_id = target_activity_id
        )
        and answer.selected_option is not null and not answer.is_hidden
      group by answer.question_id, answer.selected_option
      union all
      select question.id, null::smallint, count(*)::bigint
      from public.fun_zone_questions question
      join public.fun_zone_attempt_answers answer on answer.question_id = question.id
      where question.activity_id = target_activity_id
        and answer.group_id = activity_row.group_id
        and answer.selected_option is null and not answer.is_hidden
      group by question.id
    )
    select totals.question_id, totals.selected_option::integer, totals.response_count,
      sum(totals.response_count) over (partition by totals.question_id)
    from totals order by totals.question_id, totals.selected_option;
  else
    if not reveal_scored and activity_row.activity_type not in ('this_or_that', 'would_you_rather', 'surprise_poll') then
      raise exception 'Results are available after the activity closes.';
    end if;
    return query
    with grouped as (
      select response.selected_option, count(*)::bigint as response_count
      from public.gc_pulse_activity_responses response
      where response.activity_id = target_activity_id
        and response.group_id = activity_row.group_id
      group by response.selected_option
    )
    select null::uuid, grouped.selected_option, grouped.response_count,
      sum(grouped.response_count) over ()
    from grouped order by grouped.selected_option;
  end if;
end;
$$;

drop function if exists public.fun_zone_leaderboard(text);
create function public.fun_zone_leaderboard(period_name text default 'all_time')
returns table (
  user_id uuid,
  full_name text,
  points bigint,
  rank bigint,
  completed_activities bigint,
  achievements_count bigint
)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  group_key uuid := public.primary_cell_group_id();
  period_start timestamptz;
begin
  if auth.uid() is null or not public.is_active_user()
     or group_key is null or not public.can_access_cell_group(group_key) then
    raise exception 'Active membership is required.';
  end if;
  if period_name not in ('week', 'month', 'all_time') then
    raise exception 'Choose week, month, or all_time.';
  end if;
  period_start := case period_name
    when 'week' then date_trunc('week', timezone('utc', now())) at time zone 'UTC'
    when 'month' then date_trunc('month', timezone('utc', now())) at time zone 'UTC'
    else null
  end;

  return query
  with eligible as (
    select profile.id, coalesce(nullif(trim(profile.full_name), ''), 'Member') as name
    from public.profiles profile
    where profile.is_active and public.user_can_access_cell_group(group_key, profile.id)
  ),
  point_rows as (
    select transaction.user_id, transaction.amount::bigint as amount, transaction.created_at
    from public.fun_zone_point_transactions transaction
    where transaction.group_id = group_key
    union all
    select response.user_id, response.awarded_points::bigint as amount, response.submitted_at as created_at
    from public.gc_pulse_activity_responses response
    join public.gc_pulse_activities activity on activity.id = response.activity_id
    where response.group_id = group_key and activity.group_id = group_key
      and response.awarded_points > 0
  ),
  attempts_by_member as (
    select attempt.user_id as member_id, count(*)::bigint as completed_count
    from public.fun_zone_attempts attempt
    where attempt.group_id = group_key and attempt.completed_at is not null
      and (period_start is null or attempt.completed_at >= period_start)
    group by attempt.user_id
  ),
  achievements_by_member as (
    select achievement.user_id as member_id, count(*)::bigint as achievement_count
    from public.fun_zone_member_achievements achievement
    where achievement.group_id = group_key
    group by achievement.user_id
  ),
  points_by_member as (
    select eligible.id as member_id,
      coalesce(sum(point_rows.amount) filter (
        where period_start is null or point_rows.created_at >= period_start
      ), 0)::bigint as total_points
    from eligible
    left join point_rows on point_rows.user_id = eligible.id
    group by eligible.id
  ),
  ranked as (
    select member.id, member.name, points_by_member.total_points,
      dense_rank() over (order by points_by_member.total_points desc)::bigint as member_rank,
      coalesce(attempts_by_member.completed_count, 0)::bigint as completed_count,
      coalesce(achievements_by_member.achievement_count, 0)::bigint as achievement_count
    from points_by_member join eligible member on member.id = points_by_member.member_id
    left join attempts_by_member on attempts_by_member.member_id = member.id
    left join achievements_by_member on achievements_by_member.member_id = member.id
  )
  select ranked.id, ranked.name, ranked.total_points,
         ranked.member_rank, ranked.completed_count, ranked.achievement_count
  from ranked order by ranked.member_rank, lower(ranked.name), ranked.id;
end;
$$;

create or replace function public.fun_zone_my_summary()
returns table (
  completed_count bigint,
  total_points bigint,
  current_streak integer,
  bible_completed_count bigint,
  fellowship_responses bigint,
  weekly_rank bigint,
  monthly_rank bigint,
  all_time_rank bigint
)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  group_key uuid := public.primary_cell_group_id();
  anchor_day date;
  streak_count integer := 0;
  completion_days date[];
begin
  if auth.uid() is null or not public.is_active_user()
     or group_key is null or not public.can_access_cell_group(group_key) then
    raise exception 'Active membership is required.';
  end if;
  select array_agg(days.day order by days.day desc) into completion_days
  from (
    select distinct (attempt.completed_at at time zone 'UTC')::date as day
    from public.fun_zone_attempts attempt
    where attempt.user_id = auth.uid() and attempt.group_id = group_key
      and attempt.completed_at is not null
    union
    select distinct (response.submitted_at at time zone 'UTC')::date
    from public.gc_pulse_activity_responses response
    where response.user_id = auth.uid() and response.group_id = group_key
  ) days;
  if coalesce(cardinality(completion_days), 0) > 0 then
    if completion_days[1] >= (timezone('utc', now()))::date - 1 then
      anchor_day := completion_days[1];
      while anchor_day = any(completion_days) loop
        streak_count := streak_count + 1;
        anchor_day := anchor_day - 1;
      end loop;
    end if;
  end if;
  return query
  select
    (select count(*) from public.fun_zone_attempts attempt
      where attempt.user_id = auth.uid() and attempt.group_id = group_key
        and attempt.completed_at is not null)
      + (select count(*) from public.gc_pulse_activity_responses response
         where response.user_id = auth.uid() and response.group_id = group_key),
    coalesce((select board.points from public.fun_zone_leaderboard('all_time') board
      where board.user_id = auth.uid()), 0),
    streak_count,
    (select count(*) from public.fun_zone_attempts attempt
      join public.gc_pulse_activities activity on activity.id = attempt.activity_id
      where attempt.user_id = auth.uid() and attempt.group_id = group_key
        and attempt.completed_at is not null and activity.category = 'bible_scripture'),
    (select count(*) from public.fun_zone_attempt_answers answer
      join public.fun_zone_questions question on question.id = answer.question_id
      where answer.user_id = auth.uid() and answer.group_id = group_key
        and question.answer_mode = 'reflection' and not answer.is_hidden),
    coalesce((select board.rank from public.fun_zone_leaderboard('week') board
      where board.user_id = auth.uid()), 0),
    coalesce((select board.rank from public.fun_zone_leaderboard('month') board
      where board.user_id = auth.uid()), 0),
    coalesce((select board.rank from public.fun_zone_leaderboard('all_time') board
      where board.user_id = auth.uid()), 0);
end;
$$;

revoke all on function public.save_fun_zone_activity(uuid,jsonb,jsonb) from public, anon;
revoke all on function public.set_fun_zone_activity_status(uuid,text) from public, anon;
revoke all on function public.fun_zone_set_activity_status(uuid,text) from public, anon;
revoke all on function public.fun_zone_start_attempt(uuid) from public, anon;
revoke all on function public.fun_zone_submit_answer(uuid,uuid,integer,text) from public, anon;
revoke all on function public.fun_zone_attempt_review(uuid) from public, anon;
revoke all on function public.fun_zone_activity_overview() from public, anon;
revoke all on function public.fun_zone_activity_results(uuid) from public, anon;
revoke all on function public.fun_zone_leaderboard(text) from public, anon;
revoke all on function public.fun_zone_my_summary() from public, anon;
grant execute on function public.save_fun_zone_activity(uuid,jsonb,jsonb) to authenticated;
grant execute on function public.fun_zone_set_activity_status(uuid,text) to authenticated;
grant execute on function public.fun_zone_start_attempt(uuid) to authenticated;
grant execute on function public.fun_zone_submit_answer(uuid,uuid,integer,text) to authenticated;
grant execute on function public.fun_zone_attempt_review(uuid) to authenticated;
grant execute on function public.fun_zone_activity_overview() to authenticated;
grant execute on function public.fun_zone_activity_results(uuid) to authenticated;
grant execute on function public.fun_zone_leaderboard(text) to authenticated;
grant execute on function public.fun_zone_my_summary() to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'fun_zone_questions'
    ) then
      alter publication supabase_realtime add table public.fun_zone_questions;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'fun_zone_live_activity_updates'
    ) then
      alter publication supabase_realtime add table public.fun_zone_live_activity_updates;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'fun_zone_point_transactions'
    ) then
      alter publication supabase_realtime add table public.fun_zone_point_transactions;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'fun_zone_member_achievements'
    ) then
      alter publication supabase_realtime add table public.fun_zone_member_achievements;
    end if;
  end if;
end;
$$;

commit;
notify pgrst, 'reload schema';
