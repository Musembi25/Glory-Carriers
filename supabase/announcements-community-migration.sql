-- Community announcement permissions, replies, and photo support.
-- Apply to the existing Supabase project; this migration keeps all existing posts.

alter table public.announcements
  add column if not exists attachments jsonb not null default '[]'::jsonb;

create table if not exists public.announcement_replies (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_announcement_replies_post_created
  on public.announcement_replies(announcement_id, created_at);

alter table public.announcement_replies enable row level security;

drop policy if exists "announcement_replies_select_active" on public.announcement_replies;
create policy "announcement_replies_select_active"
on public.announcement_replies for select to authenticated
using (public.is_active_user());

drop policy if exists "announcement_replies_insert_active_self" on public.announcement_replies;
create policy "announcement_replies_insert_active_self"
on public.announcement_replies for insert to authenticated
with check (public.is_active_user() and user_id = auth.uid());

drop policy if exists "announcement_replies_update_owner_or_admin" on public.announcement_replies;
create policy "announcement_replies_update_owner_or_admin"
on public.announcement_replies for update to authenticated
using ((public.is_active_user() and auth.uid() = user_id) or public.is_admin())
with check ((public.is_active_user() and auth.uid() = user_id) or public.is_admin());

drop policy if exists "announcement_replies_delete_owner_or_admin" on public.announcement_replies;
create policy "announcement_replies_delete_owner_or_admin"
on public.announcement_replies for delete to authenticated
using ((public.is_active_user() and auth.uid() = user_id) or public.is_admin());

drop policy if exists "announcements_member_insert" on public.announcements;
create policy "announcements_member_insert"
on public.announcements for insert to authenticated
with check (public.is_active_user() and created_by = auth.uid());

drop policy if exists "announcements_owner_update_or_admin" on public.announcements;
create policy "announcements_owner_update_or_admin"
on public.announcements for update to authenticated
using (public.is_admin() or (public.is_active_user() and created_by = auth.uid()))
with check (public.is_admin() or (public.is_active_user() and created_by = auth.uid() and pinned = false));

drop policy if exists "announcements_owner_delete_or_admin" on public.announcements;
create policy "announcements_owner_delete_or_admin"
on public.announcements for delete to authenticated
using (public.is_admin() or (public.is_active_user() and created_by = auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('announcement-images', 'announcement-images', true, 8388608,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "announcement_images_upload_own" on storage.objects;
create policy "announcement_images_upload_own"
on storage.objects for insert to authenticated
with check (bucket_id = 'announcement-images' and (storage.foldername(name))[1] = auth.uid()::text and public.is_active_user());

drop policy if exists "announcement_images_update_own" on storage.objects;
create policy "announcement_images_update_own"
on storage.objects for update to authenticated
using (bucket_id = 'announcement-images' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'announcement-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "announcement_images_delete_own_or_admin" on storage.objects;
create policy "announcement_images_delete_own_or_admin"
on storage.objects for delete to authenticated
using (bucket_id = 'announcement-images' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

do $$ begin
  alter publication supabase_realtime add table public.announcement_replies;
exception when duplicate_object then null;
end $$;

drop trigger if exists set_announcement_replies_updated_at on public.announcement_replies;
create trigger set_announcement_replies_updated_at
before update on public.announcement_replies
for each row execute function public.set_updated_at();

do $$ begin
  alter type public.notification_type add value if not exists 'announcement_reply';
  alter type public.notification_type add value if not exists 'announcement_reaction';
end $$;

create or replace function public.notify_announcement_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author uuid;
begin
  select created_by into post_author
  from public.announcements where id = new.announcement_id;
  if post_author is not null and post_author <> new.user_id then
    insert into public.notifications(user_id, notification_type, title, body, entity_table, entity_id)
    values (post_author, 'announcement_reply', 'New reply to your announcement',
      left(new.body, 180), 'announcements', new.announcement_id);
  end if;
  return new;
end;
$$;

drop trigger if exists announcement_reply_notification on public.announcement_replies;
create trigger announcement_reply_notification
after insert on public.announcement_replies
for each row execute function public.notify_announcement_reply();

create or replace function public.notify_announcement_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author uuid;
begin
  if new.entity_table <> 'announcements' then return new; end if;
  select created_by into post_author
  from public.announcements where id = new.entity_id;
  if post_author is not null and post_author <> new.user_id then
    insert into public.notifications(user_id, notification_type, title, body, entity_table, entity_id)
    values (post_author, 'announcement_reaction', 'Someone reacted to your announcement',
      'A member reacted to your community update.', 'announcements', new.entity_id);
  end if;
  return new;
end;
$$;

drop trigger if exists announcement_reaction_notification on public.reactions;
create trigger announcement_reaction_notification
after insert on public.reactions
for each row execute function public.notify_announcement_reaction();
