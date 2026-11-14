-- Allow direct replies to individual takeaway comments while keeping the
-- existing takeaway/reply rows and their group-scoped policies intact.
begin;

alter table public.bible_study_takeaway_replies
  add column if not exists parent_reply_id uuid references public.bible_study_takeaway_replies(id) on delete cascade;
create index if not exists idx_bible_study_takeaway_replies_parent
  on public.bible_study_takeaway_replies(parent_reply_id, created_at);

create or replace function public.guard_bible_study_takeaway_reply_open()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare parent_takeaway_id uuid; parent_group_id uuid;
begin
  if exists (select 1 from public.bible_study_takeaways
    where id = new.takeaway_id and discussion_closed = true) then
    raise exception 'This Bible Study discussion has been closed.' using errcode = '23514';
  end if;
  if new.parent_reply_id is not null then
    select takeaway_id, group_id into parent_takeaway_id, parent_group_id
    from public.bible_study_takeaway_replies where id = new.parent_reply_id;
    if parent_takeaway_id is null or parent_takeaway_id <> new.takeaway_id
       or parent_group_id <> new.group_id then
      raise exception 'A reply must stay in the same Bible Study conversation.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.notify_bible_study_takeaway_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner_id uuid; parent_author uuid; parent_group_id uuid;
begin
  select takeaway.user_id, reading.group_id into owner_id, parent_group_id
  from public.bible_study_takeaways takeaway
  join public.bible_study_readings reading on reading.id = takeaway.reading_id
  where takeaway.id = new.takeaway_id;
  if new.parent_reply_id is not null then
    select user_id into parent_author from public.bible_study_takeaway_replies where id = new.parent_reply_id;
  end if;
  insert into public.notifications(user_id, notification_type, title, body, entity_table, entity_id, group_id)
  select recipient.user_id, 'bible_study_takeaway_reply'::public.notification_type,
    case when recipient.user_id = owner_id then 'New reply to your takeaway' else 'Someone replied to your comment' end,
    left(coalesce(new.content, 'A member shared a voice reply.'), 150),
    'bible_study_takeaway_replies', new.id, parent_group_id
  from (select distinct target.user_id from (values(owner_id),(parent_author)) target(user_id)
    where target.user_id is not null and target.user_id <> new.user_id) recipient
  where exists (select 1 from public.notification_preferences preference
    where preference.user_id = recipient.user_id and preference.bible_study_enabled = true)
    or not exists (select 1 from public.notification_preferences preference where preference.user_id = recipient.user_id);
  return new;
end;
$$;

commit;
