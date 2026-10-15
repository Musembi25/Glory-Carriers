-- Add optional audio to the existing Bible Study takeaway records.
-- This migration preserves existing text, reactions, replies, and reading history.
alter table public.bible_study_takeaways
  add column if not exists audio_path text,
  add column if not exists audio_mime_type text,
  add column if not exists audio_duration_seconds integer;

alter table public.bible_study_takeaways alter column content drop not null;
alter table public.bible_study_takeaways
  drop constraint if exists bible_study_takeaways_content_check;
alter table public.bible_study_takeaways
  add constraint bible_study_takeaways_content_check
  check (
    (content is null or char_length(trim(content)) <= 3000)
    and (nullif(trim(content), '') is not null or audio_path is not null)
  );
alter table public.bible_study_takeaways
  drop constraint if exists bible_study_takeaways_audio_duration_check;
alter table public.bible_study_takeaways
  add constraint bible_study_takeaways_audio_duration_check
  check (audio_duration_seconds is null or audio_duration_seconds between 1 and 900);

-- Audio-only takeaways still produce a useful community notification.
create or replace function public.notify_bible_study_takeaway()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, notification_type, title, body, entity_table, entity_id)
  select id,
         'bible_study_takeaway_posted'::public.notification_type,
         'New Bible Study takeaway',
         coalesce(nullif(left(trim(new.content), 150), ''), 'Shared an audio Bible Study takeaway.'),
         'bible_study_takeaways',
         new.id
  from public.profiles where is_active = true and id <> new.user_id;
  return new;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bible-study-audio',
  'bible-study-audio',
  false,
  26214400,
  array['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/aac']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "bible_audio_read_active" on storage.objects;
create policy "bible_audio_read_active" on storage.objects
for select to authenticated
using (bucket_id = 'bible-study-audio' and public.is_active_user());

drop policy if exists "bible_audio_insert_owner" on storage.objects;
create policy "bible_audio_insert_owner" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'bible-study-audio'
  and public.is_active_user()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "bible_audio_update_owner" on storage.objects;
create policy "bible_audio_update_owner" on storage.objects
for update to authenticated
using (
  bucket_id = 'bible-study-audio'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
)
with check (
  bucket_id = 'bible-study-audio'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

drop policy if exists "bible_audio_delete_owner" on storage.objects;
create policy "bible_audio_delete_owner" on storage.objects
for delete to authenticated
using (
  bucket_id = 'bible-study-audio'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);
