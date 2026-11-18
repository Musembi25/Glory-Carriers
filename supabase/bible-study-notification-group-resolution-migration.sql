begin;

create or replace function public.notify_bible_study_completion_to_admins()
returns trigger language plpgsql security definer set search_path = public as $$
declare reading_row public.bible_study_readings%rowtype;
begin
  select * into reading_row from public.bible_study_readings where id = new.reading_id;
  if reading_row.id is null then return new; end if;
  insert into public.notifications(user_id, notification_type, title, body, entity_table, entity_id, group_id)
  select profile.id, 'bible_study_question_posted'::public.notification_type,
    'A member completed today''s group reading',
    format('%s completed %s %s.', coalesce(profile.full_name, 'A member'), reading_row.book, reading_row.chapter),
    'bible_study_readings', reading_row.id, reading_row.group_id
  from public.profiles profile
  where profile.is_active = true and profile.id <> new.user_id
    and profile.role = 'admin'
    and coalesce((select preference.bible_study_enabled from public.notification_preferences preference where preference.user_id = profile.id), true)
    and public.user_can_access_cell_group(reading_row.group_id, profile.id);
  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;
