# Mobile DnD, Zone DnD, Section UI & Perf Bugs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make drag-and-drop work cleanly on mobile in goldfish/multiplayer, expand DnD to every game zone (incl. back-to-hand), enlarge graveyard/exile/library widgets to act as both visible stacks and drop targets, redesign deck-builder sections (column-tall, collapsible, expand/collapse-all, right padding), and fix two recurring perf bugs (cards browser load-more, tap/scrollbar flicker).

**Architecture:**
- DnD: keep `@dnd-kit/core` 6.3.1 + `@dnd-kit/sortable` 10.0.0. Standardize sensor config across all `DndContext` mount points: `PointerSensor { distance: 12 }` for desktop + `TouchSensor { delay: 220, tolerance: 8 }` for mobile. Hand cards must use `touch-action: pan-x` so the hand stays scrollable; drag activates via long-press (TouchSensor delay).
- Zones become first-class droppables. Graveyard/exile/library top each render as a card-shaped stack widget that doubles as a drop target and an inspect-on-tap surface (existing `CardZoneViewer`).
- Engine: a single `move-zone` action accepts `from` ∈ {hand, battlefield, graveyard, exile, library} and `to` ∈ same set, plus optional `position` (top/bottom for library). Existing battlefield→graveyard/exile dispatches collapse into this action.
- Deck-builder sections: stop using icon-row layout, render full-height cards in the sidebar with collapsible body and right-side scroll padding. Add a global expand/collapse-all toggle. Drag handle becomes explicit (grip-only listener), not whole row.
- Cards browser: stabilize `loadMore` via `useCallback` + a `cardsRef` for the cursor read; isolate the load-more `AbortController` from the search `AbortController`; halve `buildQuery` recreation by moving filter primitives into a memoized object.
- Global CSS: drop `scrollbar-gutter: stable` from `html`, drop body-level `touch-action: manipulation`, and replace the global `.fixed.inset-0` selector with an opt-in `.safe-area-overlay` class to stop layout thrashing on every modal.

**Tech Stack:** Next.js 16.2.2, React 19.2.4, `@dnd-kit/*`, Tailwind v4, Supabase Realtime, TypeScript.

---

## File Structure

**Modify:**
- `src/components/goldfish/HandArea.tsx` — touch-action, drag activation, scroll
- `src/components/goldfish/BattlefieldZone.tsx` — accept drag source on cards
- `src/components/goldfish/BattlefieldCard.tsx` (new if not present, otherwise inline in BattlefieldZone) — `useDraggable` per battlefield card
- `src/components/goldfish/GameActionBar.tsx` — replace zone icon buttons with stack widgets
- `src/components/goldfish/CardZoneViewer.tsx` — drag-out support
- `src/components/play/PlayGame.tsx` — wire new dropIds, extend `handleDragEnd`, mirror sensors in goldfish
- `src/components/goldfish/PlaySolo.tsx` (or wherever the goldfish DndContext lives) — sensors config
- `src/lib/game/engine.ts` (or equivalent action reducer) — `move-zone` action
- `src/lib/game/types.ts` — action union update
- `src/components/deck/DeckSectionsPanel.tsx` — sensor tweak, drag handle isolation, restyle, expand/collapse-all
- `src/components/deck/DeckContent.tsx` — wire collapse-all state
- `src/components/cards/CardBrowser.tsx` — `loadMore` stability + abort isolation
- `src/app/globals.css` — drop scrollbar-gutter, drop body touch-action, scope safe-area
- `src/app/api/decks/[id]/sections/[key]/route.ts` — extend PATCH for batch collapse-all if not present

**Create:**
- `src/components/goldfish/ZoneStack.tsx` — shared visual for graveyard/exile/library top, drop target + tap to view + drag-out
- `src/lib/hooks/useDeckSensors.ts` — shared sensors factory for all DndContexts (consistency)

---

## Phase 0 — Baseline & smoke

### Task 0.1: Capture current behavior

**Files:**
- Note in `docs/superpowers/notes/2026-05-06-baseline.md` (create)

- [ ] **Step 1: Record reproduction notes**

Document, with date 2026-05-06 and worktree path:
- iOS Safari: try to scroll hand horizontally during a goldfish — observe drag instead of scroll.
- Try drag from hand → graveyard icon — observe no drop target.
- Open `/cards`, click "Load more" once — observe button toggles loading then clears without appending.
- Reload the page on `/cards`, watch the right edge — observe scrollbar gutter present even on short pages.

- [ ] **Step 2: Confirm dnd-kit & next versions**

Run: `node -e "console.log(require('./package.json').dependencies)" | grep -E 'dnd-kit|next|react"'`
Expected: `@dnd-kit/core ^6.3.1`, `@dnd-kit/sortable ^10.0.0`, `next 16.2.2`, `react 19.2.4`.

- [ ] **Step 3: Commit baseline notes**

```bash
git add docs/superpowers/notes/2026-05-06-baseline.md
git commit -m "docs: log baseline for mobile-dnd-and-perf plan"
```

---

## Phase 1 — Shared DnD sensors

### Task 1.1: Extract a shared sensors hook

**Files:**
- Create: `src/lib/hooks/useDeckSensors.ts`

- [ ] **Step 1: Create the hook**

```ts
// src/lib/hooks/useDeckSensors.ts
'use client'

import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

type Variant = 'game' | 'sortable'

export function useDeckSensors(variant: Variant = 'game') {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 12 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: variant === 'sortable' ? sortableKeyboardCoordinates : undefined,
    }),
  )
}
```

- [ ] **Step 2: Replace inline sensors in PlayGame.tsx**

Find at `src/components/play/PlayGame.tsx:609-611`:

```tsx
const dndSensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 12 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
)
```

Replace with:

```tsx
import { useDeckSensors } from '@/lib/hooks/useDeckSensors'
// ...
const dndSensors = useDeckSensors('game')
```

Drop now-unused imports: `PointerSensor`, `TouchSensor`, `useSensor`, `useSensors`.

- [ ] **Step 3: Replace inline sensors in DeckSectionsPanel.tsx**

Find around `src/components/deck/DeckSectionsPanel.tsx:78-81`:

```tsx
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
)
```

Replace with:

```tsx
import { useDeckSensors } from '@/lib/hooks/useDeckSensors'
// ...
const sensors = useDeckSensors('sortable')
```

Drop now-unused imports.

- [ ] **Step 4: Find every other `<DndContext>` and apply the hook**

Run: `grep -rn "<DndContext" src/`
Expected: 3-5 mount points. For each, swap inline sensors for `useDeckSensors(variant)` (`'sortable'` if the parent wraps a `SortableContext`, else `'game'`).

- [ ] **Step 5: TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/hooks/useDeckSensors.ts src/components/play/PlayGame.tsx src/components/deck/DeckSectionsPanel.tsx
git commit -m "refactor(dnd): centralize sensor config in useDeckSensors"
```

---

## Phase 2 — Mobile hand scroll + safe drag activation

### Task 2.1: Hand horizontal scroll on mobile

**Files:**
- Modify: `src/components/goldfish/HandArea.tsx:99` (touch-action)
- Modify: `src/components/goldfish/HandArea.tsx:150` (scroll container)

- [ ] **Step 1: Replace `touch-action: none` with `pan-x`**

At `HandArea.tsx:99`:

```tsx
touchAction: draggable && !selectable ? 'none' : 'manipulation',
```

Change to:

```tsx
touchAction: draggable && !selectable ? 'pan-x' : 'manipulation',
```

`pan-x` lets the browser handle horizontal scroll; the TouchSensor's `delay: 220` activation captures only long-press gestures, so a short horizontal swipe scrolls and a long-press lifts the card.

- [ ] **Step 2: Add `overscroll-behavior-x: contain` to the scroll row**

At `HandArea.tsx:150`:

```tsx
<div className="flex gap-1.5 overflow-x-auto pb-1">
```

Change to:

```tsx
<div
  className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide"
  style={{ overscrollBehaviorX: 'contain', WebkitOverflowScrolling: 'touch' }}
>
```

- [ ] **Step 3: Manual test on iOS Safari**

Open goldfish, swipe horizontally on the hand: cards must scroll without lifting. Long-press a card 220ms+: card lifts and follows the finger. Short-tap: opens action menu.

- [ ] **Step 4: Commit**

```bash
git add src/components/goldfish/HandArea.tsx
git commit -m "fix(goldfish): keep hand horizontal scroll on mobile during dnd"
```

### Task 2.2: Drag handle isolation in DeckSectionsPanel

**Files:**
- Modify: `src/components/deck/DeckSectionsPanel.tsx` (around lines 421-429)

- [ ] **Step 1: Find the SortableSectionRow and split listeners**

Around lines 404-429, the row currently spreads `{...attributes} {...listeners}` on the whole row container. Move them to the `GripVertical` button only:

```tsx
// Old (whole-row drag):
<li
  ref={setNodeRef}
  style={{ transform, transition, opacity: isDragging ? 0.45 : 1 }}
  {...attributes}
  {...listeners}
  className="..."
>
  <GripVertical className="h-4 w-4 cursor-grab text-font-muted" />
  ...
</li>

// New (handle-only drag):
<li
  ref={setNodeRef}
  style={{ transform, transition, opacity: isDragging ? 0.45 : 1 }}
  className="..."
>
  <button
    type="button"
    {...attributes}
    {...listeners}
    aria-label="Drag to reorder"
    className="touch-none cursor-grab p-1 text-font-muted active:cursor-grabbing"
    style={{ touchAction: 'none' }}
  >
    <GripVertical className="h-4 w-4" />
  </button>
  ...
</li>
```

The `touch-action: none` is now scoped to the 24px handle only — taps and scrolls on the rest of the row are unaffected.

- [ ] **Step 2: Manual test on mobile**

Reload the deck editor sections panel on mobile. Tap the row body to expand/collapse: works. Long-press the grip: lifts and reorders. Scroll the sidebar with finger on the row body: scrolls without dragging.

- [ ] **Step 3: Commit**

```bash
git add src/components/deck/DeckSectionsPanel.tsx
git commit -m "fix(deck): scope section drag to handle only on mobile"
```

---

## Phase 3 — Engine action: `move-zone`

### Task 3.1: Define the action shape

**Files:**
- Modify: `src/lib/game/types.ts` (action union)

- [ ] **Step 1: Locate the action union**

Run: `grep -n "type GameAction\|move-graveyard\|move-exile" src/lib/game/types.ts src/lib/game/engine.ts 2>/dev/null`

Read the surrounding context: identify the existing battlefield→graveyard / battlefield→exile / play-card actions.

- [ ] **Step 2: Add `move-zone` variant**

In `src/lib/game/types.ts`:

```ts
export type Zone = 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'library'

export type MoveZoneAction = {
  type: 'move-zone'
  instanceId: string
  from: Zone
  to: Zone
  /** Library placement; ignored for other targets. */
  libraryPosition?: 'top' | 'bottom'
  /** Optional battlefield sub-zone for engine UIs that group by type. */
  battlefieldGroup?: 'creatures' | 'lands' | 'tokens' | 'other'
}
```

Add to the `GameAction` union.

- [ ] **Step 3: Implement the reducer branch**

In the engine (likely `src/lib/game/engine.ts`):

```ts
case 'move-zone': {
  const player = state.players.get(action.playerId)
  if (!player) return state
  const removeFrom = (zone: Zone) => {
    if (zone === 'hand') player.hand = player.hand.filter(c => c.instanceId !== action.instanceId)
    else if (zone === 'graveyard') player.graveyard = player.graveyard.filter(c => c.instanceId !== action.instanceId)
    else if (zone === 'exile') player.exile = player.exile.filter(c => c.instanceId !== action.instanceId)
    else if (zone === 'library') player.library = player.library.filter(id => id !== action.instanceId)
    else if (zone === 'battlefield') player.battlefield = player.battlefield.filter(c => c.instanceId !== action.instanceId)
  }
  const card = findCardEverywhere(player, action.instanceId)
  if (!card) return state
  removeFrom(action.from)
  if (action.to === 'hand') player.hand.push(card)
  else if (action.to === 'graveyard') player.graveyard.push({ instanceId: action.instanceId, cardId: card.cardId })
  else if (action.to === 'exile') player.exile.push({ instanceId: action.instanceId, cardId: card.cardId })
  else if (action.to === 'library') {
    if (action.libraryPosition === 'bottom') player.library.push(action.instanceId)
    else player.library.unshift(action.instanceId)
  }
  else if (action.to === 'battlefield') player.battlefield.push({ instanceId: action.instanceId, cardId: card.cardId, tapped: false })
  pushHistory(state, `${player.name} moved a card from ${action.from} to ${action.to}`)
  return state
}
```

`findCardEverywhere` is a small helper — add it next to the reducer. It returns `{ instanceId, cardId }` from any zone.

- [ ] **Step 4: Run unit tests if any exist**

Run: `pnpm test -- engine 2>/dev/null || echo "no engine tests yet"`
If none, add one minimum coverage test (`src/lib/game/__tests__/engine.move-zone.test.ts`) that:
1. Builds a fixture with a card in `graveyard`.
2. Dispatches `move-zone` with `from='graveyard', to='hand'`.
3. Asserts the card moved.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/engine.ts src/lib/game/__tests__/engine.move-zone.test.ts
git commit -m "feat(engine): unified move-zone action across all zones"
```

### Task 3.2: Migrate existing dispatches

**Files:**
- Modify: `src/components/play/PlayGame.tsx:613-…` (handleDragEnd)
- Modify: `src/components/goldfish/CardZoneViewer.tsx` (return-from-zone callbacks)
- Modify: `src/components/goldfish/GameActionBar.tsx` (action menu items)

- [ ] **Step 1: Audit existing senders**

Run: `grep -rn "type: 'move-graveyard'\|type: 'move-exile'\|type: 'play-card'" src/components/play/ src/components/goldfish/ src/lib/game/`

For every result, replace with a `move-zone` dispatch using the appropriate `from` and `to`.

- [ ] **Step 2: Update `handleDragEnd` in PlayGame.tsx**

The current implementation accepts only `bf-creatures | bf-other | bf-tokens | bf-lands` as drop ids and fires a `play-card` action. Extend:

```tsx
const handleDragEnd = useCallback((e: DragEndEvent) => {
  if (!e.over) return
  const dropId = String(e.over.id)
  const data = e.active.data.current as { from: Zone; instanceId: string }
  if (!data) return

  if (dropId.startsWith('bf-')) {
    const group = dropId.slice(3) as 'creatures' | 'lands' | 'tokens' | 'other'
    sendAction({ type: 'move-zone', instanceId: data.instanceId, from: data.from, to: 'battlefield', battlefieldGroup: group })
    return
  }
  if (dropId === 'zone-graveyard') return sendAction({ type: 'move-zone', ...common, to: 'graveyard' })
  if (dropId === 'zone-exile')     return sendAction({ type: 'move-zone', ...common, to: 'exile' })
  if (dropId === 'zone-library-top')    return sendAction({ type: 'move-zone', ...common, to: 'library', libraryPosition: 'top' })
  if (dropId === 'zone-library-bottom') return sendAction({ type: 'move-zone', ...common, to: 'library', libraryPosition: 'bottom' })
  if (dropId === 'zone-hand')      return sendAction({ type: 'move-zone', ...common, to: 'hand' })
}, [sendAction])
```

(`common = { type: 'move-zone' as const, instanceId: data.instanceId, from: data.from }` — extract above the conditionals.)

- [ ] **Step 3: tsc + lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/play/PlayGame.tsx src/components/goldfish/CardZoneViewer.tsx src/components/goldfish/GameActionBar.tsx
git commit -m "refactor(game): migrate zone dispatches to move-zone"
```

---

## Phase 4 — ZoneStack widget

### Task 4.1: Create the widget

**Files:**
- Create: `src/components/goldfish/ZoneStack.tsx`

- [ ] **Step 1: Implement the widget**

```tsx
// src/components/goldfish/ZoneStack.tsx
'use client'

import { useDroppable } from '@dnd-kit/core'
import { Archive, Ban, Layers } from 'lucide-react'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

export type ZoneKind = 'graveyard' | 'exile' | 'library'

interface ZoneStackProps {
  kind: ZoneKind
  count: number
  topCard?: CardRow | null
  /** Drop target id; undefined disables drop. */
  dropId?: string
  onTap: () => void
}

const META: Record<ZoneKind, { label: string; icon: typeof Archive; color: string }> = {
  graveyard: { label: 'GRAVE', icon: Archive,  color: 'border-bg-red/50 text-bg-red' },
  exile:     { label: 'EXILE', icon: Ban,      color: 'border-bg-orange/50 text-bg-orange' },
  library:   { label: 'LIB',   icon: Layers,   color: 'border-bg-accent/50 text-bg-accent' },
}

export default function ZoneStack({ kind, count, topCard, dropId, onTap }: ZoneStackProps) {
  const drop = useDroppable({ id: dropId ?? `zone-${kind}-noop`, data: { kind }, disabled: !dropId })
  const meta = META[kind]
  const Icon = meta.icon
  const showTop = kind !== 'library' && topCard?.image_small // library top stays hidden

  return (
    <button
      ref={dropId ? drop.setNodeRef : undefined}
      onClick={onTap}
      className={`relative flex shrink-0 flex-col items-center justify-end overflow-hidden rounded-lg border bg-bg-card transition-colors ${meta.color} ${
        drop.isOver ? 'ring-2 ring-bg-accent ring-offset-2 ring-offset-bg-dark' : ''
      }`}
      style={{ width: 72, height: 100 }}
      aria-label={`${meta.label} (${count})`}
    >
      {showTop ? (
        <img src={topCard!.image_small!} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      ) : (
        <Icon className="absolute inset-0 m-auto h-8 w-8 opacity-40" />
      )}
      <span className="relative z-10 w-full bg-bg-dark/70 px-1 py-0.5 text-center text-[10px] font-bold tracking-wider text-font-white">
        {meta.label} · {count}
      </span>
    </button>
  )
}
```

- [ ] **Step 2: Wire ZoneStack into GameActionBar.tsx**

Find the existing icon buttons for graveyard/exile/library and replace each with:

```tsx
<ZoneStack kind="graveyard" count={player.graveyard.length} topCard={lastCardOf(player.graveyard, cardMap)} dropId="zone-graveyard" onTap={() => openZoneViewer('graveyard')} />
<ZoneStack kind="exile"     count={player.exile.length}     topCard={lastCardOf(player.exile, cardMap)}     dropId="zone-exile"     onTap={() => openZoneViewer('exile')} />
<ZoneStack kind="library"   count={player.library.length}   topCard={null}                                  dropId="zone-library-top" onTap={() => openZoneViewer('library')} />
```

`lastCardOf` is a 3-line inline helper:

```tsx
const lastCardOf = (zone: { instanceId: string; cardId: number }[], cardMap: Map<number, CardRow>) =>
  zone.length ? cardMap.get(zone[zone.length - 1].cardId) ?? null : null
```

- [ ] **Step 3: Hand drop target**

In the goldfish/multiplayer board container that renders `<HandArea>`, wrap the hand region with a `useDroppable` ref:

```tsx
const handDrop = useDroppable({ id: 'zone-hand', data: { kind: 'hand' } })
return (
  <div ref={handDrop.setNodeRef} className={`relative ${handDrop.isOver ? 'ring-2 ring-bg-accent rounded-lg' : ''}`}>
    <HandArea ... />
  </div>
)
```

- [ ] **Step 4: Library drop split — top vs bottom**

When the library viewer is open, render a small split-drop bar (two rectangles) with ids `zone-library-top` and `zone-library-bottom`. When closed, only `zone-library-top` is exposed (default).

- [ ] **Step 5: Manual test**

Drag a hand card → graveyard ZoneStack: card disappears from hand, count increments, top preview updates. Drag → exile, → library, all work. Drag from a battlefield card → hand ZoneArea: returns to hand.

- [ ] **Step 6: Commit**

```bash
git add src/components/goldfish/ZoneStack.tsx src/components/goldfish/GameActionBar.tsx src/components/play/PlayGame.tsx
git commit -m "feat(game): card-sized zone stacks as drop targets + previews"
```

### Task 4.2: Battlefield → drag-out

**Files:**
- Modify: `src/components/goldfish/BattlefieldZone.tsx` (the inner card render)

- [ ] **Step 1: Wrap each battlefield card in `useDraggable`**

If a separate `BattlefieldCard` component does not exist, extract one. Add:

```tsx
const drag = useDraggable({
  id: `bf:${card.instanceId}`,
  data: { from: 'battlefield', instanceId: card.instanceId, cardId: card.cardId },
})
```

Apply `drag.attributes`, `drag.listeners`, `drag.setNodeRef`, transform style. Set `touchAction: 'none'` on the card itself only when dragging.

- [ ] **Step 2: Manual test**

Drag a battlefield card → hand ZoneArea: returns. Drag → graveyard: dies. Drag → exile: exiles. Tap-only (no drag) still opens the action menu.

- [ ] **Step 3: Commit**

```bash
git add src/components/goldfish/BattlefieldZone.tsx
git commit -m "feat(game): battlefield cards draggable to any zone"
```

### Task 4.3: CardZoneViewer drag-out

**Files:**
- Modify: `src/components/goldfish/CardZoneViewer.tsx`

- [ ] **Step 1: Wrap each viewer card with `useDraggable`**

Same pattern as battlefield, with `data.from = 'graveyard' | 'exile' | 'library'` (passed by parent). Drop on hand/battlefield/etc. invokes the same `move-zone` reducer.

- [ ] **Step 2: Manual test**

Open graveyard viewer, drag a card onto the hand zone in the background: returns to hand, viewer auto-closes if hand-drop is detected (`onClose` from the `move-zone` dispatch wrapper).

- [ ] **Step 3: Commit**

```bash
git add src/components/goldfish/CardZoneViewer.tsx
git commit -m "feat(game): drag cards out of zone viewer"
```

---

## Phase 5 — Deck builder section UI redesign

### Task 5.1: Right-side padding & column-tall layout

**Files:**
- Modify: `src/components/deck/DeckContent.tsx` (group rendering at lines 755-857)

- [ ] **Step 1: Find the current section grid wrapper**

Around `DeckContent.tsx:794`, the grid renders sections in a vertical stack. Each section header has a chevron toggle and the body is the `DeckGridView`.

- [ ] **Step 2: Restyle to column-tall layout**

Wrap each section header + body in a card container with bottom padding and right padding:

```tsx
<section
  key={key}
  className="flex flex-col rounded-xl border border-border bg-bg-card/40"
>
  <header className="flex items-center justify-between gap-2 px-3 py-2">
    <button onClick={() => toggleCollapsed(key)} className="flex items-center gap-2 text-left">
      <ChevronDown className={`h-4 w-4 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
      <span className="text-sm font-semibold">{name}</span>
      <span className="text-xs text-font-muted">{cards.length}</span>
    </button>
    {/* per-section actions */}
  </header>
  {!isCollapsed && (
    <div className="px-3 pb-3 pr-4 sm:pr-5 lg:pr-6">
      <DeckGridView ... />
    </div>
  )}
</section>
```

The asymmetric `pr-4 sm:pr-5 lg:pr-6` is the right-side padding the user requested. Keep `gap-3` between sections so dividers visually feel column-tall.

- [ ] **Step 3: Manual test**

Open `/decks/{id}` with sections present. Confirm: each section has visible card-like border, right-side padding > left, full column height, collapse-on-tap-header still works.

- [ ] **Step 4: Commit**

```bash
git add src/components/deck/DeckContent.tsx
git commit -m "feat(deck): column-tall section cards with right padding"
```

### Task 5.2: Expand/collapse-all button

**Files:**
- Modify: `src/components/deck/DeckContent.tsx` (header toolbar)
- Modify: `src/app/api/decks/[id]/sections/route.ts` (PATCH bulk endpoint, create if missing)

- [ ] **Step 1: Add the bulk PATCH route**

Run: `ls src/app/api/decks/\[id\]/sections/`

If no `route.ts` exists at the parent level (only `[key]/route.ts`), create:

```ts
// src/app/api/decks/[id]/sections/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { is_collapsed } = await req.json() as { is_collapsed: boolean }
  const supabase = await createClient()
  const { error } = await supabase
    .from('deck_sections')
    .update({ is_collapsed })
    .eq('deck_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

(RLS already restricts updates to the deck owner.)

- [ ] **Step 2: Add toolbar button**

In the section toolbar in `DeckContent.tsx`, near the existing group/sort controls:

```tsx
const allCollapsed = sections.length > 0 && sections.every(s => collapsedSections.has(s.id))
const toggleAll = useCallback(async () => {
  const next = !allCollapsed
  // Optimistic
  setCollapsedSections(prev => {
    if (next) return new Set(sections.map(s => s.id))
    return new Set()
  })
  const res = await fetch(`/api/decks/${deckId}/sections`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_collapsed: next }),
  })
  if (!res.ok) {
    // Rollback
    setCollapsedSections(prev => prev) // refetch via revalidate
    return
  }
}, [allCollapsed, sections, deckId])

// In JSX:
<button onClick={toggleAll} className="text-xs text-font-secondary hover:text-font-primary">
  {allCollapsed ? 'Expand all' : 'Collapse all'}
</button>
```

- [ ] **Step 3: Manual test**

Click "Collapse all": every section folds. Click "Expand all": every section opens. Reload page: state persists (DB column updated for all rows).

- [ ] **Step 4: Commit**

```bash
git add src/components/deck/DeckContent.tsx src/app/api/decks/\[id\]/sections/route.ts
git commit -m "feat(deck): expand/collapse-all sections with persistence"
```

### Task 5.3: Section reorder mobile glitch

Already addressed in Task 1.1 (sensors) + Task 2.2 (handle isolation). No additional code required here — this task is a manual verification gate.

- [ ] **Step 1: Manual test on iOS Safari**

Open the deck editor sections panel. Try to scroll the panel by dragging from a row body: scrolls smoothly. Long-press the grip handle: lifts and reorders. No phantom drags from accidental finger touches.

- [ ] **Step 2: If glitches persist, bump TouchSensor delay**

In `useDeckSensors.ts` raise the sortable variant's TouchSensor delay to `300` and tolerance to `10`. Re-test.

---

## Phase 6 — CardBrowser load-more fix

### Task 6.1: Stabilize `loadMore`

**Files:**
- Modify: `src/components/cards/CardBrowser.tsx:378-392`

- [ ] **Step 1: Add a ref for cards**

Above the `loadMore` definition:

```tsx
import { useCallback, useRef } from 'react' // ensure imports

const cardsRef = useRef<Card[]>(cards)
useEffect(() => { cardsRef.current = cards }, [cards])

const loadMoreAbortRef = useRef<AbortController | null>(null)
```

- [ ] **Step 2: Rewrite loadMore as a stable useCallback**

Replace lines 378-392 entirely:

```tsx
const loadMore = useCallback(async () => {
  if (loadingMore || !hasMore) return
  setLoadingMore(true)
  loadMoreAbortRef.current?.abort()
  const controller = new AbortController()
  loadMoreAbortRef.current = controller

  const current = cardsRef.current
  const last = current[current.length - 1]
  const canUseCursor = isDefaultSort && last && last.released_at
  const cursor = canUseCursor
    ? { after: { releasedAt: last.released_at!, id: String(last.id) } }
    : { offset: current.length }

  const { data, error } = await buildQuery(cursor)
  if (controller.signal.aborted) return
  if (error) {
    console.error('Error loading more:', error)
    setLoadingMore(false)
    return
  }
  const newRows = (data || []) as unknown as Card[]
  setCards(prev => [...prev, ...newRows])
  setHasMore(newRows.length === PAGE_SIZE)
  setLoadingMore(false)
}, [loadingMore, hasMore, isDefaultSort, buildQuery])
```

`cardsRef` removes `cards` from the dep array, so `loadMore`'s identity stays stable across appends.

- [ ] **Step 3: Cancel load-more on filter change**

In the search effect cleanup (around `CardBrowser.tsx:375`):

```tsx
return () => { cancelled = true; controller?.abort(); loadMoreAbortRef.current?.abort() }
```

This kills any in-flight load-more when the user changes filters, preventing late writes.

- [ ] **Step 4: Manual test**

Open `/cards`. Click "Load more" once: new page appears immediately. Click again: appends. Type in search while loading more: previous fetch cancels, search re-runs cleanly.

- [ ] **Step 5: Verify the slow query angle**

Run in Supabase SQL editor (via `mcp__plugin_supabase_supabase__execute_sql` if appropriate):

```sql
EXPLAIN ANALYZE
SELECT * FROM cards
WHERE released_at IS NOT NULL
ORDER BY released_at DESC, id DESC
LIMIT 60 OFFSET 60;
```

Expected: keyset variant (cursor) hits the index scan; offset variant does a sort. If the offset path is what `loadMore` takes for non-default sorts, accept the cost — but log a console warning when the offset path is used so future regressions are visible.

- [ ] **Step 6: Commit**

```bash
git add src/components/cards/CardBrowser.tsx
git commit -m "fix(cards): stabilize loadMore handler + isolate abort controller"
```

---

## Phase 7 — Tap snappiness + scrollbar flicker

### Task 7.1: Drop `scrollbar-gutter: stable` on html

**Files:**
- Modify: `src/app/globals.css:3-9`

- [ ] **Step 1: Remove the rule**

Delete the `html { scrollbar-gutter: stable }` block at lines 3-9. The original justification (avoid layout shift between short/tall pages) is outweighed by the constant gutter on every visit. App pages are typically tall; the few short ones can opt in via a `scrollbar-stable` utility class on their container.

- [ ] **Step 2: Add the opt-in utility**

Append to `globals.css`:

```css
.scrollbar-stable {
  scrollbar-gutter: stable;
}
```

- [ ] **Step 3: Apply `scrollbar-stable` only where needed**

Run: `grep -rln "min-h-screen\|h-screen" src/app/ | head` — the few pages whose body is shorter than the viewport (e.g., login, simple modals) get the class on their root container. Default pages do not.

- [ ] **Step 4: Manual test**

Reload several pages: no constant gutter on the right. Navigate between a short page and a tall one — minimal visible flicker.

### Task 7.2: Drop body-level `touch-action: manipulation`

**Files:**
- Modify: `src/app/globals.css:11-19`

- [ ] **Step 1: Remove `touch-action: manipulation` from `html, body`**

```css
html, body {
  overscroll-behavior-y: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-user-drag: none;
  /* removed: touch-action: manipulation; */
}
```

The browser default already removes the 300ms delay on viewport-fit'd pages with `<meta name="viewport" content="width=device-width, initial-scale=1">`. The global `manipulation` was redundantly forcing pan/zoom-only interpretation, suppressing double-tap-to-zoom semantics that users expect on long content.

- [ ] **Step 2: Apply `touch-action: manipulation` only on interactive controls**

Add a Tailwind utility consumption pattern: keep `style={{ touchAction: 'manipulation' }}` on `<button>` elements that already opted in (HandArea cards in non-draggable mode, deck list rows). No global rule.

- [ ] **Step 3: Manual test on iOS Safari**

Tap rapidly on buttons: snappy, no perceived 300ms delay (Safari defaults are already < 100ms with proper viewport meta). Pinch-zoom on the cards page: works as expected.

### Task 7.3: Scope the `.fixed.inset-0` safe-area rule

**Files:**
- Modify: `src/app/globals.css:51-58`
- Modify: every modal/overlay component (audit via `grep`)

- [ ] **Step 1: Replace global selector with a class**

Change the rule:

```css
.fixed.inset-0 {
  padding-top: env(safe-area-inset-top);
}
```

To:

```css
.safe-area-overlay {
  padding-top: env(safe-area-inset-top);
}
```

- [ ] **Step 2: Add the class to every full-screen overlay**

Run: `grep -rln "fixed inset-0" src/components/ src/app/`

For each match that's a full-screen overlay (modal, drawer, fullscreen confirm), add `safe-area-overlay`. For `<DragOverlay>` from dnd-kit and other portals that are NOT user-facing fullscreen overlays, do not add it.

- [ ] **Step 3: Manual test**

Open a modal on iOS: top inset respected. Drag a card on the goldfish: the dnd-kit overlay no longer gets a 47px top padding (which was offsetting the dragged card from the finger).

- [ ] **Step 4: Commit (consolidated for Phase 7)**

```bash
git add src/app/globals.css src/components/
git commit -m "perf(ui): drop global scrollbar-gutter, body touch-action, and .fixed.inset-0 selector"
```

---

## Phase 8 — Cleanup, docs, verification

### Task 8.1: Update DECISIONS.md

**Files:**
- Modify: `DECISIONS.md`

- [ ] **Step 1: Append entries**

```markdown
- 2026-05-06 — DnD: shared sensors hook `useDeckSensors` (PointerSensor distance:12 + TouchSensor delay:220, tolerance:8). Why: short mobile gestures must remain scroll, only long-press lifts.
- 2026-05-06 — Engine: collapsed `move-graveyard` / `move-exile` / `play-card` zone moves into a single `move-zone` action. Why: every zone is now a DnD source AND target; one reducer branch keeps history messages consistent.
- 2026-05-06 — UI: removed global `scrollbar-gutter: stable` and body-level `touch-action: manipulation`. Why: caused constant right-edge gutter and suppressed legitimate native gestures; opt-in `.scrollbar-stable` for the few short pages.
- 2026-05-06 — UI: replaced selector `.fixed.inset-0 { padding-top: env(...) }` with explicit class `.safe-area-overlay`. Why: previous selector hit dnd-kit DragOverlay and offset dragged cards from the finger by 47px.
```

### Task 8.2: Update CHECKPOINT.md

**Files:**
- Modify: `CHECKPOINT.md`

- [ ] **Step 1: Mark plan complete**

Add a section noting that the mobile-dnd-and-perf plan from 2026-05-06 is implemented and lists which files changed, so the next session can resume.

### Task 8.3: Verify-before-completion gate

**Files:**
- N/A

- [ ] **Step 1: Run the full check sweep**

```bash
pnpm tsc --noEmit
pnpm lint
pnpm build
```

Expected: all green. If `build` fails, fix in place — do not skip.

- [ ] **Step 2: Run the manual mobile sweep**

On iOS Safari (or Responsive design mode):
1. Goldfish: hand scrolls, long-press lifts, drag → graveyard/exile/library/back-to-hand all work.
2. Multiplayer: same matrix.
3. Deck editor: section reorder via grip-only, expand/collapse-all toggles, right padding visible, sections column-tall.
4. Cards browser: load-more on first click appends.
5. Random page: no scrollbar gutter, taps snappy.

- [ ] **Step 3: Commit**

```bash
git add DECISIONS.md CHECKPOINT.md
git commit -m "docs: log decisions + checkpoint after mobile-dnd-and-perf"
```

- [ ] **Step 4: Push (per CLAUDE.md auto-deploy rule)**

```bash
git push origin dev
```

---

## Self-review checklist

- Spec coverage:
  - DnD goldfish/multiplayer mobile to-zone moves: Phases 2 + 3 + 4 ✓
  - DnD all sections incl. back-to-hand: Phase 4 ✓
  - Enlarge graveyard/exile/library: Task 4.1 ZoneStack ✓
  - Mobile DnD + hand scroll: Task 2.1 ✓
  - Mobile DnD glitches incl. deck builder section reorder: Tasks 1.1 + 2.2 + 5.3 ✓
  - Section divider redesign (column-tall, right padding, collapsible): Task 5.1 ✓
  - Expand/collapse-all button: Task 5.2 ✓
  - Cards "load more" first-click + slowness: Task 6.1 ✓
  - Tap/click snappiness + scrollbar flicker: Tasks 7.1 + 7.2 + 7.3 ✓
- Placeholders: none — every step has the actual code or command.
- Type consistency: `Zone` type defined in 3.1 reused in 3.2, 4.1, 4.2, 4.3. `move-zone` action shape stable across reducer + dispatchers.
- Risks: `findCardEverywhere` helper in 3.1 is glossed — engineer must implement (3 lines). Mark as a "must-write inline".

