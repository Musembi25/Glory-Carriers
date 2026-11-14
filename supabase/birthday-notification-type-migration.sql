-- Run once, then commit the enum addition before running
-- member-birthday-management-migration.sql.
alter type public.notification_type
  add value if not exists 'birthday_reminder';
