-- Incremental Bible Study group upgrade.
-- Keeps existing reading/completion/discussion IDs and adds daily editorial
-- content, read sessions, moderation metadata, and support for multiple chapters
-- on one group reading date.

begin;

alter table public.bible_study_readings
  add column if not exists deleted_at timestamptz;

drop index if exists public.bible_study_readings_group_date_unique;
create unique index if not exists bible_study_readings_group_book_chapter_date_unique
  on public.bible_study_readings(group_id, book, chapter, reading_date);
create index if not exists idx_bible_study_readings_group_date
  on public.bible_study_readings(group_id, reading_date, sort_order)
  where deleted_at is null;

-- Preserve member contributions while allowing more than one reflection per
-- chapter. Existing duplicate rows are retained; the unique key remains on the
-- original reading assignment itself.
alter table public.bible_study_takeaways
  drop constraint if exists bible_study_takeaways_reading_id_user_id_key;
drop index if exists public.bible_study_takeaways_reading_id_user_id_key;

alter table public.bible_study_takeaways
  add column if not exists is_pinned boolean not null default false,
  add column if not exists is_highlighted boolean not null default false,
  add column if not exists discussion_closed boolean not null default false,
  add column if not exists reference text;
alter table public.bible_study_takeaways drop constraint if exists bible_study_takeaways_reference_check;
alter table public.bible_study_takeaways add constraint bible_study_takeaways_reference_check
  check (reference is null or char_length(trim(reference)) <= 120);

alter table public.bible_study_mentions drop constraint if exists bible_study_mentions_content_type_check;
alter table public.bible_study_mentions add constraint bible_study_mentions_content_type_check
  check (content_type in ('takeaway','takeaway_reply','question','question_answer','daily_content_response'));

create or replace function public.guard_bible_study_mention_target()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare target_group_id uuid;
begin
  if new.content_type = 'takeaway' then
    select reading.group_id into target_group_id from public.bible_study_takeaways post
      join public.bible_study_readings reading on reading.id = post.reading_id where post.id = new.content_id;
  elsif new.content_type = 'daily_content_response' then
    select group_id into target_group_id from public.bible_study_daily_content_responses where id = new.content_id;
  end if;
  if target_group_id is not null and target_group_id <> new.group_id then
    raise exception 'A mention must belong to the same group as its contribution.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_bible_study_mention_target on public.bible_study_mentions;
create trigger guard_bible_study_mention_target before insert or update on public.bible_study_mentions
  for each row execute function public.guard_bible_study_mention_target();

create or replace function public.notify_bible_study_mention()
returns trigger language plpgsql security definer set search_path = public as $$
declare mention_group_id uuid;
begin
  case new.content_type
    when 'takeaway' then select reading.group_id into mention_group_id from public.bible_study_takeaways post
      join public.bible_study_readings reading on reading.id = post.reading_id where post.id = new.content_id;
    when 'takeaway_reply' then select group_id into mention_group_id from public.bible_study_takeaway_replies where id = new.content_id;
    when 'question' then select group_id into mention_group_id from public.bible_study_questions where id = new.content_id;
    when 'question_answer' then select group_id into mention_group_id from public.bible_study_question_answers where id = new.content_id;
    when 'daily_content_response' then select group_id into mention_group_id from public.bible_study_daily_content_responses where id = new.content_id;
  end case;
  if new.mentioned_user_id <> new.mentioned_by then
    insert into public.notifications(user_id, notification_type, title, body, entity_table, entity_id, group_id)
    select new.mentioned_user_id, 'bible_study_takeaway_reply'::public.notification_type,
      'You were mentioned in Bible Study', 'A group member mentioned you in a Bible Study contribution.',
      'bible_study_' || new.content_type, new.content_id, mention_group_id
    where exists (select 1 from public.notification_preferences preference
      where preference.user_id = new.mentioned_user_id and preference.bible_study_enabled = true)
      or not exists (select 1 from public.notification_preferences preference where preference.user_id = new.mentioned_user_id);
  end if;
  return new;
end;
$$;

create or replace function public.notify_bible_study_takeaway()
returns trigger language plpgsql security definer set search_path = public as $$
declare reading_group_id uuid;
begin
  select group_id into reading_group_id from public.bible_study_readings where id = new.reading_id;
  insert into public.notifications(user_id, notification_type, title, body, entity_table, entity_id, group_id)
  select member.user_id, 'bible_study_takeaway_posted'::public.notification_type,
    'New Bible Study takeaway', left(coalesce(new.content, 'A member shared a voice reflection.'), 150),
    'bible_study_takeaways', new.id, reading_group_id
  from public.cell_group_members member
  join public.profiles profile on profile.id = member.user_id and profile.is_active = true
  left join public.notification_preferences preference on preference.user_id = member.user_id
  where member.cell_group_id = reading_group_id
    and member.membership_status in ('active','new','temporarily_inactive')
    and member.user_id <> new.user_id and coalesce(preference.bible_study_enabled, true);
  return new;
end;
$$;

create or replace function public.notify_bible_study_takeaway_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner_id uuid; parent_group_id uuid;
begin
  select takeaway.user_id, reading.group_id into owner_id, parent_group_id
  from public.bible_study_takeaways takeaway
  join public.bible_study_readings reading on reading.id = takeaway.reading_id
  where takeaway.id = new.takeaway_id;
  if owner_id is not null and owner_id <> new.user_id then
    insert into public.notifications(user_id, notification_type, title, body, entity_table, entity_id, group_id)
    select owner_id, 'bible_study_takeaway_reply'::public.notification_type,
      'New reply to your takeaway', left(coalesce(new.content, 'A member shared a voice reply.'), 150),
      'bible_study_takeaway_replies', new.id, parent_group_id
    where exists (select 1 from public.notification_preferences preference
      where preference.user_id = owner_id and preference.bible_study_enabled = true)
      or not exists (select 1 from public.notification_preferences preference where preference.user_id = owner_id);
  end if;
  return new;
end;
$$;

create or replace function public.notify_bible_study_question()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications(user_id, notification_type, title, body, entity_table, entity_id, group_id)
  select member.user_id, 'bible_study_question_posted'::public.notification_type,
    'New Bible Study conversation', left(coalesce(new.content, 'A member shared a voice message.'), 150),
    'bible_study_questions', new.id, new.group_id
  from public.cell_group_members member
  join public.profiles profile on profile.id = member.user_id and profile.is_active = true
  left join public.notification_preferences preference on preference.user_id = member.user_id
  where member.cell_group_id = new.group_id
    and member.membership_status in ('active','new','temporarily_inactive')
    and member.user_id <> new.user_id and coalesce(preference.bible_study_enabled, true);
  return new;
end;
$$;

create or replace function public.notify_bible_study_question_answer()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner_id uuid; parent_group_id uuid;
begin
  select question.user_id, question.group_id into owner_id, parent_group_id
  from public.bible_study_questions question where question.id = new.question_id;
  if owner_id is not null and owner_id <> new.user_id then
    insert into public.notifications(user_id, notification_type, title, body, entity_table, entity_id, group_id)
    select owner_id, 'bible_study_question_answer'::public.notification_type,
      'Your Bible Study question was answered', left(coalesce(new.content, 'A member shared a voice reply.'), 150),
      'bible_study_question_answers', new.id, parent_group_id
    where exists (select 1 from public.notification_preferences preference
      where preference.user_id = owner_id and preference.bible_study_enabled = true)
      or not exists (select 1 from public.notification_preferences preference where preference.user_id = owner_id);
  end if;
  return new;
end;
$$;

create or replace function public.moderate_bible_study_takeaway(
  target_takeaway_id uuid,
  pin_value boolean,
  highlight_value boolean,
  close_value boolean
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare target_group_id uuid;
begin
  select reading.group_id into target_group_id
  from public.bible_study_takeaways takeaway
  join public.bible_study_readings reading on reading.id = takeaway.reading_id
  where takeaway.id = target_takeaway_id;
  if target_group_id is null or not public.can_manage_cell_group(target_group_id) then
    raise exception 'You do not have permission to moderate this Bible Study contribution.' using errcode = '42501';
  end if;
  update public.bible_study_takeaways
  set is_pinned = pin_value, is_highlighted = highlight_value,
      discussion_closed = close_value, updated_at = timezone('utc', now())
  where id = target_takeaway_id;
end;
$$;
revoke all on function public.moderate_bible_study_takeaway(uuid,boolean,boolean,boolean) from public, anon;
grant execute on function public.moderate_bible_study_takeaway(uuid,boolean,boolean,boolean) to authenticated;

create or replace function public.guard_bible_study_takeaway_moderation()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare target_group_id uuid;
begin
  select group_id into target_group_id from public.bible_study_readings where id = new.reading_id;
  if (new.is_pinned is distinct from old.is_pinned
      or new.is_highlighted is distinct from old.is_highlighted
      or new.discussion_closed is distinct from old.discussion_closed)
     and (target_group_id is null or not public.can_manage_cell_group(target_group_id)) then
    raise exception 'Only a group administrator can moderate a Bible Study contribution.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_bible_study_takeaway_moderation on public.bible_study_takeaways;
create trigger guard_bible_study_takeaway_moderation before update on public.bible_study_takeaways
  for each row execute function public.guard_bible_study_takeaway_moderation();

create or replace function public.guard_bible_study_takeaway_reply_open()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.bible_study_takeaways
    where id = new.takeaway_id and discussion_closed = true) then
    raise exception 'This Bible Study discussion has been closed.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_bible_study_takeaway_reply_open on public.bible_study_takeaway_replies;
create trigger guard_bible_study_takeaway_reply_open before insert on public.bible_study_takeaway_replies
  for each row execute function public.guard_bible_study_takeaway_reply_open();

create or replace function public.guard_bible_study_completion()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  reading_row public.bible_study_readings%rowtype;
  app_timezone text := 'Africa/Nairobi';
begin
  select * into reading_row from public.bible_study_readings where id = new.reading_id;
  if reading_row.id is null or reading_row.deleted_at is not null or reading_row.status = 'archived' then
    raise exception 'This group reading is not available for completion.' using errcode = '23514';
  end if;
  if not public.is_active_user() or not public.can_access_cell_group(reading_row.group_id)
     or new.user_id <> auth.uid() then
    raise exception 'Only an active group member can record their own reading.' using errcode = '42501';
  end if;
  select application_timezone into app_timezone from public.bible_streak_settings where id = 1;
  if reading_row.reading_date > (now() at time zone coalesce(app_timezone, 'Africa/Nairobi'))::date then
    raise exception 'A future group reading cannot be marked complete.' using errcode = '23514';
  end if;
  new.completed_at := now();
  return new;
end;
$$;
drop trigger if exists guard_bible_study_completion on public.bible_study_completions;
create trigger guard_bible_study_completion before insert on public.bible_study_completions
  for each row execute function public.guard_bible_study_completion();

-- A daily editorial post can hold both the day's verse and the group's
-- encouragement/instructions, so members see one coherent message per date.
create table if not exists public.bible_study_daily_content (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.cell_groups(id) on delete cascade,
  content_date date not null,
  verse_reference text,
  verse_text text,
  verse_encouragement text,
  encouragement_title text,
  encouragement_message text,
  instructions text,
  reflection_questions text,
  status text not null default 'draft'
    check (status in ('draft','published','closed','archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  unique(group_id, content_date),
  check (verse_reference is null or char_length(trim(verse_reference)) between 1 and 120),
  check (verse_text is null or char_length(trim(verse_text)) <= 3000),
  check (verse_encouragement is null or char_length(trim(verse_encouragement)) <= 1200),
  check (encouragement_title is null or char_length(trim(encouragement_title)) <= 160),
  check (encouragement_message is null or char_length(trim(encouragement_message)) <= 3000),
  check (instructions is null or char_length(trim(instructions)) <= 2000),
  check (reflection_questions is null or char_length(trim(reflection_questions)) <= 2000),
  check (
    (nullif(trim(verse_reference), '') is null and nullif(trim(verse_text), '') is null)
    or (nullif(trim(verse_reference), '') is not null and nullif(trim(verse_text), '') is not null)
  )
);
create index if not exists idx_bible_study_daily_content_group_date
  on public.bible_study_daily_content(group_id, content_date desc)
  where deleted_at is null;
alter table public.bible_study_daily_content enable row level security;
drop policy if exists bible_study_daily_content_select on public.bible_study_daily_content;
drop policy if exists bible_study_daily_content_manage on public.bible_study_daily_content;
create policy bible_study_daily_content_select on public.bible_study_daily_content
  for select to authenticated using (public.can_access_cell_group(group_id));
create policy bible_study_daily_content_manage on public.bible_study_daily_content
  for all to authenticated using (public.can_manage_cell_group(group_id))
  with check (public.can_manage_cell_group(group_id));
grant select, insert, update, delete on public.bible_study_daily_content to authenticated;

create table if not exists public.bible_study_daily_content_responses (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.bible_study_daily_content(id) on delete cascade,
  group_id uuid not null references public.cell_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index if not exists idx_bible_study_daily_responses_content
  on public.bible_study_daily_content_responses(content_id, created_at);
alter table public.bible_study_daily_content_responses enable row level security;
drop policy if exists bible_study_daily_responses_select on public.bible_study_daily_content_responses;
drop policy if exists bible_study_daily_responses_insert on public.bible_study_daily_content_responses;
drop policy if exists bible_study_daily_responses_update on public.bible_study_daily_content_responses;
drop policy if exists bible_study_daily_responses_delete on public.bible_study_daily_content_responses;
create policy bible_study_daily_responses_select on public.bible_study_daily_content_responses
  for select to authenticated using (public.can_access_cell_group(group_id));
create policy bible_study_daily_responses_insert on public.bible_study_daily_content_responses
  for insert to authenticated with check (
    public.can_access_cell_group(group_id) and user_id = auth.uid()
    and exists (select 1 from public.bible_study_daily_content post
      where post.id = bible_study_daily_content_responses.content_id
        and post.group_id = bible_study_daily_content_responses.group_id
        and post.status = 'published' and post.deleted_at is null)
  );
create policy bible_study_daily_responses_update on public.bible_study_daily_content_responses
  for update to authenticated using (public.can_access_cell_group(group_id)
    and (user_id = auth.uid() or public.can_manage_cell_group(group_id)))
  with check (public.can_access_cell_group(group_id)
    and (user_id = auth.uid() or public.can_manage_cell_group(group_id))
    and exists (select 1 from public.bible_study_daily_content post
      where post.id = bible_study_daily_content_responses.content_id
        and post.group_id = bible_study_daily_content_responses.group_id));
create policy bible_study_daily_responses_delete on public.bible_study_daily_content_responses
  for delete to authenticated using (public.can_access_cell_group(group_id)
    and (user_id = auth.uid() or public.can_manage_cell_group(group_id)));
grant select, insert, update, delete on public.bible_study_daily_content_responses to authenticated;

create table if not exists public.bible_study_daily_content_reactions (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.bible_study_daily_content(id) on delete cascade,
  group_id uuid not null references public.cell_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('love','praying_hands','thumbs_up','clapping','fire','smile')),
  created_at timestamptz not null default timezone('utc', now()),
  unique(content_id, user_id, reaction)
);
create index if not exists idx_bible_study_daily_reactions_content
  on public.bible_study_daily_content_reactions(content_id);
alter table public.bible_study_daily_content_reactions enable row level security;
drop policy if exists bible_study_daily_reactions_select on public.bible_study_daily_content_reactions;
drop policy if exists bible_study_daily_reactions_insert on public.bible_study_daily_content_reactions;
drop policy if exists bible_study_daily_reactions_delete on public.bible_study_daily_content_reactions;
create policy bible_study_daily_reactions_select on public.bible_study_daily_content_reactions
  for select to authenticated using (public.can_access_cell_group(group_id));
create policy bible_study_daily_reactions_insert on public.bible_study_daily_content_reactions
  for insert to authenticated with check (public.can_access_cell_group(group_id) and user_id = auth.uid()
    and exists (select 1 from public.bible_study_daily_content post
      where post.id = bible_study_daily_content_reactions.content_id
        and post.group_id = bible_study_daily_content_reactions.group_id
        and post.status = 'published' and post.deleted_at is null));
create policy bible_study_daily_reactions_delete on public.bible_study_daily_content_reactions
  for delete to authenticated using (public.can_access_cell_group(group_id)
    and (user_id = auth.uid() or public.can_manage_cell_group(group_id)));
grant select, insert, delete on public.bible_study_daily_content_reactions to authenticated;

-- Reading presence is an expiring signal for the admin dashboard, never a
-- completion record. A member's completion still comes only from the existing
-- unique bible_study_completions row.
create table if not exists public.bible_study_reading_sessions (
  id uuid primary key default gen_random_uuid(),
  reading_id uuid not null references public.bible_study_readings(id) on delete cascade,
  group_id uuid not null references public.cell_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz,
  unique(reading_id, user_id)
);
create index if not exists idx_bible_study_reading_sessions_live
  on public.bible_study_reading_sessions(group_id, last_seen_at desc)
  where ended_at is null;
alter table public.bible_study_reading_sessions enable row level security;
drop policy if exists bible_study_read_sessions_select on public.bible_study_reading_sessions;
drop policy if exists bible_study_read_sessions_insert on public.bible_study_reading_sessions;
drop policy if exists bible_study_read_sessions_update on public.bible_study_reading_sessions;
create policy bible_study_read_sessions_select on public.bible_study_reading_sessions
  for select to authenticated using (user_id = auth.uid() or public.can_manage_cell_group(group_id));
create policy bible_study_read_sessions_insert on public.bible_study_reading_sessions
  for insert to authenticated with check (user_id = auth.uid() and public.can_access_cell_group(group_id)
    and exists (select 1 from public.bible_study_readings reading
      where reading.id = bible_study_reading_sessions.reading_id
        and reading.group_id = bible_study_reading_sessions.group_id and reading.deleted_at is null));
create policy bible_study_read_sessions_update on public.bible_study_reading_sessions
  for update to authenticated using (user_id = auth.uid() and public.can_access_cell_group(group_id))
  with check (user_id = auth.uid() and public.can_access_cell_group(group_id)
    and exists (select 1 from public.bible_study_readings reading
      where reading.id = bible_study_reading_sessions.reading_id
        and reading.group_id = bible_study_reading_sessions.group_id and reading.deleted_at is null));
grant select, insert, update on public.bible_study_reading_sessions to authenticated;

create or replace function public.guard_bible_study_reading_session()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare reading_group_id uuid;
begin
  select group_id into reading_group_id from public.bible_study_readings
  where id = new.reading_id and deleted_at is null;
  if reading_group_id is null or reading_group_id <> new.group_id
     or not public.can_access_cell_group(new.group_id) or new.user_id <> auth.uid() then
    raise exception 'A reading session must belong to your active group reading.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then new.started_at := now(); end if;
  new.last_seen_at := now();
  return new;
end;
$$;
drop trigger if exists guard_bible_study_reading_session on public.bible_study_reading_sessions;
create trigger guard_bible_study_reading_session before insert or update on public.bible_study_reading_sessions
  for each row execute function public.guard_bible_study_reading_session();

-- Daily content notifications use existing Bible Study notification categories,
-- and carry the group so the app routes them back to the shared page.
create or replace function public.notify_bible_study_daily_content()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and new.deleted_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'published' or old.deleted_at is not null) then
    insert into public.notifications(user_id, notification_type, title, body, entity_table, entity_id, group_id)
    select member.user_id,
      'bible_study_question_posted'::public.notification_type,
      case when new.verse_reference is not null then 'Verse of the Day and Bible Study' else 'Daily Bible encouragement' end,
      coalesce(nullif(new.encouragement_title, ''), nullif(new.verse_reference, ''), 'A new group Bible Study message is available.'),
      'bible_study_daily_content', new.id, new.group_id
    from public.cell_group_members member
    left join public.notification_preferences preference on preference.user_id = member.user_id
    where member.cell_group_id = new.group_id
      and member.membership_status in ('active','new','temporarily_inactive')
      and member.user_id is not null
      and member.user_id <> new.created_by and coalesce(preference.bible_study_enabled, true);
  end if;
  return new;
end;
$$;
drop trigger if exists on_bible_study_daily_content_notify on public.bible_study_daily_content;
create trigger on_bible_study_daily_content_notify
  after insert or update of status, deleted_at on public.bible_study_daily_content
  for each row execute function public.notify_bible_study_daily_content();

create or replace function public.notify_bible_study_daily_response()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  content_author uuid;
  post_group_id uuid;
begin
  select created_by, group_id into content_author, post_group_id
  from public.bible_study_daily_content where id = new.content_id;
  if content_author is not null and content_author <> new.user_id then
    insert into public.notifications(user_id, notification_type, title, body, entity_table, entity_id, group_id)
    select content_author, 'bible_study_takeaway_reply'::public.notification_type,
      'A member responded to your Bible Study post', left(new.content, 150),
      'bible_study_daily_content_responses', new.id, post_group_id
    where exists (select 1 from public.notification_preferences preference
      where preference.user_id = content_author and preference.bible_study_enabled = true)
      or not exists (select 1 from public.notification_preferences preference where preference.user_id = content_author);
  end if;
  return new;
end;
$$;
drop trigger if exists on_bible_study_daily_response_notify on public.bible_study_daily_content_responses;
create trigger on_bible_study_daily_response_notify after insert on public.bible_study_daily_content_responses
  for each row execute function public.notify_bible_study_daily_response();

create or replace function public.notify_bible_study_daily_reaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare content_author uuid;
begin
  select created_by into content_author from public.bible_study_daily_content where id = new.content_id;
  if content_author is not null and content_author <> new.user_id then
    insert into public.notifications(user_id, notification_type, title, body, entity_table, entity_id, group_id)
    select content_author, 'bible_study_takeaway_reply'::public.notification_type,
      'A member reacted to your Bible Study post', 'A group member shared a reaction.',
      'bible_study_daily_content', new.content_id, new.group_id
    where exists (select 1 from public.notification_preferences preference
      where preference.user_id = content_author and preference.bible_study_enabled = true)
      or not exists (select 1 from public.notification_preferences preference where preference.user_id = content_author);
  end if;
  return new;
end;
$$;
drop trigger if exists on_bible_study_daily_reaction_notify on public.bible_study_daily_content_reactions;
create trigger on_bible_study_daily_reaction_notify after insert on public.bible_study_daily_content_reactions
  for each row execute function public.notify_bible_study_daily_reaction();

create or replace function public.notify_bible_study_reading_plan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'draft' and new.deleted_at is null then
    insert into public.notifications(user_id, notification_type, title, body, entity_table, entity_id, group_id)
    select member.user_id, 'bible_study_question_posted'::public.notification_type,
      'A group Bible reading was scheduled',
      format('%s %s is scheduled for %s.', new.book, new.chapter, new.reading_date),
      'bible_study_readings', new.id, new.group_id
    from public.cell_group_members member
    left join public.notification_preferences preference on preference.user_id = member.user_id
    where member.cell_group_id = new.group_id
      and member.membership_status in ('active','new','temporarily_inactive')
      and member.user_id is not null and member.user_id <> new.created_by
      and coalesce(preference.bible_study_enabled, true);
  end if;
  return new;
end;
$$;
drop trigger if exists on_bible_study_reading_plan_notify on public.bible_study_readings;
create trigger on_bible_study_reading_plan_notify after insert on public.bible_study_readings
  for each row execute function public.notify_bible_study_reading_plan();

create or replace function public.notify_bible_study_completion_to_admins()
returns trigger language plpgsql security definer set search_path = public as $$
declare reading_row public.bible_study_readings%rowtype;
begin
  select * into reading_row from public.bible_study_readings where id = new.reading_id;
  if reading_row.id is null then return new; end if;
  insert into public.notifications(user_id, notification_type, title, body, entity_table, entity_id, group_id)
  select profile.id, 'bible_study_question_posted'::public.notification_type,
    'A member completed today''s group reading',
    format('%s completed %s %s.', coalesce(profile.full_name, 'A member'), reading_row.book, reading_row.chapter),
    'bible_study_completions', new.id, reading_row.group_id
  from public.profiles profile
  where profile.is_active = true and profile.id <> new.user_id
    and profile.role = 'admin'
    and coalesce((select preference.bible_study_enabled from public.notification_preferences preference where preference.user_id = profile.id), true)
    and public.user_can_access_cell_group(reading_row.group_id, profile.id);
  return new;
end;
$$;
drop trigger if exists on_bible_study_completion_admin_notify on public.bible_study_completions;
create trigger on_bible_study_completion_admin_notify after insert on public.bible_study_completions
  for each row execute function public.notify_bible_study_completion_to_admins();

create or replace function public.notify_bible_study_reaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner_id uuid;
  target_group_id uuid;
  target_table text;
begin
  case new.content_type
    when 'takeaway' then
      select post.user_id, reading.group_id into owner_id, target_group_id
      from public.bible_study_takeaways post join public.bible_study_readings reading on reading.id = post.reading_id
      where post.id = new.content_id;
      target_table := 'bible_study_takeaways';
    when 'takeaway_reply' then
      select post.user_id, post.group_id into owner_id, target_group_id
      from public.bible_study_takeaway_replies post where post.id = new.content_id;
      target_table := 'bible_study_takeaway_replies';
    when 'question' then
      select post.user_id, post.group_id into owner_id, target_group_id
      from public.bible_study_questions post where post.id = new.content_id;
      target_table := 'bible_study_questions';
    when 'question_answer' then
      select post.user_id, post.group_id into owner_id, target_group_id
      from public.bible_study_question_answers post where post.id = new.content_id;
      target_table := 'bible_study_question_answers';
  end case;
  if owner_id is not null and owner_id <> new.user_id then
    insert into public.notifications(user_id, notification_type, title, body, entity_table, entity_id, group_id)
    select owner_id, 'bible_study_takeaway_reply'::public.notification_type,
      'Someone reacted to your Bible Study contribution', 'A group member shared a reaction.',
      target_table, new.content_id, target_group_id
    where exists (select 1 from public.notification_preferences preference
      where preference.user_id = owner_id and preference.bible_study_enabled = true)
      or not exists (select 1 from public.notification_preferences preference where preference.user_id = owner_id);
  end if;
  return new;
end;
$$;
drop trigger if exists on_bible_study_reaction_notify on public.bible_study_takeaway_reactions;
create trigger on_bible_study_reaction_notify after insert on public.bible_study_takeaway_reactions
  for each row execute function public.notify_bible_study_reaction();

-- Include the new persisted rows in Supabase Realtime where publication exists.
do $$
declare table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'bible_study_daily_content','bible_study_daily_content_responses',
      'bible_study_daily_content_reactions','bible_study_reading_sessions'
    ] loop
      if not exists (select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;

commit;
