-- Let the leader of a cell group manage that group's planned readings and
-- Verse of the Day content. The older Bible Study policy only recognized a
-- global admin, which did not match the group-scoped admin controls in the app.
-- Apply after management-cell-groups-migration.sql and
-- bible-study-management-upgrade-migration.sql.

begin;

drop policy if exists "bible_readings_admin_write" on public.bible_study_readings;
drop policy if exists bible_study_readings_group_managers_manage on public.bible_study_readings;
create policy bible_study_readings_group_managers_manage
  on public.bible_study_readings
  for all to authenticated
  using (public.can_manage_cell_group(group_id))
  with check (public.can_manage_cell_group(group_id));

drop policy if exists bible_study_daily_content_manage on public.bible_study_daily_content;
create policy bible_study_daily_content_manage
  on public.bible_study_daily_content
  for all to authenticated
  using (public.can_manage_cell_group(group_id))
  with check (public.can_manage_cell_group(group_id));

-- bible_study_readings is a parent row with its own group_id. The generic
-- child-row scope trigger has no parent lookup for it, so its CASE statement
-- raised CASE_NOT_FOUND on every edit, archive, or soft delete.
create or replace function public.guard_bible_study_reading_scope()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.group_id is distinct from old.group_id then
    raise exception 'A group reading cannot be moved to another group.' using errcode = '42501';
  end if;
  if new.group_id is null then
    new.group_id := public.primary_cell_group_id();
  end if;
  if new.group_id is null then
    raise exception 'A cell group is required for this reading.' using errcode = '23502';
  end if;
  return new;
end;
$$;
drop trigger if exists assign_cell_group_scope on public.bible_study_readings;
drop trigger if exists guard_bible_study_reading_scope on public.bible_study_readings;
create trigger guard_bible_study_reading_scope
  before insert or update on public.bible_study_readings
  for each row execute function public.guard_bible_study_reading_scope();

-- Takeaway mentions use the new content_type 'takeaway'. Resolve every
-- supported mention target directly and keep its group id immutable.
create or replace function public.assign_bible_study_mention_scope()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare resolved_group uuid;
begin
  if tg_op = 'UPDATE' and new.group_id is distinct from old.group_id then
    raise exception 'A Bible Study mention cannot be moved to another group.' using errcode = '42501';
  end if;
  case new.content_type
    when 'takeaway' then
      select reading.group_id into resolved_group
      from public.bible_study_takeaways post
      join public.bible_study_readings reading on reading.id = post.reading_id
      where post.id = new.content_id;
    when 'takeaway_reply' then
      select group_id into resolved_group from public.bible_study_takeaway_replies where id = new.content_id;
    when 'question' then
      select group_id into resolved_group from public.bible_study_questions where id = new.content_id;
    when 'question_answer' then
      select group_id into resolved_group from public.bible_study_question_answers where id = new.content_id;
    when 'daily_content_response' then
      select group_id into resolved_group from public.bible_study_daily_content_responses where id = new.content_id;
    else
      raise exception 'This Bible Study mention type is not supported.' using errcode = '23514';
  end case;
  if resolved_group is null then
    raise exception 'The Bible Study mention target could not be verified.' using errcode = '42501';
  end if;
  new.group_id := resolved_group;
  return new;
end;
$$;
drop trigger if exists assign_cell_group_scope on public.bible_study_mentions;
drop trigger if exists assign_bible_study_mention_scope on public.bible_study_mentions;
create trigger assign_bible_study_mention_scope
  before insert or update on public.bible_study_mentions
  for each row execute function public.assign_bible_study_mention_scope();

-- The reaction notifier used singular entity names that the group scope
-- trigger did not recognize. Use the canonical table names for notifications.
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
      from public.bible_study_takeaways post
      join public.bible_study_readings reading on reading.id = post.reading_id
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
    else
      raise exception 'This Bible Study reaction type is not supported.' using errcode = '23514';
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

-- Keep the client reaction set and database constraint in sync. Each member
-- may add or remove their own reactions within a group they can access.
alter table public.bible_study_takeaway_reactions
  drop constraint if exists bible_study_takeaway_reactions_reaction_check;
alter table public.bible_study_takeaway_reactions
  add constraint bible_study_takeaway_reactions_reaction_check
  check (reaction in (
    'thumbs_up','fire','love','laugh','smile','amazed','bowing',
    'folded_hands','praying_hands','crying','clapping','shy'
  ));

drop policy if exists "bible_reactions_select" on public.bible_study_takeaway_reactions;
create policy "bible_reactions_select"
  on public.bible_study_takeaway_reactions
  for select to authenticated
  using (public.can_access_cell_group(group_id));

drop policy if exists "bible_reactions_self_write" on public.bible_study_takeaway_reactions;
create policy "bible_reactions_self_write"
  on public.bible_study_takeaway_reactions
  for all to authenticated
  using (
    public.can_access_cell_group(group_id)
    and (user_id = auth.uid() or public.can_manage_cell_group(group_id))
  )
  with check (
    public.can_access_cell_group(group_id)
    and user_id = auth.uid()
  );

create unique index if not exists bible_study_content_reactions_unique
  on public.bible_study_takeaway_reactions(content_type, content_id, user_id, reaction);

grant select, insert, update, delete on public.bible_study_readings,
  public.bible_study_daily_content, public.bible_study_takeaway_reactions to authenticated;

notify pgrst, 'reload schema';

commit;
