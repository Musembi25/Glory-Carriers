-- Run this in the Supabase SQL editor if your project already has users
-- and no one is showing up with admin access.

-- If no admin exists yet, this promotes the earliest active profile.
select public.ensure_admin_exists();

-- If you are signed in and still need to make your current account the admin
-- because there is no active admin, run this from the SQL editor while logged in
-- through the app flow by using the app itself after rerunning the schema.
-- The app now calls `claim_admin_if_no_active_admin()` automatically on sign-in.

-- If you want to promote a specific account manually, uncomment and edit:
-- update public.profiles
-- set role = 'admin', is_active = true
-- where email = 'you@example.com';
