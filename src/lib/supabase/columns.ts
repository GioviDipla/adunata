/**
 * Column sets for Supabase `.select()` calls.
 * Keep queries narrow — never `select('*')` on user-facing paths.
 *
 * Rule of thumb:
 * - LIST / GRID → only what the UI row renders + fields used by filters
 * - DETAIL → fetched on-demand when the detail modal opens
 * - GAME → everything the engine/renderer needs at runtime (no prices, no legalities)
 */

// ── cards ─────────────────────────────────────────────────────────────────

/** Card browser grid + CardItem. 15 light columns, no heavy jsonb. */
export const CARD_GRID_COLUMNS =
  'id, name, mana_cost, type_line, image_small, image_normal, prices_eur, prices_usd, cmc, rarity, set_code, color_identity, colors, keywords, released_at'

/** In-game card reference: engine, battlefield, hand, zones. No prices, no legalities, no search_vector. */
export const CARD_GAME_COLUMNS =
  'id, scryfall_id, name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, rarity, set_code, set_name, collector_number, image_small, image_normal, power, toughness, keywords, produced_mana, layout, card_faces'

/** Deck view / editor: game-level data + prices + released_at (for sorting/stats). No legalities, no search_vector. */
export const CARD_DECK_COLUMNS =
  'id, scryfall_id, name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, rarity, set_code, set_name, collector_number, image_small, image_normal, power, toughness, keywords, produced_mana, layout, card_faces, prices_eur, prices_eur_foil, prices_usd, prices_usd_foil, released_at'

/** CardDetail modal: deck columns + legalities. Everything except search_vector and timestamps. */
export const CARD_DETAIL_COLUMNS =
  'id, scryfall_id, name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, rarity, set_code, set_name, collector_number, image_small, image_normal, image_art_crop, power, toughness, keywords, produced_mana, layout, card_faces, prices_eur, prices_eur_foil, prices_usd, prices_usd_foil, released_at, legalities'

// ── decks ─────────────────────────────────────────────────────────────────

/** Deck picker / combobox (Play page, Add to Deck). */
export const DECK_PICKER_COLUMNS = 'id, name, format'

/** Deck list page / profile. card_count is denormalized on the row. */
export const DECK_LIST_COLUMNS =
  'id, name, format, visibility, cover_card_id, card_count, updated_at, user_id'

/** Full deck view — everything needed by DeckEditor / DeckView. */
export const DECK_DETAIL_COLUMNS =
  'id, user_id, name, description, format, visibility, cover_card_id, created_at, updated_at'

// ── game ──────────────────────────────────────────────────────────────────

/** game_states: everything needed to render/resume a game. */
export const GAME_STATE_COLUMNS = 'id, lobby_id, state_data'

/** game_lobbies: list/status view. */
export const LOBBY_LIST_COLUMNS =
  'id, lobby_code, status, format, name, created_at, updated_at'

/** game_lobbies: full record for the lobby page. */
export const LOBBY_DETAIL_COLUMNS =
  'id, host_user_id, lobby_code, format, status, max_players, winner_id, started_at, name, created_at, updated_at'

/** game_players: roster for a lobby. */
export const GAME_PLAYER_COLUMNS =
  'id, user_id, deck_id, seat_position, life_total, ready, is_first'

/** game_log: replay / history. */
export const GAME_LOG_COLUMNS =
  'id, seq, player_id, action, data, text, type, created_at'

/** deck_cards: full row (all 6 columns). Returned from insert/update to the client. */
export const DECK_CARD_COLUMNS = 'id, deck_id, card_id, quantity, board, created_at'
