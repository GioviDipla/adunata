# Pub Decks — public deck search with filters

**Date:** 2026-06-22
**Status:** Approved (design forks confirmed by user)

## Goal

Rename the "Decks" nav entry to "My Decks" and add a new "Pub Decks" section: a
dedicated page that lists **all** `visibility='public'` decks with a rich filter
panel and paginated "carica altri" loading, mirroring the Cards browser and
Community patterns.

## Scope decisions (confirmed)

- **Pub Decks scope:** `decks.visibility = 'public'` only. `unlisted` decks are
  link-shareable but intentionally not browsable here.
- **Card-list filter:** single AND/OR toggle for the whole card list. AND = deck
  contains ALL listed cards; OR = deck contains AT LEAST ONE.
- **Navigation:** two navbar entries — "My Decks" (`/decks`) and "Pub Decks"
  (`/decks/public`). No in-page tabs.

## Architecture

```
Navbar
  - "My Decks"  -> /decks          (existing, user's decks; h1 already "My Decks")
  - "Pub Decks" -> /decks/public   (new)

/decks/public (Server Component)
  - fetch first 10 public decks (RPC search_public_decks, no filters, offset 0)
  - render <PublicDeckBrowser initial={...} /> (client)

<PublicDeckBrowser> (client)
  - filter state (name, creator, commander, colors[], colorIdentity[], cards[], cardMode, format)
  - on filter change -> GET /api/decks/public/search?... (debounced) -> replace list
  - "Carica altri" -> GET same with offset += 10 -> append
  - results: deck cards (cover, name, creator, format, card_count) -> link /decks/[id]

API  GET /api/decks/public/search
  - auth required
  - parses filter query params, calls RPC search_public_decks(...)
  - returns { decks: [...] }

RPC  search_public_decks(...)  -- PL/pgSQL, security invoker
  - filters: name, creator, commander, colors, color_identity, cards, card_mode, format
  - returns deck row + creator profile + commander card + cover card image
  - p_limit / p_offset pagination (default 10 / 0)
  - order by updated_at desc

Migration
  - create function search_public_decks(...)
  - create index idx_deck_cards_card_id on deck_cards(card_id)  -- card-list filter
  - grant execute to authenticated
```

## Filter semantics

| Filter | Param | Semantics |
|--------|-------|-----------|
| Deck name | `name` (text) | `decks.name ILIKE %name%` |
| Creator | `creator` (text) | creator `profiles.username` OR `display_name` ILIKE |
| Commander | `commander` (text) | card name where `deck_cards.board='commander'` ILIKE |
| Color | `colors` (text[]) | deck has cards of EACH selected color in `cards.colors`. Board in (`main`,`commander`). AND across selected. |
| Color identity | `ci` (text[]) | deck CI (union of `cards.color_identity`, boards `main`+`commander`) ⊇ all selected. AND. |
| Card list | `cards` (uuid[]) + `cardMode` (`and`/`or`) | AND: all card_ids present in deck_cards (any board); OR: at least one present |
| Format | `format` (text) | `decks.format = format` exact, nullable (any) |

**Color vs color identity** (both kept, user-requested):
- **color** = presence of a mana-cost color among the deck's cards
- **color identity** = the deck's full CI (Commander-style: union of card CI)

Empty/empty-array params are ignored (no filter). Boards `main`+`commander`
used for color/CI computation; sideboard/maybeboard/tokens/removed excluded.

## RPC return shape

```ts
type PublicDeckResult = {
  id: string
  name: string
  description: string | null
  format: string | null
  card_count: number
  updated_at: string
  user_id: string
  creator_username: string | null
  creator_display_name: string | null
  commander_card_id: string | null
  commander_name: string | null
  cover_card_id: string | null
  cover_image_art_crop: string | null
  cover_image_normal: string | null
}
```

Commander resolved via lateral subquery on `deck_cards` (board='commander')
join `cards`. Cover resolved from the stored `decks.cover_card_id` left-joined
to `cards` (same source as the dashboard "Latest public decks" section — not
the dynamic `get_deck_covers` RPC, which is owner-specific). One row per deck,
no N+1.

## Pagination

- `PAGE_SIZE = 10` (matches Community / /users).
- Initial page from server (offset 0). "Carica altri" appends offset += 10.
- `hasMore` = `decks.length === PAGE_SIZE` (same convention as CardBrowser /
  UserSearch).
- Filter change resets to offset 0 (replace list, not append).

## UI

- Filter panel: collapsible on mobile (default open on desktop). Inputs:
  - text: name, creator, commander
  - color checkboxes (W/U/B/R/G) — two groups: Color, Color identity
  - card picker: search-as-you-type (reuse `/api/cards/search`), add to chip list,
    each chip removable; AND/OR toggle above the list
  - format select (Any / Commander / Standard / Modern / Legacy)
  - "Clear filters" button
- Results grid: responsive `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5`,
  same card visual as dashboard "Latest public decks".
- Empty state: "No public decks match these filters."
- "Carica altri" button at bottom, same style as Community.

## Dashboard change

The dashboard "Latest public decks" section header gets a "View all" link to
`/decks/public` (consistent with "Active games" -> /play, "My recent decks" ->
/decks).

## Error handling

- RPC error -> API returns 500 `{ error }`, client shows empty state (no crash).
- Invalid filter params -> API clamps/sanitizes (offset capped, empty strings
  treated as no filter).
- Auth required on API (401 if no session) — public decks are browseable but
  the app is auth-gated globally.

## Testing

No test runner in project. Verification = manual + DB-level:
- `search_public_decks` tested via `supabase db query --linked` with filter
  combos after migration.
- `tsc --noEmit` + `eslint` clean.
- `/decks/public` renders, filters narrow results, "carica altri" loads more.

## Out of scope (YAGNI)

- Relevance/similarity sort (updated_at desc only for now).
- Saved searches / filter presets.
- Deck stats in result cards (card_count only).
- Full-text search indexes (ILIKE on small dataset is fine; revisit if public
  decks exceed ~5k).
