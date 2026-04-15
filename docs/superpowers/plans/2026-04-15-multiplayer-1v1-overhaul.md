# Multiplayer 1v1 Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the multiplayer 1v1 game with 13 features: layout restructure, counters, tokens, commander death choice, library mechanics (Scry/Surveil/Mill/Peak), auto-pass priority, combat damage priority, chat, and opponent card preview.

**Architecture:** The game engine (`engine.ts`) is a pure function `applyAction(state, action) → state` running server-side. The API route `/api/game/[id]/action` applies actions and broadcasts via Supabase Realtime. The client (`PlayGame.tsx`) renders based on `GameState` and sends actions. New features extend the existing action/handler pattern.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + Realtime), TypeScript, Tailwind CSS, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-04-15-multiplayer-1v1-overhaul-design.md`

---

## Phase 1 — Layout & Visuals

### Task 1: Battlefield Layout Restructure + Commander Zone

**Files:**
- Modify: `src/components/play/PlayGame.tsx:652-862` (main game layout)
- Modify: `src/components/play/GameActionBar.tsx` (move to top)

- [ ] **Step 1: Restructure PlayGame layout**

Replace the current layout (lines 652-860) with a bottom-aligned structure. The key change: battlefield grows from bottom up, action bar at top, hand+commander fixed at bottom.

In `src/components/play/PlayGame.tsx`, replace the game layout section (the `return` block starting at line 652):

```tsx
return (
  <div className="relative flex h-[100dvh] flex-col bg-bg-dark">
    {/* Action Bar — fixed top */}
    <GameActionBar
      phase={gameState.phase}
      turn={gameState.turn}
      life={myState.life}
      libraryCount={myState.libraryCount}
      graveyardCount={myState.graveyard.length}
      exileCount={myState.exile.length}
      hasPriority={hasPriority}
      isActivePlayer={isActivePlayer}
      onPassPriority={() => sendAction(createPassPriority(userId, myName))}
      onLifeChange={(amount) => sendAction(createLifeChange(userId, myName, userId, myName, amount))}
      onDraw={() => sendAction(createDraw(userId, myName))}
      onViewZone={setViewingZone}
      onConcede={() => sendAction(createConcede(userId, myName))}
      onConfirmUntap={() => sendAction(createConfirmUntap(userId, myName))}
    />

    {/* Scrollable middle: opponent field + player battlefield */}
    <div className="flex-1 overflow-y-auto">
      {/* Opponent field */}
      <OpponentField
        state={opponentState}
        cardMap={cardMap}
        expanded={opponentExpanded}
        onToggleExpand={() => setOpponentExpanded((v) => !v)}
        onCardPreview={(card) => setPreview({ card })}
      />

      {/* Divider */}
      <div className="border-b border-border/40 mx-3" />

      {/* Player battlefield */}
      <div className="px-3 py-1.5">
        {/* Creatures */}
        <BattlefieldZone
          title="CREATURES" cards={myBattlefieldByZone.creatures}
          onTapToggle={handleTapToggle} onSendToGraveyard={handleSendToGraveyard}
          onExile={handleExile} onReturnToHand={handleReturnToHand}
          onCardPreview={(card, id, tapped) => setPreview({ card, zone: 'battlefield', instanceId: id, tapped })}
        />
        {/* Other permanents */}
        {myBattlefieldByZone.other.length > 0 && (
          <div className="mt-1.5">
            <BattlefieldZone
              title="OTHER" cards={myBattlefieldByZone.other}
              onTapToggle={handleTapToggle} onSendToGraveyard={handleSendToGraveyard}
              onExile={handleExile} onReturnToHand={handleReturnToHand}
              onCardPreview={(card, id, tapped) => setPreview({ card, zone: 'battlefield', instanceId: id, tapped })}
            />
          </div>
        )}
        {/* Lands */}
        <div className="mt-1.5">
          <BattlefieldZone
            title="LANDS" cards={myBattlefieldByZone.lands}
            onTapToggle={handleTapToggle} onSendToGraveyard={handleSendToGraveyard}
            onExile={handleExile} onReturnToHand={handleReturnToHand}
            onCardPreview={(card, id, tapped) => setPreview({ card, zone: 'battlefield', instanceId: id, tapped })}
          />
        </div>
      </div>
    </div>

    {/* Game Log */}
    <GameLog entries={log} myUserId={userId} />

    {/* Hand + Commander Zone — fixed bottom */}
    <div className="border-t border-border bg-bg-card px-3 py-2">
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          <HandArea
            cards={myHandCards}
            onPlayCard={handlePlayCard}
            onCardPreview={(card, instanceId) => setPreview({ card, zone: 'hand', instanceId })}
          />
        </div>
        {/* Commander zone — right of hand */}
        {myState.commandZone.length > 0 && (
          <div className="flex shrink-0 flex-col gap-1">
            <span className="text-[7px] font-bold tracking-wider text-yellow-500 text-center">CMD</span>
            {myState.commandZone.map((c) => {
              const data = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
              return (
                <CommandZoneCard
                  key={c.instanceId}
                  cardId={c.cardId}
                  data={data}
                  onOpenPreview={(row) => setPreview({ card: row, zone: 'commandZone', instanceId: c.instanceId })}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>

    {/* Zone viewers, preview overlay, combat overlays — same as before */}
    {/* ... keep all existing zone viewers, CardPreviewOverlay, CombatAttackers, CombatBlockers, DiscardSelector unchanged ... */}
  </div>
)
```

- [ ] **Step 2: Add `opponentExpanded` state**

At the top of `PlayGame`, add:
```tsx
const [opponentExpanded, setOpponentExpanded] = useState(false)
```

- [ ] **Step 3: Update CommandZoneCard size**

Change the `CommandZoneCard` component style from `{ width: 68, height: 95 }` to `{ width: 48, height: 67 }` for the compact right-of-hand placement.

- [ ] **Step 4: Build and verify**

Run: `npx next build`
Expected: Build succeeds with zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/play/PlayGame.tsx
git commit -m "feat(game): restructure layout — battlefield bottom-aligned, commander zone right of hand"
```

---

### Task 2: Opponent Field Expandable + Card Preview

**Files:**
- Modify: `src/components/play/OpponentField.tsx`

- [ ] **Step 1: Add expand toggle and card preview to OpponentField**

Rewrite `src/components/play/OpponentField.tsx`:

```tsx
'use client'

import { useState, useRef, useCallback } from 'react'
import { Heart, Layers, Archive, Ban, Crown, Maximize2, Minimize2 } from 'lucide-react'
import type { PlayerState, CardMap, BattlefieldCardState } from '@/lib/game/types'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

function toCardRow(cardId: number, data: CardMap[string]): CardRow {
  return {
    id: cardId, scryfall_id: '', name: data.name, mana_cost: data.manaCost ?? null,
    cmc: 0, type_line: data.typeLine, oracle_text: data.oracleText ?? null,
    colors: null, color_identity: [], rarity: '', set_code: '', set_name: '',
    collector_number: '', image_small: data.imageSmall ?? null,
    image_normal: data.imageNormal ?? null, image_art_crop: null,
    prices_usd: null, prices_usd_foil: null, prices_eur: null, prices_eur_foil: null,
    released_at: null, legalities: null, power: data.power ?? null,
    toughness: data.toughness ?? null, keywords: null, produced_mana: null,
    layout: null, card_faces: null, search_vector: null, created_at: '', updated_at: '',
  }
}

function OpponentCard({
  card, cardMap, expanded, onCardPreview,
}: {
  card: BattlefieldCardState; cardMap: CardMap; expanded: boolean
  onCardPreview?: (card: CardRow) => void
}) {
  const data = cardMap[card.instanceId] ?? cardMap[String(card.cardId)]
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggered = useRef(false)

  const size = expanded ? { width: 68, height: 95 } : { width: 48, height: 67 }

  const handlePointerDown = useCallback(() => {
    longPressTriggered.current = false
    timerRef.current = setTimeout(() => {
      longPressTriggered.current = true
      if (data && onCardPreview) onCardPreview(toCardRow(data.cardId, data))
    }, 400)
  }, [data, onCardPreview])

  const handlePointerUp = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }, [])

  const handleClick = useCallback(() => {
    if (longPressTriggered.current) return
    if (data && onCardPreview) onCardPreview(toCardRow(data.cardId, data))
  }, [data, onCardPreview])

  return (
    <button
      className={`overflow-hidden rounded border transition-transform select-none ${
        card.tapped ? 'rotate-90 border-font-muted' : 'border-border'
      } ${card.attacking ? 'ring-1 ring-bg-red' : ''} ${card.highlighted === 'red' ? 'ring-2 ring-bg-red' : ''}`}
      style={size}
      title={data?.name ?? 'Unknown'}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(e) => {
        e.preventDefault()
        if (data && onCardPreview) onCardPreview(toCardRow(data.cardId, data))
      }}
    >
      {data?.imageSmall ? (
        <img src={data.imageSmall} alt={data.name} className="h-full w-full object-cover pointer-events-none" draggable={false} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-bg-cell p-0.5">
          <span className="text-center text-[6px] text-font-muted">{data?.name ?? '?'}</span>
        </div>
      )}
    </button>
  )
}

interface OpponentFieldProps {
  state: PlayerState
  cardMap: CardMap
  expanded: boolean
  onToggleExpand: () => void
  onCardPreview?: (card: CardRow) => void
}

export default function OpponentField({ state, cardMap, expanded, onToggleExpand, onCardPreview }: OpponentFieldProps) {
  const creatures = state.battlefield.filter((c) => {
    const d = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
    return d?.typeLine?.toLowerCase().includes('creature')
  })
  const lands = state.battlefield.filter((c) => {
    const d = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
    return d?.typeLine?.toLowerCase().includes('land')
  })
  const other = state.battlefield.filter((c) => {
    const d = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
    return d && !d.typeLine?.toLowerCase().includes('creature') && !d.typeLine?.toLowerCase().includes('land')
  })

  return (
    <div className="border-b border-border bg-bg-surface/50 px-3 py-2">
      {/* Stats row */}
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-wider text-font-muted">OPPONENT</span>
          <button onClick={onToggleExpand} className="p-0.5 text-font-muted hover:text-font-primary">
            {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Heart size={10} className="text-bg-red" />
            <span className="text-xs font-bold text-font-primary">{state.life}</span>
          </div>
          <div className="flex items-center gap-1 text-font-muted">
            <Layers size={10} /><span className="text-[10px]">{state.libraryCount}</span>
          </div>
          <div className="flex items-center gap-1 text-font-muted">
            <span className="text-[10px]">Hand: {state.handCount}</span>
          </div>
          <div className="flex items-center gap-1 text-font-muted">
            <Archive size={10} /><span className="text-[10px]">{state.graveyard.length}</span>
          </div>
          <div className="flex items-center gap-1 text-font-muted">
            <Ban size={10} /><span className="text-[10px]">{state.exile.length}</span>
          </div>
        </div>
      </div>

      {/* Command zone */}
      {state.commandZone.length > 0 && (
        <div className="mb-1 flex items-center gap-1">
          <Crown size={9} className="text-yellow-500" />
          {state.commandZone.map((c) => {
            const d = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
            return <span key={c.instanceId} className="text-[9px] text-yellow-500">{d?.name ?? '?'}</span>
          })}
        </div>
      )}

      {/* Battlefield */}
      <div className="flex flex-wrap gap-1">
        {[...creatures, ...other, ...lands].map((c) => (
          <OpponentCard key={c.instanceId} card={c} cardMap={cardMap} expanded={expanded} onCardPreview={onCardPreview} />
        ))}
        {state.battlefield.length === 0 && (
          <span className="py-2 text-[9px] text-font-muted">No permanents</span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add readOnly prop to CardPreviewOverlay**

In `src/components/game/CardPreviewOverlay.tsx`, add `readOnly?: boolean` to `CardPreviewOverlayProps` and use it:

```tsx
// In the interface, add:
readOnly?: boolean

// Change hasAnyActions computation:
const hasAnyActions = !readOnly && (canShowBattlefieldActions || canShowHandActions || canShowCommandZoneActions)
```

- [ ] **Step 3: Build and verify**

Run: `npx next build`

- [ ] **Step 4: Commit**

```bash
git add src/components/play/OpponentField.tsx src/components/game/CardPreviewOverlay.tsx
git commit -m "feat(game): opponent field expandable with card preview on tap/longpress"
```

---

### Task 3: Library Viewer — Split Filters & Cards

**Files:**
- Modify: `src/components/goldfish/CardZoneViewer.tsx`

- [ ] **Step 1: Add sticky filter bar and extended library actions**

In `src/components/goldfish/CardZoneViewer.tsx`, add new props and restructure the layout:

```tsx
// Add to CardZoneViewerProps:
onSendToGraveyard?: (instanceId: string) => void
onSendToExile?: (instanceId: string) => void
onSendToBottom?: (instanceId: string) => void
```

Change the filter section (lines 79-99) to be sticky:

```tsx
{cards.length > 0 && (
  <div className="sticky top-0 z-10 flex gap-1 overflow-x-auto bg-bg-surface px-3 py-2 border-b border-border shadow-sm">
    {/* ... same filter buttons ... */}
  </div>
)}
```

Add new action buttons in the card overlay section (lines 133-151), when the new props are provided:

```tsx
{onSendToGraveyard && (
  <button onClick={() => onSendToGraveyard(entry.instanceId)}
    className="flex-1 rounded bg-bg-red/80 px-1 py-1 text-[9px] font-bold text-font-white">
    GY
  </button>
)}
{onSendToExile && (
  <button onClick={() => onSendToExile(entry.instanceId)}
    className="flex-1 rounded bg-font-muted/80 px-1 py-1 text-[9px] font-bold text-font-white">
    Exile
  </button>
)}
{onSendToBottom && (
  <button onClick={() => onSendToBottom(entry.instanceId)}
    className="flex-1 rounded bg-bg-cell/90 px-1 py-1 text-[9px] font-bold text-font-white">
    Bottom
  </button>
)}
```

- [ ] **Step 2: Wire library viewer in PlayGame with all actions**

In `PlayGame.tsx`, update the library viewer section to pass the new callbacks:

```tsx
{viewingZone === 'library' && (
  <CardZoneViewer
    title="Library (top to bottom)"
    cards={libraryCards}
    onClose={() => {
      setViewingZone(null)
      // Log library view
      sendAction({ type: 'library_view' as any, playerId: userId, data: {}, text: `${myName} searched their library` })
    }}
    onReturnToHand={(instanceId) => {
      const data = cardMap[instanceId]
      if (!data) return
      sendAction(createMoveZone(userId, myName, instanceId, data.cardId, data.name, 'library', 'hand'))
    }}
    onReturnToBattlefield={(instanceId) => {
      const data = cardMap[instanceId]
      if (!data) return
      sendAction(createMoveZone(userId, myName, instanceId, data.cardId, data.name, 'library', 'battlefield'))
    }}
    onSendToGraveyard={(instanceId) => {
      const data = cardMap[instanceId]
      if (!data) return
      sendAction(createMoveZone(userId, myName, instanceId, data.cardId, data.name, 'library', 'graveyard'))
    }}
    onSendToExile={(instanceId) => {
      const data = cardMap[instanceId]
      if (!data) return
      sendAction(createMoveZone(userId, myName, instanceId, data.cardId, data.name, 'library', 'exile'))
    }}
    onSendToBottom={(instanceId) => {
      const data = cardMap[instanceId]
      if (!data) return
      sendAction(createMoveZone(userId, myName, instanceId, data.cardId, data.name, 'library', 'libraryBottom'))
    }}
    onCardPreview={(card) => setPreview({ card })}
  />
)}
```

- [ ] **Step 3: Handle `libraryBottom` in engine**

In `src/lib/game/engine.ts`, in `handleMoveZone`, add support for `to === 'libraryBottom'`:

```tsx
} else if (to === 'libraryBottom') {
  player.library.push(instanceId)
  player.libraryCount = player.library.length
}
```

- [ ] **Step 4: Handle `library_view` in action route**

In `src/app/api/game/[id]/action/route.ts`, add a special case before `applyAction` for log-only actions:

```tsx
// Log-only actions (no state change)
if (action.type === 'library_view') {
  const newSeq = currentState.lastActionSeq + 1
  const updatedState = { ...currentState, lastActionSeq: newSeq }
  await admin.from('game_log').insert({
    lobby_id: lobbyId, seq: newSeq, player_id: action.playerId,
    action: action.type, data: (action.data as Json) ?? null, text: action.text,
  })
  await admin.from('game_states').update({
    state_data: updatedState as unknown as Json, updated_at: new Date().toISOString(),
  }).eq('id', gameStateRow.id)
  return NextResponse.json({ state: updatedState, seq: newSeq })
}
```

- [ ] **Step 5: Add `library_view` to GameActionType union**

In `src/lib/game/types.ts`, add `'library_view'` to `GameActionType`.

- [ ] **Step 6: Build and verify**

Run: `npx next build`

- [ ] **Step 7: Commit**

```bash
git add src/components/goldfish/CardZoneViewer.tsx src/components/play/PlayGame.tsx src/lib/game/engine.ts src/app/api/game/[id]/action/route.ts src/lib/game/types.ts
git commit -m "feat(game): library viewer split layout, extended card actions, view logging"
```

---

## Phase 2 — Engine Core Extensions

### Task 4: Types Extension (Counters, Tokens, Commander Tax, Auto-Pass)

**Files:**
- Modify: `src/lib/game/types.ts`

- [ ] **Step 1: Extend all type interfaces**

In `src/lib/game/types.ts`:

Add `counters` to `BattlefieldCardState`:
```typescript
export interface BattlefieldCardState {
  instanceId: string
  cardId: number
  tapped: boolean
  attacking: boolean
  blocking: string | null
  damageMarked: number
  highlighted: 'blue' | 'red' | null
  counters: { name: string; value: number }[]  // NEW
}
```

Add new fields to `PlayerState`:
```typescript
export interface PlayerState {
  life: number
  library: string[]
  libraryCount: number
  hand: string[]
  handCount: number
  battlefield: BattlefieldCardState[]
  graveyard: { instanceId: string; cardId: number }[]
  exile: { instanceId: string; cardId: number }[]
  commandZone: { instanceId: string; cardId: number }[]
  commanderCastCount: number   // NEW
  autoPass: boolean            // NEW
  revealedCards?: {            // NEW
    action: 'scry' | 'surveil' | 'peak'
    instanceIds: string[]
    decisions: Record<string, 'top' | 'bottom' | 'graveyard' | 'hand' | 'exile'>
    topOrder: string[]
  }
}
```

Add `damageApplied` to `CombatState`:
```typescript
export interface CombatState {
  phase: 'declare_attackers' | 'declare_blockers' | 'damage' | null
  attackers: { instanceId: string; targetPlayerId: string }[]
  blockers: { instanceId: string; blockingInstanceId: string }[]
  damageAssigned: boolean
  damageApplied: boolean  // NEW
}
```

Add `pendingCommanderChoice` to `GameState`:
```typescript
export interface GameState {
  // ... existing ...
  pendingCommanderChoice?: {
    playerId: string
    instanceId: string
    cardId: number
    cardName: string
    source: 'graveyard' | 'exile'
  }
}
```

Extend `GameActionType`:
```typescript
export type GameActionType =
  | 'play_card' | 'pass_priority' | 'declare_attackers' | 'declare_blockers'
  | 'combat_damage' | 'draw' | 'discard' | 'tap' | 'untap' | 'move_zone'
  | 'life_change' | 'game_start' | 'phase_change' | 'confirm_untap'
  | 'concede' | 'mulligan' | 'keep_hand' | 'bottom_cards'
  | 'library_view'
  | 'add_counter' | 'remove_counter' | 'set_counter'
  | 'create_token' | 'commander_choice' | 'toggle_auto_pass'
  | 'reveal_top' | 'resolve_revealed' | 'peak' | 'mill' | 'draw_x'
  | 'resolve_combat_damage' | 'chat_message'
```

Extend `LogEntry`:
```typescript
export interface LogEntry {
  id: string
  seq: number
  playerId: string | null
  action: string
  data: Record<string, unknown> | null
  text: string
  createdAt: string
  type?: 'action' | 'chat'  // NEW
}
```

Add `isToken` to `CardMap`:
```typescript
export type CardMap = Record<string, {
  cardId: number; name: string; imageSmall: string | null; imageNormal: string | null
  typeLine: string; manaCost: string | null; power: string | null; toughness: string | null
  oracleText: string | null; isCommander: boolean; isToken: boolean
}>
```

- [ ] **Step 2: Update all places that create BattlefieldCardState to include `counters: []`**

In `engine.ts`, every `player.battlefield.push({...})` and every object literal with `instanceId, cardId, tapped, attacking, blocking, damageMarked, highlighted` must now include `counters: []`. There are 3 occurrences in `handlePlayCard` (lines 178-180, 185, 190) and 1 in `handleMoveZone` (line 246).

- [ ] **Step 3: Update CombatState initializations to include `damageApplied: false`**

In `engine.ts`, every `s.combat = { phase: null, attackers: [], blockers: [], damageAssigned: false }` must add `damageApplied: false`. There are 5 occurrences (lines 99, 128, 156, 286, 373).

- [ ] **Step 4: Update game start route to include new PlayerState fields**

In `src/app/api/lobbies/[id]/start/route.ts`, the initial `PlayerState` creation must include `commanderCastCount: 0`, `autoPass: false`.

- [ ] **Step 5: Update CardMap construction to include `isToken: false`**

In `src/app/api/game/[id]/route.ts`, where CardMap entries are built, add `isToken: false` to each entry.

- [ ] **Step 6: Build and verify**

Run: `npx next build`

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/engine.ts src/app/api/lobbies/[id]/start/route.ts src/app/api/game/[id]/route.ts
git commit -m "feat(game): extend types — counters, tokens, commander tax, auto-pass, combat damage priority"
```

---

### Task 5: Counter Engine Handlers + UI

**Files:**
- Modify: `src/lib/game/engine.ts`
- Modify: `src/lib/game/actions.ts`
- Modify: `src/components/game/CardPreviewOverlay.tsx`
- Modify: `src/components/goldfish/BattlefieldZone.tsx`

- [ ] **Step 1: Add counter handlers to engine**

In `src/lib/game/engine.ts`, add to the switch in `applyAction`:

```typescript
case 'add_counter':
  return handleAddCounter(s, action)
case 'remove_counter':
  return handleRemoveCounter(s, action)
case 'set_counter':
  return handleSetCounter(s, action)
```

Add the handler functions:

```typescript
function handleAddCounter(s: GameState, action: GameAction): GameState {
  const { instanceId, counterName, amount } = action.data as { instanceId: string; counterName: string; amount: number }
  const player = s.players[action.playerId]
  const card = player.battlefield.find((c) => c.instanceId === instanceId)
  if (!card) return s
  const existing = card.counters.find((c) => c.name === counterName)
  if (existing) {
    existing.value += (amount || 1)
    if (existing.value <= 0) card.counters = card.counters.filter((c) => c.name !== counterName)
  } else {
    card.counters.push({ name: counterName, value: amount || 1 })
  }
  return s
}

function handleRemoveCounter(s: GameState, action: GameAction): GameState {
  const { instanceId, counterName, amount } = action.data as { instanceId: string; counterName: string; amount: number }
  const player = s.players[action.playerId]
  const card = player.battlefield.find((c) => c.instanceId === instanceId)
  if (!card) return s
  const existing = card.counters.find((c) => c.name === counterName)
  if (existing) {
    existing.value -= (amount || 1)
    if (existing.value <= 0) card.counters = card.counters.filter((c) => c.name !== counterName)
  }
  return s
}

function handleSetCounter(s: GameState, action: GameAction): GameState {
  const { instanceId, counterName, value } = action.data as { instanceId: string; counterName: string; value: number }
  const player = s.players[action.playerId]
  const card = player.battlefield.find((c) => c.instanceId === instanceId)
  if (!card) return s
  if (value <= 0) {
    card.counters = card.counters.filter((c) => c.name !== counterName)
  } else {
    const existing = card.counters.find((c) => c.name === counterName)
    if (existing) existing.value = value
    else card.counters.push({ name: counterName, value })
  }
  return s
}
```

- [ ] **Step 2: Add counter action creators**

In `src/lib/game/actions.ts`:

```typescript
export function createAddCounter(playerId: string, playerName: string, instanceId: string, cardName: string, counterName: string, amount: number = 1): GameAction {
  return {
    type: 'add_counter', playerId,
    data: { instanceId, counterName, amount },
    text: `${playerName} adds ${counterName} counter to ${cardName}`,
  }
}

export function createRemoveCounter(playerId: string, playerName: string, instanceId: string, cardName: string, counterName: string, amount: number = 1): GameAction {
  return {
    type: 'remove_counter', playerId,
    data: { instanceId, counterName, amount },
    text: `${playerName} removes ${counterName} counter from ${cardName}`,
  }
}
```

- [ ] **Step 3: Add counter badges to BattlefieldZone cards**

In `src/components/goldfish/BattlefieldZone.tsx`, add a `counters` prop to the card rendering. After the card image, add counter badges:

```tsx
{/* Counter badges — bottom-right corner */}
{card.counters && card.counters.length > 0 && (
  <div className="absolute bottom-0.5 right-0.5 flex flex-col gap-0.5">
    {card.counters.map((c) => (
      <span key={c.name} className="rounded bg-bg-accent/90 px-1 text-[7px] font-bold text-font-white leading-tight">
        {c.name}: {c.value}
      </span>
    ))}
  </div>
)}
```

Note: This requires passing `counters` data through to the card. The `BattlefieldCard` type needs a `counters` field and `PlayGame` must pass it from the `BattlefieldCardState`.

- [ ] **Step 4: Add counter management UI to CardPreviewOverlay**

In `src/components/game/CardPreviewOverlay.tsx`, add props:
```tsx
counters?: { name: string; value: number }[]
onAddCounter?: (instanceId: string, counterName: string) => void
onRemoveCounter?: (instanceId: string, counterName: string) => void
```

Add a counters section after the action buttons (inside the `canShowBattlefieldActions` block):

```tsx
{/* Counters */}
{canShowBattlefieldActions && (
  <div className="mt-2 border-t border-border/50 pt-2" onClick={(e) => e.stopPropagation()}>
    <p className="text-[10px] font-bold text-font-muted mb-1">COUNTERS</p>
    {(preview.counters ?? []).map((c) => (
      <div key={c.name} className="flex items-center justify-between py-0.5">
        <span className="text-xs text-font-primary">{c.name}: {c.value}</span>
        <div className="flex gap-1">
          <button onClick={() => onRemoveCounter?.(preview.instanceId!, c.name)}
            className="px-1.5 py-0.5 rounded bg-bg-cell text-xs text-font-secondary">-</button>
          <button onClick={() => onAddCounter?.(preview.instanceId!, c.name)}
            className="px-1.5 py-0.5 rounded bg-bg-cell text-xs text-font-secondary">+</button>
        </div>
      </div>
    ))}
    <button onClick={() => {
      const name = prompt('Counter name:')
      if (name && preview.instanceId) onAddCounter?.(preview.instanceId, name)
    }} className="mt-1 text-[10px] text-font-accent">+ Add Counter</button>
  </div>
)}
```

- [ ] **Step 5: Wire counters in PlayGame**

In `PlayGame.tsx`, pass `counters` from `BattlefieldCardState` through to the preview and BattlefieldZone. Add handlers:

```tsx
const handleAddCounter = useCallback((instanceId: string, counterName: string) => {
  const data = cardMap[instanceId]
  if (!data) return
  sendAction(createAddCounter(userId, myName, instanceId, data.name, counterName))
}, [cardMap, sendAction, userId, myName])

const handleRemoveCounter = useCallback((instanceId: string, counterName: string) => {
  const data = cardMap[instanceId]
  if (!data) return
  sendAction(createRemoveCounter(userId, myName, instanceId, data.name, counterName))
}, [cardMap, sendAction, userId, myName])
```

Pass `counters` to the preview state when setting it from battlefield:
```tsx
// When setting preview from battlefield, include counters:
const bfCard = myState.battlefield.find((c) => c.instanceId === id)
setPreview({ card, zone: 'battlefield', instanceId: id, tapped, counters: bfCard?.counters })
```

- [ ] **Step 6: Build and verify**

Run: `npx next build`

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/engine.ts src/lib/game/actions.ts src/components/game/CardPreviewOverlay.tsx src/components/goldfish/BattlefieldZone.tsx src/components/play/PlayGame.tsx
git commit -m "feat(game): counter system — add/remove/set counters on battlefield cards"
```

---

### Task 6: Token System (DB + DeckBuilder + In-Game)

**Files:**
- Create: `supabase/migrations/20260415000000_deck_tokens.sql`
- Create: `src/app/api/decks/[id]/tokens/route.ts`
- Create: `src/components/play/TokenCreator.tsx`
- Modify: `src/lib/game/engine.ts`
- Modify: `src/lib/game/actions.ts`
- Modify: `src/components/deck/DeckEditor.tsx`
- Modify: `src/components/play/PlayGame.tsx`

- [ ] **Step 1: Create migration**

Create `supabase/migrations/20260415000000_deck_tokens.sql`:

```sql
create table public.deck_tokens (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks(id) on delete cascade,
  name text not null,
  power text,
  toughness text,
  colors text[] default '{}',
  type_line text not null default 'Token Creature',
  keywords text[] default '{}',
  image_url text,
  created_at timestamptz default now()
);

alter table public.deck_tokens enable row level security;

create policy "Users can view tokens in own or public decks"
  on public.deck_tokens for select to authenticated
  using (deck_id in (select id from public.decks where user_id = auth.uid() or visibility = 'public'));

create policy "Users can insert tokens in own decks"
  on public.deck_tokens for insert to authenticated
  with check (deck_id in (select id from public.decks where user_id = auth.uid()));

create policy "Users can update tokens in own decks"
  on public.deck_tokens for update to authenticated
  using (deck_id in (select id from public.decks where user_id = auth.uid()));

create policy "Users can delete tokens in own decks"
  on public.deck_tokens for delete to authenticated
  using (deck_id in (select id from public.decks where user_id = auth.uid()));
```

- [ ] **Step 2: Apply migration**

Run via Supabase MCP: `mcp__plugin_supabase_supabase__apply_migration`

- [ ] **Step 3: Create tokens API route**

Create `src/app/api/decks/[id]/tokens/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: deckId } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('deck_tokens').select('*').eq('deck_id', deckId).order('created_at')
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: deckId } = await params
  const supabase = await createClient()
  const body = await request.json()
  const { data, error } = await supabase.from('deck_tokens').insert({ ...body, deck_id: deckId }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: deckId } = await params
  const supabase = await createClient()
  const { tokenId } = await request.json()
  await supabase.from('deck_tokens').delete().eq('id', tokenId).eq('deck_id', deckId)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Add token handler to engine**

In `src/lib/game/engine.ts`, add to switch:
```typescript
case 'create_token':
  return handleCreateToken(s, action)
```

Add handler:
```typescript
function handleCreateToken(s: GameState, action: GameAction): GameState {
  const { tokens } = action.data as { tokens: { instanceId: string; cardId: number }[] }
  const player = s.players[action.playerId]
  for (const t of tokens) {
    player.battlefield.push({
      instanceId: t.instanceId, cardId: t.cardId,
      tapped: false, attacking: false, blocking: null,
      damageMarked: 0, highlighted: null, counters: [],
    })
  }
  return s
}
```

- [ ] **Step 5: Token removal on zone exit (engine invariant)**

In `handleMoveZone`, after the "Remove from source" block and before the "Add to target" block, add:

```typescript
// Token invariant: tokens cease to exist when leaving battlefield
// (The cardMap check must be done by the caller/API route since engine doesn't have cardMap)
// The API route will strip token moves to non-battlefield zones
```

Actually, the engine doesn't have CardMap access. The token removal must happen in the API route. In `src/app/api/game/[id]/action/route.ts`, after `applyAction` but before saving, check if any tokens left the battlefield and remove them from the state's graveyard/exile/hand arrays. This is handled by passing a `cardMap` context to the API route.

Alternatively — simpler approach: the engine handles it via a new field on the action data. When `move_zone` is called with `isToken: true` and `to !== 'battlefield'`, skip adding to destination.

In `handleMoveZone`, after removing from source:
```typescript
// Token cleanup: if moving a token off battlefield, don't add to destination
const isToken = (action.data as { isToken?: boolean }).isToken
if (isToken && to !== 'battlefield') {
  return s  // token ceases to exist
}
```

- [ ] **Step 6: Create TokenCreator component**

Create `src/components/play/TokenCreator.tsx` — a modal that shows deck tokens and a custom form. This is a new file with the token creation UI. Wire it into PlayGame's special actions area.

- [ ] **Step 7: Add "Tokens" tab to DeckEditor**

In `src/components/deck/DeckEditor.tsx`, add a `'tokens'` option to `BoardTab` and render a token management section when selected. Fetch tokens from `/api/decks/[id]/tokens`.

- [ ] **Step 8: Build and verify**

Run: `npx next build`

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260415000000_deck_tokens.sql src/app/api/decks/[id]/tokens/route.ts src/components/play/TokenCreator.tsx src/lib/game/engine.ts src/lib/game/actions.ts src/components/deck/DeckEditor.tsx src/components/play/PlayGame.tsx
git commit -m "feat(game): token system — deck builder tab, in-game creation, engine support"
```

---

### Task 7: Commander Death Choice

**Files:**
- Create: `src/components/play/CommanderChoiceModal.tsx`
- Modify: `src/lib/game/engine.ts`
- Modify: `src/lib/game/actions.ts`
- Modify: `src/components/play/PlayGame.tsx`

- [ ] **Step 1: Add commander choice handler to engine**

In `engine.ts`, add to switch:
```typescript
case 'commander_choice':
  return handleCommanderChoice(s, action)
```

Add handler:
```typescript
function handleCommanderChoice(s: GameState, action: GameAction): GameState {
  if (!s.pendingCommanderChoice) return s
  if (s.pendingCommanderChoice.playerId !== action.playerId) return s

  const { destination } = action.data as { destination: 'commandZone' | 'graveyard' | 'exile' | 'hand' }
  const { instanceId, cardId, playerId } = s.pendingCommanderChoice
  const player = s.players[playerId]

  if (destination === 'commandZone') {
    player.commandZone.push({ instanceId, cardId })
  } else if (destination === 'graveyard') {
    player.graveyard.push({ instanceId, cardId })
  } else if (destination === 'exile') {
    player.exile.push({ instanceId, cardId })
  } else if (destination === 'hand') {
    player.hand.push(instanceId)
    player.handCount = player.hand.length
    // Auto-pass reset: new card in hand
    player.autoPass = false
  }

  delete s.pendingCommanderChoice
  return s
}
```

- [ ] **Step 2: Modify handleMoveZone to detect commander going to GY/exile**

In `handleMoveZone`, before the "Add to target" section, check for commander:

```typescript
// Commander death choice: if commander is going to graveyard or exile, 
// set pendingCommanderChoice instead of moving
const isCommander = (action.data as { isCommander?: boolean }).isCommander
if (isCommander && (to === 'graveyard' || to === 'exile')) {
  const data = action.data as { cardId: number }
  s.pendingCommanderChoice = {
    playerId: action.playerId,
    instanceId,
    cardId: data.cardId,
    cardName: (action.data as { cardName?: string }).cardName ?? 'Commander',
    source: to as 'graveyard' | 'exile',
  }
  return s
}
```

- [ ] **Step 3: Increment commanderCastCount on cast from CZ**

In `handlePlayCard`, when `from === 'commandZone'`, increment:
```typescript
} else if (from === 'commandZone' && to === 'battlefield') {
  player.commandZone = player.commandZone.filter((c) => c.instanceId !== instanceId)
  const cardId = (action.data as { cardId: number }).cardId
  player.battlefield.push({
    instanceId, cardId, tapped: false, attacking: false, blocking: null, damageMarked: 0, highlighted: null, counters: [],
  })
  player.commanderCastCount++  // NEW: increment tax
}
```

- [ ] **Step 4: Block non-commander_choice actions when pending**

At the top of `applyAction`, add:
```typescript
if (s.pendingCommanderChoice && action.type !== 'commander_choice') {
  return s  // reject all actions until commander choice is resolved
}
```

- [ ] **Step 5: Create CommanderChoiceModal**

Create `src/components/play/CommanderChoiceModal.tsx`:

```tsx
'use client'

import { Crown, Archive, Ban, Hand } from 'lucide-react'
import type { CardMap } from '@/lib/game/types'

interface CommanderChoiceModalProps {
  instanceId: string
  cardId: number
  cardName: string
  source: 'graveyard' | 'exile'
  commanderCastCount: number
  cardMap: CardMap
  onChoose: (destination: 'commandZone' | 'graveyard' | 'exile' | 'hand') => void
}

export default function CommanderChoiceModal({
  instanceId, cardName, source, commanderCastCount, cardMap, onChoose,
}: CommanderChoiceModalProps) {
  const data = cardMap[instanceId]
  const taxAmount = commanderCastCount * 2

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-dark/80 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-xl border border-border bg-bg-surface p-4">
        <h2 className="mb-1 text-center text-lg font-bold text-font-primary">Commander Zone Choice</h2>
        <p className="mb-4 text-center text-sm text-font-secondary">
          {cardName} would go to {source}. Choose destination:
        </p>
        {data?.imageSmall && (
          <img src={data.imageSmall} alt={cardName} className="mx-auto mb-4 h-40 rounded-lg" />
        )}
        <div className="flex flex-col gap-2">
          <button onClick={() => onChoose('commandZone')}
            className="flex items-center gap-3 rounded-lg bg-yellow-500/20 px-4 py-3 text-sm font-medium text-yellow-400 active:bg-yellow-500/30">
            <Crown size={18} />
            <div>
              <div>Command Zone</div>
              <div className="text-[10px] text-yellow-500/70">Next cast: +{taxAmount + 2} tax ({taxAmount} current)</div>
            </div>
          </button>
          <button onClick={() => onChoose('graveyard')}
            className="flex items-center gap-3 rounded-lg bg-bg-cell px-4 py-3 text-sm font-medium text-font-primary active:bg-bg-hover">
            <Archive size={18} className="text-bg-red" /> Graveyard
          </button>
          <button onClick={() => onChoose('exile')}
            className="flex items-center gap-3 rounded-lg bg-bg-cell px-4 py-3 text-sm font-medium text-font-primary active:bg-bg-hover">
            <Ban size={18} className="text-font-muted" /> Exile
          </button>
          <button onClick={() => onChoose('hand')}
            className="flex items-center gap-3 rounded-lg bg-bg-cell px-4 py-3 text-sm font-medium text-font-primary active:bg-bg-hover">
            <Hand size={18} className="text-font-accent" /> Return to Hand
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Wire CommanderChoiceModal in PlayGame**

In `PlayGame.tsx`, render `CommanderChoiceModal` when `gameState.pendingCommanderChoice` is set and it's the current player's choice. Add handler for the choice and update move_zone calls to pass `isCommander` flag.

- [ ] **Step 7: Add action creator**

In `actions.ts`:
```typescript
export function createCommanderChoice(playerId: string, playerName: string, cardName: string, destination: string): GameAction {
  return {
    type: 'commander_choice', playerId,
    data: { destination },
    text: `${playerName} sends ${cardName} to ${destination === 'commandZone' ? 'command zone' : destination}`,
  }
}
```

- [ ] **Step 8: Build and verify**

Run: `npx next build`

- [ ] **Step 9: Commit**

```bash
git add src/lib/game/engine.ts src/lib/game/actions.ts src/components/play/CommanderChoiceModal.tsx src/components/play/PlayGame.tsx
git commit -m "feat(game): commander death choice — modal with CZ/GY/exile/hand + tax tracking"
```

---

## Phase 3 — Priority & Combat

### Task 8: Auto-Pass Priority

**Files:**
- Modify: `src/lib/game/engine.ts`
- Modify: `src/lib/game/actions.ts`
- Modify: `src/app/api/game/[id]/action/route.ts`
- Modify: `src/components/play/GameActionBar.tsx`
- Modify: `src/components/play/PlayGame.tsx`

- [ ] **Step 1: Add auto-pass engine handler**

In `engine.ts`, add to switch:
```typescript
case 'toggle_auto_pass':
  return handleToggleAutoPass(s, action)
```

Handler:
```typescript
function handleToggleAutoPass(s: GameState, action: GameAction): GameState {
  const player = s.players[action.playerId]
  player.autoPass = !player.autoPass
  return s
}
```

- [ ] **Step 2: Add auto-pass reset in all draw/hand handlers**

In `handleDraw`, after `player.hand.push(drawnId)`:
```typescript
player.autoPass = false
```

In `handleMoveZone`, after `player.hand.push(instanceId)` (the `to === 'hand'` branch):
```typescript
player.autoPass = false
```

In `advancePhase`, after the auto-draw in the draw phase (after `ap.hand.push(drawnId)`):
```typescript
ap.autoPass = false
```

- [ ] **Step 3: Server-side auto-pass loop in action route**

In `src/app/api/game/[id]/action/route.ts`, after applying the action, add an auto-pass loop:

```typescript
// Apply action through the engine
let newState = applyAction(currentState, action)

// Auto-pass loop: if the player with priority has autoPass enabled, chain pass_priority
let autoPassLoopCount = 0
const MAX_AUTO_PASSES = 50 // safety limit
while (
  autoPassLoopCount < MAX_AUTO_PASSES &&
  newState.priorityPlayerId &&
  newState.players[newState.priorityPlayerId]?.autoPass &&
  !newState.pendingCommanderChoice &&
  !newState.mulliganStage
) {
  const autoPassAction: GameAction = {
    type: 'pass_priority',
    playerId: newState.priorityPlayerId,
    data: {},
    text: `Auto-pass`,
  }
  newState = applyAction(newState, autoPassAction)
  autoPassLoopCount++

  // Log auto-pass
  await admin.from('game_log').insert({
    lobby_id: lobbyId, seq: newState.lastActionSeq,
    player_id: autoPassAction.playerId, action: 'pass_priority',
    data: null, text: autoPassAction.text,
  })
}
```

- [ ] **Step 4: Add toggle button to GameActionBar**

In `GameActionBar.tsx`, add prop `autoPass: boolean` and `onToggleAutoPass: () => void`. Add a toggle button:

```tsx
{hasPriority && (
  <button onClick={onToggleAutoPass}
    className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 ${
      autoPass ? 'bg-bg-green text-font-white' : 'bg-bg-cell text-font-secondary'
    }`}>
    <SkipForward size={14} />
    <span className="text-[7px] font-bold">{autoPass ? 'AUTO' : 'F6'}</span>
  </button>
)}
```

- [ ] **Step 5: Wire in PlayGame**

Pass `autoPass` and `onToggleAutoPass` to GameActionBar. Create the action creator and handler.

- [ ] **Step 6: Build and verify**

Run: `npx next build`

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/engine.ts src/lib/game/actions.ts src/app/api/game/[id]/action/route.ts src/components/play/GameActionBar.tsx src/components/play/PlayGame.tsx
git commit -m "feat(game): auto-pass priority — F6-style toggle, server-side chaining, auto-reset on draw"
```

---

### Task 9: Combat Damage Priority

**Files:**
- Modify: `src/lib/game/engine.ts`
- Modify: `src/components/play/PlayGame.tsx`

- [ ] **Step 1: Split handleCombatDamage**

In `engine.ts`, modify `handleCombatDamage` to NOT kill creatures — only mark damage:

Replace the post-damage section (lines 353-377) — remove the dead creature loop and phase advance. Instead:

```typescript
// Mark damage applied but don't resolve yet — give priority for responses
s.combat.damageApplied = true
s.phase = 'combat_damage'
s.priorityPlayerId = s.activePlayerId
s.apPassedFirst = false
return s
```

- [ ] **Step 2: Add resolve_combat_damage handler**

```typescript
case 'resolve_combat_damage':
  return handleResolveCombatDamage(s, action)
```

```typescript
function handleResolveCombatDamage(s: GameState, _action: GameAction): GameState {
  // Move all red-highlighted (lethal damage) creatures to graveyard
  for (const pid of Object.keys(s.players)) {
    const player = s.players[pid]
    const dead: BattlefieldCardState[] = []
    const alive: BattlefieldCardState[] = []
    for (const c of player.battlefield) {
      if (c.highlighted === 'red') dead.push(c)
      else alive.push(c)
    }
    player.battlefield = alive.map((c) => ({
      ...c, attacking: false, blocking: null, damageMarked: 0, highlighted: null,
    }))
    for (const c of dead) {
      player.graveyard.push({ instanceId: c.instanceId, cardId: c.cardId })
    }
  }
  s.combat = { phase: null, attackers: [], blockers: [], damageAssigned: true, damageApplied: false }
  s.phase = 'main2'
  s.priorityPlayerId = s.activePlayerId
  s.apPassedFirst = false
  return s
}
```

- [ ] **Step 3: Modify handlePassPriority for combat damage resolution**

In `handlePassPriority`, where both players have passed (the `if (s.apPassedFirst)` block), add a check:

```typescript
if (s.apPassedFirst) {
  s.apPassedFirst = false
  // If combat damage was applied and both pass, resolve it
  if (s.phase === 'combat_damage' && s.combat.damageApplied) {
    return handleResolveCombatDamage(s, action)
  }
  return advancePhase(s)
}
```

- [ ] **Step 4: Remove auto-combat-damage from PlayGame's useEffect**

In `PlayGame.tsx`, the `useEffect` at lines 423-503 auto-calculates and sends combat damage. Modify it to NOT auto-send when `combat.damageApplied` is true (meaning damage was already calculated, we're in the response window):

```tsx
if (gameState.combat.damageApplied) return  // Already calculated, in response window
```

Add this check after `if (combatDamageSentRef.current) return`.

- [ ] **Step 5: Build and verify**

Run: `npx next build`

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/engine.ts src/components/play/PlayGame.tsx
git commit -m "feat(game): combat damage priority — response window before creatures die"
```

---

## Phase 4 — Library Mechanics

### Task 10: Special Actions Menu + Peak

**Files:**
- Create: `src/components/play/SpecialActionsMenu.tsx`
- Modify: `src/components/play/GameActionBar.tsx`
- Modify: `src/components/play/PlayGame.tsx`

- [ ] **Step 1: Create SpecialActionsMenu component**

Create `src/components/play/SpecialActionsMenu.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Wand2, Eye, Shuffle, Skull, BookOpen, X } from 'lucide-react'

interface SpecialActionsMenuProps {
  onPeak: (n: number) => void
  onScry: (n: number) => void
  onSurveil: (n: number) => void
  onMill: (n: number, target: 'self' | 'opponent') => void
  onDrawX: (n: number) => void
  onClose: () => void
}

const ACTIONS = [
  { key: 'peak', label: 'Peak', icon: Eye, color: 'text-font-accent' },
  { key: 'scry', label: 'Scry', icon: Shuffle, color: 'text-blue-400' },
  { key: 'surveil', label: 'Surveil', icon: BookOpen, color: 'text-purple-400' },
  { key: 'mill_self', label: 'Mill (Self)', icon: Skull, color: 'text-bg-red' },
  { key: 'mill_opp', label: 'Mill (Opponent)', icon: Skull, color: 'text-orange-400' },
  { key: 'draw_x', label: 'Draw X', icon: BookOpen, color: 'text-bg-green' },
] as const

export default function SpecialActionsMenu({ onPeak, onScry, onSurveil, onMill, onDrawX, onClose }: SpecialActionsMenuProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [n, setN] = useState(1)

  const handleConfirm = () => {
    if (!selected || n < 1) return
    switch (selected) {
      case 'peak': onPeak(n); break
      case 'scry': onScry(n); break
      case 'surveil': onSurveil(n); break
      case 'mill_self': onMill(n, 'self'); break
      case 'mill_opp': onMill(n, 'opponent'); break
      case 'draw_x': onDrawX(n); break
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg-dark/60" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-xl border border-border bg-bg-surface p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-font-primary">Special Actions</h3>
          <button onClick={onClose} className="text-font-muted"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {ACTIONS.map((a) => {
            const Icon = a.icon
            return (
              <button key={a.key} onClick={() => setSelected(a.key)}
                className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-[10px] font-medium transition-colors ${
                  selected === a.key ? 'bg-bg-accent/20 ring-1 ring-bg-accent' : 'bg-bg-cell'
                } ${a.color}`}>
                <Icon size={16} />
                {a.label}
              </button>
            )
          })}
        </div>
        {selected && (
          <div className="flex items-center gap-3">
            <label className="text-xs text-font-secondary">N:</label>
            <input type="number" min={1} max={10} value={n} onChange={(e) => setN(Math.max(1, Math.min(10, Number(e.target.value))))}
              className="w-16 rounded bg-bg-cell px-2 py-1 text-center text-sm text-font-primary" />
            <button onClick={handleConfirm}
              className="flex-1 rounded-lg bg-bg-accent py-2 text-sm font-bold text-font-white">
              Go
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add Wand2 button to GameActionBar**

In `GameActionBar.tsx`, add an `onSpecialActions: () => void` prop. Add button:

```tsx
<button onClick={onSpecialActions} disabled={!hasPriority}
  className="flex flex-col items-center gap-0.5 rounded-xl bg-bg-cell px-3 py-2 text-font-secondary disabled:opacity-30">
  <Wand2 size={16} /><span className="text-[8px] font-bold">SPECIAL</span>
</button>
```

- [ ] **Step 3: Wire Peak in PlayGame**

Add state `showSpecialActions` and handler for peak (reads top N from library, shows in a simple modal).

- [ ] **Step 4: Build and verify**

Run: `npx next build`

- [ ] **Step 5: Commit**

```bash
git add src/components/play/SpecialActionsMenu.tsx src/components/play/GameActionBar.tsx src/components/play/PlayGame.tsx
git commit -m "feat(game): special actions menu — Peak/Scry/Surveil/Mill/Draw X"
```

---

### Task 11: Scry/Surveil (Reveal & Choose) + Mill + Draw X

**Files:**
- Create: `src/components/play/RevealedCardsChooser.tsx`
- Modify: `src/lib/game/engine.ts`
- Modify: `src/lib/game/actions.ts`
- Modify: `src/components/play/PlayGame.tsx`

- [ ] **Step 1: Add reveal/resolve/mill/draw_x handlers to engine**

In `engine.ts`:

```typescript
case 'reveal_top':
  return handleRevealTop(s, action)
case 'resolve_revealed':
  return handleResolveRevealed(s, action)
case 'mill':
  return handleMill(s, action)
case 'draw_x':
  return handleDrawX(s, action)
```

Handlers:

```typescript
function handleRevealTop(s: GameState, action: GameAction): GameState {
  const { count, actionType } = action.data as { count: number; actionType: 'scry' | 'surveil' | 'peak' }
  const player = s.players[action.playerId]
  const topN = player.library.slice(0, Math.min(count, player.library.length))
  player.revealedCards = {
    action: actionType,
    instanceIds: topN,
    decisions: {},
    topOrder: [],
  }
  return s
}

function handleResolveRevealed(s: GameState, action: GameAction): GameState {
  const player = s.players[action.playerId]
  if (!player.revealedCards) return s
  const { decisions, topOrder } = action.data as {
    decisions: Record<string, 'top' | 'bottom' | 'graveyard' | 'hand' | 'exile'>
    topOrder: string[]
  }

  // Remove all revealed cards from library first
  const revealedSet = new Set(player.revealedCards.instanceIds)
  player.library = player.library.filter((id) => !revealedSet.has(id))

  // Process each decision
  const toBottom: string[] = []
  for (const [instanceId, dest] of Object.entries(decisions)) {
    const cardId = 0 // Will be resolved from cardMap on client; engine just needs instanceId
    if (dest === 'graveyard') {
      player.graveyard.push({ instanceId, cardId })
    } else if (dest === 'hand') {
      player.hand.push(instanceId)
      player.handCount = player.hand.length
      player.autoPass = false
    } else if (dest === 'exile') {
      player.exile.push({ instanceId, cardId })
    } else if (dest === 'bottom') {
      toBottom.push(instanceId)
    }
    // 'top' cards are handled via topOrder
  }

  // Put "top" cards on top of library in order
  if (topOrder.length > 0) {
    player.library = [...topOrder, ...player.library]
  }
  // Put "bottom" cards at bottom
  if (toBottom.length > 0) {
    player.library = [...player.library, ...toBottom]
  }

  player.libraryCount = player.library.length
  delete player.revealedCards
  return s
}

function handleMill(s: GameState, action: GameAction): GameState {
  const { count, targetPlayerId, cardIds } = action.data as { count: number; targetPlayerId: string; cardIds: Record<string, number> }
  const target = s.players[targetPlayerId]
  const milled = target.library.splice(0, Math.min(count, target.library.length))
  for (const instanceId of milled) {
    target.graveyard.push({ instanceId, cardId: cardIds[instanceId] ?? 0 })
  }
  target.libraryCount = target.library.length
  return s
}
// NOTE: The client must resolve instanceId→cardId from CardMap and send cardIds in action.data.
// Same pattern applies to handleResolveRevealed — the client includes cardIds for graveyard/exile moves.

function handleDrawX(s: GameState, action: GameAction): GameState {
  const { count } = action.data as { count: number }
  const player = s.players[action.playerId]
  const drawn = player.library.splice(0, Math.min(count, player.library.length))
  player.hand.push(...drawn)
  player.libraryCount = player.library.length
  player.handCount = player.hand.length
  player.autoPass = false
  return s
}
```

- [ ] **Step 2: Create RevealedCardsChooser component**

Create `src/components/play/RevealedCardsChooser.tsx` — shows the revealed cards with destination buttons (Top/Bottom/Graveyard/Hand/Exile), reorderable "top" pile, and a confirm button.

- [ ] **Step 3: Wire in PlayGame**

Render `RevealedCardsChooser` when `myState.revealedCards` is set. On confirm, send `resolve_revealed` action with decisions and topOrder.

- [ ] **Step 4: Build and verify**

Run: `npx next build`

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/engine.ts src/lib/game/actions.ts src/components/play/RevealedCardsChooser.tsx src/components/play/PlayGame.tsx
git commit -m "feat(game): Scry/Surveil/Mill/Draw X — reveal & choose UI, engine handlers"
```

---

## Phase 5 — Chat

### Task 12: Chat Messages in Game Log

**Files:**
- Create: `supabase/migrations/20260415100000_game_log_type.sql`
- Modify: `src/app/api/game/[id]/action/route.ts`
- Modify: `src/components/play/GameLog.tsx`
- Modify: `src/components/play/PlayGame.tsx`
- Modify: `src/lib/game/types.ts` (already done in Task 4)

- [ ] **Step 1: Create migration**

```sql
alter table public.game_log add column if not exists type text not null default 'action';
```

Apply via Supabase MCP.

- [ ] **Step 2: Handle chat_message in action route**

In `src/app/api/game/[id]/action/route.ts`, add alongside the `library_view` handler:

```typescript
if (action.type === 'chat_message') {
  const newSeq = currentState.lastActionSeq + 1
  const updatedState = { ...currentState, lastActionSeq: newSeq }
  await admin.from('game_log').insert({
    lobby_id: lobbyId, seq: newSeq, player_id: action.playerId,
    action: 'chat_message', data: (action.data as Json) ?? null,
    text: action.text, type: 'chat',
  })
  await admin.from('game_states').update({
    state_data: updatedState as unknown as Json, updated_at: new Date().toISOString(),
  }).eq('id', gameStateRow.id)
  return NextResponse.json({ state: updatedState, seq: newSeq })
}
```

- [ ] **Step 3: Add chat input and rendering to GameLog**

In `src/components/play/GameLog.tsx`:

```tsx
// Add props:
interface GameLogProps {
  entries: LogEntry[]
  myUserId: string
  onSendChat?: (message: string) => void
}

// Add chat input at the bottom:
{onSendChat && (
  <form onSubmit={(e) => {
    e.preventDefault()
    const input = e.currentTarget.querySelector('input') as HTMLInputElement
    if (input.value.trim()) {
      onSendChat(input.value.trim())
      input.value = ''
    }
  }} className="flex gap-1 border-t border-border/50 px-3 py-1.5">
    <input type="text" placeholder="Chat..." maxLength={200}
      className="flex-1 rounded bg-bg-cell px-2 py-1 text-[10px] text-font-primary placeholder:text-font-muted outline-none" />
    <button type="submit" className="rounded bg-bg-accent px-2 py-1 text-[9px] font-bold text-font-white">Send</button>
  </form>
)}

// Render chat entries differently:
<span className={
  entry.type === 'chat'
    ? 'italic text-font-secondary'
    : entry.playerId === myUserId ? 'text-font-accent' : 'text-font-primary'
}>
  {entry.text}
</span>
```

- [ ] **Step 4: Update log parsing for `type` field**

In `PlayGame.tsx`, where log entries are parsed from the realtime subscription and initial fetch, include the `type` field:

```tsx
type: (row.type ?? 'action') as 'action' | 'chat',
```

- [ ] **Step 5: Wire chat in PlayGame**

```tsx
const handleSendChat = useCallback((message: string) => {
  sendAction({
    type: 'chat_message' as GameActionType,
    playerId: userId,
    data: { message },
    text: `${myName}: ${message}`,
  })
}, [sendAction, userId, myName])

// Pass to GameLog:
<GameLog entries={log} myUserId={userId} onSendChat={handleSendChat} />
```

- [ ] **Step 6: Build and verify**

Run: `npx next build`

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260415100000_game_log_type.sql src/app/api/game/[id]/action/route.ts src/components/play/GameLog.tsx src/components/play/PlayGame.tsx
git commit -m "feat(game): in-game chat — messages integrated into game log"
```

---

## Final: Push All Changes

- [ ] **Push to remote**

```bash
git push
```
