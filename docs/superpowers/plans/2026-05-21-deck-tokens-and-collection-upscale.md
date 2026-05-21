# Deck Tokens + Collection Upscale UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tokens first-class deck citizens (same tap/longpress/right-click as main cards, visible in viewer, integrated into the standard search bar) and show the upscaled badge in MyCollection tiles. Slightly bigger card thumbnails in the search dropdown with longpress/right-click opening the existing CardDetail modal (Add button already there).

**Architecture:** Reuse existing primitives — `UpscaledBadge`, `useLongPress`, `AddCardSearch`, `CardDetail`. No schema changes, no new tables, no new RPCs. Extend `/api/cards/search` with a single optional `?type=token` filter that triggers the same OR-clause the bespoke token search used. Drop the bespoke token search block from `DeckEditor`. Re-enable the editor's general-purpose `DeckContent` handlers on the `tokens` tab, then constrain the menu entries (not the handlers) inside `DeckCardActionSheet`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase Postgres, existing `useLongPress` hook, existing `CardDetail` modal (already has working POST + `onAddToDeck` callback).

---

## Reference: existing primitives reused

- `useLongPress` from `@/lib/hooks/useLongPress` — call site spread:
  ```tsx
  const longPress = useLongPress({ onLongPress: () => fn() })
  <button {...longPress.handlers} onClick={(e) => { if (longPress.wasLongPress()) return; ... }}>
  ```
  `handlers` already includes `onPointerDown` / `onPointerUp` / `onPointerLeave` / `onPointerCancel` / `onPointerMove` and `style: { touchAction: 'manipulation' }`. `wasLongPress()` is one-shot consume.
- `UpscaledBadge` from `@/components/cards/UpscaledBadge` — pure presentational, only `className` prop.
- `CardDetail` from `@/components/cards/CardDetail` — when invoked from `DeckEditor`, `onAddToDeck` is already wired. The modal performs its own POST to `/api/decks/${deckId}/cards`.

---

## File Structure

**Create:**
- (no new files)

**Modify:**
- `src/app/(app)/cards/page.tsx` — extend `user_cards` join select to include `has_upscaled_2x`.
- `src/components/collection/CollectionView.tsx` — extend the local `FullCard` type if needed.
- `src/components/collection/CollectionTile.tsx` — render `UpscaledBadge`.
- `src/app/api/cards/search/route.ts` — accept `?type=token`.
- `src/components/deck/AddCardSearch.tsx` — bigger thumb, longpress/right-click → `onPreviewCard`, token-aware placeholder + URL, new prop.
- `src/components/deck/DeckEditor.tsx` — delete bespoke token search, drop `activeTab !== 'tokens'` guards, special-case `handleMoveToBoard` for token-source clone, wire `onPreviewCard` to `AddCardSearch`.
- `src/components/deck/DeckCardActionSheet.tsx` — restrict menu items when source `board === 'tokens'`.
- `src/components/deck/DeckView.tsx` — add `'tokens'` to the tab union, render tab + counter.

**Delete (inside `DeckEditor.tsx`, not whole files):**
- `tokenSearch` / `tokenSearchResults` / `searchingTokens` state.
- Token-only `useEffect` that performs the dedicated DB+Scryfall search.
- `{activeTab === 'tokens' && (...)}` block rendering the bespoke search bar and dropdown.
- `handleAddTokenWithSave` (no remaining callers after the block is removed — verify in Task 5 Step 4).

---

## Task 1: MyCollection — extend `user_cards` SELECT to include `has_upscaled_2x`

**Files:**
- Modify: `src/app/(app)/cards/page.tsx:67-68`

- [ ] **Step 1: Open the file and locate the user_cards select**

`src/app/(app)/cards/page.tsx` around lines 64-74. The current SELECT is:

```ts
.from('user_cards')
.select(
  `id, quantity, foil, language, condition, acquired_price_eur,
   card:cards!card_id(id, scryfall_id, name, name_it, mana_cost, type_line, image_small, image_normal, cmc, rarity, set_code, color_identity, prices_eur, prices_usd, released_at)`,
  { count: 'exact' },
)
```

- [ ] **Step 2: Add `has_upscaled_2x` to the join select**

Replace the line containing the `card:cards!card_id(...)` projection with:

```ts
card:cards!card_id(id, scryfall_id, name, name_it, mana_cost, type_line, image_small, image_normal, cmc, rarity, set_code, color_identity, prices_eur, prices_usd, released_at, has_upscaled_2x)
```

- [ ] **Step 3: Type-check passes**

Run:
```bash
npx tsc --noEmit
```

Expected: no new errors. If `FullCard` is hand-typed and lacks `has_upscaled_2x`, fix it in Task 2 — for now confirm no other regression.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/cards/page.tsx
git commit -m "feat(collection): include has_upscaled_2x in user_cards SELECT for collection tiles"
```

---

## Task 2: MyCollection — render `UpscaledBadge` on `CollectionTile`

**Files:**
- Modify: `src/components/collection/CollectionView.tsx` (only if `FullCard` type needs the flag added)
- Modify: `src/components/collection/CollectionTile.tsx`

- [ ] **Step 1: Inspect the local `FullCard` type**

Run:
```bash
grep -n "FullCard\b" src/components/collection/CollectionView.tsx src/components/collection/CollectionTile.tsx
```

If the type is `Database['public']['Tables']['cards']['Row']` directly, `has_upscaled_2x` is already present — skip Step 2.
If it's a hand-typed alias with explicit fields, add `has_upscaled_2x: boolean | null` to the alias in `CollectionView.tsx` and re-export.

- [ ] **Step 2: (conditional) Extend the type**

Only if Step 1 found a hand-typed alias. Example edit shape:

```ts
type FullCard = {
  id: string
  // ... existing fields ...
  has_upscaled_2x: boolean | null
}
```

- [ ] **Step 3: Add the badge import and render in `CollectionTile.tsx`**

Open `src/components/collection/CollectionTile.tsx`. Near the top imports add:

```tsx
import UpscaledBadge from '@/components/cards/UpscaledBadge'
```

Find the relative `<div>` that wraps the card `<Image>` (around line 96-110, the block after the comment `{/* Card image — image_normal (488×680)... */}`). After the closing `</Image>` (or after the placeholder `else` branch — at the end of the relative wrapper, before its `</div>`), add:

```tsx
{item.card.has_upscaled_2x && (
  <UpscaledBadge className="absolute bottom-1.5 right-1.5" />
)}
```

Final shape:

```tsx
<div className="relative ...">
  {item.card.image_normal || item.card.image_small ? (
    <Image src={...} ... />
  ) : (
    <div>...</div>
  )}
  {item.card.has_upscaled_2x && (
    <UpscaledBadge className="absolute bottom-1.5 right-1.5" />
  )}
</div>
```

- [ ] **Step 4: Type-check passes**

Run:
```bash
npx tsc --noEmit
```

Expected: zero new errors.

- [ ] **Step 5: Manual smoke test**

Run:
```bash
npm run dev
```

Open `http://localhost:3000/cards?tab=collection`. Confirm at least one collection tile shows the badge (any card already upscaled — e.g. one from the post-migration backfill). Tiles without the flag show no badge.

- [ ] **Step 6: Commit**

```bash
git add src/components/collection/CollectionTile.tsx src/components/collection/CollectionView.tsx
git commit -m "feat(collection): render upscaled badge on CollectionTile when card.has_upscaled_2x"
```

---

## Task 3: API — accept `?type=token` on `/api/cards/search`

**Files:**
- Modify: `src/app/api/cards/search/route.ts`

- [ ] **Step 1: Read the current handler**

Open `src/app/api/cards/search/route.ts`. Identify three branches:
- Local DB search (around line 38-54)
- Scryfall fallback query construction (around line 59-66)
- Catch-block fallback (around line 130-144)

- [ ] **Step 2: Add the param + helper near the top of GET**

After the `upscaledOnly` line (~line 25), add:

```ts
const typeFilter = request.nextUrl.searchParams.get('type')
const isTokenSearch = typeFilter === 'token'

const TOKEN_DB_OR = 'type_line.ilike.%Token%,type_line.ilike.%Emblem%,type_line.ilike.%Dungeon%,type_line.ilike.%Plane%,type_line.ilike.%Scheme%,layout.eq.token,layout.eq.double_faced_token,layout.eq.emblem'
const TOKEN_SCRY_PREFIX = '(t:token OR t:emblem OR t:dungeon OR t:plane OR t:scheme) '
```

> `const TOKEN_DB_OR` and `const TOKEN_SCRY_PREFIX` are module-local helpers. Keep them inside the `GET` function or hoist to module scope — either is fine; pick whichever the surrounding file style prefers.

- [ ] **Step 3: Apply the OR-clause to the local DB query**

Find the local query block:

```ts
let localQuery = supabase
  .from('cards')
  .select(CARD_GRID_COLUMNS)
  .ilike(column, `%${query}%`)
  .limit(10)

if (upscaledOnly) localQuery = localQuery.eq('has_upscaled_2x', true)

const { data: localCards } = await localQuery
```

Replace with:

```ts
let localQuery = supabase
  .from('cards')
  .select(CARD_GRID_COLUMNS)
  .ilike(column, `%${query}%`)
  .limit(10)

if (isTokenSearch) localQuery = localQuery.or(TOKEN_DB_OR)
if (upscaledOnly) localQuery = localQuery.eq('has_upscaled_2x', true)

const { data: localCards } = await localQuery
```

- [ ] **Step 4: Prefix the Scryfall queries with the token clause**

Find:

```ts
if (lang === 'en') {
  scryQueries.push(query, `lang:it ${query}`)
} else if (lang === 'it') {
  scryQueries.push(query, `lang:it ${query}`)
} else {
  scryQueries.push(`lang:${lang} ${query}`)
}
```

Replace with:

```ts
const prefix = isTokenSearch ? TOKEN_SCRY_PREFIX : ''
if (lang === 'en') {
  scryQueries.push(`${prefix}${query}`, `${prefix}lang:it ${query}`)
} else if (lang === 'it') {
  scryQueries.push(`${prefix}${query}`, `${prefix}lang:it ${query}`)
} else {
  scryQueries.push(`${prefix}lang:${lang} ${query}`)
}
```

- [ ] **Step 5: Apply the OR-clause to the catch-block fallback**

Find the fallback query in the `catch` (around line 134-144):

```ts
let fallbackQuery = supabase
  .from('cards')
  .select(CARD_GRID_COLUMNS)
  .ilike(column, `%${query}%`)
  .limit(10)

if (upscaledOnly) fallbackQuery = fallbackQuery.eq('has_upscaled_2x', true)
```

Replace with:

```ts
let fallbackQuery = supabase
  .from('cards')
  .select(CARD_GRID_COLUMNS)
  .ilike(column, `%${query}%`)
  .limit(10)

if (isTokenSearch) fallbackQuery = fallbackQuery.or(TOKEN_DB_OR)
if (upscaledOnly) fallbackQuery = fallbackQuery.eq('has_upscaled_2x', true)
```

- [ ] **Step 6: Type-check passes**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 7: Manual smoke test via curl**

Boot dev server (if not running) and test:
```bash
curl -s "http://localhost:3000/api/cards/search?q=soldier&type=token" | python3 -c "import json,sys; d=json.load(sys.stdin); print('count:', len(d.get('cards', []))); print('first names:', [c['name'] for c in d.get('cards', [])[:3]])"
```

Expected: response contains only token-shaped names (e.g. "Soldier Token", "Soldier", or token-typed printings). Compare with `?q=soldier` (no type filter) — that includes non-token Soldier cards.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/cards/search/route.ts
git commit -m "feat(api): add ?type=token filter to /api/cards/search

Reuses the same OR-clause and Scryfall t:* prefix the bespoke token search applied — applied to the local DB branch, the Scryfall fallback, and the catch-block fallback for parity."
```

---

## Task 4: `AddCardSearch` — context-aware placeholder + URL + bigger thumb

**Files:**
- Modify: `src/components/deck/AddCardSearch.tsx`

- [ ] **Step 1: Derive `isTokenSearch` and use it for placeholder + URL**

Open `src/components/deck/AddCardSearch.tsx`. Inside the component body (after the props are destructured at the top, around line 20), add:

```tsx
const isTokenSearch = currentBoard === 'tokens'
```

In `searchCards` (the `useCallback` around line 31), replace the `fetch` URL:

```tsx
const url = isTokenSearch
  ? `/api/cards/search?q=${encodeURIComponent(searchQuery)}&type=token`
  : `/api/cards/search?q=${encodeURIComponent(searchQuery)}`
const res = await fetch(url, { signal: controller.signal })
```

Add `isTokenSearch` to the `useCallback` dependency array.

In the `<input>` JSX (line 130), replace the placeholder:

```tsx
placeholder={isTokenSearch
  ? "Search tokens (Soldier, Treasure, Emblem...)"
  : "Search cards to add..."
}
```

- [ ] **Step 2: Bump the thumb size**

In the `<button>` row mapping (around line 144-173), find:

```tsx
<img
  src={card.image_small}
  alt={card.name}
  className="h-10 w-auto rounded"
/>
```

Replace with:

```tsx
<img
  src={card.image_small}
  alt={card.name}
  className="h-12 w-auto rounded"
/>
```

And the badge classname:

```tsx
{card.has_upscaled_2x && (
  <UpscaledBadge className="absolute -bottom-0.5 -right-1 scale-90" />
)}
```

(was `scale-75`).

- [ ] **Step 3: Type-check passes**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/deck/AddCardSearch.tsx
git commit -m "feat(deck): AddCardSearch becomes context-aware for tokens + larger thumbs

When currentBoard==='tokens' the search bar uses a token-specific placeholder and appends ?type=token to the search URL. Thumbnails grow from h-10 to h-12 (+20%); the upscaled badge scale bumps from 75% to 90% to stay proportionate."
```

---

## Task 5: `DeckEditor` — drop bespoke token search block

**Files:**
- Modify: `src/components/deck/DeckEditor.tsx`

- [ ] **Step 1: Remove token-only state**

In `src/components/deck/DeckEditor.tsx`, delete these three `useState` lines (currently around lines 184-186):

```tsx
const [tokenSearch, setTokenSearch] = useState('')
const [tokenSearchResults, setTokenSearchResults] = useState<CardRow[]>([])
const [searchingTokens, setSearchingTokens] = useState(false)
```

- [ ] **Step 2: Remove the token-only `useEffect`**

Delete the entire `useEffect` block currently around lines 188-249, the one whose body begins with `if (tokenSearch.trim().length < 2)` and ends with `}, [tokenSearch])`.

- [ ] **Step 3: Remove the token-only render block**

Find the JSX block currently at lines 867-915:

```tsx
{activeTab === 'tokens' && (
  <div className="mb-3">
    {/* Token search bar */}
    ...
  </div>
)}
```

Delete the entire block (the opening `{activeTab === 'tokens' && (` through the matching `)}`).

- [ ] **Step 4: Check + remove `handleAddTokenWithSave` if unused**

Run:
```bash
grep -n "handleAddTokenWithSave" src/components/deck/DeckEditor.tsx
```

Expected: only the declaration line (around 576) remains. If no other reference, delete the `useCallback` declaration (lines ~576-608). If something else references it (e.g. another component or modal), leave it.

- [ ] **Step 5: Type-check passes**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors. Unused imports may surface — fix by deleting the unused import.

- [ ] **Step 6: Manual smoke test**

Open the dev server, open a deck in the editor, switch to the `Tokens` tab. Confirm:
- No second search bar above the standard one.
- The standard `AddCardSearch` is visible with the token placeholder.
- Typing "soldier" produces token results in the dropdown.
- Clicking a result adds the token to the tokens board.

- [ ] **Step 7: Commit**

```bash
git add src/components/deck/DeckEditor.tsx
git commit -m "refactor(deck): drop bespoke token search block in favor of unified AddCardSearch

The tokens tab no longer renders a dedicated search input; AddCardSearch (now context-aware) takes over. Drops tokenSearch* state, the dedicated useEffect, the {activeTab==='tokens' && (...)} render block, and handleAddTokenWithSave when no callers remain."
```

---

## Task 6: `DeckEditor` — drop `activeTab !== 'tokens'` guards on `DeckContent` handlers

**Files:**
- Modify: `src/components/deck/DeckEditor.tsx`

- [ ] **Step 1: Locate the `DeckContent` invocation**

In `src/components/deck/DeckEditor.tsx`, find the `<DeckContent ... />` at around line 951 (post-Task 5 line numbers may shift — search for `<DeckContent`).

- [ ] **Step 2: Replace the gated handler props**

Replace this:

```tsx
onToggleCommander={
  activeTab !== 'tokens' && activeTab !== 'removed'
    ? handleToggleCommander
    : undefined
}
onMoveToBoard={activeTab !== 'tokens' ? handleMoveToBoard : undefined}
onSectionChange={
  activeTab === 'removed' ? undefined : handleSectionChange
}
onTagsChange={
  activeTab === 'removed' ? undefined : handleTagsChange
}
onToggleFoil={
  activeTab !== 'tokens' && activeTab !== 'removed'
    ? handleToggleFoil
    : undefined
}
```

With:

```tsx
onToggleCommander={activeTab !== 'removed' ? handleToggleCommander : undefined}
onMoveToBoard={activeTab !== 'removed' ? handleMoveToBoard : undefined}
onSectionChange={activeTab === 'removed' ? undefined : handleSectionChange}
onTagsChange={activeTab === 'removed' ? undefined : handleTagsChange}
onToggleFoil={activeTab !== 'removed' ? handleToggleFoil : undefined}
```

This enables `editingMode = !!onMoveToBoard` for the tokens tab.

- [ ] **Step 3: Type-check passes**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/deck/DeckEditor.tsx
git commit -m "feat(deck): re-enable editing-mode handlers on Tokens tab

Removing the activeTab !== 'tokens' guards flips DeckGridView/DeckCard into editing mode (tap opens context menu, longpress / right-click opens the card detail) for the tokens section, matching main/sideboard/maybeboard. Per-action restrictions for tokens move into DeckCardActionSheet (Task 8)."
```

---

## Task 7: `handleMoveToBoard` — clone semantic when source is `tokens`

**Files:**
- Modify: `src/components/deck/DeckEditor.tsx`

- [ ] **Step 1: Read the current handler**

Inside `DeckEditor.tsx` find `handleMoveToBoard` (around line 352). Current body:

```tsx
const handleMoveToBoard = useCallback(
  async (cardId: number, fromBoard: string, toBoard: string) => {
    setCards((prev) =>
      prev.map((c) =>
        c.card.id === cardId && c.board === fromBoard
          ? { ...c, board: toBoard }
          : c
      )
    )
    await fetch(`/api/decks/${deck.id}/cards`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_id: cardId,
        board: toBoard,
        current_board: fromBoard,
      }),
    })
  },
  [deck.id]
)
```

- [ ] **Step 2: Add the clone branch for token source**

Replace the handler body with:

```tsx
const handleMoveToBoard = useCallback(
  async (cardId: number, fromBoard: string, toBoard: string) => {
    // Source = tokens, target ≠ tokens: CLONE (POST) — keep the token row.
    if (fromBoard === 'tokens' && toBoard !== 'tokens') {
      const sourceEntry = cards.find(
        (c) => c.card.id === cardId && c.board === 'tokens'
      )
      setCards((prev) => {
        const existing = prev.find(
          (c) => c.card.id === cardId && c.board === toBoard
        )
        if (existing) {
          return prev.map((c) =>
            c.card.id === cardId && c.board === toBoard
              ? { ...c, quantity: c.quantity + 1 }
              : c
          )
        }
        if (!sourceEntry) return prev
        return [
          ...prev,
          {
            id: `temp-${Date.now()}`,
            card: sourceEntry.card,
            quantity: 1,
            board: toBoard,
          },
        ]
      })
      await fetch(`/api/decks/${deck.id}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: cardId,
          quantity: 1,
          board: toBoard,
        }),
      })
      return
    }

    // Default: MOVE
    setCards((prev) =>
      prev.map((c) =>
        c.card.id === cardId && c.board === fromBoard
          ? { ...c, board: toBoard }
          : c
      )
    )
    await fetch(`/api/decks/${deck.id}/cards`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_id: cardId,
        board: toBoard,
        current_board: fromBoard,
      }),
    })
  },
  [deck.id, cards]
)
```

> Note: `cards` is added to the dependency array because the clone branch reads it. This will cause the callback to be re-created on every cards change, which is intentional — the alternative (using a ref) is overkill for a deck editor.

- [ ] **Step 3: Type-check passes**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Manual smoke test**

In the editor on the Tokens tab, with at least one token present:
1. Tap a token → context menu opens.
2. Pick "Add to Main" (will be available after Task 8).
3. Confirm the main count increments AND the token is still visible in the tokens tab.
4. Reload — both rows persist.

(Skip the menu step until Task 8 lands; you can temporarily simulate by calling `handleMoveToBoard(id, 'tokens', 'main')` from the React devtools or by skipping this step entirely until Task 8.)

- [ ] **Step 5: Commit**

```bash
git add src/components/deck/DeckEditor.tsx
git commit -m "feat(deck): cloning semantics when moving a token to another board

handleMoveToBoard now branches on source: when from='tokens' and to≠'tokens', it POSTs a new row to the target board and keeps the token row intact (clone). Other transitions keep the existing PUT-based move behavior."
```

---

## Task 8: `DeckCardActionSheet` — restrict menu items for token source

**Files:**
- Modify: `src/components/deck/DeckCardActionSheet.tsx`

- [ ] **Step 1: Inspect the existing component**

Run:
```bash
grep -n "board\|onMoveToBoard\|onToggleCommander\|onToggleFoil\|main\|sideboard\|maybeboard" src/components/deck/DeckCardActionSheet.tsx | head -40
```

Identify how the menu currently builds its items — likely a `<button>` list inside the sheet body, with each action wired to the corresponding callback prop.

- [ ] **Step 2: Derive `isTokenSource`**

In the component body, near the top, add (replace `entryBoard` / `currentBoard` with whatever prop name carries the current row's board):

```tsx
const isTokenSource = currentBoard === 'tokens'
```

- [ ] **Step 3: Hide non-applicable actions when `isTokenSource`**

Wrap the following items in `{!isTokenSource && (...)}`:
- "Make commander" / "Remove as commander"
- "Toggle foil"
- "Change section"
- "Move to Tokens"
- "Move to Removed"
- Any tag editor

Keep visible regardless:
- Quantity +1 / -1
- Remove (delete row)

- [ ] **Step 4: Add explicit "Add to {board}" items when `isTokenSource`**

After the qty/remove block, add:

```tsx
{isTokenSource && (
  <>
    <button
      type="button"
      onClick={() => { onMoveToBoard?.(cardId, 'tokens', 'main'); onClose() }}
      className="..."  // match existing menu button classes
    >
      Add to Main
    </button>
    <button
      type="button"
      onClick={() => { onMoveToBoard?.(cardId, 'tokens', 'sideboard'); onClose() }}
      className="..."
    >
      Add to Sideboard
    </button>
    <button
      type="button"
      onClick={() => { onMoveToBoard?.(cardId, 'tokens', 'maybeboard'); onClose() }}
      className="..."
    >
      Add to Maybeboard
    </button>
  </>
)}
```

> Replace `onMoveToBoard?.(cardId, 'tokens', 'main')` with the actual signature this sheet uses. If the existing "Move to ..." buttons in this file call `onMoveToBoard(cardId, currentBoard, target)`, mirror that.

- [ ] **Step 5: Type-check passes**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Manual smoke test**

Editor → Tokens tab. Tap a token → menu opens. Confirm:
- Visible items: qty +, qty -, Remove, Add to Main, Add to Sideboard, Add to Maybeboard.
- Not visible: Make commander, Toggle foil, Change section, Move to Tokens/Removed.
- Click "Add to Main" → main count +1 in the tab badge, the token still shows in tokens.

- [ ] **Step 7: Commit**

```bash
git add src/components/deck/DeckCardActionSheet.tsx
git commit -m "feat(deck): token-aware context menu

When the row's source board is tokens, the action sheet hides commander/foil/section/move-to-tokens/move-to-removed entries and exposes Add to Main / Sideboard / Maybeboard shortcuts (route through onMoveToBoard which clones for token sources)."
```

---

## Task 9: `AddCardSearch` — longpress / right-click → preview modal

**Files:**
- Modify: `src/components/deck/AddCardSearch.tsx`

- [ ] **Step 1: Add the prop**

In `src/components/deck/AddCardSearch.tsx`, extend the props interface:

```tsx
interface AddCardSearchProps {
  deckId: string
  onCardAdded: (card: CardRow, board: string) => void
  currentBoard: string
  onPreviewCard?: (card: CardRow) => void
}
```

Destructure it in the function signature:

```tsx
export default function AddCardSearch({
  deckId,
  onCardAdded,
  currentBoard,
  onPreviewCard,
}: AddCardSearchProps) {
```

- [ ] **Step 2: Import `useLongPress`**

At the top, alongside existing imports:

```tsx
import { useLongPress } from '@/lib/hooks/useLongPress'
```

- [ ] **Step 3: Extract the row into a sub-component**

Hooks can't be called inside `.map`. Extract each result row into a tiny inline component so `useLongPress` can be called once per row:

Add this above the default-exported component, in the same file:

```tsx
function ResultRow({
  card,
  selected,
  onAdd,
  onPreview,
}: {
  card: CardRow
  selected: boolean
  onAdd: () => void
  onPreview?: (card: CardRow) => void
}) {
  const longPress = useLongPress({
    onLongPress: () => onPreview?.(card),
  })
  return (
    <button
      type="button"
      {...longPress.handlers}
      onClick={(e) => {
        if (longPress.wasLongPress()) return
        onAdd()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        onPreview?.(card)
      }}
      className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-bg-hover ${
        selected ? 'bg-bg-hover' : ''
      }`}
    >
      {card.image_small && (
        <span className="relative shrink-0">
          <img
            src={card.image_small}
            alt={card.name}
            className="h-12 w-auto rounded"
          />
          {card.has_upscaled_2x && (
            <UpscaledBadge className="absolute -bottom-0.5 -right-1 scale-90" />
          )}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-font-primary">
          {card.name}
        </div>
        <div className="truncate text-xs text-font-muted">
          {card.type_line} {card.mana_cost && `· ${card.mana_cost}`}
        </div>
      </div>
      <Plus className="h-4 w-4 shrink-0 text-font-muted" />
    </button>
  )
}
```

> `Plus` and `UpscaledBadge` are already imported at the top of the file; the sub-component uses the module-scope imports.

- [ ] **Step 4: Replace the inline `.map` with `<ResultRow>`**

Find the existing `.map` (around line 143-173):

```tsx
{results.map((card, i) => (
  <button ...>
    ...
  </button>
))}
```

Replace with:

```tsx
{results.map((card, i) => (
  <ResultRow
    key={card.id}
    card={card}
    selected={i === selectedIndex}
    onAdd={() => addCard(card)}
    onPreview={onPreviewCard}
  />
))}
```

- [ ] **Step 5: Type-check passes**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/deck/AddCardSearch.tsx
git commit -m "feat(deck): longpress/right-click on AddCardSearch result opens CardDetail

Each dropdown row becomes a tiny ResultRow component so useLongPress can be applied per-row (hooks can't run inside .map). Tap = add (existing behavior, gated by wasLongPress consume). Long-press / right-click = onPreviewCard callback, which the parent wires to the existing CardDetail modal."
```

---

## Task 10: `DeckEditor` — wire `onPreviewCard` on `AddCardSearch`

**Files:**
- Modify: `src/components/deck/DeckEditor.tsx`

- [ ] **Step 1: Pass the prop**

In `src/components/deck/DeckEditor.tsx`, find the `<AddCardSearch ... />` (around line 806):

```tsx
<AddCardSearch
  deckId={deck.id}
  onCardAdded={handleCardAdded}
  currentBoard={activeTab}
/>
```

Replace with:

```tsx
<AddCardSearch
  deckId={deck.id}
  onCardAdded={handleCardAdded}
  currentBoard={activeTab}
  onPreviewCard={setSelectedDetailCard}
/>
```

`setSelectedDetailCard` is the existing setter (declared around line 83). The existing `<CardDetail card={selectedDetailCard} ... onAddToDeck={(card) => handleCardAdded(card, activeTab)} />` block (around line 1109-1120) already handles the modal close + add wiring.

- [ ] **Step 2: Type-check passes**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Manual smoke test**

Open dev, deck editor, focus the search bar, type a card name. Then:
- Long-press a result (touch) → `CardDetail` modal opens, no row appended to the deck.
- Right-click a result (desktop) → modal opens, no row appended.
- Normal click → card added as before, modal stays closed.
- Inside the modal, click "Add to deck" / "Aggiungi": card is appended to the current board (Main, Side, Maybe, or Tokens), modal closes.

- [ ] **Step 4: Commit**

```bash
git add src/components/deck/DeckEditor.tsx
git commit -m "feat(deck): wire AddCardSearch preview into existing CardDetail modal"
```

---

## Task 11: `DeckView` — add `Tokens` tab

**Files:**
- Modify: `src/components/deck/DeckView.tsx`

- [ ] **Step 1: Extend `BoardTab` union**

In `src/components/deck/DeckView.tsx` around line 21:

Before:
```tsx
type BoardTab = 'main' | 'sideboard' | 'maybeboard' | 'stats'
```

After:
```tsx
type BoardTab = 'main' | 'sideboard' | 'maybeboard' | 'tokens' | 'stats'
```

- [ ] **Step 2: Add `tokens` to the counter**

Find the counter object (around lines 130-135):

```tsx
const counts = {
  main: cards.filter((c) => c.board === 'main').reduce((s, c) => s + c.quantity, 0),
  sideboard: cards.filter((c) => c.board === 'sideboard').reduce((s, c) => s + c.quantity, 0),
  maybeboard: cards.filter((c) => c.board === 'maybeboard').reduce((s, c) => s + c.quantity, 0),
}
```

(approximate shape — match the surrounding code). Add a line for tokens:

```tsx
tokens: cards.filter((c) => c.board === 'tokens').reduce((s, c) => s + c.quantity, 0),
```

- [ ] **Step 3: Add `tokens` to the tab list**

Find the `.map` around line 263:

Before:
```tsx
{(['main', 'sideboard', 'maybeboard', 'stats'] as BoardTab[]).map((tab) => {
```

After:
```tsx
{(['main', 'sideboard', 'maybeboard', 'tokens', 'stats'] as BoardTab[]).map((tab) => {
```

- [ ] **Step 4: Add label cases**

Around lines 278/281 the labels are computed:

```tsx
{tab === 'main' ? 'Main' : tab === 'sideboard' ? 'Side' : tab === 'maybeboard' ? 'Maybe' : 'Stats'}
// and
{tab === 'main' ? 'Main Deck' : tab === 'sideboard' ? 'Sideboard' : tab === 'maybeboard' ? 'Maybeboard' : 'Stats'}
```

Replace with:

```tsx
{tab === 'main' ? 'Main' : tab === 'sideboard' ? 'Side' : tab === 'maybeboard' ? 'Maybe' : tab === 'tokens' ? 'Tkns' : 'Stats'}
// and
{tab === 'main' ? 'Main Deck' : tab === 'sideboard' ? 'Sideboard' : tab === 'maybeboard' ? 'Maybeboard' : tab === 'tokens' ? 'Tokens' : 'Stats'}
```

- [ ] **Step 5: Verify filteredCards already handles tokens**

`filteredCards = cards.filter((c) => c.board === activeTab)` (around line 105) already covers `tokens` because it's now in the union.

- [ ] **Step 6: Type-check passes**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 7: Manual smoke test**

Visit any public deck containing tokens (e.g. a deck you own with the tokens board populated). Confirm:
- A new `Tokens` tab appears in the tab strip.
- Counter reflects the token quantity.
- Clicking the tab lists the tokens read-only (no context menu, tap opens the card detail per the existing viewer behavior).
- Tokens with `has_upscaled_2x = true` show the badge (same `DeckContent` renderer as other tabs).

- [ ] **Step 8: Commit**

```bash
git add src/components/deck/DeckView.tsx
git commit -m "feat(deck-viewer): add Tokens tab to public deck view

Extends BoardTab with 'tokens', renders the tab + counter, and lets DeckContent's existing read-only flow show the tokens board (upscaled badge included automatically via DeckGridView/DeckCard)."
```

---

## Task 12: End-to-end smoke test + push

**Files:**
- (no file changes)

- [ ] **Step 1: Final type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Walk through the full UX checklist**

In the dev server:

1. `/cards?tab=collection` — collection tile shows badge on upscaled cards.
2. Open a deck editor, switch to Tokens tab. No second search bar. Standard `AddCardSearch` placeholder reads "Search tokens...".
3. Type "soldier" — only token results in the dropdown. Click one → token added to tokens board.
4. Tap an existing token → context menu shows qty/remove/Add-to-{Main,Side,Maybe}. No commander/foil/section/move options.
5. Long-press a token → `CardDetail` modal opens.
6. Tap "Add to Main" in the menu → main count increments, token still in tokens.
7. Switch to Main tab → search bar placeholder back to "Search cards to add...". Type "soldier" → no token results.
8. Right-click a result in the dropdown → `CardDetail` modal opens, row not added.
9. Click "Add to deck" inside the modal → card appended to the current board.
10. Visit a public deck with tokens. Confirm Tokens tab visible with badges.

- [ ] **Step 3: Push to `dev`**

```bash
git push origin dev
```

Expected: Vercel preview build kicks off. Once Ready, repeat steps 1–10 against the preview URL.

---

## Self-review notes (internal)

- Spec coverage:
  - Feature 1 (collection badge) → Tasks 1, 2.
  - Feature 2 (tokens like main cards + viewer tab) → Tasks 6, 7, 8, 11.
  - Feature 3 (unified search) → Tasks 3, 4, 5.
  - Feature 4 (bigger thumb + longpress preview) → Tasks 4, 9, 10.
- No placeholders: every code block is final code or a clearly-marked extraction step with surrounding context.
- Type consistency: `useLongPress({ onLongPress }).handlers` and `.wasLongPress()` are the actual public API (verified in `src/lib/hooks/useLongPress.ts`). `CardDetail.onAddToDeck` already exists with signature `(card: Card) => void` and DeckEditor already wires `(card) => handleCardAdded(card, activeTab)`. `handleMoveToBoard` keeps its existing `(cardId, fromBoard, toBoard)` signature.
- No new files. No schema changes. No new dependencies.
