-- Run after bible-partner-experience-migration.sql.
-- Serialize starts for an identical partnership challenge and reject duplicates.
begin;

create or replace function public.create_bible_partner_challenge(target_partnership uuid,challenge_title text,challenge_days integer)
returns public.bible_study_partner_challenges language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.bible_study_partner_challenges; local_today date; app_timezone text; challenge_key text;
begin
  if auth.uid() is null then raise exception 'Sign in to start a challenge.' using errcode='42501'; end if;
  if not public.bible_partner_is_active_member(target_partnership) then raise exception 'Active partnership membership is required.' using errcode='42501'; end if;
  if challenge_title is null or char_length(trim(challenge_title)) not between 3 and 100
    or challenge_days is null or challenge_days not between 3 and 365 then
    raise exception 'Choose a title and a duration from 3 to 365 days.' using errcode='22023';
  end if;
  select application_timezone into app_timezone from public.bible_streak_settings where id=1;
  local_today:=(now() at time zone coalesce(app_timezone,'Africa/Nairobi'))::date;
  challenge_key:=target_partnership::text||':'||lower(trim(challenge_title))||':'||challenge_days::text;
  perform pg_advisory_xact_lock(hashtextextended(challenge_key,0));
  select * into result from public.bible_study_partner_challenges c
    where c.partnership_id=target_partnership and lower(trim(c.title))=lower(trim(challenge_title))
      and c.duration_days=challenge_days and c.status='active' and c.ends_on>=local_today
    order by c.created_at desc limit 1;
  if found then
    raise exception 'An active challenge with this name and duration already exists for your partnership.' using errcode='23505';
  end if;
  insert into public.bible_study_partner_challenges(partnership_id,title,duration_days,starts_on,ends_on,created_by)
  values(target_partnership,trim(challenge_title),challenge_days,local_today,local_today+challenge_days-1,auth.uid()) returning * into result;
  insert into public.bible_study_partner_challenge_members(challenge_id,user_id)
    select result.id,user_id from public.bible_study_partnership_members where partnership_id=target_partnership and status='active';
  return result;
end;
$$;

revoke all on function public.create_bible_partner_challenge(uuid,text,integer) from public,anon;
grant execute on function public.create_bible_partner_challenge(uuid,text,integer) to authenticated;

drop policy if exists bible_partner_events_delete on public.bible_study_partner_events;
create policy bible_partner_events_delete on public.bible_study_partner_events for delete to authenticated
  using(actor_id=auth.uid());
grant delete on public.bible_study_partner_events to authenticated;

create or replace function public.delete_bible_partner_challenge(target_challenge uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare challenge_row public.bible_study_partner_challenges%rowtype; local_today date; app_timezone text;
begin
  if auth.uid() is null then raise exception 'Sign in to manage challenges.' using errcode='42501'; end if;
  select * into challenge_row from public.bible_study_partner_challenges where id=target_challenge;
  if not found then raise exception 'Challenge not found.' using errcode='P0002'; end if;
  if challenge_row.created_by <> auth.uid() then raise exception 'Only the challenge creator can delete it.' using errcode='42501'; end if;
  select application_timezone into app_timezone from public.bible_streak_settings where id=1;
  local_today:=(now() at time zone coalesce(app_timezone,'Africa/Nairobi'))::date;
  if challenge_row.status='active' and challenge_row.ends_on>=local_today then
    raise exception 'Active challenges cannot be deleted. Close the challenge first.' using errcode='22023';
  end if;
  if not public.bible_partner_is_active_member(challenge_row.partnership_id) then
    raise exception 'Active partnership membership is required.' using errcode='42501';
  end if;
  delete from public.bible_study_partner_challenges where id=challenge_row.id;
  return true;
end;
$$;

revoke all on function public.delete_bible_partner_challenge(uuid) from public,anon;
grant execute on function public.delete_bible_partner_challenge(uuid) to authenticated;

create or replace function public.delete_bible_partner_message(target_message uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare message_row public.bible_study_partner_messages%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in to manage encouragement.' using errcode='42501'; end if;
  select * into message_row from public.bible_study_partner_messages where id=target_message for update;
  if not found then raise exception 'Encouragement not found.' using errcode='P0002'; end if;
  if message_row.user_id <> auth.uid() then raise exception 'Only the author can delete this encouragement.' using errcode='42501'; end if;
  delete from public.bible_study_partner_events
    where actor_id=auth.uid() and event_type='encouragement_sent'
      and metadata->>'message_id'=message_row.id::text;
  delete from public.bible_study_partner_messages where id=message_row.id;
  return true;
end;
$$;

revoke all on function public.delete_bible_partner_message(uuid) from public,anon;
grant execute on function public.delete_bible_partner_message(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
