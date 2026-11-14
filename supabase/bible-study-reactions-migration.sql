begin;

alter table public.bible_study_takeaway_reactions
  add column if not exists content_type text,
  add column if not exists content_id uuid;

alter table public.bible_study_takeaway_reactions
  alter column takeaway_id drop not null;

alter table public.bible_study_takeaway_reactions
  drop constraint if exists bible_study_takeaway_reactions_reaction_check;

alter table public.bible_study_takeaway_reactions
  add constraint bible_study_takeaway_reactions_reaction_check
  check (reaction in ('thumbs_up', 'fire', 'love', 'laugh', 'smile', 'amazed', 'bowing', 'folded_hands', 'praying_hands', 'crying', 'clapping', 'shy'));

revoke all on public.bible_study_takeaway_reactions from anon;
grant select, insert, update, delete on public.bible_study_takeaway_reactions to authenticated;

drop policy if exists "bible_reactions_select" on public.bible_study_takeaway_reactions;
create policy "bible_reactions_select"
  on public.bible_study_takeaway_reactions
  for select to authenticated
  using (public.is_active_user());

drop policy if exists "bible_reactions_self_write" on public.bible_study_takeaway_reactions;
create policy "bible_reactions_self_write"
  on public.bible_study_takeaway_reactions
  for all to authenticated
  using (public.is_active_user() and (public.is_admin() or user_id = auth.uid()))
  with check (public.is_active_user() and (public.is_admin() or user_id = auth.uid()));

update public.bible_study_takeaway_reactions
set content_type = 'takeaway',
    content_id = takeaway_id
where content_type is null or content_id is null;

do $$
begin
  if exists (
    select 1
    from public.bible_study_takeaway_reactions
    where content_type is null or content_id is null
  ) then
    raise exception 'Bible Study reactions contain rows without a valid target. Review them before applying this migration.';
  end if;
end;
$$;

alter table public.bible_study_takeaway_reactions
  drop constraint if exists bible_study_takeaway_reactions_content_type_check;

alter table public.bible_study_takeaway_reactions
  add constraint bible_study_takeaway_reactions_content_type_check
  check (content_type in ('takeaway', 'takeaway_reply', 'question', 'question_answer'));

alter table public.bible_study_takeaway_reactions
  alter column content_type set not null,
  alter column content_id set not null;

create unique index if not exists bible_study_content_reactions_unique
  on public.bible_study_takeaway_reactions (content_type, content_id, user_id, reaction);

create index if not exists idx_bible_study_content_reactions_target
  on public.bible_study_takeaway_reactions (content_type, content_id);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'bible_study_takeaway_reactions'
     ) then
    alter publication supabase_realtime add table public.bible_study_takeaway_reactions;
  end if;
end;
$$;

commit;
