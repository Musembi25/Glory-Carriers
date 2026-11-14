-- Permanently clear GC Pulse posts and group-broadcast history.
-- Fun Zone records are intentionally retained; its current gameplay uses the
-- legacy gc_pulse_activities table as a shared parent table.
begin;

delete from public.notifications
where notification_type::text in (
  'announcement_posted',
  'announcement_reply',
  'announcement_reaction'
)
or entity_table in ('announcements', 'announcement_replies')
or (
  entity_table = 'messages'
  and entity_id in (select id from public.messages where recipient_id is null)
);

delete from public.reactions
where entity_table in ('announcements', 'announcement_replies')
or (
  entity_table = 'messages'
  and entity_id in (select id from public.messages where recipient_id is null)
);

delete from public.announcement_replies;
delete from public.announcements;
delete from public.messages where recipient_id is null;

-- Group broadcasts are no longer supported; keep Messages private and direct.
alter table public.messages alter column recipient_id set not null;

-- Prevent GC Pulse content from being recreated through the client API.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('announcements', 'announcement_replies')
  loop
    execute format('drop policy if exists %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end;
$$;

drop trigger if exists on_announcement_created_notify on public.announcements;
drop trigger if exists set_announcements_updated_at on public.announcements;
drop trigger if exists announcement_reply_notification on public.announcement_replies;
drop trigger if exists set_announcement_replies_updated_at on public.announcement_replies;
drop trigger if exists announcement_reaction_notification on public.reactions;
drop function if exists public.handle_announcement_notification();
drop function if exists public.notify_announcement_reply();
drop function if exists public.notify_announcement_reaction();

alter table public.reactions
  drop constraint if exists reactions_exclude_gc_pulse,
  add constraint reactions_exclude_gc_pulse
  check (entity_table not in ('announcements', 'announcement_replies'));

commit;
