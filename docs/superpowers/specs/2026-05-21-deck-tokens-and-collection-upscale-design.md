# Deck Tokens + Collection Upscale UX — Design Spec

**Date:** 2026-05-21
**Scope:** Four related quality-of-life improvements to the deck builder, deck viewer, and `MyCollection` view, plus integration of the dedicated token search bar into the standard `AddCardSearch` flow.

---

## Motivation

The upscale pipeline + Cloudflare R2 migration (shipped 2026-05-21, commit `a4d1f31`) made HD card art a first-class feature. Several UI surfaces still don't show the upscaled badge consistently or treat tokens as a second-class citizen:

1. `MyCollection` tiles don't show the upscaled badge even when the card has an HD version available.
2. Tokens inside a deck's `Tokens` section behave differently from main/sideboard cards: no context menu on tap, no longpress-to-detail in editing mode.
3. The deck editor has a separate, bespoke token search bar with its own placeholder and its own dropdown — two search UIs in the same screen depending on the active tab.
4. The card add dropdown (`AddCardSearch`) has tiny thumbnails (40px) and no way to preview a card before adding it — users have to add the card, see it's wrong, then remove it.
5. The deck viewer (read-only) has no `Tokens` tab at all, so tokens are invisible to anyone viewing a public deck.

Each is small in isolation. Together they make the upscale story feel half-finished and tokens feel bolted-on.

---

## Goals

- Show the upscaled badge wherever a card's image is rendered, including `MyCollection` and the deck viewer's tokens tab.
- Unify token interaction with normal-card interaction in the deck builder (tap → context menu, longpress/right-click → detail).
- Replace the dedicated token search bar with an auto-context-aware variant of the standard `AddCardSearch`.
- Slightly larger thumbnails (+20%) and longpress/right-click → detail modal with an inline "Add" button.
- Make tokens visible in the public deck viewer.

## Non-goals

- Redesign of the `Tokens` section layout or the `CardDetail` modal.
- New columns on `cards` or `card_image_assets`.
- New auto-queue mechanism for upscale jobs beyond what `ProxyPrintModal` already does.
- A "show tokens only" filter outside the deck context (e.g. on `/cards`).

---

## Architecture overview

Four independent changes touching distinct files. No new shared abstractions; reuse `UpscaledBadge`, `useLongPress`, `AddCardSearch`, and `CardDetail` as they already exist.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Feature 1: MyCollection badge                                            │
│   src/app/(app)/cards/page.tsx  (extend user_cards SELECT)               │
│   src/components/collection/CollectionTile.tsx  (render badge)           │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Feature 2: Tokens behave like main-deck cards                            │
│   src/components/deck/DeckEditor.tsx                                     │
│     - drop activeTab !== 'tokens' guards on DeckContent handlers         │
│     - handleMoveToBoard: for tokens => POST clone instead of update      │
│   src/components/deck/DeckCardActionSheet.tsx                            │
│     - context-aware menu items: tokens get qty/remove + "Add to X"       │
│   src/components/deck/DeckView.tsx                                       │
│     - extend BoardTab with 'tokens', render tab + counter                │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Feature 3: Unified token search                                          │
│   src/app/api/cards/search/route.ts  (add ?type=token)                   │
│   src/components/deck/AddCardSearch.tsx                                  │
│     - placeholder + URL depend on currentBoard === 'tokens'              │
│   src/components/deck/DeckEditor.tsx                                     │
│     - delete bespoke token search block + supporting state               │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Feature 4: Bigger thumbs + preview modal in AddCardSearch                │
│   src/components/deck/AddCardSearch.tsx                                  │
│     - h-10 -> h-12, badge scale-75 -> scale-90                           │
│     - useLongPress + onContextMenu => onPreviewCard(card)                │
│     - new optional prop onPreviewCard                                    │
│   src/components/deck/DeckEditor.tsx                                     │
│     - pass onPreviewCard={setSelectedDetailCard} to AddCardSearch        │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 1 — MyCollection badge

### Files touched

- `src/app/(app)/cards/page.tsx`
- `src/components/collection/CollectionTile.tsx`
- `src/components/collection/CollectionView.tsx` (only if `FullCard` type needs the new field)

### Changes

**`src/app/(app)/cards/page.tsx:67-68`** — extend the `user_cards` select to include `has_upscaled_2x`:

```ts
card:cards!card_id(id, scryfall_id, name, name_it, mana_cost, type_line, image_small, image_normal, cmc, rarity, set_code, color_identity, prices_eur, prices_usd, released_at, has_upscaled_2x)
```

**`src/components/collection/CollectionTile.tsx`** — import `UpscaledBadge`, render it inside the relative wrapper around the card image (around line 98–110):

```tsx
import UpscaledBadge from '@/components/cards/UpscaledBadge'
// ...
<div className="relative">
  {item.card.image_normal || item.card.image_small ? (
    <Image src={...} ... />
  ) : (...)}
  {item.card.has_upscaled_2x && (
    <UpscaledBadge className="absolute bottom-1.5 right-1.5" />
  )}
</div>
```

If `FullCard` (or whatever type the tile receives) doesn't yet expose `has_upscaled_2x`, extend the type alias in `CollectionView.tsx` accordingly — the Database row type already has the column.

### Verification

1. Open `/cards?tab=collection` with at least one collection item whose card has `has_upscaled_2x = true`. Badge visible in bottom-right of the tile.
2. Items without the flag: no badge.

---

## Feature 2 — Tokens behave like main-deck cards

### Files touched

- `src/components/deck/DeckEditor.tsx`
- `src/components/deck/DeckCardActionSheet.tsx`
- `src/components/deck/DeckView.tsx`

### Editor-side changes

**Remove the `activeTab !== 'tokens'` guards on `DeckContent` handler props** (`DeckEditor.tsx:951-978`):

Before:
```tsx
onToggleCommander={
  activeTab !== 'tokens' && activeTab !== 'removed'
    ? handleToggleCommander
    : undefined
}
onMoveToBoard={activeTab !== 'tokens' ? handleMoveToBoard : undefined}
onToggleFoil={
  activeTab !== 'tokens' && activeTab !== 'removed'
    ? handleToggleFoil
    : undefined
}
```

After:
```tsx
onToggleCommander={activeTab !== 'removed' ? handleToggleCommander : undefined}
onMoveToBoard={activeTab !== 'removed' ? handleMoveToBoard : undefined}
onToggleFoil={activeTab !== 'removed' ? handleToggleFoil : undefined}
```

This re-enables editing mode in the tokens tab (`editingMode = !!onMoveToBoard` flips to true), which automatically gives the tokens section tap → context menu and longpress/right-click → detail, matching the other sections.

**`handleMoveToBoard` semantic change for tokens** (`DeckEditor.tsx`, find the existing handler):

When the source row is in `board === 'tokens'`, the operation is **clone**, not **move**: keep the token in the tokens section and POST a new row into the target board (`main`/`sideboard`/`maybeboard`). For non-token rows, the existing PATCH-then-update behavior is unchanged.

Pseudocode:
```ts
async function handleMoveToBoard(cardId, targetBoard, sourceBoard) {
  if (sourceBoard === 'tokens' && targetBoard !== 'tokens') {
    // Clone the token into the target board, leave source row intact.
    await fetch(`/api/decks/${deck.id}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: cardId, quantity: 1, board: targetBoard }),
    })
    // Optimistic local insert; do NOT remove the original tokens row.
    setCards(prev => [...prev, { /* clone with board=targetBoard, quantity=1 */ }])
    return
  }
  // Existing move-update logic for non-token sources stays unchanged.
}
```

The `commander` toggle and `foil` toggle are gated at the context-menu level (see ActionSheet below), not at the handler level — handlers stay generic.

### Context menu changes — `DeckCardActionSheet.tsx`

The sheet renders menu items based on the current card's board. Add a branch:

- If `entry.board === 'tokens'`: render only `qty +`, `qty -`, `remove`, `Add to Main`, `Add to Sideboard`, `Add to Maybeboard`. Hide `toggle commander`, `toggle foil`, `move to tokens`, `move to removed`, and the section-change submenu.
- Otherwise (existing behavior): full menu.

"Add to {board}" items invoke `onMoveToBoard(cardId, targetBoard, 'tokens')` which the editor handler interprets as clone (per above).

### Viewer-side changes — `DeckView.tsx`

**Extend the tab union** (line 21):
```ts
type BoardTab = 'main' | 'sideboard' | 'maybeboard' | 'tokens' | 'stats'
```

**Add `tokens` to the tab list** (line 263):
```ts
{(['main', 'sideboard', 'maybeboard', 'tokens', 'stats'] as BoardTab[]).map(...)}
```

Add the label cases at lines 278/281:
- short: `tab === 'tokens' ? 'Tkns'`
- long: `tab === 'tokens' ? 'Tokens'`

**Add the counter** (around line 132-134):
```ts
tokens: cards.filter((c) => c.board === 'tokens').reduce((s, c) => s + c.quantity, 0),
```

The existing `filteredCards = cards.filter((c) => c.board === activeTab)` already covers `tokens` once the tab is in the union. `DeckContent` is invoked without `onMoveToBoard` in the viewer, so editing mode stays off and tap → open detail (existing viewer behavior).

### Verification

1. Editor, tokens tab: tap a token → context menu opens. Long-press / right-click → detail modal.
2. Context menu on token: shows only qty/remove/Add-to-{Main,Side,Maybe}. No commander/foil/section toggles.
3. Click "Add to Main": main count increments, token still visible in tokens tab.
4. Viewer (any public deck with tokens): a `Tokens` tab appears with the correct count, listing the tokens read-only with badges where applicable.

---

## Feature 3 — Unified token search

### Files touched

- `src/app/api/cards/search/route.ts`
- `src/components/deck/AddCardSearch.tsx`
- `src/components/deck/DeckEditor.tsx`

### API change

Add `?type=token` to `/api/cards/search` (`route.ts:21`):

```ts
const typeFilter = request.nextUrl.searchParams.get('type')
const isTokenSearch = typeFilter === 'token'
```

In the local DB branch (around line 41), if `isTokenSearch` append the same OR-clause used today by the bespoke token search:

```ts
let localQuery = supabase
  .from('cards')
  .select(CARD_GRID_COLUMNS)
  .ilike(column, `%${query}%`)
  .limit(10)

if (isTokenSearch) {
  localQuery = localQuery.or(
    'type_line.ilike.%Token%,type_line.ilike.%Emblem%,type_line.ilike.%Dungeon%,type_line.ilike.%Plane%,type_line.ilike.%Scheme%,layout.eq.token,layout.eq.double_faced_token,layout.eq.emblem',
  )
}

if (upscaledOnly) localQuery = localQuery.eq('has_upscaled_2x', true)
```

In the Scryfall fallback (around line 59), prepend a type clause to every constructed query:

```ts
const typePrefix = isTokenSearch ? '(t:token OR t:emblem OR t:dungeon OR t:plane OR t:scheme) ' : ''
if (lang === 'en') {
  scryQueries.push(`${typePrefix}${query}`, `${typePrefix}lang:it ${query}`)
} else if (lang === 'it') {
  scryQueries.push(`${typePrefix}${query}`, `${typePrefix}lang:it ${query}`)
} else {
  scryQueries.push(`${typePrefix}lang:${lang} ${query}`)
}
```

Upsert behavior into `cards` is unchanged — tokens land in the catalog like any Scryfall result.

### `AddCardSearch.tsx` adjustments

Component already receives `currentBoard`. Derive `isTokenSearch` from it and branch only the placeholder and the fetch URL:

```tsx
const isTokenSearch = currentBoard === 'tokens'

// Placeholder
placeholder={isTokenSearch
  ? "Search tokens (Soldier, Treasure, Emblem...)"
  : "Search cards to add..."
}

// Fetch URL
const url = isTokenSearch
  ? `/api/cards/search?q=${encodeURIComponent(searchQuery)}&type=token`
  : `/api/cards/search?q=${encodeURIComponent(searchQuery)}`
const res = await fetch(url, { signal: controller.signal })
```

`addCard()` already POSTs `{ card_id, quantity: 1, board: currentBoard }`, so when `currentBoard === 'tokens'` the row lands in the tokens board. No further changes.

### `DeckEditor.tsx` cleanup

Delete:
- `tokenSearch` / `tokenSearchResults` / `searchingTokens` state (lines 184–186).
- The `useEffect` that performed the dedicated token search (lines 189–249).
- The entire `{activeTab === 'tokens' && (...)}` UI block that rendered the bespoke search input and dropdown (lines 867–915).
- `handleAddTokenWithSave` (line 576) **if** no other callsite uses it. If something else still needs it, leave it alone.

### Verification

1. Open the deck editor on the `Tokens` tab: the standard search bar appears with the token placeholder. No second search bar above it.
2. Type "soldier": dropdown shows soldier tokens from the DB + Scryfall. Click one: token added to the tokens board with `+1`.
3. Switch to the `Main` tab: same bar, placeholder reverts to "Search cards to add...". Typing "soldier" no longer surfaces tokens.

---

## Feature 4 — Bigger thumb + longpress-to-detail in AddCardSearch

### Files touched

- `src/components/deck/AddCardSearch.tsx`
- `src/components/deck/DeckEditor.tsx`

### Thumbnail size

`AddCardSearch.tsx`:
- Line 156: `className="h-10 w-auto rounded"` → `className="h-12 w-auto rounded"`.
- Line 159: `className="absolute -bottom-0.5 -right-1 scale-75"` → `className="absolute -bottom-0.5 -right-1 scale-90"`.

### Long-press / right-click → preview

Pattern mirrored from `src/components/cards/CardItem.tsx` and `src/components/deck/DeckCard.tsx` (both already use `useLongPress` from `@/lib/hooks/useLongPress`).

`AddCardSearch.tsx`:

```tsx
import { useLongPress } from '@/lib/hooks/useLongPress'

interface AddCardSearchProps {
  deckId: string
  onCardAdded: (card: CardRow, board: string) => void
  currentBoard: string
  onPreviewCard?: (card: CardRow) => void   // <-- new
}
```

Per-row preview wiring inside the `.map`:

```tsx
{results.map((card, i) => {
  const longPress = useLongPress({
    onLongPress: () => onPreviewCard?.(card),
  })
  return (
    <button
      key={card.id}
      onClick={(e) => {
        if (longPress.consumeLongPress()) return
        addCard(card)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        onPreviewCard?.(card)
      }}
      onPointerDown={longPress.onPointerDown}
      onPointerUp={longPress.onPointerUp}
      onPointerLeave={longPress.onPointerCancel}
      onPointerCancel={longPress.onPointerCancel}
      className={...}
    >
      ...
    </button>
  )
})}
```

> If `useLongPress`'s public surface uses different handler names (`onPointerDown` vs single ref or separate `bind()`), match the call sites in `DeckCard.tsx`/`CardItem.tsx` — this spec assumes the same API.

### `DeckEditor.tsx` wiring

The editor already renders `<CardDetail card={selectedDetailCard} onAddToDeck={(card) => handleCardAdded(card, activeTab)} ... />` (line 1109–1120). It also already has `setSelectedDetailCard`. The only addition is one prop to `AddCardSearch`:

```tsx
<AddCardSearch
  deckId={deck.id}
  onCardAdded={handleCardAdded}
  currentBoard={activeTab}
  onPreviewCard={setSelectedDetailCard}   // <-- new
/>
```

Inside the `CardDetail` modal the "Add to deck" button already calls `onAddToDeck(displayCard)` (CardDetail.tsx:305). That callback in DeckEditor calls `handleCardAdded(card, activeTab)`. For the search-driven preview flow, `handleCardAdded` should additionally fire the actual POST that the dropdown's `addCard()` would have fired — otherwise the modal's "Add" just updates local state without persistence.

> Check whether `handleCardAdded` currently performs a POST or only updates local state. If it only mutates state (the search's `addCard` does the POST today), extend `handleCardAdded` to perform the POST itself when called from the modal path — or have `CardDetail.onAddToDeck` go through a separate handler that does both POST + local update. Final wiring is decided during implementation, not in the spec, but it must end with: clicking "Add" in the modal performs the same persistence as clicking the dropdown row.

### Verification

1. Open `AddCardSearch` dropdown: thumbnails are 48px tall (was 40), upscale badge slightly larger.
2. Long-press a row on touch: detail modal opens; the row is NOT added to the deck.
3. Right-click a row on desktop: detail modal opens; row is NOT added.
4. Click "Add to deck" in the modal: card is added to the active board (Main, Side, Maybe, Tokens), modal closes.
5. Normal click on row: card added as before, modal does not open.

---

## Data flow + state changes summary

| Surface | New state | New props | New API params |
|---|---|---|---|
| `CollectionTile` | — | — | — |
| `cards/page.tsx` user_cards select | — | — | — |
| `AddCardSearch` | none | `onPreviewCard?` | `?type=token` (sent when `currentBoard==='tokens'`) |
| `DeckEditor` | removes `tokenSearch*` state | passes `onPreviewCard` | — |
| `DeckCardActionSheet` | — | conditional rendering on `board==='tokens'` | — |
| `DeckView` | extends `BoardTab` union, adds counter | — | — |
| `/api/cards/search` | — | — | `type=token` accepted |

No DB schema changes. No new tables, columns, or RPCs.

---

## Error handling + edge cases

- **`AddCardSearch` POST fails for token**: existing flow already swallows errors silently (`addCard` only checks `res.ok` and clears the input). Same behavior — out of scope to redesign here.
- **Token cloned to main while user is already viewing main tab**: optimistic insert respects current `cards` state; deduplication by `(card.id, board)` is the responsibility of the existing `handleCardAdded` logic.
- **Viewer tokens tab with zero tokens**: still renders the tab with `(0)` count, matching the pattern of `maybeboard` when empty. If preferred, hide the tab when count is zero — implementation choice noted but not blocking.
- **`type=token` on Scryfall fallback with no matches**: returns empty array — UI shows "no results", same as today.
- **Long-press triggers on accidental scroll inside the dropdown**: `useLongPress` already implements distance tolerance (12px move cancels). If accidental triggers happen in practice, tighten the threshold — not preemptive.

---

## Testing

Manual (no test runner in the repo):

1. **MyCollection badge**: visit `/cards?tab=collection` as a user with ≥1 upscaled card in collection. Confirm badge visible.
2. **Tokens context menu**: open a deck with tokens in editor → tap token → menu shows qty/remove/Add-to-{Main,Side,Maybe}.
3. **Tokens long-press**: long-press a token in editor → detail modal opens.
4. **Viewer tokens tab**: visit `/decks/{public-deck-with-tokens}` while logged out → `Tokens` tab visible.
5. **Unified search on tokens tab**: editor tokens tab → type "soldier" → only token results.
6. **Unified search on main tab**: editor main tab → type "soldier" → no token results in dropdown.
7. **Larger thumb**: open dropdown → thumb is visually larger.
8. **Long-press in dropdown**: long-press a result → modal opens, row not added.
9. **Add-from-modal**: click "Add to deck" in modal → card added to current board.

Type-check:
```bash
npx tsc --noEmit
```

---

## Out of scope

- Reworking how tokens are persisted (still `cards` + `deck_cards` with `board='tokens'`).
- Auto-queueing upscale jobs from the deck open flow — `ProxyPrintModal` remains the only trigger.
- A general "search filter" UI (chips/operators) in `AddCardSearch` beyond the implicit `type=token` derivation.
- Bulk token import.
- Tooltips / a11y polish — deferred.

---

## Open implementation questions (resolved during implementation, not blocking spec approval)

1. Exact API shape of the existing `useLongPress` hook (single ref vs `{ onPointerDown, onPointerUp, ... }` vs `bind()`). Spec assumes the latter; mirror whatever `CardItem.tsx`/`DeckCard.tsx` already use.
2. Whether `handleCardAdded` in `DeckEditor` currently performs the POST itself or only updates local state. If only the latter, route the modal-driven "Add" through a thin wrapper that fires the same POST as `AddCardSearch.addCard()`.
3. Whether to hide the viewer `Tokens` tab when the count is zero. Default: show with `(0)` for consistency with `maybeboard`. Override to hide if visually noisy.
