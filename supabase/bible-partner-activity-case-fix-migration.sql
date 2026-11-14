-- Run after management-cell-groups-migration.sql and bible-partner-experience-migration.sql.
-- Prevent CASE_NOT_FOUND for activity reactions and enforce accepted-partnership membership.
begin;

create or replace function public.assign_cell_group_scope()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  resolved_group uuid;
  row_data jsonb := to_jsonb(new);
  row_group text := row_data ->> 'group_id';
  parent_id uuid;
  parent_partnership_id uuid;
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) ->> 'group_id') is distinct from (to_jsonb(old) ->> 'group_id') then
      raise exception 'Group ownership cannot be changed.' using errcode = '42501';
    end if;
  end if;

  case tg_table_name
    when 'event_ideas' then select group_id into resolved_group from public.events where id = (row_data->>'event_id')::uuid;
    when 'tasks' then select group_id into resolved_group from public.events where id = (row_data->>'event_id')::uuid;
    when 'rsvps' then select group_id into resolved_group from public.events where id = (row_data->>'event_id')::uuid;
    when 'event_check_ins' then select group_id into resolved_group from public.events where id = (row_data->>'event_id')::uuid;
    when 'idea_votes' then select event.group_id into resolved_group from public.event_ideas idea join public.events event on event.id = idea.event_id where idea.id = (row_data->>'idea_id')::uuid;
    when 'prayer_point_replies' then select group_id into resolved_group from public.prayer_points where id = (row_data->>'prayer_point_id')::uuid;
    when 'prayer_reminders' then select group_id into resolved_group from public.prayer_points where id = (row_data->>'prayer_point_id')::uuid;
    when 'announcement_replies' then select group_id into resolved_group from public.announcements where id = (row_data->>'announcement_id')::uuid;
    when 'virtual_meeting_attendance' then select group_id into resolved_group from public.virtual_meetings where id = (row_data->>'meeting_id')::uuid;
    when 'discipleship_class_sessions' then select group_id into resolved_group from public.discipleship_classes where id = (row_data->>'class_id')::uuid;
    when 'discipleship_enrollments' then select group_id into resolved_group from public.discipleship_classes where id = (row_data->>'class_id')::uuid;
    when 'discipleship_lessons' then select group_id into resolved_group from public.discipleship_classes where id = (row_data->>'class_id')::uuid;
    when 'discipleship_lesson_completions' then select class_item.group_id into resolved_group from public.discipleship_lessons lesson join public.discipleship_classes class_item on class_item.id = lesson.class_id where lesson.id = (row_data->>'lesson_id')::uuid;
    when 'discipleship_member_notes' then select class_item.group_id into resolved_group from public.discipleship_lessons lesson join public.discipleship_classes class_item on class_item.id = lesson.class_id where lesson.id = (row_data->>'lesson_id')::uuid;
    when 'discipleship_discussions' then select group_id into resolved_group from public.discipleship_classes where id = (row_data->>'class_id')::uuid;
    when 'discipleship_assignment_submissions' then select class_item.group_id into resolved_group from public.discipleship_lessons lesson join public.discipleship_classes class_item on class_item.id = lesson.class_id where lesson.id = (row_data->>'lesson_id')::uuid;
    when 'discipleship_submission_history' then select group_id into resolved_group from public.discipleship_assignment_submissions where id = (row_data->>'submission_id')::uuid;
    when 'discipleship_session_attendance' then select class_item.group_id into resolved_group from public.discipleship_class_sessions session join public.discipleship_classes class_item on class_item.id = session.class_id where session.id = (row_data->>'session_id')::uuid;
    when 'bible_study_completions' then select group_id into resolved_group from public.bible_study_readings where id = (row_data->>'reading_id')::uuid;
    when 'bible_study_takeaways' then select group_id into resolved_group from public.bible_study_readings where id = (row_data->>'reading_id')::uuid;
    when 'bible_study_takeaway_replies' then select group_id into resolved_group from public.bible_study_takeaways where id = (row_data->>'takeaway_id')::uuid;
    when 'bible_study_question_answers' then select group_id into resolved_group from public.bible_study_questions where id = (row_data->>'question_id')::uuid;
    when 'bible_study_takeaway_reactions' then
      case row_data->>'content_type'
        when 'takeaway' then select group_id into resolved_group from public.bible_study_takeaways where id = (row_data->>'content_id')::uuid;
        when 'takeaway_reply' then select group_id into resolved_group from public.bible_study_takeaway_replies where id = (row_data->>'content_id')::uuid;
        when 'question' then select group_id into resolved_group from public.bible_study_questions where id = (row_data->>'content_id')::uuid;
        when 'question_answer' then select group_id into resolved_group from public.bible_study_question_answers where id = (row_data->>'content_id')::uuid;
        else resolved_group := nullif(row_group, '')::uuid;
      end case;
    when 'bible_study_mentions' then
      case row_data->>'content_type'
        when 'takeaway' then select reading.group_id into resolved_group from public.bible_study_takeaways post join public.bible_study_readings reading on reading.id = post.reading_id where post.id = (row_data->>'content_id')::uuid;
        when 'takeaway_reply' then select group_id into resolved_group from public.bible_study_takeaway_replies where id = (row_data->>'content_id')::uuid;
        when 'question' then select group_id into resolved_group from public.bible_study_questions where id = (row_data->>'content_id')::uuid;
        when 'question_answer' then select group_id into resolved_group from public.bible_study_question_answers where id = (row_data->>'content_id')::uuid;
        else resolved_group := nullif(row_group, '')::uuid;
      end case;
    when 'gc_pulse_activities' then resolved_group := nullif(row_group, '')::uuid;
    when 'gc_pulse_activity_keys' then select group_id into resolved_group from public.gc_pulse_activities where id = (row_data->>'activity_id')::uuid;
    when 'gc_pulse_activity_responses' then select group_id into resolved_group from public.gc_pulse_activities where id = (row_data->>'activity_id')::uuid;
    when 'reactions' then
      parent_id := (row_data->>'entity_id')::uuid;
      case row_data->>'entity_table'
        when 'events' then select group_id into resolved_group from public.events where id = parent_id;
        when 'announcements' then select group_id into resolved_group from public.announcements where id = parent_id;
        when 'announcement_replies' then select group_id into resolved_group from public.announcement_replies where id = parent_id;
        when 'prayer_points' then select group_id into resolved_group from public.prayer_points where id = parent_id;
        when 'prayer_point_replies' then select group_id into resolved_group from public.prayer_point_replies where id = parent_id;
        when 'event_ideas' then select group_id into resolved_group from public.event_ideas where id = parent_id;
        when 'virtual_meetings' then select group_id into resolved_group from public.virtual_meetings where id = parent_id;
        when 'messages' then select group_id into resolved_group from public.messages where id = parent_id;
        when 'leadership_assignments' then select group_id into resolved_group from public.leadership_assignments where id = parent_id;
        when 'resources' then select group_id into resolved_group from public.resources where id = parent_id;
        when 'discipleship_classes' then select group_id into resolved_group from public.discipleship_classes where id = parent_id;
        when 'discipleship_discussions' then select group_id into resolved_group from public.discipleship_discussions where id = parent_id;
        when 'gc_pulse_activities' then select group_id into resolved_group from public.gc_pulse_activities where id = parent_id;
        when 'bible_study_partner_events' then
          select partnership.group_id, activity.partnership_id into resolved_group, parent_partnership_id
          from public.bible_study_partner_events activity
          join public.bible_study_partnerships partnership on partnership.id = activity.partnership_id
          where activity.id = parent_id and partnership.status = 'active';
        when 'bible_study_partner_messages' then
          select partnership.group_id, message.partnership_id into resolved_group, parent_partnership_id
          from public.bible_study_partner_messages message
          join public.bible_study_partnerships partnership on partnership.id = message.partnership_id
          where message.id = parent_id and partnership.status = 'active';
        when 'bible_study_partner_challenges' then
          select partnership.group_id, challenge.partnership_id into resolved_group, parent_partnership_id
          from public.bible_study_partner_challenges challenge
          join public.bible_study_partnerships partnership on partnership.id = challenge.partnership_id
          where challenge.id = parent_id and partnership.status = 'active';
        when 'bible_study_partnerships' then
          select group_id, id into resolved_group, parent_partnership_id
          from public.bible_study_partnerships where id = parent_id and status = 'active';
        else
          raise exception 'This reaction target is not supported.' using errcode = '23514';
      end case;
      if parent_partnership_id is not null and not exists (
        select 1 from public.bible_study_partnership_members member
        where member.partnership_id = parent_partnership_id
          and member.user_id = auth.uid() and member.status = 'active'
      ) then
        raise exception 'Active partnership membership is required to react to this activity.' using errcode = '42501';
      end if;
      if row_data->>'entity_table' like 'bible_study_partner_%' and parent_partnership_id is null then
        raise exception 'This partnership activity is unavailable.' using errcode = '42501';
      end if;
    when 'notifications' then
      parent_id := nullif(row_data->>'entity_id', '')::uuid;
      case row_data->>'entity_table'
        when 'events' then select group_id into resolved_group from public.events where id = parent_id;
        when 'event_ideas' then select group_id into resolved_group from public.event_ideas where id = parent_id;
        when 'tasks' then select group_id into resolved_group from public.tasks where id = parent_id;
        when 'messages' then select group_id into resolved_group from public.messages where id = parent_id;
        when 'prayer_points' then select group_id into resolved_group from public.prayer_points where id = parent_id;
        when 'prayer_point_replies' then select group_id into resolved_group from public.prayer_point_replies where id = parent_id;
        when 'cell_group_members' then select cell_group_id into resolved_group from public.cell_group_members where id = parent_id;
        when 'announcements' then select group_id into resolved_group from public.announcements where id = parent_id;
        when 'announcement_replies' then select group_id into resolved_group from public.announcement_replies where id = parent_id;
        when 'resources' then select group_id into resolved_group from public.resources where id = parent_id;
        when 'leadership_assignments' then select group_id into resolved_group from public.leadership_assignments where id = parent_id;
        when 'virtual_meetings' then select group_id into resolved_group from public.virtual_meetings where id = parent_id;
        when 'virtual_meeting_attendance' then select group_id into resolved_group from public.virtual_meeting_attendance where meeting_id = parent_id limit 1;
        when 'discipleship_classes' then select group_id into resolved_group from public.discipleship_classes where id = parent_id;
        when 'discipleship_class_sessions' then select group_id into resolved_group from public.discipleship_class_sessions where id = parent_id;
        when 'discipleship_enrollments' then select group_id into resolved_group from public.discipleship_enrollments where class_id = parent_id limit 1;
        when 'discipleship_lessons' then select group_id into resolved_group from public.discipleship_lessons where id = parent_id;
        when 'discipleship_lesson_completions' then select group_id into resolved_group from public.discipleship_lesson_completions where lesson_id = parent_id limit 1;
        when 'discipleship_member_notes' then select group_id into resolved_group from public.discipleship_member_notes where id = parent_id;
        when 'discipleship_discussions' then select group_id into resolved_group from public.discipleship_discussions where id = parent_id;
        when 'discipleship_assignment_submissions' then select group_id into resolved_group from public.discipleship_assignment_submissions where id = parent_id;
        when 'discipleship_submission_history' then select group_id into resolved_group from public.discipleship_submission_history where id = parent_id;
        when 'bible_study_readings' then select group_id into resolved_group from public.bible_study_readings where id = parent_id;
        when 'bible_study_takeaway' then select reading.group_id into resolved_group from public.bible_study_takeaways post join public.bible_study_readings reading on reading.id = post.reading_id where post.id = parent_id;
        when 'bible_study_question' then select group_id into resolved_group from public.bible_study_questions where id = parent_id;
        when 'bible_study_question_answer' then select group_id into resolved_group from public.bible_study_question_answers where id = parent_id;
        when 'bible_study_takeaway_reply' then select group_id into resolved_group from public.bible_study_takeaway_replies where id = parent_id;
        when 'bible_study_daily_content' then select group_id into resolved_group from public.bible_study_daily_content where id = parent_id;
        when 'bible_study_daily_content_response' then select group_id into resolved_group from public.bible_study_daily_content_responses where id = parent_id;
        when 'bible_study_takeaways' then select group_id into resolved_group from public.bible_study_takeaways where id = parent_id;
        when 'bible_study_takeaway_replies' then select group_id into resolved_group from public.bible_study_takeaway_replies where id = parent_id;
        when 'bible_study_questions' then select group_id into resolved_group from public.bible_study_questions where id = parent_id;
        when 'bible_study_question_answers' then select group_id into resolved_group from public.bible_study_question_answers where id = parent_id;
        when 'gc_pulse_activities' then select group_id into resolved_group from public.gc_pulse_activities where id = parent_id;
        when 'bible_study_partner_streaks' then select group_id into resolved_group from public.bible_study_partner_streaks where id = parent_id;
        else resolved_group := null;
      end case;
    else resolved_group := nullif(row_group, '')::uuid;
  end case;

  if tg_table_name = 'notifications'
    and nullif(row_data->>'entity_table', '') is not null
    and resolved_group is null
    and tg_op = 'INSERT' then
    raise exception 'The notification group could not be verified.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if resolved_group is not null and resolved_group <> (row_data->>'group_id')::uuid then
      raise exception 'A record cannot be moved away from its parent group.' using errcode = '42501';
    end if;
    return new;
  end if;

  if resolved_group is null and row_group is not null then resolved_group := row_group::uuid; end if;
  if resolved_group is null then resolved_group := public.primary_cell_group_id(); end if;
  if resolved_group is null then raise exception 'A cell group is required.'; end if;
  new := jsonb_populate_record(new, jsonb_build_object('group_id', resolved_group));
  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;
