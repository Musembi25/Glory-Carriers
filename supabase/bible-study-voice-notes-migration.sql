-- Extend the existing Bible Study conversations with private voice-note metadata.
-- Requires bible-study-migration.sql and bible-study-audio-migration.sql.
alter table public.bible_study_takeaway_replies
  add column if not exists audio_path text,
  add column if not exists audio_mime_type text,
  add column if not exists audio_duration_seconds integer;
alter table public.bible_study_questions
  add column if not exists audio_path text,
  add column if not exists audio_mime_type text,
  add column if not exists audio_duration_seconds integer;
alter table public.bible_study_question_answers
  add column if not exists audio_path text,
  add column if not exists audio_mime_type text,
  add column if not exists audio_duration_seconds integer;

alter table public.bible_study_takeaway_replies alter column content drop not null;
alter table public.bible_study_takeaway_replies drop constraint if exists bible_study_takeaway_replies_content_check;
alter table public.bible_study_takeaway_replies add constraint bible_study_takeaway_replies_content_check
  check (
    (content is null or char_length(trim(content)) between 1 and 2000)
    and (nullif(trim(content), '') is not null or audio_path is not null)
    and (audio_path is null or (left(audio_path, length(user_id::text) + 1) = user_id::text || '/' and position('..' in audio_path) = 0 and audio_mime_type is not null))
    and (audio_mime_type is null or audio_mime_type in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/aac'))
    and (audio_duration_seconds is null or audio_duration_seconds between 1 and 900)
  );

alter table public.bible_study_questions alter column content drop not null;
alter table public.bible_study_questions drop constraint if exists bible_study_questions_content_check;
alter table public.bible_study_questions add constraint bible_study_questions_content_check
  check (
    (content is null or char_length(trim(content)) between 1 and 3000)
    and (nullif(trim(content), '') is not null or audio_path is not null)
    and (audio_path is null or (left(audio_path, length(user_id::text) + 1) = user_id::text || '/' and position('..' in audio_path) = 0 and audio_mime_type is not null))
    and (audio_mime_type is null or audio_mime_type in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/aac'))
    and (audio_duration_seconds is null or audio_duration_seconds between 1 and 900)
  );

alter table public.bible_study_question_answers alter column content drop not null;
alter table public.bible_study_question_answers drop constraint if exists bible_study_question_answers_content_check;
alter table public.bible_study_question_answers add constraint bible_study_question_answers_content_check
  check (
    (content is null or char_length(trim(content)) between 1 and 3000)
    and (nullif(trim(content), '') is not null or audio_path is not null)
    and (audio_path is null or (left(audio_path, length(user_id::text) + 1) = user_id::text || '/' and position('..' in audio_path) = 0 and audio_mime_type is not null))
    and (audio_mime_type is null or audio_mime_type in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/aac'))
    and (audio_duration_seconds is null or audio_duration_seconds between 1 and 900)
  );

-- Keep existing notification delivery working for audio-only posts and replies.
create or replace function public.notify_bible_study_takeaway_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare takeaway_author uuid;
begin
  select user_id into takeaway_author from public.bible_study_takeaways where id = new.takeaway_id;
  if takeaway_author is not null and takeaway_author <> new.user_id then
    perform public.create_notification(
      takeaway_author,
      'bible_study_takeaway_reply'::public.notification_type,
      'New reply to your takeaway',
      coalesce(nullif(left(trim(new.content), 150), ''), 'Shared a voice reply in Bible Study.'),
      'bible_study_takeaway_replies',
      new.id
    );
  end if;
  return new;
end;
$$;

create or replace function public.notify_bible_study_question()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, notification_type, title, body, entity_table, entity_id)
  select id,
         'bible_study_question_posted'::public.notification_type,
         'New Bible Study question',
         coalesce(nullif(left(trim(new.content), 150), ''), 'Shared a voice note in Bible Study.'),
         'bible_study_questions',
         new.id
  from public.profiles where is_active = true and id <> new.user_id;
  return new;
end;
$$;

create or replace function public.notify_bible_study_question_answer()
returns trigger language plpgsql security definer set search_path = public as $$
declare question_author uuid;
begin
  select user_id into question_author from public.bible_study_questions where id = new.question_id;
  if question_author is not null and question_author <> new.user_id then
    perform public.create_notification(
      question_author,
      'bible_study_question_answer'::public.notification_type,
      'Your Bible Study question was answered',
      coalesce(nullif(left(trim(new.content), 150), ''), 'Shared a voice reply in Bible Study.'),
      'bible_study_question_answers',
      new.id
    );
  end if;
  return new;
end;
$$;
