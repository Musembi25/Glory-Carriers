-- Apply after management-cell-groups, bible-study, bible-study-personal and
-- bible-streak-system migrations. Personal notes are never exposed here.
begin;

create table if not exists public.bible_study_partnerships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.cell_groups(id) on delete cascade,
  name text not null default 'Bible reading partnership' check (char_length(trim(name)) between 1 and 80),
  created_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','active','declined','ended')),
  started_on date,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.bible_study_partnership_members (
  partnership_id uuid not null references public.bible_study_partnerships(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','active','declined')),
  invited_at timestamptz not null default now(), responded_at timestamptz,
  primary key (partnership_id,user_id)
);
create index if not exists bible_partner_members_user_status_idx on public.bible_study_partnership_members(user_id,status,partnership_id);
create index if not exists bible_partner_groups_group_status_idx on public.bible_study_partnerships(group_id,status,created_at desc);

-- Migrate existing pair invitations in place so their IDs and history survive.
insert into public.bible_study_partnerships(id,group_id,name,created_by,status,started_on,ended_at,created_at,updated_at)
select id,group_id,'Bible reading partnership',invited_by,status,started_on,ended_at,created_at,updated_at
from public.bible_study_partner_streaks on conflict(id) do nothing;
insert into public.bible_study_partnership_members(partnership_id,user_id,invited_by,status,invited_at,responded_at)
select streak.id,person.user_id,streak.invited_by,
  case when streak.status in ('active','ended') then 'active'
       when streak.status='declined' then 'declined'
       when person.user_id=streak.invited_by then 'active' else 'pending' end,
  streak.created_at,streak.responded_at
from public.bible_study_partner_streaks streak
cross join lateral (values(streak.member_one_id),(streak.member_two_id)) person(user_id)
on conflict(partnership_id,user_id) do nothing;

create or replace function public.bible_partner_can_view(target_partnership uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.bible_study_partnership_members m
    join public.bible_study_partnerships p on p.id=m.partnership_id
    join public.profiles profile on profile.id=auth.uid() and profile.is_active=true
    where m.partnership_id=target_partnership and m.user_id=auth.uid()
      and public.user_can_access_cell_group(p.group_id,auth.uid())
      and ((p.status in ('active','ended') and m.status='active')
        or (p.status='pending' and m.status in ('active','pending')) or p.status='declined'));
$$;
create or replace function public.bible_partner_is_active_member(target_partnership uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.bible_study_partnership_members m
    join public.bible_study_partnerships p on p.id=m.partnership_id
    join public.profiles profile on profile.id=auth.uid() and profile.is_active=true
    where m.partnership_id=target_partnership and m.user_id=auth.uid() and m.status='active' and p.status='active'
      and public.user_can_access_cell_group(p.group_id,auth.uid()));
$$;
revoke all on function public.bible_partner_can_view(uuid) from public,anon,authenticated;
revoke all on function public.bible_partner_is_active_member(uuid) from public,anon,authenticated;
grant execute on function public.bible_partner_can_view(uuid) to authenticated;
grant execute on function public.bible_partner_is_active_member(uuid) to authenticated;

alter table public.bible_study_partnerships enable row level security;
alter table public.bible_study_partnership_members enable row level security;
drop policy if exists bible_partner_group_select on public.bible_study_partnerships;
create policy bible_partner_group_select on public.bible_study_partnerships for select to authenticated using(public.bible_partner_can_view(id));
drop policy if exists bible_partner_members_select on public.bible_study_partnership_members;
create policy bible_partner_members_select on public.bible_study_partnership_members for select to authenticated using(public.bible_partner_can_view(partnership_id));
drop policy if exists bible_partner_group_cell_scope on public.bible_study_partnerships;
create policy bible_partner_group_cell_scope on public.bible_study_partnerships as restrictive for all to authenticated
  using(public.can_access_cell_group(group_id)) with check(public.can_access_cell_group(group_id));
drop policy if exists bible_partner_members_cell_scope on public.bible_study_partnership_members;
create policy bible_partner_members_cell_scope on public.bible_study_partnership_members as restrictive for all to authenticated
  using(public.bible_partner_can_view(partnership_id)) with check(public.bible_partner_can_view(partnership_id));
revoke all on public.bible_study_partnerships,public.bible_study_partnership_members from anon,authenticated;
grant select on public.bible_study_partnerships,public.bible_study_partnership_members to authenticated;

create or replace function public.create_bible_study_partnership(target_group uuid,invitees uuid[],partnership_name text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare new_id uuid; invitee uuid;
begin
  if auth.uid() is null or not public.is_active_user() or not public.can_access_cell_group(target_group) then
    raise exception 'Active group membership is required.' using errcode='42501';
  end if;
  if invitees is null or cardinality(invitees)<1 or cardinality(invitees)>9 or auth.uid()=any(invitees)
    or (select count(distinct invitee_list.user_id) from unnest(invitees) as invitee_list(user_id))<>cardinality(invitees) then
    raise exception 'Choose one to nine different partners.' using errcode='22023';
  end if;
  foreach invitee in array invitees loop
    if not public.can_receive_cell_group_message(target_group,invitee) then
      raise exception 'Every invited member must be active in this cell group.' using errcode='42501';
    end if;
  end loop;
  insert into public.bible_study_partnerships(group_id,name,created_by,status)
  values(target_group,coalesce(nullif(trim(partnership_name),''),'Bible reading partnership'),auth.uid(),'pending') returning id into new_id;
  insert into public.bible_study_partnership_members(partnership_id,user_id,invited_by,status,responded_at)
  values(new_id,auth.uid(),auth.uid(),'active',now());
  insert into public.bible_study_partnership_members(partnership_id,user_id,invited_by,status)
  select new_id,invitee_list.user_id,auth.uid(),'pending' from unnest(invitees) as invitee_list(user_id);
  insert into public.notifications(user_id,notification_type,title,body,group_id)
  select invitee_list.user_id,'bible_study_takeaway_reply'::public.notification_type,'Bible reading partnership invitation',
    left(coalesce((select full_name from public.profiles where id=auth.uid()),'A member') || ' invited you to read Scripture together.',180),
    target_group from unnest(invitees) as invitee_list(user_id);
  return new_id;
end;
$$;

create or replace function public.respond_to_bible_study_partnership(target_partnership uuid,response text)
returns public.bible_study_partnerships language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.bible_study_partnerships; target_group uuid; local_today date; app_timezone text;
begin
  if response not in ('active','declined') then raise exception 'Invalid invitation response.' using errcode='22023'; end if;
  select p.group_id into target_group from public.bible_study_partnerships p
  join public.bible_study_partnership_members m on m.partnership_id=p.id
  where p.id=target_partnership and p.status='pending' and m.user_id=auth.uid() and m.status='pending';
  if target_group is null or not public.can_access_cell_group(target_group) then raise exception 'Invitation is unavailable.' using errcode='42501'; end if;
  update public.bible_study_partnership_members set status=response,responded_at=now()
    where partnership_id=target_partnership and user_id=auth.uid() and status='pending';
  if response='declined' then
    update public.bible_study_partnerships set status='declined',updated_at=now() where id=target_partnership returning * into result;
  elsif not exists(select 1 from public.bible_study_partnership_members where partnership_id=target_partnership and status='pending') then
    select application_timezone into app_timezone from public.bible_streak_settings where id=1;
    local_today:=(now() at time zone coalesce(app_timezone,'Africa/Nairobi'))::date;
    update public.bible_study_partnerships set status='active',started_on=coalesce(
      (select min(reading_date) from public.bible_study_readings where group_id=target_group and reading_date>=local_today and status in ('scheduled','active')),
      local_today),updated_at=now() where id=target_partnership returning * into result;
    insert into public.notifications(user_id,notification_type,title,body,group_id)
    select user_id,'bible_study_takeaway_reply'::public.notification_type,'Partnership ready',
      'Everyone accepted. Your shared reading streak begins with the next scheduled reading.',
      target_group
    from public.bible_study_partnership_members where partnership_id=target_partnership and user_id<>auth.uid();
  else
    select * into result from public.bible_study_partnerships where id=target_partnership;
  end if;
  return result;
end;
$$;

create or replace function public.end_bible_study_partnership(target_partnership uuid)
returns public.bible_study_partnerships language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.bible_study_partnerships;
begin
  update public.bible_study_partnerships p set status='ended',ended_at=now(),updated_at=now()
  where p.id=target_partnership and p.status='active' and public.bible_partner_is_active_member(p.id)
  returning p.* into result;
  if result.id is null then raise exception 'Partnership is unavailable.' using errcode='42501'; end if;
  return result;
end;
$$;
revoke all on function public.create_bible_study_partnership(uuid,uuid[],text) from public,anon;
revoke all on function public.respond_to_bible_study_partnership(uuid,text) from public,anon;
revoke all on function public.end_bible_study_partnership(uuid) from public,anon;
grant execute on function public.create_bible_study_partnership(uuid,uuid[],text) to authenticated;
grant execute on function public.respond_to_bible_study_partnership(uuid,text) to authenticated;
grant execute on function public.end_bible_study_partnership(uuid) to authenticated;

-- Only aggregate completed reading data is returned, and only to members of
-- an accepted partnership. Notes and reflections remain private.
create or replace function public.bible_partner_member_summary(target_partnership uuid,target_member uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  settings_row public.bible_streak_settings%rowtype;
  today_date date; first_date date; week_start date; month_start date;
  completed_total integer; current_days integer:=0; longest_days integer:=0; result jsonb;
begin
  if not public.bible_partner_is_active_member(target_partnership)
    or not exists(select 1 from public.bible_study_partnership_members m
      join public.bible_study_partnerships p on p.id=m.partnership_id
      join public.profiles profile on profile.id=target_member and profile.is_active=true
      where m.partnership_id=target_partnership and m.user_id=target_member and m.status='active' and p.status='active'
        and public.user_can_access_cell_group(p.group_id,target_member)
        and public.user_can_access_cell_group(p.group_id,auth.uid())) then
    raise exception 'Reading history is available to active partnership members only.' using errcode='42501';
  end if;
  select * into settings_row from public.bible_streak_settings where id=1;
  today_date:=(now() at time zone coalesce(settings_row.application_timezone,'Africa/Nairobi'))::date;
  select coalesce(min(activity_date),today_date) into first_date from (
    select (completed_at at time zone coalesce(settings_row.application_timezone,'Africa/Nairobi'))::date as activity_date
      from public.personal_bible_study_readings where user_id=target_member and status='completed' and completed_at is not null
    union all
    select reading_date from public.personal_bible_study_readings where user_id=target_member
  ) activity_dates;
  select count(*)::integer into completed_total from public.personal_bible_study_readings
    where user_id=target_member and status='completed' and completed_at is not null;
  select coalesce(max(run_days) filter(where last_day=today_date),max(run_days) filter(where last_day=today_date-1),0)::integer
    into current_days from (
      with days as (select local_date as day,(qualified or protected) as counts
        from public.bible_streak_calendar_rows(target_member,coalesce(settings_row.application_timezone,'Africa/Nairobi'),
          coalesce(settings_row.daily_requirement,'at_least_one'),first_date,today_date)),
      numbered as (select day,day-row_number() over(order by day)::integer as run_key from days where counts)
      select min(day) as first_day,max(day) as last_day,count(*)::integer as run_days from numbered group by run_key
    ) runs;
  select coalesce(max(run_days),0)::integer into longest_days from (
    with days as (select local_date as day,(qualified or protected) as counts
      from public.bible_streak_calendar_rows(target_member,coalesce(settings_row.application_timezone,'Africa/Nairobi'),
        coalesce(settings_row.daily_requirement,'at_least_one'),first_date,today_date)),
    numbered as (select day,day-row_number() over(order by day)::integer as run_key from days where counts)
    select count(*)::integer as run_days from numbered group by run_key
  ) runs;
  week_start:=date_trunc('week',today_date::timestamp)::date;
  month_start:=date_trunc('month',today_date::timestamp)::date;
  select jsonb_build_object(
    'user_id',target_member,'timezone',coalesce(settings_row.application_timezone,'Africa/Nairobi'),
    'current_streak',current_days,'longest_streak',longest_days,'completed_chapters',completed_total,
    'today_complete',public.bible_streak_day_qualifies(target_member,today_date),
    'weekly_completed',(select count(*) from public.bible_streak_calendar_rows(target_member,coalesce(settings_row.application_timezone,'Africa/Nairobi'),coalesce(settings_row.daily_requirement,'at_least_one'),week_start,today_date) where qualified),
    'weekly_elapsed',today_date-week_start+1,
    'monthly_completed',(select count(*) from public.bible_streak_calendar_rows(target_member,coalesce(settings_row.application_timezone,'Africa/Nairobi'),coalesce(settings_row.daily_requirement,'at_least_one'),month_start,today_date) where qualified),
    'monthly_elapsed',today_date-month_start+1,
    'calendar',(select coalesce(jsonb_agg(jsonb_build_object('date',local_date,'status',day_state,'completed_count',completed_count,'assigned_count',assigned_count) order by local_date),'[]'::jsonb)
      from public.bible_streak_calendar_rows(target_member,coalesce(settings_row.application_timezone,'Africa/Nairobi'),coalesce(settings_row.daily_requirement,'at_least_one'),first_date,today_date+31))
  ) into result;
  return result;
end;
$$;
revoke all on function public.bible_partner_member_summary(uuid,uuid) from public,anon;
grant execute on function public.bible_partner_member_summary(uuid,uuid) to authenticated;

create table if not exists public.bible_study_partner_events (
  id uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references public.bible_study_partnerships(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check(event_type in ('group_reading_completed','personal_reading_completed','shared_day_completed','encouragement_sent','milestone_reached','challenge_completed')),
  reading_id uuid references public.bible_study_readings(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists bible_partner_events_feed_idx on public.bible_study_partner_events(partnership_id,created_at desc);
alter table public.bible_study_partner_events enable row level security;
drop policy if exists bible_partner_events_select on public.bible_study_partner_events;
create policy bible_partner_events_select on public.bible_study_partner_events for select to authenticated
  using(public.bible_partner_can_view(partnership_id));
revoke all on public.bible_study_partner_events from anon,authenticated;
grant select on public.bible_study_partner_events to authenticated;

create table if not exists public.bible_study_partner_event_reactions (
  event_id uuid not null references public.bible_study_partner_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check(reaction in ('love','celebrate','pray','encourage','clap')),
  created_at timestamptz not null default now(), primary key(event_id,user_id,reaction)
);
alter table public.bible_study_partner_event_reactions enable row level security;
drop policy if exists bible_partner_event_reactions_select on public.bible_study_partner_event_reactions;
drop policy if exists bible_partner_event_reactions_insert on public.bible_study_partner_event_reactions;
drop policy if exists bible_partner_event_reactions_delete on public.bible_study_partner_event_reactions;
create policy bible_partner_event_reactions_select on public.bible_study_partner_event_reactions for select to authenticated
  using(exists(select 1 from public.bible_study_partner_events e where e.id=event_id and public.bible_partner_can_view(e.partnership_id)));
create policy bible_partner_event_reactions_insert on public.bible_study_partner_event_reactions for insert to authenticated
  with check(user_id=auth.uid() and exists(select 1 from public.bible_study_partner_events e where e.id=event_id and public.bible_partner_is_active_member(e.partnership_id)));
create policy bible_partner_event_reactions_delete on public.bible_study_partner_event_reactions for delete to authenticated using(user_id=auth.uid());
revoke all on public.bible_study_partner_event_reactions from anon,authenticated;
grant select,insert,delete on public.bible_study_partner_event_reactions to authenticated;

create table if not exists public.bible_study_partner_messages (
  id uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references public.bible_study_partnerships(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check(char_length(trim(content)) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists bible_partner_messages_feed_idx on public.bible_study_partner_messages(partnership_id,created_at desc);
alter table public.bible_study_partner_messages enable row level security;
drop policy if exists bible_partner_messages_select on public.bible_study_partner_messages;
drop policy if exists bible_partner_messages_insert on public.bible_study_partner_messages;
create policy bible_partner_messages_select on public.bible_study_partner_messages for select to authenticated using(public.bible_partner_can_view(partnership_id));
create policy bible_partner_messages_insert on public.bible_study_partner_messages for insert to authenticated
  with check(user_id=auth.uid() and public.bible_partner_is_active_member(partnership_id));
revoke all on public.bible_study_partner_messages from anon,authenticated;
grant select,insert on public.bible_study_partner_messages to authenticated;

create table if not exists public.bible_study_partner_message_reactions (
  message_id uuid not null references public.bible_study_partner_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check(reaction in ('love','celebrate','pray','encourage','clap')),
  created_at timestamptz not null default now(), primary key(message_id,user_id,reaction)
);
alter table public.bible_study_partner_message_reactions enable row level security;
drop policy if exists bible_partner_message_reactions_select on public.bible_study_partner_message_reactions;
drop policy if exists bible_partner_message_reactions_insert on public.bible_study_partner_message_reactions;
drop policy if exists bible_partner_message_reactions_delete on public.bible_study_partner_message_reactions;
create policy bible_partner_message_reactions_select on public.bible_study_partner_message_reactions for select to authenticated
  using(exists(select 1 from public.bible_study_partner_messages m where m.id=message_id and public.bible_partner_can_view(m.partnership_id)));
create policy bible_partner_message_reactions_insert on public.bible_study_partner_message_reactions for insert to authenticated
  with check(user_id=auth.uid() and exists(select 1 from public.bible_study_partner_messages m where m.id=message_id and public.bible_partner_is_active_member(m.partnership_id)));
create policy bible_partner_message_reactions_delete on public.bible_study_partner_message_reactions for delete to authenticated using(user_id=auth.uid());
revoke all on public.bible_study_partner_message_reactions from anon,authenticated;
grant select,insert,delete on public.bible_study_partner_message_reactions to authenticated;

create table if not exists public.bible_study_partner_challenges (
  id uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references public.bible_study_partnerships(id) on delete cascade,
  title text not null check(char_length(trim(title)) between 3 and 100),
  duration_days smallint not null check(duration_days between 3 and 365),
  starts_on date not null, ends_on date not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check(status in ('active','completed','ended')),
  created_at timestamptz not null default now(), check(ends_on>=starts_on)
);
create index if not exists bible_partner_challenges_group_idx on public.bible_study_partner_challenges(partnership_id,created_at desc);
create table if not exists public.bible_study_partner_challenge_members (
  challenge_id uuid not null references public.bible_study_partner_challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key(challenge_id,user_id)
);
alter table public.bible_study_partner_challenges enable row level security;
alter table public.bible_study_partner_challenge_members enable row level security;
drop policy if exists bible_partner_challenges_select on public.bible_study_partner_challenges;
drop policy if exists bible_partner_challenges_scope on public.bible_study_partner_challenges;
create policy bible_partner_challenges_select on public.bible_study_partner_challenges for select to authenticated
  using(public.bible_partner_can_view(partnership_id));
create policy bible_partner_challenges_scope on public.bible_study_partner_challenges as restrictive for all to authenticated
  using(public.bible_partner_can_view(partnership_id)) with check(public.bible_partner_is_active_member(partnership_id));
drop policy if exists bible_partner_challenge_members_select on public.bible_study_partner_challenge_members;
drop policy if exists bible_partner_challenge_members_scope on public.bible_study_partner_challenge_members;
create policy bible_partner_challenge_members_select on public.bible_study_partner_challenge_members for select to authenticated
  using(exists(select 1 from public.bible_study_partner_challenges c where c.id=challenge_id and public.bible_partner_can_view(c.partnership_id)));
create policy bible_partner_challenge_members_scope on public.bible_study_partner_challenge_members as restrictive for all to authenticated
  using(exists(select 1 from public.bible_study_partner_challenges c where c.id=challenge_id and public.bible_partner_can_view(c.partnership_id)))
  with check(exists(select 1 from public.bible_study_partner_challenges c where c.id=challenge_id and public.bible_partner_can_view(c.partnership_id)));
revoke all on public.bible_study_partner_challenges,public.bible_study_partner_challenge_members from anon,authenticated;
grant select on public.bible_study_partner_challenges,public.bible_study_partner_challenge_members to authenticated;

create or replace function public.create_bible_partner_challenge(target_partnership uuid,challenge_title text,challenge_days integer)
returns public.bible_study_partner_challenges language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.bible_study_partner_challenges; local_today date; app_timezone text;
begin
  if not public.bible_partner_is_active_member(target_partnership) then raise exception 'Active partnership membership is required.' using errcode='42501'; end if;
  if char_length(trim(challenge_title)) not between 3 and 100 or challenge_days not between 3 and 365 then
    raise exception 'Choose a title and a duration from 3 to 365 days.' using errcode='22023';
  end if;
  select application_timezone into app_timezone from public.bible_streak_settings where id=1;
  local_today:=(now() at time zone coalesce(app_timezone,'Africa/Nairobi'))::date;
  insert into public.bible_study_partner_challenges(partnership_id,title,duration_days,starts_on,ends_on,created_by)
  values(target_partnership,trim(challenge_title),challenge_days,local_today,local_today+challenge_days-1,auth.uid()) returning * into result;
  insert into public.bible_study_partner_challenge_members(challenge_id,user_id)
    select result.id,user_id from public.bible_study_partnership_members where partnership_id=target_partnership and status='active';
  return result;
end;
$$;
create or replace function public.end_bible_partner_challenge(target_challenge uuid)
returns public.bible_study_partner_challenges language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.bible_study_partner_challenges;
begin
  update public.bible_study_partner_challenges c set status='ended'
    where c.id=target_challenge and c.status='active' and public.bible_partner_is_active_member(c.partnership_id)
    returning c.* into result;
  if result.id is null then raise exception 'Challenge is unavailable.' using errcode='42501'; end if;
  return result;
end;
$$;
revoke all on function public.create_bible_partner_challenge(uuid,text,integer) from public,anon;
revoke all on function public.end_bible_partner_challenge(uuid) from public,anon;
grant execute on function public.create_bible_partner_challenge(uuid,text,integer) to authenticated;
grant execute on function public.end_bible_partner_challenge(uuid) to authenticated;

create or replace function public.notify_bible_partner_message()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare partner_group uuid; sender_name text;
begin
  select group_id into partner_group from public.bible_study_partnerships where id=new.partnership_id;
  select full_name into sender_name from public.profiles where id=new.user_id;
  insert into public.bible_study_partner_events(partnership_id,actor_id,event_type,metadata)
  values(new.partnership_id,new.user_id,'encouragement_sent',jsonb_build_object('message_id',new.id));
  insert into public.notifications(user_id,notification_type,title,body,group_id)
  select m.user_id,'bible_study_takeaway_reply'::public.notification_type,'Partner encouragement',
    left(coalesce(sender_name,'A partner') || ': ' || new.content,180),partner_group
  from public.bible_study_partnership_members m
  where m.partnership_id=new.partnership_id and m.user_id<>new.user_id and m.status='active';
  return new;
end;
$$;
drop trigger if exists bible_partner_message_notify on public.bible_study_partner_messages;
create trigger bible_partner_message_notify after insert on public.bible_study_partner_messages
  for each row execute function public.notify_bible_partner_message();

create unique index if not exists bible_partner_milestone_once_idx
  on public.bible_study_partner_events(partnership_id,(metadata->>'milestone'))
  where event_type='milestone_reached';
create unique index if not exists bible_partner_shared_day_once_idx
  on public.bible_study_partner_events(partnership_id,(metadata->>'reading_date'))
  where event_type='shared_day_completed';
create unique index if not exists bible_partner_challenge_complete_once_idx
  on public.bible_study_partner_events(partnership_id,(metadata->>'challenge_id'))
  where event_type='challenge_completed';

create or replace function public.maybe_log_bible_partner_shared_milestone(
  target_partnership uuid,target_date date,target_actor uuid,target_reading uuid
)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  partnership public.bible_study_partnerships%rowtype;
  reading_dates record;
  all_readings_done boolean;
  streak_days integer:=0;
  goal integer;
  event_id uuid;
begin
  select * into partnership from public.bible_study_partnerships where id=target_partnership and status='active';
  if partnership.id is null then return; end if;
  select not exists(
    select 1 from public.bible_study_readings reading
    where reading.group_id=partnership.group_id and reading.reading_date=target_date
      and reading.status in ('scheduled','active')
      and exists(select 1 from public.bible_study_partnership_members member
        where member.partnership_id=target_partnership and member.status='active'
          and not exists(select 1 from public.bible_study_completions completion
            where completion.reading_id=reading.id and completion.user_id=member.user_id))
  ) into all_readings_done;
  if all_readings_done then
    insert into public.bible_study_partner_events(partnership_id,actor_id,event_type,reading_id,metadata)
    values(target_partnership,target_actor,'shared_day_completed',target_reading,jsonb_build_object('reading_date',target_date))
    on conflict do nothing returning id into event_id;
    if event_id is not null then
      insert into public.notifications(user_id,notification_type,title,body,group_id)
      select member.user_id,'bible_study_takeaway_reply'::public.notification_type,'Everyone completed today’s reading',
        'Your whole partnership showed up for the shared reading today. Keep growing together.',partnership.group_id
      from public.bible_study_partnership_members member
      where member.partnership_id=target_partnership and member.status='active';
    end if;
  end if;
  for reading_dates in
    select distinct reading_date as day from public.bible_study_readings
    where group_id=partnership.group_id and reading_date>=coalesce(partnership.started_on,target_date)
      and reading_date<=target_date and status in ('scheduled','active')
    order by reading_date desc
  loop
    select not exists(
      select 1 from public.bible_study_readings reading
      where reading.group_id=partnership.group_id and reading.reading_date=reading_dates.day
        and reading.status in ('scheduled','active')
        and exists(select 1 from public.bible_study_partnership_members member
          where member.partnership_id=target_partnership and member.status='active'
            and not exists(select 1 from public.bible_study_completions completion
              where completion.reading_id=reading.id and completion.user_id=member.user_id))
    ) into all_readings_done;
    if not all_readings_done then exit; end if;
    streak_days:=streak_days+1;
  end loop;
  if streak_days not in (3,7,14,30,50,100) then return; end if;
  goal:=streak_days;
  insert into public.bible_study_partner_events(partnership_id,actor_id,event_type,reading_id,metadata)
    values(target_partnership,target_actor,'milestone_reached',target_reading,jsonb_build_object('milestone',goal))
    on conflict do nothing returning id into event_id;
  if event_id is not null then
    insert into public.notifications(user_id,notification_type,title,body,group_id)
    select member.user_id,'bible_study_takeaway_reply'::public.notification_type,'Shared reading milestone',
      'Your partnership completed '||goal||' scheduled reading days together. Keep growing in the Word.',
      partnership.group_id
    from public.bible_study_partnership_members member
    where member.partnership_id=target_partnership and member.status='active';
  end if;
end;
$$;

create or replace function public.log_bible_partner_group_completion()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare target_reading public.bible_study_readings%rowtype; relation record; member_id uuid; created_event_id uuid;
begin
  select * into target_reading from public.bible_study_readings where id=new.reading_id;
  for relation in
    select p.id,p.group_id from public.bible_study_partnerships p
    join public.bible_study_partnership_members m on m.partnership_id=p.id and m.user_id=new.user_id and m.status='active'
    where p.status='active' and p.group_id=target_reading.group_id
  loop
    insert into public.bible_study_partner_events(partnership_id,actor_id,event_type,reading_id,metadata)
    values(relation.id,new.user_id,'group_reading_completed',new.reading_id,jsonb_build_object('reading_date',target_reading.reading_date))
    returning id into created_event_id;
    for member_id in select user_id from public.bible_study_partnership_members
      where partnership_id=relation.id and user_id<>new.user_id and status='active' loop
      insert into public.notifications(user_id,notification_type,title,body,group_id)
      values(member_id,'bible_study_takeaway_reply'::public.notification_type,'Partner completed today’s reading',
        coalesce((select full_name from public.profiles where id=new.user_id),'Your partner') || ' completed a shared Bible reading.',
        relation.group_id);
    end loop;
    perform public.maybe_log_bible_partner_shared_milestone(relation.id,target_reading.reading_date,new.user_id,new.reading_id);
  end loop;
  return new;
end;
$$;
drop trigger if exists bible_partner_group_completion_event on public.bible_study_completions;
create trigger bible_partner_group_completion_event after insert on public.bible_study_completions
  for each row execute function public.log_bible_partner_group_completion();

create or replace function public.log_bible_partner_personal_completion()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare relation record; member_id uuid; local_day date; created_event_id uuid;
begin
  if new.status<>'completed' or new.completed_at is null or (tg_op='UPDATE' and old.status='completed') then return new; end if;
  select (new.completed_at at time zone coalesce(application_timezone,'Africa/Nairobi'))::date into local_day
    from public.bible_streak_settings where id=1;
  local_day:=coalesce(local_day,(new.completed_at at time zone 'Africa/Nairobi')::date);
  for relation in
    select p.id,p.group_id from public.bible_study_partnerships p
    join public.bible_study_partnership_members m on m.partnership_id=p.id and m.user_id=new.user_id and m.status='active'
    where p.status='active'
  loop
    insert into public.bible_study_partner_events(partnership_id,actor_id,event_type,metadata)
    values(relation.id,new.user_id,'personal_reading_completed',jsonb_build_object('local_date',local_day))
    returning id into created_event_id;
    for member_id in select user_id from public.bible_study_partnership_members
      where partnership_id=relation.id and user_id<>new.user_id and status='active' loop
      insert into public.notifications(user_id,notification_type,title,body,group_id)
      values(member_id,'bible_study_takeaway_reply'::public.notification_type,'Partner completed a Bible reading',
        coalesce((select full_name from public.profiles where id=new.user_id),'Your partner') || ' completed a personal Bible reading.',
        relation.group_id);
    end loop;
  end loop;
  return new;
end;
$$;
drop trigger if exists bible_partner_personal_completion_event on public.personal_bible_study_readings;
create trigger bible_partner_personal_completion_event after insert or update on public.personal_bible_study_readings
  for each row execute function public.log_bible_partner_personal_completion();

create or replace function public.complete_bible_partner_challenges()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare challenge record; event_id uuid; member_id uuid;
begin
  if new.status<>'completed' or new.completed_at is null or (tg_op='UPDATE' and old.status='completed') then return new; end if;
  for challenge in
    select c.id,c.partnership_id,c.title,p.group_id from public.bible_study_partner_challenges c
    join public.bible_study_partnerships p on p.id=c.partnership_id
    where c.status='active' and (now() at time zone coalesce((select application_timezone from public.bible_streak_settings where id=1),'Africa/Nairobi'))::date between c.starts_on and c.ends_on
      and exists(select 1 from public.bible_study_partner_challenge_members m where m.challenge_id=c.id and m.user_id=new.user_id)
      and not exists(
        select 1 from public.bible_study_partner_challenge_members m
        where m.challenge_id=c.id and (
          select count(distinct (reading.completed_at at time zone coalesce((select application_timezone from public.bible_streak_settings where id=1),'Africa/Nairobi'))::date)
          from public.personal_bible_study_readings reading where reading.user_id=m.user_id and reading.status='completed'
            and reading.completed_at is not null
            and (reading.completed_at at time zone coalesce((select application_timezone from public.bible_streak_settings where id=1),'Africa/Nairobi'))::date between c.starts_on and c.ends_on
        ) < c.duration_days
      )
  loop
    update public.bible_study_partner_challenges set status='completed' where id=challenge.id and status='active';
    insert into public.bible_study_partner_events(partnership_id,actor_id,event_type,metadata)
      values(challenge.partnership_id,new.user_id,'challenge_completed',jsonb_build_object('challenge_id',challenge.id,'title',challenge.title))
      on conflict do nothing returning id into event_id;
    if event_id is not null then
      for member_id in select user_id from public.bible_study_partnership_members
        where partnership_id=challenge.partnership_id and status='active' loop
        insert into public.notifications(user_id,notification_type,title,body,group_id)
        values(member_id,'bible_study_takeaway_reply'::public.notification_type,'Shared challenge completed',
          'Your partnership completed “'||challenge.title||'”. Celebrate this faithful rhythm.',
          challenge.group_id);
      end loop;
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists bible_partner_challenge_completion on public.personal_bible_study_readings;
create trigger bible_partner_challenge_completion after insert or update on public.personal_bible_study_readings
  for each row execute function public.complete_bible_partner_challenges();

do $$
declare target_table text;
begin
  foreach target_table in array array['bible_study_partnerships','bible_study_partnership_members','bible_study_partner_events','bible_study_partner_event_reactions','bible_study_partner_messages','bible_study_partner_message_reactions','bible_study_partner_challenges','bible_study_partner_challenge_members'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=target_table) then
      execute format('alter publication supabase_realtime add table public.%I',target_table);
    end if;
  end loop;
end;
$$;

notify pgrst,'reload schema';
commit;
