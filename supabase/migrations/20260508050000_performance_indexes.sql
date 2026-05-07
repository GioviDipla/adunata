-- Performance indexes for Adunata. Fixes sequential scans on
-- cards.type_line ilike queries, cards.color_identity array
-- operators, and missing FK/access-pattern indexes on game and
-- social tables.

-- 1. cards.type_line trigram index
--    ilike('%TYPE%') in CardBrowser + DeckEditor
--    Without: ~108k-row seq scan = 10s+ timeout
create index if not exists idx_cards_type_line_trgm
  on public.cards using gin (type_line gin_trgm_ops)
  where type_line is not null;

-- 2. cards.color_identity GIN index
--    contains/overlaps/containedBy in CardBrowser
create index if not exists idx_cards_color_identity_gin
  on public.cards using gin (color_identity);

-- 3. game_players FK + compound filter
create index if not exists idx_game_players_lobby_id
  on public.game_players (lobby_id);
create index if not exists idx_game_players_lobby_user
  on public.game_players (lobby_id, user_id);

-- 4. game_log lookup by (lobby_id, seq)
create index if not exists idx_game_log_lobby_seq
  on public.game_log (lobby_id, seq);

-- 5. game_states FK
create index if not exists idx_game_states_lobby_id
  on public.game_states (lobby_id);

-- 6. deck_comments access patterns
create index if not exists idx_deck_comments_deck_id
  on public.deck_comments (deck_id, created_at);
create index if not exists idx_deck_comments_user_id
  on public.deck_comments (user_id);

-- 7. card_likes access patterns
create index if not exists idx_card_likes_card_id
  on public.card_likes (card_id);
create index if not exists idx_card_likes_user_card
  on public.card_likes (user_id, card_id);

-- 8. deck_likes toggle detection
create index if not exists idx_deck_likes_deck_user
  on public.deck_likes (deck_id, user_id);

-- 9. game_lobbies status filter (used in lobby listing)
create index if not exists idx_game_lobbies_status
  on public.game_lobbies (status);

-- Note: All game/social tables were already in the supabase_realtime
-- publication at the time this migration was applied. No alter needed.
