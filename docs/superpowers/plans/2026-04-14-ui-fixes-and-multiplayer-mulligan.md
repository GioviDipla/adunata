# UI Fixes & Multiplayer Mulligan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 UI/UX issues: collapsible sidebar, deck list hover, card search, mobile nav overflow, deck card zone moves, multiplayer mulligan, combat image overflow, zone viewer filter overlap.

**Architecture:** Each task is independent with no cross-task dependencies. Tasks 1-4 and 7-8 are CSS/UI fixes. Task 5 adds a context menu for moving deck cards between boards. Task 6 adds server-side mulligan flow to multiplayer via new action types in the game engine.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4, Supabase, TypeScript

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/lib/contexts/SidebarContext.tsx` | **Create** — Sidebar collapse state context provider |
| `src/components/Navbar.tsx` | **Modify** — Add collapse toggle, shrink mobile icons |
| `src/app/(app)/layout.tsx` | **Modify** — Wrap in SidebarProvider, use client MainContent wrapper |
| `src/components/cards/CardBrowser.tsx` | **Modify** — Fallback to /api/cards/search when textSearch returns 0 |
| `src/components/deck/DeckCard.tsx` | **Modify** — Add right-click/long-press context menu for board move |
| `src/components/deck/DeckGridView.tsx` | **Modify** — Add right-click/long-press context menu for board move |
| `src/components/deck/DeckTextView.tsx` | **Modify** — Add hover preview, add context menu for board move |
| `src/components/deck/DeckContent.tsx` | **Modify** — Pass onMoveToBoard callback down |
| `src/components/deck/DeckEditor.tsx` | **Modify** — Add handleMoveToBoard handler |
| `src/components/deck/CardContextMenu.tsx` | **Create** — Shared context menu for move-to-board + other actions |
| `src/lib/game/types.ts` | **Modify** — Add mulligan types to GameState |
| `src/lib/game/actions.ts` | **Modify** — Add mulligan/keep/bottom_cards action creators |
| `src/lib/game/engine.ts` | **Modify** — Add mulligan/keep/bottom_cards handlers |
| `src/app/api/lobbies/[id]/start/route.ts` | **Modify** — Initialize game with mulligan stage |
| `src/components/play/PlayGame.tsx` | **Modify** — Add mulligan UI, fix zone viewer z-index |
| `src/components/play/CombatAttackers.tsx` | **Modify** — Constrain card images to grid cells |
| `src/components/play/CombatBlockers.tsx` | **Modify** — Constrain card images to grid cells |
| `src/components/goldfish/CardZoneViewer.tsx` | **Modify** — Fix filter z-index overlap |

---

### Task 1: Collapsible Desktop Sidebar

**Files:**
- Create: `src/lib/contexts/SidebarContext.tsx`
- Modify: `src/components/Navbar.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Create SidebarContext**

Create `src/lib/contexts/SidebarContext.tsx`:

```tsx
'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

interface SidebarContextType {
  collapsed: boolean
  toggle: () => void
}

const SidebarContext = createContext<SidebarContextType>({ collapsed: false, toggle: () => {} })

export function useSidebar() {
  return useContext(SidebarContext)
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved === 'true') setCollapsed(true)
  }, [])

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }

  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  )
}
```

- [ ] **Step 2: Update Navbar with collapse toggle**

In `src/components/Navbar.tsx`:

1. Import `useSidebar` from the context and `PanelLeftClose`, `PanelLeftOpen` from lucide-react.
2. Get `{ collapsed, toggle }` from `useSidebar()`.
3. Change the desktop sidebar `<aside>` classes from `md:w-60` to dynamic: `collapsed ? 'md:w-16' : 'md:w-60'`. Add `transition-all duration-200`.
4. In the logo section: when collapsed, hide the text span and show only the icon.
5. In the nav links: when collapsed, hide the label text and center the icon. Change `px-3` to `justify-center px-0` when collapsed.
6. Add a toggle button at the bottom of the sidebar (before or instead of the Sign out section):

```tsx
<button
  onClick={toggle}
  className="flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-font-secondary transition-colors hover:bg-bg-hover hover:text-font-primary"
  title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
>
  {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
  {!collapsed && <span>Collapse</span>}
</button>
```

7. The Sign out button: when collapsed, hide the text, show only icon.
8. Nav link labels: wrap in `{!collapsed && <span>{item.label}</span>}`.
9. Add `title={item.label}` to each nav Link for tooltip when collapsed.

- [ ] **Step 3: Update layout.tsx**

Convert `src/app/(app)/layout.tsx` to use SidebarProvider and a client wrapper for dynamic main padding:

```tsx
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/get-user";
import { Navbar } from "@/components/Navbar";
import { SidebarProvider } from "@/lib/contexts/SidebarContext";
import { MainContent } from "@/components/MainContent";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-bg-dark">
        <Navbar />
        <MainContent>{children}</MainContent>
      </div>
    </SidebarProvider>
  );
}
```

Create `src/components/MainContent.tsx`:

```tsx
'use client'

import { useSidebar } from '@/lib/contexts/SidebarContext'

export function MainContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar()

  return (
    <main className={`pb-20 md:pb-0 transition-all duration-200 ${collapsed ? 'md:pl-16' : 'md:pl-60'}`}>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Verify sidebar collapses and expands**

Run: `npm run dev`  
Verify: On desktop, clicking the collapse button shrinks sidebar to icons-only (w-16). Clicking again restores to full width (w-60). State persists across page navigations. Mobile bottom nav is unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contexts/SidebarContext.tsx src/components/MainContent.tsx src/components/Navbar.tsx src/app/\(app\)/layout.tsx
git commit -m "feat(ui): collapsible desktop sidebar with localStorage persistence"
```

---

### Task 2: Mouse-over Card Preview in Deck Text View

**Files:**
- Modify: `src/components/deck/DeckTextView.tsx`

- [ ] **Step 1: Add hover preview to DeckTextView**

In `src/components/deck/DeckTextView.tsx`:

1. Add `useState` import.
2. Add state: `const [hoverCard, setHoverCard] = useState<{ card: CardRow; x: number; y: number } | null>(null)`
3. On each card name button, add `onMouseEnter` and `onMouseLeave` handlers:

```tsx
<button
  onClick={() => onCardClick?.(entry.card)}
  onMouseEnter={(e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setHoverCard({ card: entry.card, x: rect.left, y: rect.top })
  }}
  onMouseLeave={() => setHoverCard(null)}
  className={/* existing classes */}
>
  {entry.card.name}
</button>
```

4. At the end of the component (before the closing `</div>` of the root), add the preview:

```tsx
{hoverCard && hoverCard.card.image_normal && (
  <div
    className="pointer-events-none fixed z-50 hidden lg:block"
    style={{
      left: Math.min(hoverCard.x, window.innerWidth - 240),
      top: Math.max(0, hoverCard.y - 320),
    }}
  >
    <img
      src={hoverCard.card.image_normal}
      alt={hoverCard.card.name}
      className="h-auto w-56 rounded-lg shadow-2xl"
    />
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/deck/DeckTextView.tsx
git commit -m "feat(deck): add mouse-over card preview to text view"
```

---

### Task 3: Fix Card Search for Multi-word Names

**Files:**
- Modify: `src/components/cards/CardBrowser.tsx`

The issue: PostgreSQL `websearch_to_tsquery` with English config drops stop words and uses stemming, causing some multi-word card names to fail. Also, cards not yet in the local DB won't appear at all since CardBrowser only queries Supabase directly.

Fix: When textSearch returns 0 results, fall back to the `/api/cards/search` endpoint which does `ilike` on name + Scryfall fallback for both English and Italian.

- [ ] **Step 1: Add fallback search to CardBrowser**

In `src/components/cards/CardBrowser.tsx`, modify the `useEffect` fetch function (lines 103-143):

Replace the `fetchCards()` function body with:

```typescript
async function fetchCards() {
  setLoading(true)

  // Primary: Supabase textSearch (fast, GIN-indexed)
  const { data, error } = await buildQuery(0)

  if (!cancelled) {
    if (error) {
      console.error('Error fetching cards:', error)
      setCards([])
      setHasMore(false)
      setLoading(false)
      return
    }

    // If textSearch found results, use them
    if (data && data.length > 0) {
      setCards(data)
      setHasMore(data.length === PAGE_SIZE)
      setLoading(false)
      return
    }

    // Fallback: if textSearch returned 0 results and we have a search term,
    // try the /api/cards/search endpoint which does ilike + Scryfall fallback
    if (debouncedSearch.trim().length >= 2) {
      try {
        const controller = new AbortController()
        const res = await fetch(
          `/api/cards/search?q=${encodeURIComponent(debouncedSearch.trim())}`,
          { signal: controller.signal }
        )
        if (!cancelled && res.ok) {
          const json = await res.json()
          const fallbackCards = json.cards ?? []
          setCards(fallbackCards)
          setHasMore(false) // Scryfall results are limited, no pagination
          setLoading(false)
          return
        }
      } catch {
        // Ignore abort/fetch errors
      }
    }

    if (!cancelled) {
      setCards(data ?? [])
      setHasMore(false)
      setLoading(false)
    }
  }
}
```

- [ ] **Step 2: Add AbortController to the fallback fetch**

The `useEffect` cleanup already sets `cancelled = true`. For the fallback fetch, store the abort controller in the effect scope and abort on cleanup:

At the top of the useEffect, add:
```typescript
let controller: AbortController | null = null
```

In the fallback fetch block, assign: `controller = new AbortController()` and pass `{ signal: controller.signal }` (already shown above).

In the cleanup return:
```typescript
return () => {
  cancelled = true
  controller?.abort()
}
```

- [ ] **Step 3: Verify search works**

Run: `npm run dev`
Test: Type "altar of dementia" in the Cards search. It should find the card via Scryfall fallback even if not in local DB. Also test Italian: "altare della demenza".

- [ ] **Step 4: Commit**

```bash
git add src/components/cards/CardBrowser.tsx
git commit -m "fix(cards): fallback to Scryfall search when full-text returns 0 results"
```

---

### Task 4: Mobile Bottom Nav Icon Overflow

**Files:**
- Modify: `src/components/Navbar.tsx`

The 6 nav items overflow the bottom bar on small screens. Fix: reduce icon size, padding, and font size.

- [ ] **Step 1: Shrink mobile nav items**

In `src/components/Navbar.tsx`, the mobile bottom nav (line 88):

Change the outer nav from:
```tsx
<nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-border bg-bg-surface px-2 py-1 md:hidden">
```
to:
```tsx
<nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-border bg-bg-surface px-1 py-0.5 md:hidden">
```

Change each Link in the mobile nav from:
```tsx
className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${...}`}
```
to:
```tsx
className={`flex flex-col items-center gap-0 rounded-lg px-1.5 py-1 text-[10px] font-medium transition-colors ${...}`}
```

Change icon size from `<Icon className="h-5 w-5" />` to `<Icon className="h-4 w-4" />`.

Abbreviate the labels for mobile by replacing `<span>{item.label}</span>` with:
```tsx
<span className="truncate max-w-[3.5rem]">{item.label}</span>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Navbar.tsx
git commit -m "fix(mobile): shrink bottom nav icons and labels to prevent overflow"
```

---

### Task 5: Move Cards Between Boards (Sideboard/Maybeboard) in Deck Editor

**Files:**
- Create: `src/components/deck/CardContextMenu.tsx`
- Modify: `src/components/deck/DeckEditor.tsx`
- Modify: `src/components/deck/DeckContent.tsx`
- Modify: `src/components/deck/DeckCard.tsx`
- Modify: `src/components/deck/DeckGridView.tsx`
- Modify: `src/components/deck/DeckTextView.tsx`

- [ ] **Step 1: Create CardContextMenu component**

Create `src/components/deck/CardContextMenu.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { ArrowRight, Trash2 } from 'lucide-react'

interface CardContextMenuProps {
  x: number
  y: number
  currentBoard: string
  onMoveToBoard: (board: string) => void
  onRemove?: () => void
  onClose: () => void
}

const BOARDS = [
  { key: 'main', label: 'Main Deck' },
  { key: 'sideboard', label: 'Sideboard' },
  { key: 'maybeboard', label: 'Maybeboard' },
]

export default function CardContextMenu({
  x, y, currentBoard, onMoveToBoard, onRemove, onClose,
}: CardContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [onClose])

  // Clamp position to viewport
  const menuWidth = 180
  const menuHeight = 160
  const left = Math.min(x, window.innerWidth - menuWidth - 8)
  const top = Math.min(y, window.innerHeight - menuHeight - 8)

  const otherBoards = BOARDS.filter((b) => b.key !== currentBoard)

  return (
    <div
      ref={ref}
      className="fixed z-[100] w-44 rounded-xl border border-border bg-bg-surface py-1 shadow-2xl"
      style={{ left, top }}
    >
      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-font-muted">
        Move to
      </div>
      {otherBoards.map((board) => (
        <button
          key={board.key}
          onClick={() => { onMoveToBoard(board.key); onClose() }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-font-primary transition-colors hover:bg-bg-hover"
        >
          <ArrowRight className="h-3.5 w-3.5 text-font-muted" />
          {board.label}
        </button>
      ))}
      {onRemove && (
        <>
          <div className="mx-2 my-1 border-t border-border" />
          <button
            onClick={() => { onRemove(); onClose() }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-bg-red transition-colors hover:bg-bg-red/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add handleMoveToBoard to DeckEditor**

In `src/components/deck/DeckEditor.tsx`:

Add a new handler after `handleRemove`:

```typescript
const handleMoveToBoard = useCallback(
  async (cardId: number, fromBoard: string, toBoard: string) => {
    // Update local state: change the board property
    setCards((prev) =>
      prev.map((c) =>
        c.card.id === cardId && c.board === fromBoard
          ? { ...c, board: toBoard }
          : c
      )
    )

    // Update in DB
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

Pass `onMoveToBoard={handleMoveToBoard}` to `<DeckContent>`.

- [ ] **Step 3: Thread onMoveToBoard through DeckContent**

In `src/components/deck/DeckContent.tsx`:

1. Add to `DeckContentProps`:
```typescript
onMoveToBoard?: (cardId: number, fromBoard: string, toBoard: string) => void
```

2. Destructure `onMoveToBoard` from props.

3. Pass `onMoveToBoard` to `DeckCard`, `DeckGridView`, and `DeckTextView` in all rendering sections (commander, list, grid, text).

- [ ] **Step 4: Add context menu to DeckCard**

In `src/components/deck/DeckCard.tsx`:

1. Import `CardContextMenu` and `useLongPress` from `@/lib/hooks/useLongPress`.
2. Add `onMoveToBoard` prop:
```typescript
onMoveToBoard?: (cardId: number, fromBoard: string, toBoard: string) => void
```
3. Add state for context menu:
```typescript
const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
```
4. Add long-press hook:
```typescript
const longPress = useLongPress({
  onLongPress: (e: PointerEvent) => {
    setContextMenu({ x: e.clientX, y: e.clientY })
  },
  delay: 500,
})
```
5. Add `onContextMenu` to the row div:
```tsx
onContextMenu={(e) => {
  if (onMoveToBoard) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }
}}
{...(onMoveToBoard ? longPress : {})}
```
6. Render the context menu:
```tsx
{contextMenu && onMoveToBoard && (
  <CardContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    currentBoard={board}
    onMoveToBoard={(toBoard) => onMoveToBoard(card.id, board, toBoard)}
    onRemove={onRemove ? () => onRemove(card.id, board) : undefined}
    onClose={() => setContextMenu(null)}
  />
)}
```

- [ ] **Step 5: Add context menu to DeckGridView**

In `src/components/deck/DeckGridView.tsx`:

1. Import `CardContextMenu` and add `useState`.
2. Add `onMoveToBoard` prop (same signature).
3. Add state:
```typescript
const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cardId: number; board: string } | null>(null)
```
4. On each card wrapper div, add `onContextMenu`:
```tsx
onContextMenu={(e) => {
  if (onMoveToBoard) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, cardId: entry.card.id, board: entry.board })
  }
}}
```
5. After the grid, render:
```tsx
{contextMenu && onMoveToBoard && (
  <CardContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    currentBoard={contextMenu.board}
    onMoveToBoard={(toBoard) => onMoveToBoard(contextMenu.cardId, contextMenu.board, toBoard)}
    onRemove={onRemove ? () => onRemove(contextMenu.cardId, contextMenu.board) : undefined}
    onClose={() => setContextMenu(null)}
  />
)}
```

- [ ] **Step 6: Add context menu to DeckTextView**

In `src/components/deck/DeckTextView.tsx`:

Same pattern as DeckGridView. Add `onMoveToBoard` prop, `contextMenu` state, `onContextMenu` on each card row, render `CardContextMenu`.

- [ ] **Step 7: Verify context menu works**

Run: `npm run dev`
Test: In deck editor, right-click or long-press a card → context menu shows "Move to Sideboard" / "Move to Maybeboard". Clicking moves the card. Verify in all 3 view modes (list, grid, text).

- [ ] **Step 8: Commit**

```bash
git add src/components/deck/CardContextMenu.tsx src/components/deck/DeckEditor.tsx src/components/deck/DeckContent.tsx src/components/deck/DeckCard.tsx src/components/deck/DeckGridView.tsx src/components/deck/DeckTextView.tsx
git commit -m "feat(deck): move cards between boards via right-click/long-press context menu"
```

---

### Task 6: Multiplayer Mulligan

**Files:**
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/actions.ts`
- Modify: `src/lib/game/engine.ts`
- Modify: `src/app/api/lobbies/[id]/start/route.ts`
- Modify: `src/components/play/PlayGame.tsx`

- [ ] **Step 1: Add mulligan types to GameState**

In `src/lib/game/types.ts`:

1. Add new action types to `GameActionType`:
```typescript
| 'mulligan'
| 'keep_hand'
| 'bottom_cards'
```

2. Add mulligan stage to `GameState`:
```typescript
export interface GameState {
  turn: number
  phase: GamePhase
  activePlayerId: string
  priorityPlayerId: string
  firstPlayerId: string
  combat: CombatState
  players: Record<string, PlayerState>
  lastActionSeq: number
  apPassedFirst?: boolean
  /** Mulligan stage: present during pre-game, absent once both players have kept */
  mulliganStage?: {
    /** Per-player mulligan state */
    playerDecisions: Record<string, {
      mulliganCount: number
      decided: boolean       // true = player has chosen to keep
      needsBottomCards: number // how many cards to put on bottom (0 = none needed)
      bottomCardsDone: boolean // true = bottom cards selection completed
    }>
  }
}
```

- [ ] **Step 2: Add mulligan action creators**

In `src/lib/game/actions.ts`, add:

```typescript
export function createMulligan(playerId: string, playerName: string): GameAction {
  return { type: 'mulligan', playerId, data: {}, text: `${playerName} mulligans` }
}

export function createKeepHand(playerId: string, playerName: string, mulliganCount: number): GameAction {
  return {
    type: 'keep_hand', playerId,
    data: { mulliganCount },
    text: `${playerName} keeps hand${mulliganCount > 0 ? ` (mulligan ${mulliganCount})` : ''}`,
  }
}

export function createBottomCards(playerId: string, playerName: string, instanceIds: string[], count: number): GameAction {
  return {
    type: 'bottom_cards', playerId,
    data: { instanceIds, count },
    text: `${playerName} puts ${count} card${count > 1 ? 's' : ''} on bottom`,
  }
}
```

- [ ] **Step 3: Add mulligan handlers to engine**

In `src/lib/game/engine.ts`, add cases in `applyAction`:

```typescript
case 'mulligan':
  return handleMulligan(s, action)
case 'keep_hand':
  return handleKeepHand(s, action)
case 'bottom_cards':
  return handleBottomCards(s, action)
```

Add the handler functions:

```typescript
function handleMulligan(s: GameState, action: GameAction): GameState {
  if (!s.mulliganStage) return s
  const player = s.players[action.playerId]
  const decision = s.mulliganStage.playerDecisions[action.playerId]
  if (!decision || decision.decided) return s

  decision.mulliganCount++

  // Shuffle hand back into library, reshuffle, draw 7
  player.library = [...player.library, ...player.hand]
  player.hand = []

  // Fisher-Yates shuffle
  const lib = player.library
  for (let i = lib.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lib[i], lib[j]] = [lib[j], lib[i]]
  }

  // Draw 7
  player.hand = lib.splice(0, 7)
  player.libraryCount = lib.length
  player.handCount = player.hand.length

  return s
}

function handleKeepHand(s: GameState, action: GameAction): GameState {
  if (!s.mulliganStage) return s
  const decision = s.mulliganStage.playerDecisions[action.playerId]
  if (!decision || decision.decided) return s

  decision.decided = true
  decision.needsBottomCards = decision.mulliganCount
  decision.bottomCardsDone = decision.mulliganCount === 0

  // Check if both players are done with all mulligan steps
  return checkMulliganComplete(s)
}

function handleBottomCards(s: GameState, action: GameAction): GameState {
  if (!s.mulliganStage) return s
  const decision = s.mulliganStage.playerDecisions[action.playerId]
  if (!decision || decision.bottomCardsDone) return s

  const { instanceIds } = action.data as { instanceIds: string[] }
  const player = s.players[action.playerId]

  // Move selected cards from hand to bottom of library
  const toBottom = player.hand.filter((id) => instanceIds.includes(id))
  player.hand = player.hand.filter((id) => !instanceIds.includes(id))
  player.library = [...player.library, ...toBottom]
  player.libraryCount = player.library.length
  player.handCount = player.hand.length

  decision.bottomCardsDone = true

  return checkMulliganComplete(s)
}

function checkMulliganComplete(s: GameState): GameState {
  if (!s.mulliganStage) return s

  const allDone = Object.values(s.mulliganStage.playerDecisions).every(
    (d) => d.decided && d.bottomCardsDone
  )

  if (allDone) {
    // Mulligan complete — remove stage and start the game
    delete s.mulliganStage
  }

  return s
}
```

- [ ] **Step 4: Initialize game with mulligan stage**

In `src/app/api/lobbies/[id]/start/route.ts`, modify the `initialState` (around line 100):

Change:
```typescript
const initialState: GameState = {
  turn: 1,
  phase: 'untap',
  ...
}
```
To:
```typescript
const mulliganDecisions: Record<string, { mulliganCount: number; decided: boolean; needsBottomCards: number; bottomCardsDone: boolean }> = {}
for (const player of players) {
  mulliganDecisions[player.user_id] = {
    mulliganCount: 0,
    decided: false,
    needsBottomCards: 0,
    bottomCardsDone: false,
  }
}

const initialState: GameState = {
  turn: 1,
  phase: 'untap',
  activePlayerId: firstPlayerId,
  priorityPlayerId: firstPlayerId,
  firstPlayerId,
  combat: { phase: null, attackers: [], blockers: [], damageAssigned: false },
  players: playerStates,
  lastActionSeq: 0,
  mulliganStage: {
    playerDecisions: mulliganDecisions,
  },
}
```

- [ ] **Step 5: Add mulligan UI to PlayGame**

In `src/components/play/PlayGame.tsx`:

1. Import the new action creators:
```typescript
import {
  ...,
  createMulligan, createKeepHand, createBottomCards,
} from '@/lib/game/actions'
```

2. Add mulligan handlers after the existing action handlers:

```typescript
const handleMulligan = useCallback(() => {
  sendAction(createMulligan(userId, myName))
}, [sendAction, userId, myName])

const handleKeepHand = useCallback(() => {
  const mulliganCount = gameState?.mulliganStage?.playerDecisions[userId]?.mulliganCount ?? 0
  sendAction(createKeepHand(userId, myName, mulliganCount))
}, [sendAction, userId, myName, gameState])

const handleBottomCardsConfirm = useCallback((selectedIds: string[]) => {
  sendAction(createBottomCards(userId, myName, selectedIds, selectedIds.length))
}, [sendAction, userId, myName])
```

3. Add bottom-cards selection state:
```typescript
const [bottomSelectIds, setBottomSelectIds] = useState<Set<string>>(new Set())
```

4. Before the main game return, add mulligan stage rendering. After the loading/gameOver checks (line ~514), add:

```typescript
// Mulligan stage
if (gameState.mulliganStage) {
  const myDecision = gameState.mulliganStage.playerDecisions[userId]
  const opponentDecision = opponentId ? gameState.mulliganStage.playerDecisions[opponentId] : null

  // Bottom cards selection
  if (myDecision.decided && !myDecision.bottomCardsDone && myDecision.needsBottomCards > 0) {
    const needed = myDecision.needsBottomCards
    return (
      <div className="flex min-h-screen flex-col bg-bg-dark">
        <div className="flex items-center justify-between border-b border-border bg-bg-surface px-4 py-3">
          <span className="text-sm font-semibold text-font-primary">Multiplayer</span>
          <span className="text-xs text-font-muted">Select {needed} card{needed > 1 ? 's' : ''} to put on bottom</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
          <h2 className="text-lg font-bold text-font-primary">Put {needed} Card{needed > 1 ? 's' : ''} on Bottom</h2>
          <p className="text-sm text-font-secondary">Selected: {bottomSelectIds.size} / {needed}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {myHandCards.map((hc) => {
              const isSelected = bottomSelectIds.has(hc.instanceId)
              return (
                <button key={hc.instanceId}
                  onClick={() => {
                    if (!isSelected && bottomSelectIds.size >= needed) return
                    setBottomSelectIds((prev) => {
                      const next = new Set(prev)
                      if (next.has(hc.instanceId)) next.delete(hc.instanceId); else next.add(hc.instanceId)
                      return next
                    })
                  }}
                  className={`relative overflow-hidden rounded-lg border transition-all ${isSelected ? 'border-bg-red ring-2 ring-bg-red/40' : 'border-border-light hover:border-bg-accent'}`}
                  style={{ width: 90, height: 126 }}>
                  {hc.card.image_small ? <img src={hc.card.image_small} alt={hc.card.name} className="h-full w-full object-cover" /> : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-bg-surface p-2">
                      <span className="text-[8px] text-font-secondary">{hc.card.type_line?.split('—')[0].trim()}</span>
                      <span className="text-center text-[10px] font-semibold text-font-primary">{hc.card.name}</span>
                    </div>
                  )}
                  {isSelected && <div className="absolute inset-0 flex items-center justify-center bg-bg-dark/50"><span className="text-xs font-bold text-font-white">BOTTOM</span></div>}
                </button>
              )
            })}
          </div>
          <button
            onClick={() => {
              handleBottomCardsConfirm(Array.from(bottomSelectIds))
              setBottomSelectIds(new Set())
            }}
            disabled={bottomSelectIds.size !== needed}
            className="rounded-xl bg-bg-green px-6 py-2.5 text-sm font-bold text-font-white hover:bg-bg-green/80 disabled:cursor-not-allowed disabled:opacity-40">
            Confirm ({bottomSelectIds.size}/{needed})
          </button>
        </div>
      </div>
    )
  }

  // Mulligan decision (keep or mull)
  if (!myDecision.decided) {
    const mulliganCount = myDecision.mulliganCount
    return (
      <div className="flex min-h-screen flex-col bg-bg-dark">
        <div className="flex items-center justify-between border-b border-border bg-bg-surface px-4 py-3">
          <span className="text-sm font-semibold text-font-primary">Multiplayer</span>
          <span className="text-xs text-font-muted">{mulliganCount > 0 ? `Mulligan ${mulliganCount}` : 'Opening Hand'}</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
          <h2 className="text-lg font-bold text-font-primary">
            {mulliganCount === 0 ? 'Opening Hand' : `Mulligan ${mulliganCount} — Draw 7`}
          </h2>
          <p className="text-sm text-font-secondary">
            {mulliganCount > 0 ? `After keeping, put ${mulliganCount} card${mulliganCount > 1 ? 's' : ''} on bottom.` : 'Keep this hand or mulligan?'}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {myHandCards.map((hc) => (
              <button key={hc.instanceId}
                onClick={() => setPreview({ card: hc.card })}
                className="overflow-hidden rounded-lg border border-border-light transition-transform hover:scale-105"
                style={{ width: 90, height: 126 }}>
                {hc.card.image_small ? <img src={hc.card.image_small} alt={hc.card.name} className="h-full w-full object-cover" /> : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-bg-surface p-2">
                    <span className="text-[8px] text-font-secondary">{hc.card.type_line?.split('—')[0].trim()}</span>
                    <span className="text-center text-[10px] font-semibold text-font-primary">{hc.card.name}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
          {opponentDecision && (
            <p className="text-xs text-font-muted">
              {opponentDecision.decided
                ? (opponentDecision.bottomCardsDone ? 'Opponent is ready' : 'Opponent is selecting bottom cards...')
                : 'Opponent is deciding...'}
            </p>
          )}
          <div className="flex gap-3">
            <button onClick={handleKeepHand} className="rounded-xl bg-bg-green px-6 py-2.5 text-sm font-bold text-font-white hover:bg-bg-green/80">Keep</button>
            <button onClick={handleMulligan} className="rounded-xl bg-bg-accent px-6 py-2.5 text-sm font-bold text-font-white hover:bg-bg-accent-dark">Mulligan</button>
          </div>
        </div>
        <CardPreviewOverlay preview={preview} onClose={closePreview} isCommanderCard={isCommanderCard}
          onTapToggle={handleTapToggle} onReturnToHand={handleReturnToHand} onReturnToCommandZone={handleReturnToCommandZone}
          onSendToGraveyard={handleSendToGraveyard} onExile={handleExile} onPlayCard={handlePlayCard}
          onDiscardFromHand={handleDiscardFromHand} onExileFromHand={handleExileFromHand} onPlayFromCommandZone={handlePlayFromCommandZone} />
      </div>
    )
  }

  // Waiting for opponent
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-dark">
      <span className="text-sm text-font-muted">Waiting for opponent to finish mulligan...</span>
    </div>
  )
}
```

- [ ] **Step 6: Verify mulligan flow**

Run: `npm run dev`
Test in two browser tabs:
1. Start a game → both players see mulligan screen with 7 cards
2. Player 1 clicks Mulligan → hand reshuffled, sees "Mulligan 1 — Draw 7"
3. Player 1 clicks Keep → if mulligan > 0, sees bottom cards selection
4. Select correct number of cards → confirm → waiting for opponent
5. Player 2 keeps → game starts normally with untap phase

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/actions.ts src/lib/game/engine.ts src/app/api/lobbies/\\[id\\]/start/route.ts src/components/play/PlayGame.tsx
git commit -m "feat(multiplayer): add London Mulligan with bottom cards selection"
```

---

### Task 7: Combat Card Images Overflow Fix

**Files:**
- Modify: `src/components/play/CombatAttackers.tsx`
- Modify: `src/components/play/CombatBlockers.tsx`

The card images in combat overlays use fixed pixel heights that can overflow on small screens. Fix: use aspect-ratio with max-height and `object-contain`.

- [ ] **Step 1: Fix CombatAttackers card sizing**

In `src/components/play/CombatAttackers.tsx`:

Change the card button from fixed height to responsive:

Replace:
```tsx
<div className="relative w-full" style={{ height: 100 }}>
  {data.imageSmall ? (
    <img src={data.imageSmall} alt={data.name} className="h-full w-full object-cover" />
```
With:
```tsx
<div className="relative w-full aspect-[5/7] overflow-hidden">
  {data.imageSmall ? (
    <img src={data.imageSmall} alt={data.name} className="h-full w-full object-cover" />
```

Also change the grid from `grid-cols-3 gap-2 sm:grid-cols-4` to `grid-cols-4 gap-1.5 sm:grid-cols-5` to fit more cards in less space.

- [ ] **Step 2: Fix CombatBlockers card sizing**

In `src/components/play/CombatBlockers.tsx`:

Same change for both the attackers grid and blockers grid:

Replace all `style={{ height: 90 }}` with nothing, and change the container div class to `aspect-[5/7] overflow-hidden`:

```tsx
<div className="relative w-full aspect-[5/7] overflow-hidden">
```

Also change grids from `grid-cols-3 gap-2 sm:grid-cols-4` to `grid-cols-4 gap-1.5 sm:grid-cols-5`.

- [ ] **Step 3: Commit**

```bash
git add src/components/play/CombatAttackers.tsx src/components/play/CombatBlockers.tsx
git commit -m "fix(combat): constrain card images to responsive aspect-ratio grid cells"
```

---

### Task 8: Zone Viewer Cards Covering Filters

**Files:**
- Modify: `src/components/goldfish/CardZoneViewer.tsx`

The card grid's hover overlays and scrolling can visually overlap the filter bar. Fix: add `relative z-10` to the header+filter area and `isolate` to the scroll area to create a new stacking context.

- [ ] **Step 1: Fix z-index stacking in CardZoneViewer**

In `src/components/goldfish/CardZoneViewer.tsx`:

1. Change the header div (line 66) to:
```tsx
<div className="relative z-10 flex items-center justify-between border-b border-border px-4 py-3">
```

2. Change the filter bar wrapper (line 80) to:
```tsx
<div className="relative z-10 flex gap-1 overflow-x-auto border-b border-border px-3 py-2">
```

3. Change the card grid scroll area (line 102) to:
```tsx
<div className="isolate flex-1 overflow-y-auto p-3">
```

This ensures the header and filters always render above the card grid, even when cards have absolute-positioned hover overlays.

- [ ] **Step 2: Commit**

```bash
git add src/components/goldfish/CardZoneViewer.tsx
git commit -m "fix(zones): prevent card hover overlays from covering filter bar"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - [x] Collapsible sidebar (Task 1)
   - [x] Mouse-over in deck list mode (Task 2)
   - [x] Card search for full names EN/IT (Task 3)
   - [x] Mobile nav icon overflow (Task 4)
   - [x] Move cards to sideboard/maybeboard (Task 5)
   - [x] Multiplayer mulligan (Task 6)
   - [x] Combat images overflow (Task 7)
   - [x] Zone viewer cards covering filters (Task 8)

2. **Placeholder scan:** No TBD, TODO, or "implement later" found.

3. **Type consistency:** Verified — `mulliganStage`, `playerDecisions`, action types consistent across types.ts, actions.ts, engine.ts, and PlayGame.tsx. `onMoveToBoard` signature `(cardId: number, fromBoard: string, toBoard: string)` is consistent across DeckEditor, DeckContent, DeckCard, DeckGridView, DeckTextView.
