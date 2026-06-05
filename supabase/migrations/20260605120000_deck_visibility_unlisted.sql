-- ============================================================
-- Add tri-state visibility for decks: 'private' | 'unlisted' | 'public'.
--
-- Semantics:
--   * private  — owner only
--   * unlisted — anyone with the link can SELECT, but not listed on the
--                owner's public profile and the page emits noindex
--   * public   — anyone can SELECT and the deck is listed/indexable
--
-- This migration:
--   1. Adds a CHECK constraint on decks.visibility to lock the value set.
--   2. Widens the existing SELECT policies on decks and deck_cards so anon
--      and authenticated visitors can read unlisted decks too. Owner-only
--      mutations remain untouched.
-- ============================================================

-- 1. CHECK constraint. Drop the legacy one if any previous attempt added it.
alter table public.decks drop constraint if exists decks_visibility_check;
alter table public.decks
  add constraint decks_visibility_check
  check (visibility in ('private', 'unlisted', 'public'));

-- 2. Widen SELECT policies. Replace existing 'public or owner' policies with
-- 'public/unlisted or owner' so link-based access works for unlisted decks
-- without leaking them into listing endpoints (which keep filtering 'public').

drop policy if exists "decks_select_public_or_owner" on public.decks;
create policy "decks_select_public_or_owner"
  on public.decks
  for select
  using (
    visibility in ('public', 'unlisted')
    or (auth.uid() is not null and user_id = auth.uid())
  );

drop policy if exists "deck_cards_select_public_or_owner" on public.deck_cards;
create policy "deck_cards_select_public_or_owner"
  on public.deck_cards
  for select
  using (
    deck_id in (
      select id from public.decks
       where visibility in ('public', 'unlisted')
          or (auth.uid() is not null and user_id = auth.uid())
    )
  );

-- Also widen deck_sections so unlisted decks render their custom sections to
-- visitors. The existing policy mirrors decks SELECT and must follow.
drop policy if exists deck_sections_select_visible on public.deck_sections;
create policy deck_sections_select_visible on public.deck_sections
  for select
  using (
    exists (
      select 1 from public.decks d
      where d.id = deck_sections.deck_id
        and (
          d.visibility in ('public', 'unlisted')
          or (auth.uid() is not null and d.user_id = auth.uid())
        )
    )
  );
