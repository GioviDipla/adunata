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

/** Card browser grid + CardItem. Light columns only — no heavy jsonb, no unused arrays.
 *  Keep `image_normal` so the hover-preview (desktop) can use it without an extra fetch.
 *  `name_it` is included so the client can rank Italian-name matches locally. */
export const CARD_GRID_COLUMNS =
  'id, name, name_it, mana_cost, type_line, image_small, image_normal, prices_eur, prices_usd, cmc, rarity, set_code, color_identity, released_at'

/** In-game card reference: engine, battlefield, hand, zones. No prices, no legalities, no search_vector.
 *  Includes pre-computed phase-trigger flags so the UI can highlight triggers at O(1). */
export const CARD_GAME_COLUMNS =
  'id, scryfall_id, name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, rarity, set_code, set_name, collector_number, image_small, image_normal, power, toughness, keywords, produced_mana, layout, card_faces, has_upkeep_trigger, has_etb_trigger, has_attacks_trigger, has_dies_trigger, has_end_step_trigger, has_cast_trigger'

/** Deck view / editor: game-level data + prices + released_at (for sorting/stats). No legalities, no search_vector.
 *  `flavor_name` is carried so the bulk importer can index just-upserted UB reprints
 *  under both the canonical and flavor name in its in-memory resolution maps. */
export const CARD_DECK_COLUMNS =
  'id, scryfall_id, name, flavor_name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, rarity, set_code, set_name, collector_number, image_small, image_normal, power, toughness, keywords, produced_mana, layout, card_faces, prices_eur, prices_eur_foil, prices_usd, prices_usd_foil, released_at'

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
  'id, user_id, name, description, format, visibility, cover_card_id, card_count, created_at, updated_at'

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

/** deck_cards: full row. Returned from insert/update to the client.
 *  `is_foil` is set at import time from Moxfield-style `*F*` / ` F` / `*E*` markers.
 *  `section_id`, `tags`, `position_in_section` added 2026-04-24 for the sections/tags feature. */
export const DECK_CARD_COLUMNS =
  'id, deck_id, card_id, quantity, board, is_foil, section_id, tags, position_in_section, created_at'
