-- Remove illustrated-avatar fields and enable optional user-owned profile photos.
-- Before running this SQL, remove old bucket contents through Supabase Storage:
--   supabase storage rm --experimental --yes -r ss:///avatars --linked
--   supabase storage rm --experimental --yes -r ss:///member-record-photos --linked
-- The Storage API removes objects and their buckets; direct storage-table deletes are blocked.
begin;

update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
  - 'avatar_url' - 'avatar' - 'picture' - 'illustrated_avatar_id'
where raw_user_meta_data ?| array['avatar_url', 'avatar', 'picture', 'illustrated_avatar_id'];

do $$
begin
  if to_regclass('public.profiles') is not null then
    execute 'alter table public.profiles drop column if exists avatar_url, drop column if exists avatar, drop column if exists picture, drop column if exists illustrated_avatar_id';
    execute 'alter table public.profiles add column if not exists profile_photo_path text';
    if not exists (
      select 1 from pg_constraint
      where conname = 'profiles_profile_photo_path_owner_check'
        and conrelid = 'public.profiles'::regclass
    ) then
      execute $constraint$
        alter table public.profiles
          add constraint profiles_profile_photo_path_owner_check
          check (profile_photo_path is null or profile_photo_path ~ ('^' || id::text || '/[^/]+$'))
      $constraint$;
    end if;
  end if;

  if to_regclass('public.cell_group_members') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cell_group_members' and column_name = 'merged_record_data') then
      execute $sql$
        update public.cell_group_members member
        set merged_record_data = coalesce((
          select jsonb_agg(entry.value - 'avatar_storage_path' - 'avatar_removed' - 'avatar_url' - 'avatar' - 'picture' - 'illustrated_avatar_id')
          from jsonb_array_elements(coalesce(member.merged_record_data, '[]'::jsonb)) as entry(value)
        ), '[]'::jsonb)
      $sql$;
    end if;
    execute 'alter table public.cell_group_members drop column if exists avatar_storage_path, drop column if exists avatar_removed, drop column if exists avatar_url, drop column if exists avatar, drop column if exists picture, drop column if exists illustrated_avatar_id';
  end if;
end $$;

drop policy if exists "avatars_insert_own" on storage.objects;
drop policy if exists "avatars_update_own" on storage.objects;
drop policy if exists "avatars_delete_own" on storage.objects;
drop policy if exists "member_record_photos_admin_select" on storage.objects;
drop policy if exists "member_record_photos_admin_insert" on storage.objects;
drop policy if exists "member_record_photos_admin_update" on storage.objects;
drop policy if exists "member_record_photos_admin_delete" on storage.objects;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile_photos_insert_own" on storage.objects;
create policy "profile_photos_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and public.is_active_user()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_photos_update_own" on storage.objects;
create policy "profile_photos_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and public.is_active_user()
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-photos'
  and public.is_active_user()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_photos_delete_own" on storage.objects;
create policy "profile_photos_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and public.is_active_user()
  and (storage.foldername(name))[1] = auth.uid()::text
);

notify pgrst, 'reload schema';
commit;
