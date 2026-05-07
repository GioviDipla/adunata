-- Speed up ilike on oracle_text for the Rules Text filter in CardBrowser.
-- Without a trigram index, ilike '%keyword%' does a sequential scan on
-- ~108k rows that takes >10s, hitting the statement timeout. The search
-- returns zero results and the UI shows "no cards found".
create index if not exists idx_cards_oracle_text_trgm
  on public.cards using gin (oracle_text gin_trgm_ops)
  where oracle_text is not null;
