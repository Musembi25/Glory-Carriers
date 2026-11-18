-- Repair deployments where the activity delete policy was applied without its table grant.
begin;

drop policy if exists bible_partner_events_delete on public.bible_study_partner_events;
create policy bible_partner_events_delete on public.bible_study_partner_events for delete to authenticated
  using(actor_id=auth.uid());
grant delete on public.bible_study_partner_events to authenticated;

notify pgrst, 'reload schema';
commit;
