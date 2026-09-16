-- Shared Bible Study: reading plan, personal completions, reflections, and encouragements.
create table if not exists public.bible_study_readings (
  id uuid primary key default gen_random_uuid(),
  book text not null check (char_length(trim(book)) > 0),
  chapter smallint not null check (chapter > 0 and chapter < 200),
  reading_date date not null unique,
  sort_order integer not null unique,
  status text not null default 'scheduled' check (status in ('draft','scheduled','active','archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(book, chapter, reading_date)
);

create table if not exists public.bible_study_completions (
  id uuid primary key default gen_random_uuid(),
  reading_id uuid not null references public.bible_study_readings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  completed_at timestamptz not null default timezone('utc', now()),
  unique(reading_id, user_id)
);

create table if not exists public.bible_study_takeaways (
  id uuid primary key default gen_random_uuid(),
  reading_id uuid not null references public.bible_study_readings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 3000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(reading_id, user_id)
);

create table if not exists public.bible_study_takeaway_reactions (
  id uuid primary key default gen_random_uuid(),
  takeaway_id uuid not null references public.bible_study_takeaways(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('thumbs_up','fire','love','laugh','smile','amazed','bowing','folded_hands')),
  created_at timestamptz not null default timezone('utc', now()),
  unique(takeaway_id, user_id, reaction)
);

create index if not exists idx_bible_readings_date on public.bible_study_readings(reading_date);
create index if not exists idx_bible_completions_reading on public.bible_study_completions(reading_id);
create index if not exists idx_bible_takeaways_reading on public.bible_study_takeaways(reading_id, created_at desc);

alter table public.bible_study_readings enable row level security;
alter table public.bible_study_completions enable row level security;
alter table public.bible_study_takeaways enable row level security;
alter table public.bible_study_takeaway_reactions enable row level security;

drop policy if exists "bible_readings_select" on public.bible_study_readings;
drop policy if exists "bible_readings_admin_write" on public.bible_study_readings;
drop policy if exists "bible_completions_select" on public.bible_study_completions;
drop policy if exists "bible_completions_self_insert" on public.bible_study_completions;
drop policy if exists "bible_takeaways_select" on public.bible_study_takeaways;
drop policy if exists "bible_takeaways_self_write" on public.bible_study_takeaways;
drop policy if exists "bible_reactions_select" on public.bible_study_takeaway_reactions;
drop policy if exists "bible_reactions_self_write" on public.bible_study_takeaway_reactions;

create policy "bible_readings_select" on public.bible_study_readings for select to authenticated using (public.is_active_user());
create policy "bible_readings_admin_write" on public.bible_study_readings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "bible_completions_select" on public.bible_study_completions for select to authenticated using (public.is_active_user());
create policy "bible_completions_self_insert" on public.bible_study_completions for insert to authenticated with check (public.is_active_user() and user_id = auth.uid());
create policy "bible_takeaways_select" on public.bible_study_takeaways for select to authenticated using (public.is_active_user());
create policy "bible_takeaways_self_write" on public.bible_study_takeaways for all to authenticated using (public.is_admin() or user_id = auth.uid()) with check (public.is_admin() or user_id = auth.uid());
create policy "bible_reactions_select" on public.bible_study_takeaway_reactions for select to authenticated using (public.is_active_user());
create policy "bible_reactions_self_write" on public.bible_study_takeaway_reactions for all to authenticated using (public.is_admin() or user_id = auth.uid()) with check (public.is_admin() or user_id = auth.uid());

-- Safe upgrade for installations that ran an earlier version of this migration.
alter table public.bible_study_takeaway_reactions drop constraint if exists bible_study_takeaway_reactions_reaction_check;
alter table public.bible_study_takeaway_reactions add constraint bible_study_takeaway_reactions_reaction_check
  check (reaction in ('thumbs_up','fire','love','laugh','smile','amazed','bowing','folded_hands','praying_hands','crying','clapping','shy'));

-- Reuse the existing reactions table for every Bible Study conversation item.
-- Existing takeaway reactions remain attached to their original takeaway.
alter table public.bible_study_takeaway_reactions add column if not exists content_type text;
alter table public.bible_study_takeaway_reactions add column if not exists content_id uuid;
alter table public.bible_study_takeaway_reactions alter column takeaway_id drop not null;
update public.bible_study_takeaway_reactions
set content_type = 'takeaway', content_id = takeaway_id
where content_type is null or content_id is null;
alter table public.bible_study_takeaway_reactions drop constraint if exists bible_study_takeaway_reactions_content_type_check;
alter table public.bible_study_takeaway_reactions add constraint bible_study_takeaway_reactions_content_type_check
  check (content_type in ('takeaway','takeaway_reply','question','question_answer'));
alter table public.bible_study_takeaway_reactions alter column content_type set not null;
alter table public.bible_study_takeaway_reactions alter column content_id set not null;
create unique index if not exists bible_study_content_reactions_unique
  on public.bible_study_takeaway_reactions(content_type, content_id, user_id, reaction);
create index if not exists idx_bible_study_content_reactions_target
  on public.bible_study_takeaway_reactions(content_type, content_id);

insert into public.bible_study_readings (book, chapter, reading_date, sort_order, status)
select book, chapter, date '2026-09-07' + (sort_order - 1), sort_order, 'scheduled'
from (values
  ('Galatians',1,1),('Galatians',2,2),('Galatians',3,3),('Galatians',4,4),('Galatians',5,5),('Galatians',6,6),
  ('Ephesians',1,7),('Ephesians',2,8),('Ephesians',3,9),('Ephesians',4,10),('Ephesians',5,11),('Ephesians',6,12),
  ('Philippians',1,13),('Philippians',2,14),('Philippians',3,15),('Philippians',4,16),
  ('Colossians',1,17),('Colossians',2,18),('Colossians',3,19),('Colossians',4,20)
) as plan(book, chapter, sort_order)
where not exists (
  select 1 from public.bible_study_readings existing
  where existing.sort_order = plan.sort_order
     or existing.reading_date = date '2026-09-07' + (plan.sort_order - 1)
)
-- Existing installations may already have this plan under older dates.  Keep those
-- row IDs (and their linked completions/takeaways), then correct their dates below.
-- The plan's unique sort order is the stable seed identity here, so never try to
-- insert a duplicate position.
on conflict (sort_order) do nothing;

-- Community conversations: replies to takeaways and an open, group-wide Q&A.
create table if not exists public.bible_study_takeaway_replies (
  id uuid primary key default gen_random_uuid(),
  takeaway_id uuid not null references public.bible_study_takeaways(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.bible_study_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 3000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.bible_study_question_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.bible_study_questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 3000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_bible_takeaway_replies_takeaway on public.bible_study_takeaway_replies(takeaway_id, created_at);
create index if not exists idx_bible_questions_created on public.bible_study_questions(created_at desc);
create index if not exists idx_bible_question_answers_question on public.bible_study_question_answers(question_id, created_at);

alter table public.bible_study_takeaway_replies enable row level security;
alter table public.bible_study_questions enable row level security;
alter table public.bible_study_question_answers enable row level security;

drop policy if exists "bible_takeaway_replies_select" on public.bible_study_takeaway_replies;
drop policy if exists "bible_takeaway_replies_self_write" on public.bible_study_takeaway_replies;
drop policy if exists "bible_questions_select" on public.bible_study_questions;
drop policy if exists "bible_questions_self_write" on public.bible_study_questions;
drop policy if exists "bible_question_answers_select" on public.bible_study_question_answers;
drop policy if exists "bible_question_answers_self_write" on public.bible_study_question_answers;

create policy "bible_takeaway_replies_select" on public.bible_study_takeaway_replies for select to authenticated using (public.is_active_user());
create policy "bible_takeaway_replies_self_write" on public.bible_study_takeaway_replies for all to authenticated using (public.is_admin() or user_id = auth.uid()) with check (public.is_active_user() and (public.is_admin() or user_id = auth.uid()));
create policy "bible_questions_select" on public.bible_study_questions for select to authenticated using (public.is_active_user());
create policy "bible_questions_self_write" on public.bible_study_questions for all to authenticated using (public.is_admin() or user_id = auth.uid()) with check (public.is_active_user() and (public.is_admin() or user_id = auth.uid()));
create policy "bible_question_answers_select" on public.bible_study_question_answers for select to authenticated using (public.is_active_user());
create policy "bible_question_answers_self_write" on public.bible_study_question_answers for all to authenticated using (public.is_admin() or user_id = auth.uid()) with check (public.is_active_user() and (public.is_admin() or user_id = auth.uid()));

-- Run these once in the Supabase SQL editor to have new posts appear immediately
-- for members who are already on the Bible Study page.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bible_study_takeaway_replies') then
    alter publication supabase_realtime add table public.bible_study_takeaway_replies;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bible_study_questions') then
    alter publication supabase_realtime add table public.bible_study_questions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bible_study_question_answers') then
    alter publication supabase_realtime add table public.bible_study_question_answers;
  end if;
end $$;

-- Bible Study activity also enters the app-wide notification and Web Push pipeline.
do $$
begin
  if not exists (select 1 from pg_enum where enumtypid = 'public.notification_type'::regtype and enumlabel = 'bible_study_takeaway_posted') then
    alter type public.notification_type add value 'bible_study_takeaway_posted';
  end if;
  if not exists (select 1 from pg_enum where enumtypid = 'public.notification_type'::regtype and enumlabel = 'bible_study_takeaway_reply') then
    alter type public.notification_type add value 'bible_study_takeaway_reply';
  end if;
  if not exists (select 1 from pg_enum where enumtypid = 'public.notification_type'::regtype and enumlabel = 'bible_study_question_posted') then
    alter type public.notification_type add value 'bible_study_question_posted';
  end if;
  if not exists (select 1 from pg_enum where enumtypid = 'public.notification_type'::regtype and enumlabel = 'bible_study_question_answer') then
    alter type public.notification_type add value 'bible_study_question_answer';
  end if;
end $$;

alter table public.notification_preferences add column if not exists bible_study_enabled boolean not null default true;

create or replace function public.notify_bible_study_takeaway()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, notification_type, title, body, entity_table, entity_id)
  select id, 'bible_study_takeaway_posted'::public.notification_type, 'New Bible Study takeaway', left(new.content, 150), 'bible_study_takeaways', new.id
  from public.profiles where is_active = true and id <> new.user_id;
  return new;
end;
$$;

create or replace function public.notify_bible_study_takeaway_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare takeaway_author uuid;
begin
  select user_id into takeaway_author from public.bible_study_takeaways where id = new.takeaway_id;
  if takeaway_author is not null and takeaway_author <> new.user_id then
    perform public.create_notification(takeaway_author, 'bible_study_takeaway_reply'::public.notification_type, 'New reply to your takeaway', left(new.content, 150), 'bible_study_takeaway_replies', new.id);
  end if;
  return new;
end;
$$;

create or replace function public.notify_bible_study_question()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, notification_type, title, body, entity_table, entity_id)
  select id, 'bible_study_question_posted'::public.notification_type, 'New Bible Study question', left(new.content, 150), 'bible_study_questions', new.id
  from public.profiles where is_active = true and id <> new.user_id;
  return new;
end;
$$;

create or replace function public.notify_bible_study_question_answer()
returns trigger language plpgsql security definer set search_path = public as $$
declare question_author uuid;
begin
  select user_id into question_author from public.bible_study_questions where id = new.question_id;
  if question_author is not null and question_author <> new.user_id then
    perform public.create_notification(question_author, 'bible_study_question_answer'::public.notification_type, 'Your Bible Study question was answered', left(new.content, 150), 'bible_study_question_answers', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_bible_study_takeaway_notify on public.bible_study_takeaways;
create trigger on_bible_study_takeaway_notify after insert on public.bible_study_takeaways for each row execute function public.notify_bible_study_takeaway();
drop trigger if exists on_bible_study_takeaway_reply_notify on public.bible_study_takeaway_replies;
create trigger on_bible_study_takeaway_reply_notify after insert on public.bible_study_takeaway_replies for each row execute function public.notify_bible_study_takeaway_reply();
drop trigger if exists on_bible_study_question_notify on public.bible_study_questions;
create trigger on_bible_study_question_notify after insert on public.bible_study_questions for each row execute function public.notify_bible_study_question();
drop trigger if exists on_bible_study_question_answer_notify on public.bible_study_question_answers;
create trigger on_bible_study_question_answer_notify after insert on public.bible_study_question_answers for each row execute function public.notify_bible_study_question_answer();

-- Correct the September 2026 plan without touching completions, takeaways, reactions, or replies.
-- Galatians 6 was Saturday 12 Sep; Sunday was intentionally a rest day; Ephesians began Monday.
update public.bible_study_readings set reading_date = reading_date + 100 where book in ('Ephesians', 'Philippians', 'Colossians') and reading_date < date '2026-12-01';
update public.bible_study_readings set reading_date = case
  when book = 'Ephesians' then date '2026-09-14' + (chapter - 1)
  when book = 'Philippians' then date '2026-09-20' + (chapter - 1)
  when book = 'Colossians' then date '2026-09-24' + (chapter - 1)
end
where book in ('Ephesians', 'Philippians', 'Colossians');

-- Structured mentions reuse the existing profile and notification systems.
create table if not exists public.bible_study_mentions (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('takeaway_reply', 'question', 'question_answer')),
  content_id uuid not null,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  mentioned_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique(content_type, content_id, mentioned_user_id)
);
create index if not exists idx_bible_study_mentions_user on public.bible_study_mentions(mentioned_user_id, created_at desc);
alter table public.bible_study_mentions enable row level security;
drop policy if exists "bible_mentions_select" on public.bible_study_mentions;
drop policy if exists "bible_mentions_insert_own" on public.bible_study_mentions;
create policy "bible_mentions_select" on public.bible_study_mentions for select to authenticated using (public.is_active_user());
create policy "bible_mentions_insert_own" on public.bible_study_mentions for insert to authenticated with check (public.is_active_user() and mentioned_by = auth.uid());

create or replace function public.notify_bible_study_mention()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.mentioned_user_id <> new.mentioned_by then
    insert into public.notifications (user_id, notification_type, title, body, entity_table, entity_id)
    values (new.mentioned_user_id, 'bible_study_takeaway_reply'::public.notification_type, 'You were mentioned in Bible Study', 'A member mentioned you in a Bible Study conversation.', 'bible_study_' || new.content_type, new.content_id);
  end if;
  return new;
end;
$$;
drop trigger if exists on_bible_study_mention_notify on public.bible_study_mentions;
create trigger on_bible_study_mention_notify after insert on public.bible_study_mentions for each row execute function public.notify_bible_study_mention();

-- Partner Streaks: relationship records only. Daily streak values are always derived
-- from bible_study_readings + bible_study_completions, never stored or manually changed.
create table if not exists public.bible_study_partner_streaks (
  id uuid primary key default gen_random_uuid(),
  member_one_id uuid not null references public.profiles(id) on delete cascade,
  member_two_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  invited_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'declined', 'ended')),
  started_on date,
  responded_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (member_one_id <> member_two_id),
  check (invited_by in (member_one_id, member_two_id)),
  check (invited_user_id in (member_one_id, member_two_id)),
  check (invited_by <> invited_user_id)
);
create unique index if not exists bible_partner_streak_one_active_pair on public.bible_study_partner_streaks(member_one_id, member_two_id) where status in ('pending', 'active');
create index if not exists idx_bible_partner_streak_member_one on public.bible_study_partner_streaks(member_one_id);
create index if not exists idx_bible_partner_streak_member_two on public.bible_study_partner_streaks(member_two_id);
alter table public.bible_study_partner_streaks enable row level security;
drop policy if exists "bible_partner_streak_select" on public.bible_study_partner_streaks;
drop policy if exists "bible_partner_streak_insert" on public.bible_study_partner_streaks;
create policy "bible_partner_streak_select" on public.bible_study_partner_streaks for select to authenticated using (public.is_admin() or auth.uid() in (member_one_id, member_two_id));
create policy "bible_partner_streak_insert" on public.bible_study_partner_streaks for insert to authenticated with check (public.is_active_user() and invited_by = auth.uid() and auth.uid() in (member_one_id, member_two_id) and invited_user_id in (member_one_id, member_two_id));

create or replace function public.respond_to_bible_partner_streak(streak_id uuid, response text)
returns public.bible_study_partner_streaks language plpgsql security definer set search_path = public as $$
declare result public.bible_study_partner_streaks;
begin
  if response not in ('active', 'declined') then raise exception 'Invalid response'; end if;
  update public.bible_study_partner_streaks set status=response, responded_at=timezone('utc',now()), started_on=case when response='active' then coalesce((select min(reading_date) from public.bible_study_readings where reading_date >= current_date),current_date) else null end, updated_at=timezone('utc',now()) where id=streak_id and status='pending' and invited_user_id=auth.uid() returning * into result;
  if result.id is null then raise exception 'Invitation is unavailable'; end if;
  return result;
end;
$$;
create or replace function public.end_bible_partner_streak(streak_id uuid)
returns public.bible_study_partner_streaks language plpgsql security definer set search_path = public as $$
declare result public.bible_study_partner_streaks;
begin
  update public.bible_study_partner_streaks set status='ended', ended_at=timezone('utc',now()), updated_at=timezone('utc',now()) where id=streak_id and status='active' and auth.uid() in (member_one_id,member_two_id) returning * into result;
  if result.id is null then raise exception 'Streak is unavailable'; end if;
  return result;
end;
$$;
create or replace function public.send_bible_partner_encouragement(streak_id uuid, message text)
returns void language plpgsql security definer set search_path = public as $$
declare partner_id uuid;
begin
  select case when member_one_id=auth.uid() then member_two_id else member_one_id end into partner_id from public.bible_study_partner_streaks where id=streak_id and status='active' and auth.uid() in (member_one_id,member_two_id);
  if partner_id is null then raise exception 'Streak is unavailable'; end if;
  insert into public.notifications(user_id,notification_type,title,body,entity_table,entity_id) values(partner_id,'bible_study_takeaway_reply'::public.notification_type,'Partner Streak encouragement',left(message,180),'bible_study_partner_streaks',streak_id);
end;
$$;
grant execute on function public.respond_to_bible_partner_streak(uuid,text) to authenticated;
grant execute on function public.end_bible_partner_streak(uuid) to authenticated;
grant execute on function public.send_bible_partner_encouragement(uuid,text) to authenticated;
create or replace function public.notify_bible_partner_streak()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications(user_id,notification_type,title,body,entity_table,entity_id) values(new.invited_user_id,'bible_study_takeaway_reply'::public.notification_type,'Bible Study Partner Streak invitation','A member invited you to build a Bible Study streak together.','bible_study_partner_streaks',new.id);
  elsif old.status = 'pending' and new.status = 'active' then
    insert into public.notifications(user_id,notification_type,title,body,entity_table,entity_id) values(new.invited_by,'bible_study_takeaway_reply'::public.notification_type,'Partner Streak accepted','Your Bible Study Partner Streak is now active.','bible_study_partner_streaks',new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists on_bible_partner_streak_notify on public.bible_study_partner_streaks;
create trigger on_bible_partner_streak_notify after insert or update on public.bible_study_partner_streaks for each row execute function public.notify_bible_partner_streak();
do $$ begin if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bible_study_partner_streaks') then alter publication supabase_realtime add table public.bible_study_partner_streaks; end if; end $$;
