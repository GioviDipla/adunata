-- ============================================================
-- Let public decks actually be public — readable by the anon role
-- so share links render to logged-out recipients AND the WhatsApp /
-- iMessage / Discord OG scraper can fetch the Open Graph metadata.
-- ============================================================
-- Previously the three SELECT policies below were scoped to
-- `authenticated`, so:
--   * the page server-rendered empty data for anon users and the
--     outer handler redirected them to /login,
--   * the OG scraper (no cookies) never saw the deck name / cover /
--     author, so pasting a link in chat rendered a bare URL.
-- Owner-only private deck access stays intact: the policy still gates
-- private rows to `auth.uid() = user_id`.

drop policy if exists "Users can view own or public decks" on public.decks;
create policy "decks_select_public_or_owner"
  on public.decks
  for select
  using (
    visibility = 'public'
    or (auth.uid() is not null and user_id = auth.uid())
  );

drop policy if exists "Users can view cards in own or public decks" on public.deck_cards;
create policy "deck_cards_select_public_or_owner"
  on public.deck_cards
  for select
  using (
    deck_id in (
      select id from public.decks
       where visibility = 'public'
          or (auth.uid() is not null and user_id = auth.uid())
    )
  );

-- Profiles are already surfaced to logged-in users everywhere the app
-- shows an author (/u/[username], deck pill, comments). Opening SELECT
-- to anon just so the OG scraper can pick up the "by {name}" line and
-- the visitor's DeckView can render matches the existing intent.
drop policy if exists "Authenticated users can view all profiles" on public.profiles;
create policy "profiles_select_all"
  on public.profiles
  for select
  using (true);
