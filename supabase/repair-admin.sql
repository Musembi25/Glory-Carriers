-- Read-only inspection for a database owner before restoring or bootstrapping access.
select id, email, full_name, role, is_active, created_at
from public.profiles
order by created_at asc, id asc;

-- After reviewing and verifying the intended existing active profile, apply
-- super-admin-security-migration.sql and run this manually from the SQL editor:
-- select public.bootstrap_super_admin('VERIFIED-PROFILE-UUID'::uuid);
