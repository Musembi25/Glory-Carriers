-- Glory Carriers fresh start
-- Use this only when you want to wipe the current app setup and begin again.
-- After running this file, immediately run `supabase/schema.sql`.

begin;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_updated on auth.users;

delete from auth.users;

delete from storage.objects where bucket_id = 'avatars';
delete from storage.buckets where id = 'avatars';

drop table if exists public.messages cascade;
drop table if exists public.idea_votes cascade;
drop table if exists public.event_ideas cascade;
drop table if exists public.tasks cascade;
drop table if exists public.rsvps cascade;
drop table if exists public.events cascade;
drop table if exists public.profiles cascade;

drop function if exists public.set_updated_at() cascade;
drop function if exists public.is_active_user() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.current_user_role() cascade;
drop function if exists public.current_user_is_active() cascade;
drop function if exists public.ensure_admin_exists() cascade;
drop function if exists public.backfill_profiles_from_auth() cascade;
drop function if exists public.ensure_current_user_profile() cascade;
drop function if exists public.claim_admin_if_no_active_admin() cascade;
drop function if exists public.admin_delete_user(uuid) cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.sync_auth_user() cascade;
drop function if exists public.toggle_task_completion(uuid, public.task_status) cascade;

drop type if exists public.rsvp_status cascade;
drop type if exists public.task_status cascade;
drop type if exists public.app_role cascade;

commit;
