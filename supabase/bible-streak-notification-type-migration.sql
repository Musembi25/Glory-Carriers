-- Run this file by itself and commit it before bible-streak-system-migration.sql.
alter type public.notification_type
  add value if not exists 'bible_study_reminder';
