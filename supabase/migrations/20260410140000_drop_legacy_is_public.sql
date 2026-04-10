-- Drop the legacy is_public column and its companion RLS policy. The
-- decks.visibility column introduced in 20260410130000 replaces both. Keeping
-- the legacy policy around would OR another SELECT clause onto the decks
-- table, creating a footgun where setting is_public=true would widen access
-- outside the new visibility system.

drop policy if exists "Users can view public decks" on public.decks;

alter table public.decks drop column if exists is_public;
