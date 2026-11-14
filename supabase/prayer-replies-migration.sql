-- Add member encouragement replies to existing prayer requests.
-- This migration is additive and preserves the existing prayer-point visibility model.
create table if not exists public.prayer_point_replies (
  id uuid primary key default gen_random_uuid(),
  prayer_point_id uuid not null references public.prayer_points (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1200),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_prayer_point_replies_request_created
  on public.prayer_point_replies (prayer_point_id, created_at);

drop trigger if exists set_prayer_point_replies_updated_at on public.prayer_point_replies;
create trigger set_prayer_point_replies_updated_at
before update on public.prayer_point_replies
for each row execute function public.set_updated_at();

alter table public.prayer_point_replies enable row level security;

drop policy if exists "prayer_point_replies_select_active" on public.prayer_point_replies;
create policy "prayer_point_replies_select_active"
on public.prayer_point_replies
for select to authenticated
using (public.is_active_user());

drop policy if exists "prayer_point_replies_insert_self" on public.prayer_point_replies;
create policy "prayer_point_replies_insert_self"
on public.prayer_point_replies
for insert to authenticated
with check (public.is_active_user() and user_id = auth.uid());

drop policy if exists "prayer_point_replies_update_owner_or_admin" on public.prayer_point_replies;
create policy "prayer_point_replies_update_owner_or_admin"
on public.prayer_point_replies
for update to authenticated
using (public.is_active_user() and (user_id = auth.uid() or public.is_admin()))
with check (public.is_active_user() and (user_id = auth.uid() or public.is_admin()));

drop policy if exists "prayer_point_replies_delete_owner_or_admin" on public.prayer_point_replies;
create policy "prayer_point_replies_delete_owner_or_admin"
on public.prayer_point_replies
for delete to authenticated
using (public.is_active_user() and (user_id = auth.uid() or public.is_admin()));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'prayer_point_replies'
     ) then
    alter publication supabase_realtime add table public.prayer_point_replies;
  end if;
end $$;
