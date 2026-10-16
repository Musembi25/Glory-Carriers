-- GC Pulse text-post presentation metadata.
-- Additive only: existing announcements and their permissions remain unchanged.

alter table public.announcements
  add column if not exists presentation jsonb not null default '{}'::jsonb;

alter table public.announcements
  drop constraint if exists announcements_presentation_valid;

alter table public.announcements
  add constraint announcements_presentation_valid check (
    presentation = '{}'::jsonb
    or (
      jsonb_typeof(presentation) = 'object'
      and coalesce(presentation->>'font', 'default') in ('default', 'modern', 'serif', 'rounded')
      and coalesce(presentation->>'color', 'auto') in ('auto', 'ivory', 'ink', 'gold', 'sky')
      and coalesce(presentation->>'headline', 'false') in ('true', 'false')
      and (
        presentation->>'kind' is null
        or (
          presentation->>'kind' = 'text'
          and presentation->>'theme' in ('sunrise', 'ocean', 'ember', 'paper', 'midnight')
        )
      )
    )
  );
