-- Apply as a standalone migration and commit before applying
-- pre-membership-records-migration.sql. PostgreSQL requires newly-added enum
-- labels to be committed before they are used by defaults or functions.
alter type public.membership_status add value if not exists 'prospective';
alter type public.membership_status add value if not exists 'pending';
alter type public.membership_status add value if not exists 'inactive';

-- Refresh PostgREST's view of the membership enum after this migration commits.
notify pgrst, 'reload schema';
