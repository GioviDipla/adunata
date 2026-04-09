# Multiplayer 1v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real-time 1v1 MTG matches with lobby system, priority passing, combat phases, and persistent game log.

**Architecture:** Supabase Realtime subscriptions on a `game_states` table. Game log is append-only source of truth in `game_log` table. Server computes state projection after each action. All game actions go through a single `POST /api/game/[id]/action` endpoint. No rule enforcement — tabletop trust model.

**Tech Stack:** Next.js 16 App Router, Supabase (Realtime, Postgres, Auth), TypeScript, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-04-09-multiplayer-1v1-design.md`

---

## File Structure

### Shared Types & Logic
- Create: `src/lib/game/types.ts` — All game state types, action types, phase definitions
- Create: `src/lib/game/engine.ts` — Pure functions: apply action to state, compute damage, validate phase transitions
- Create: `src/lib/game/phases.ts` — Phase/step definitions with combat sub-phases, priority rules per phase
- Create: `src/lib/game/actions.ts` — Action creators (play card, pass priority, declare attackers, etc.)

### API Routes
- Create: `src/app/api/lobbies/route.ts` — POST create lobby, GET list user's lobbies
- Create: `src/app/api/lobbies/join/route.ts` — POST join lobby with code
- Create: `src/app/api/lobbies/[id]/ready/route.ts` — PATCH toggle ready
- Create: `src/app/api/lobbies/[id]/start/route.ts` — POST start game
- Create: `src/app/api/game/[id]/route.ts` — GET initial state + card map
- Create: `src/app/api/game/[id]/action/route.ts` — POST submit game action

### Pages
- Create: `src/app/(app)/play/page.tsx` — Server component: lobby list + create/join
- Create: `src/app/(app)/play/[lobbyId]/page.tsx` — Server component: waiting room
- Create: `src/app/(app)/play/[lobbyId]/game/page.tsx` — Server component: game loader

### Components
- Create: `src/components/play/CreateLobby.tsx` — Create lobby form (deck select)
- Create: `src/components/play/JoinLobby.tsx` — Join with code input
- Create: `src/components/play/WaitingRoom.tsx` — Pre-game: deck select, ready, start
- Create: `src/components/play/PlayGame.tsx` — Main game container, realtime subscription, state management
- Create: `src/components/play/OpponentField.tsx` — Opponent's battlefield + stats (compact)
- Create: `src/components/play/PlayerField.tsx` — Your battlefield (reuses BattlefieldZone)
- Create: `src/components/play/GameLog.tsx` — Collapsible log panel
- Create: `src/components/play/GameActionBar.tsx` — Bottom bar: phase, life, zones, OK/actions
- Create: `src/components/play/PriorityIndicator.tsx` — Green pulse / waiting spinner
- Create: `src/components/play/CombatAttackers.tsx` — Attacker selection UI
- Create: `src/components/play/CombatBlockers.tsx` — Blocker assignment UI
- Create: `src/components/play/DiscardSelector.tsx` — Discard to 7 UI

### Modifications
- Modify: `src/components/Navbar.tsx` — Add "Play" nav item
- Modify: `src/types/supabase.ts` — Add game_log table type, extend game_lobbies/game_players types
- Modify: `src/components/goldfish/BattlefieldZone.tsx` — Add attacking/blocking/damage visual states

---

## Task 1: Database Schema & Types

**Files:**
- Modify: `src/types/supabase.ts`

- [ ] **Step 1: Apply migration for schema changes**

Run the Supabase MCP `apply_migration` tool with name `extend_game_tables_for_multiplayer` and this SQL:

```sql
-- Extend game_lobbies
ALTER TABLE public.game_lobbies ADD COLUMN IF NOT EXISTS winner_id uuid REFERENCES auth.users(id);
ALTER TABLE public.game_lobbies ADD COLUMN IF NOT EXISTS started_at timestamptz;

-- Extend game_players
ALTER TABLE public.game_players ADD COLUMN IF NOT EXISTS ready boolean NOT NULL DEFAULT false;
ALTER TABLE public.game_players ADD COLUMN IF NOT EXISTS is_first boolean;

-- Create game_log
CREATE TABLE IF NOT EXISTS public.game_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id uuid NOT NULL REFERENCES public.game_lobbies(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  player_id uuid,
  action text NOT NULL,
  data jsonb,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lobby_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_game_log_lobby ON public.game_log(lobby_id, seq);

-- RLS for game_log
ALTER TABLE public.game_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Game log readable by lobby players" ON public.game_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.game_players gp WHERE gp.lobby_id = game_log.lobby_id AND gp.user_id = auth.uid())
  );
CREATE POLICY "Game log insertable by lobby players" ON public.game_log
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.game_players gp WHERE gp.lobby_id = game_log.lobby_id AND gp.user_id = auth.uid())
  );

-- Enable realtime on game_states
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_states;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_log;
```

- [ ] **Step 2: Update TypeScript types**

Add to `src/types/supabase.ts` inside the `Tables` object, after `game_states`:

```typescript
game_log: {
  Row: {
    id: string
    lobby_id: string
    seq: number
    player_id: string | null
    action: string
    data: Json | null
    text: string
    created_at: string
  }
  Insert: {
    id?: string
    lobby_id: string
    seq: number
    player_id?: string | null
    action: string
    data?: Json | null
    text: string
    created_at?: string
  }
  Update: {
    id?: string
    lobby_id?: string
    seq?: number
    player_id?: string | null
    action?: string
    data?: Json | null
    text?: string
    created_at?: string
  }
  Relationships: []
}
```

Also extend `game_lobbies` Row/Insert/Update to include `winner_id: string | null` and `started_at: string | null`.

Extend `game_players` Row/Insert/Update to include `ready: boolean` and `is_first: boolean | null`.

- [ ] **Step 3: Commit**

```bash
git add src/types/supabase.ts
git commit -m "feat(mp): extend game tables schema and types for multiplayer"
```

---

## Task 2: Game Types & Phase Definitions

**Files:**
- Create: `src/lib/game/types.ts`
- Create: `src/lib/game/phases.ts`

- [ ] **Step 1: Create game types**

Create `src/lib/game/types.ts`:

```typescript
export interface BattlefieldCardState {
  instanceId: string
  cardId: number
  tapped: boolean
  attacking: boolean
  blocking: string | null  // instanceId of the attacker being blocked
  damageMarked: number
  highlighted: 'blue' | 'red' | null  // blue=untap step, red=lethal damage
}

export interface PlayerState {
  life: number
  library: string[]        // instanceIds — hidden from opponent
  libraryCount: number
  hand: string[]           // instanceIds — hidden from opponent
  handCount: number
  battlefield: BattlefieldCardState[]
  graveyard: { instanceId: string; cardId: number }[]
  exile: { instanceId: string; cardId: number }[]
  commandZone: { instanceId: string; cardId: number }[]
}

export type GamePhase =
  | 'untap' | 'upkeep' | 'draw'
  | 'main1'
  | 'begin_combat' | 'declare_attackers' | 'declare_blockers' | 'combat_damage' | 'end_combat'
  | 'main2'
  | 'end_step' | 'cleanup'

export interface CombatState {
  phase: 'declare_attackers' | 'declare_blockers' | 'damage' | null
  attackers: { instanceId: string; targetPlayerId: string }[]
  blockers: { instanceId: string; blockingInstanceId: string }[]
  damageAssigned: boolean
}

export interface GameState {
  turn: number
  phase: GamePhase
  activePlayerId: string
  priorityPlayerId: string
  firstPlayerId: string
  combat: CombatState
  players: Record<string, PlayerState>
  lastActionSeq: number
}

export type GameActionType =
  | 'play_card'
  | 'pass_priority'
  | 'declare_attackers'
  | 'declare_blockers'
  | 'combat_damage'
  | 'draw'
  | 'discard'
  | 'tap'
  | 'untap'
  | 'move_zone'
  | 'life_change'
  | 'game_start'
  | 'phase_change'
  | 'confirm_untap'
  | 'concede'

export interface GameAction {
  type: GameActionType
  playerId: string
  data: Record<string, unknown>
  text: string
}

export interface LogEntry {
  id: string
  seq: number
  playerId: string | null
  action: string
  data: Record<string, unknown> | null
  text: string
  createdAt: string
}

// Card map: instanceId → card data (built at game start, kept client-side)
export type CardMap = Record<string, { cardId: number; name: string; imageSmall: string | null; imageNormal: string | null; typeLine: string; manaCost: string | null; power: string | null; toughness: string | null; oracleText: string | null }>
```

- [ ] **Step 2: Create phase definitions**

Create `src/lib/game/phases.ts`:

```typescript
import type { GamePhase } from './types'

export interface PhaseDefinition {
  key: GamePhase
  label: string
  hasPriority: boolean       // whether players get priority in this phase
  isActivePlayerOnly: boolean // only AP can act (e.g. declare attackers)
}

export const GAME_PHASES: PhaseDefinition[] = [
  { key: 'untap',             label: 'Untap',             hasPriority: false, isActivePlayerOnly: true },
  { key: 'upkeep',            label: 'Upkeep',            hasPriority: true,  isActivePlayerOnly: false },
  { key: 'draw',              label: 'Draw',              hasPriority: true,  isActivePlayerOnly: false },
  { key: 'main1',             label: 'Main 1',            hasPriority: true,  isActivePlayerOnly: false },
  { key: 'begin_combat',      label: 'Begin Combat',      hasPriority: true,  isActivePlayerOnly: false },
  { key: 'declare_attackers', label: 'Declare Attackers', hasPriority: true,  isActivePlayerOnly: true },
  { key: 'declare_blockers',  label: 'Declare Blockers',  hasPriority: true,  isActivePlayerOnly: true },
  { key: 'combat_damage',     label: 'Combat Damage',     hasPriority: true,  isActivePlayerOnly: false },
  { key: 'end_combat',        label: 'End Combat',        hasPriority: true,  isActivePlayerOnly: false },
  { key: 'main2',             label: 'Main 2',            hasPriority: true,  isActivePlayerOnly: false },
  { key: 'end_step',          label: 'End Step',          hasPriority: true,  isActivePlayerOnly: false },
  { key: 'cleanup',           label: 'Cleanup',           hasPriority: false, isActivePlayerOnly: true },
]

export function getNextPhase(current: GamePhase): GamePhase | null {
  const idx = GAME_PHASES.findIndex((p) => p.key === current)
  if (idx === -1 || idx >= GAME_PHASES.length - 1) return null
  return GAME_PHASES[idx + 1].key
}

export function getPhase(key: GamePhase): PhaseDefinition {
  return GAME_PHASES.find((p) => p.key === key)!
}

export function getOpponentId(state: { players: Record<string, unknown> }, playerId: string): string {
  return Object.keys(state.players).find((id) => id !== playerId)!
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/phases.ts
git commit -m "feat(mp): add game types and phase definitions"
```

---

## Task 3: Game Engine — State Projection & Action Processing

**Files:**
- Create: `src/lib/game/engine.ts`
- Create: `src/lib/game/actions.ts`

- [ ] **Step 1: Create game engine**

Create `src/lib/game/engine.ts` — pure functions that take current state + action → new state:

```typescript
import type { GameState, GameAction, BattlefieldCardState, CombatState } from './types'
import { getNextPhase, getPhase, getOpponentId } from './phases'

export function applyAction(state: GameState, action: GameAction): GameState {
  const s = structuredClone(state)
  s.lastActionSeq++

  switch (action.type) {
    case 'pass_priority':
      return handlePassPriority(s, action)
    case 'play_card':
      return handlePlayCard(s, action)
    case 'tap':
      return handleTap(s, action)
    case 'untap':
      return handleUntap(s, action)
    case 'confirm_untap':
      return handleConfirmUntap(s, action)
    case 'move_zone':
      return handleMoveZone(s, action)
    case 'life_change':
      return handleLifeChange(s, action)
    case 'declare_attackers':
      return handleDeclareAttackers(s, action)
    case 'declare_blockers':
      return handleDeclareBlockers(s, action)
    case 'combat_damage':
      return handleCombatDamage(s, action)
    case 'draw':
      return handleDraw(s, action)
    case 'discard':
      return handleDiscard(s, action)
    case 'phase_change':
      return handlePhaseChange(s, action)
    case 'concede':
      return s // handled at API level
    default:
      return s
  }
}

function handlePassPriority(s: GameState, action: GameAction): GameState {
  const opponentId = getOpponentId(s, action.playerId)

  // If the person passing is NOT the one with priority, ignore
  if (s.priorityPlayerId !== action.playerId) return s

  // If priority was with AP and AP passes, give to NAP
  if (s.priorityPlayerId === s.activePlayerId) {
    s.priorityPlayerId = opponentId
    return s
  }

  // NAP is passing — both have now passed. Advance phase.
  return advancePhase(s)
}

function advancePhase(s: GameState): GameState {
  const currentPhase = s.phase
  const nextPhaseKey = getNextPhase(currentPhase)

  // Handle combat sub-phase advancement
  if (currentPhase === 'declare_attackers' && s.combat.phase === 'declare_attackers') {
    s.phase = 'declare_blockers'
    s.combat.phase = 'declare_blockers'
    s.priorityPlayerId = getOpponentId(s, s.activePlayerId) // NAP declares blockers
    return s
  }
  if (currentPhase === 'declare_blockers' && s.combat.phase === 'declare_blockers') {
    s.phase = 'combat_damage'
    s.combat.phase = 'damage'
    s.priorityPlayerId = s.activePlayerId
    return s
  }

  if (!nextPhaseKey) {
    // End of turn — swap active player
    const opponentId = getOpponentId(s, s.activePlayerId)
    s.turn++
    s.phase = 'untap'
    s.activePlayerId = opponentId
    s.priorityPlayerId = opponentId
    s.combat = { phase: null, attackers: [], blockers: [], damageAssigned: false }

    // Highlight tapped permanents blue for untap step
    const ap = s.players[opponentId]
    ap.battlefield = ap.battlefield.map((c) => ({
      ...c,
      highlighted: c.tapped ? 'blue' : null,
    }))
    return s
  }

  s.phase = nextPhaseKey

  // Phase-specific setup
  if (nextPhaseKey === 'draw') {
    // Auto-draw (skip turn 1 for first player)
    const skipDraw = s.turn === 1 && s.activePlayerId === s.firstPlayerId
    if (!skipDraw) {
      const ap = s.players[s.activePlayerId]
      if (ap.library.length > 0) {
        const drawnId = ap.library.shift()!
        ap.hand.push(drawnId)
        ap.libraryCount = ap.library.length
        ap.handCount = ap.hand.length
      }
    }
  }

  if (nextPhaseKey === 'begin_combat') {
    s.combat = { phase: null, attackers: [], blockers: [], damageAssigned: false }
  }

  if (nextPhaseKey === 'declare_attackers') {
    s.combat.phase = 'declare_attackers'
  }

  if (nextPhaseKey === 'end_combat') {
    // Move lethal-damage creatures to graveyard
    for (const pid of Object.keys(s.players)) {
      const player = s.players[pid]
      const dead: BattlefieldCardState[] = []
      const alive: BattlefieldCardState[] = []
      for (const c of player.battlefield) {
        if (c.highlighted === 'red') dead.push(c)
        else alive.push(c)
      }
      player.battlefield = alive.map((c) => ({
        ...c,
        attacking: false,
        blocking: null,
        damageMarked: 0,
        highlighted: null,
      }))
      for (const c of dead) {
        player.graveyard.push({ instanceId: c.instanceId, cardId: c.cardId })
      }
    }
    s.combat = { phase: null, attackers: [], blockers: [], damageAssigned: false }
  }

  if (nextPhaseKey === 'cleanup') {
    // Cleanup is auto — just set priority to AP for discard
    s.priorityPlayerId = s.activePlayerId
    return s
  }

  // Default: AP gets priority
  const phaseDef = getPhase(nextPhaseKey)
  s.priorityPlayerId = phaseDef.hasPriority ? s.activePlayerId : s.activePlayerId
  return s
}

function handlePlayCard(s: GameState, action: GameAction): GameState {
  const { instanceId, from, to } = action.data as { instanceId: string; from: string; to: string }
  const player = s.players[action.playerId]

  if (from === 'hand' && to === 'battlefield') {
    player.hand = player.hand.filter((id) => id !== instanceId)
    player.handCount = player.hand.length
    const cardId = (action.data as { cardId: number }).cardId
    player.battlefield.push({
      instanceId, cardId, tapped: false, attacking: false, blocking: null, damageMarked: 0, highlighted: null,
    })
  } else if (from === 'hand' && to === 'graveyard') {
    player.hand = player.hand.filter((id) => id !== instanceId)
    player.handCount = player.hand.length
    const cardId = (action.data as { cardId: number }).cardId
    player.graveyard.push({ instanceId, cardId })
  } else if (from === 'commandZone' && to === 'battlefield') {
    player.commandZone = player.commandZone.filter((c) => c.instanceId !== instanceId)
    const cardId = (action.data as { cardId: number }).cardId
    player.battlefield.push({
      instanceId, cardId, tapped: false, attacking: false, blocking: null, damageMarked: 0, highlighted: null,
    })
  }

  // After playing a card, opponent gets priority
  s.priorityPlayerId = getOpponentId(s, action.playerId)
  return s
}

function handleTap(s: GameState, action: GameAction): GameState {
  const { instanceId } = action.data as { instanceId: string }
  const player = s.players[action.playerId]
  const card = player.battlefield.find((c) => c.instanceId === instanceId)
  if (card) card.tapped = true
  return s
}

function handleUntap(s: GameState, action: GameAction): GameState {
  const { instanceId } = action.data as { instanceId: string }
  const player = s.players[action.playerId]
  const card = player.battlefield.find((c) => c.instanceId === instanceId)
  if (card) { card.tapped = false; card.highlighted = null }
  return s
}

function handleConfirmUntap(s: GameState, _action: GameAction): GameState {
  // Clear all blue highlights, advance from untap
  const ap = s.players[s.activePlayerId]
  ap.battlefield = ap.battlefield.map((c) => ({ ...c, highlighted: null }))
  return advancePhase(s)
}

function handleMoveZone(s: GameState, action: GameAction): GameState {
  const { instanceId, from, to, cardId } = action.data as {
    instanceId: string; from: string; to: string; cardId: number
  }
  const player = s.players[action.playerId]

  // Remove from source
  if (from === 'battlefield') {
    player.battlefield = player.battlefield.filter((c) => c.instanceId !== instanceId)
  } else if (from === 'hand') {
    player.hand = player.hand.filter((id) => id !== instanceId)
    player.handCount = player.hand.length
  } else if (from === 'graveyard') {
    player.graveyard = player.graveyard.filter((c) => c.instanceId !== instanceId)
  } else if (from === 'exile') {
    player.exile = player.exile.filter((c) => c.instanceId !== instanceId)
  }

  // Add to target
  if (to === 'battlefield') {
    player.battlefield.push({ instanceId, cardId, tapped: false, attacking: false, blocking: null, damageMarked: 0, highlighted: null })
  } else if (to === 'hand') {
    player.hand.push(instanceId)
    player.handCount = player.hand.length
  } else if (to === 'graveyard') {
    player.graveyard.push({ instanceId, cardId })
  } else if (to === 'exile') {
    player.exile.push({ instanceId, cardId })
  } else if (to === 'commandZone') {
    player.commandZone.push({ instanceId, cardId })
  }

  return s
}

function handleLifeChange(s: GameState, action: GameAction): GameState {
  const { targetPlayerId, amount } = action.data as { targetPlayerId: string; amount: number }
  s.players[targetPlayerId].life += amount
  return s
}

function handleDeclareAttackers(s: GameState, action: GameAction): GameState {
  const { attackerIds } = action.data as { attackerIds: string[] }
  const player = s.players[action.playerId]
  const opponentId = getOpponentId(s, action.playerId)

  s.combat.attackers = attackerIds.map((id) => ({ instanceId: id, targetPlayerId: opponentId }))

  // Mark attackers on battlefield + auto-tap (player could have untapped for vigilance before)
  for (const card of player.battlefield) {
    if (attackerIds.includes(card.instanceId)) {
      card.attacking = true
      // Auto-tap attackers (player can manually untap for vigilance via separate action before confirming)
      card.tapped = true
    }
  }

  // After declaring, AP gets priority, then NAP
  s.priorityPlayerId = action.playerId
  return s
}

function handleDeclareBlockers(s: GameState, action: GameAction): GameState {
  const { blockerAssignments } = action.data as { blockerAssignments: { blockerId: string; attackerId: string }[] }
  const player = s.players[action.playerId]

  s.combat.blockers = blockerAssignments.map((b) => ({
    instanceId: b.blockerId,
    blockingInstanceId: b.attackerId,
  }))

  for (const card of player.battlefield) {
    const assignment = blockerAssignments.find((b) => b.blockerId === card.instanceId)
    if (assignment) {
      card.blocking = assignment.attackerId
    }
  }

  // After declaring blockers, AP gets priority
  s.priorityPlayerId = s.activePlayerId
  return s
}

function handleCombatDamage(s: GameState, _action: GameAction): GameState {
  const ap = s.players[s.activePlayerId]
  const napId = getOpponentId(s, s.activePlayerId)
  const nap = s.players[napId]

  for (const atk of s.combat.attackers) {
    const attackerCard = ap.battlefield.find((c) => c.instanceId === atk.instanceId)
    if (!attackerCard) continue

    // Find blockers for this attacker
    const blockerAssignments = s.combat.blockers.filter((b) => b.blockingInstanceId === atk.instanceId)

    if (blockerAssignments.length === 0) {
      // Unblocked — damage to player
      // We need power from the card map, but engine doesn't have it.
      // The API layer will pass power/toughness in action.data
    } else {
      // Blocked — mutual damage (simplified: handled by action.data from client)
    }
  }

  // Combat damage is calculated client-side and sent via action.data
  // because the engine doesn't have the card stats. The action includes:
  // { damageToPlayer: number, creaturesDamaged: [{ instanceId, damage }] }
  const { damageToPlayer, creaturesDamaged } = _action.data as {
    damageToPlayer: number
    creaturesDamaged: { instanceId: string; playerId: string; damage: number; lethal: boolean }[]
  }

  if (damageToPlayer) {
    nap.life -= damageToPlayer
  }

  for (const cd of creaturesDamaged ?? []) {
    const player = s.players[cd.playerId]
    const card = player.battlefield.find((c) => c.instanceId === cd.instanceId)
    if (card) {
      card.damageMarked += cd.damage
      if (cd.lethal) card.highlighted = 'red'
    }
  }

  s.combat.damageAssigned = true
  s.priorityPlayerId = s.activePlayerId
  return s
}

function handleDraw(s: GameState, action: GameAction): GameState {
  const player = s.players[action.playerId]
  if (player.library.length > 0) {
    const drawnId = player.library.shift()!
    player.hand.push(drawnId)
    player.libraryCount = player.library.length
    player.handCount = player.hand.length
  }
  return s
}

function handleDiscard(s: GameState, action: GameAction): GameState {
  const { instanceId, cardId } = action.data as { instanceId: string; cardId: number }
  const player = s.players[action.playerId]
  player.hand = player.hand.filter((id) => id !== instanceId)
  player.handCount = player.hand.length
  player.graveyard.push({ instanceId, cardId })
  return s
}

function handlePhaseChange(s: GameState, _action: GameAction): GameState {
  return advancePhase(s)
}
```

- [ ] **Step 2: Create action creators**

Create `src/lib/game/actions.ts`:

```typescript
import type { GameAction } from './types'

export function createPassPriority(playerId: string, playerName: string): GameAction {
  return { type: 'pass_priority', playerId, data: {}, text: `${playerName}: OK` }
}

export function createPlayCard(playerId: string, playerName: string, instanceId: string, cardId: number, cardName: string, from: string, to: string): GameAction {
  return {
    type: 'play_card', playerId,
    data: { instanceId, cardId, from, to, cardName },
    text: `${playerName} plays ${cardName}`,
  }
}

export function createTap(playerId: string, playerName: string, instanceId: string, cardName: string): GameAction {
  return { type: 'tap', playerId, data: { instanceId }, text: `${playerName} taps ${cardName}` }
}

export function createUntap(playerId: string, playerName: string, instanceId: string, cardName: string): GameAction {
  return { type: 'untap', playerId, data: { instanceId }, text: `${playerName} untaps ${cardName}` }
}

export function createConfirmUntap(playerId: string, playerName: string): GameAction {
  return { type: 'confirm_untap', playerId, data: {}, text: `${playerName} finishes untap step` }
}

export function createDeclareAttackers(playerId: string, playerName: string, attackerIds: string[], attackerNames: string[]): GameAction {
  const names = attackerNames.length > 0 ? attackerNames.join(', ') : 'no creatures'
  return {
    type: 'declare_attackers', playerId,
    data: { attackerIds },
    text: `${playerName} declares attackers: ${names}`,
  }
}

export function createDeclareBlockers(playerId: string, playerName: string, blockerAssignments: { blockerId: string; attackerId: string; blockerName: string; attackerName: string }[]): GameAction {
  const desc = blockerAssignments.length > 0
    ? blockerAssignments.map((b) => `${b.blockerName} blocks ${b.attackerName}`).join(', ')
    : 'no blockers'
  return {
    type: 'declare_blockers', playerId,
    data: { blockerAssignments: blockerAssignments.map((b) => ({ blockerId: b.blockerId, attackerId: b.attackerId })) },
    text: `${playerName} declares blockers: ${desc}`,
  }
}

export function createCombatDamage(playerId: string, damageToPlayer: number, creaturesDamaged: { instanceId: string; playerId: string; damage: number; lethal: boolean }[], description: string): GameAction {
  return {
    type: 'combat_damage', playerId,
    data: { damageToPlayer, creaturesDamaged },
    text: description,
  }
}

export function createMoveZone(playerId: string, playerName: string, instanceId: string, cardId: number, cardName: string, from: string, to: string): GameAction {
  return {
    type: 'move_zone', playerId,
    data: { instanceId, cardId, from, to },
    text: `${playerName} moves ${cardName} from ${from} to ${to}`,
  }
}

export function createLifeChange(playerId: string, playerName: string, targetPlayerId: string, targetName: string, amount: number): GameAction {
  const dir = amount > 0 ? 'gains' : 'loses'
  return {
    type: 'life_change', playerId,
    data: { targetPlayerId, amount },
    text: `${targetName} ${dir} ${Math.abs(amount)} life`,
  }
}

export function createDiscard(playerId: string, playerName: string, instanceId: string, cardId: number, cardName: string): GameAction {
  return {
    type: 'discard', playerId,
    data: { instanceId, cardId },
    text: `${playerName} discards ${cardName}`,
  }
}

export function createConcede(playerId: string, playerName: string): GameAction {
  return { type: 'concede', playerId, data: {}, text: `${playerName} concedes` }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/game/engine.ts src/lib/game/actions.ts
git commit -m "feat(mp): game engine and action creators"
```

---

## Task 4: Lobby API Routes

**Files:**
- Create: `src/app/api/lobbies/route.ts`
- Create: `src/app/api/lobbies/join/route.ts`
- Create: `src/app/api/lobbies/[id]/ready/route.ts`
- Create: `src/app/api/lobbies/[id]/start/route.ts`

- [ ] **Step 1: Create lobby CRUD route**

Create `src/app/api/lobbies/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous chars
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { deckId, format } = await request.json()
  if (!deckId) return NextResponse.json({ error: 'deckId required' }, { status: 400 })

  // Verify deck ownership
  const { data: deck } = await supabase.from('decks').select('id, format').eq('id', deckId).eq('user_id', user.id).single()
  if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 })

  const lobbyCode = generateCode()

  const { data: lobby, error } = await supabase.from('game_lobbies').insert({
    host_user_id: user.id,
    lobby_code: lobbyCode,
    format: format || deck.format,
    status: 'waiting',
    max_players: 2,
  }).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Add host as first player
  await supabase.from('game_players').insert({
    lobby_id: lobby.id,
    user_id: user.id,
    deck_id: deckId,
    seat_position: 1,
  })

  return NextResponse.json({ lobby }, { status: 201 })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: lobbies } = await supabase
    .from('game_players')
    .select('lobby:game_lobbies!lobby_id(*)')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ lobbies: lobbies?.map((l) => l.lobby).filter(Boolean) ?? [] })
}
```

- [ ] **Step 2: Create join route**

Create `src/app/api/lobbies/join/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code, deckId } = await request.json()
  if (!code || !deckId) return NextResponse.json({ error: 'code and deckId required' }, { status: 400 })

  // Find lobby
  const { data: lobby } = await supabase
    .from('game_lobbies')
    .select('*')
    .eq('lobby_code', code.toUpperCase())
    .eq('status', 'waiting')
    .single()

  if (!lobby) return NextResponse.json({ error: 'Lobby not found or already started' }, { status: 404 })
  if (lobby.host_user_id === user.id) return NextResponse.json({ error: 'Cannot join your own lobby' }, { status: 400 })

  // Check not already joined
  const { data: existing } = await supabase
    .from('game_players')
    .select('id')
    .eq('lobby_id', lobby.id)
    .eq('user_id', user.id)
    .single()

  if (existing) return NextResponse.json({ error: 'Already in this lobby' }, { status: 400 })

  // Check player count
  const { count } = await supabase
    .from('game_players')
    .select('*', { count: 'exact', head: true })
    .eq('lobby_id', lobby.id)

  if ((count ?? 0) >= lobby.max_players) return NextResponse.json({ error: 'Lobby is full' }, { status: 400 })

  // Verify deck ownership
  const { data: deck } = await supabase.from('decks').select('id').eq('id', deckId).eq('user_id', user.id).single()
  if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 })

  // Join
  const { error } = await supabase.from('game_players').insert({
    lobby_id: lobby.id,
    user_id: user.id,
    deck_id: deckId,
    seat_position: 2,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ lobby })
}
```

- [ ] **Step 3: Create ready toggle route**

Create `src/app/api/lobbies/[id]/ready/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lobbyId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: player } = await supabase
    .from('game_players')
    .select('id, ready')
    .eq('lobby_id', lobbyId)
    .eq('user_id', user.id)
    .single()

  if (!player) return NextResponse.json({ error: 'Not in this lobby' }, { status: 404 })

  const { error } = await supabase
    .from('game_players')
    .update({ ready: !player.ready })
    .eq('id', player.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ready: !player.ready })
}
```

- [ ] **Step 4: Create start game route**

Create `src/app/api/lobbies/[id]/start/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { GameState, CardMap } from '@/lib/game/types'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lobbyId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify host
  const { data: lobby } = await supabase
    .from('game_lobbies')
    .select('*')
    .eq('id', lobbyId)
    .eq('host_user_id', user.id)
    .eq('status', 'waiting')
    .single()

  if (!lobby) return NextResponse.json({ error: 'Not host or lobby not found' }, { status: 404 })

  // Get players
  const { data: players } = await supabase
    .from('game_players')
    .select('*')
    .eq('lobby_id', lobbyId)
    .order('seat_position')

  if (!players || players.length !== 2) {
    return NextResponse.json({ error: 'Need exactly 2 players' }, { status: 400 })
  }

  if (!players.every((p) => p.ready)) {
    return NextResponse.json({ error: 'All players must be ready' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Build decks for each player
  const playerStates: Record<string, GameState['players'][string]> = {}
  let instanceCounter = 0

  for (const player of players) {
    const { data: deckCards } = await admin
      .from('deck_cards')
      .select('card_id, quantity, board, card:cards!card_id(*)')
      .eq('deck_id', player.deck_id)

    const library: string[] = []
    const commandZone: { instanceId: string; cardId: number }[] = []

    for (const dc of deckCards ?? []) {
      if (!dc.card) continue
      const card = dc.card as unknown as { id: number }

      if (dc.board === 'commander') {
        const iid = `ci-${++instanceCounter}`
        commandZone.push({ instanceId: iid, cardId: card.id })
      } else if (dc.board === 'main') {
        for (let i = 0; i < dc.quantity; i++) {
          library.push(`ci-${++instanceCounter}`)
        }
      }
    }

    // Shuffle library
    for (let i = library.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [library[i], library[j]] = [library[j], library[i]]
    }

    // Draw 7
    const hand = library.splice(0, 7)

    playerStates[player.user_id] = {
      life: 20,
      library,
      libraryCount: library.length,
      hand,
      handCount: hand.length,
      battlefield: [],
      graveyard: [],
      exile: [],
      commandZone,
    }
  }

  // Coin flip
  const firstPlayerIdx = Math.random() < 0.5 ? 0 : 1
  const firstPlayerId = players[firstPlayerIdx].user_id

  await admin.from('game_players').update({ is_first: true }).eq('user_id', firstPlayerId).eq('lobby_id', lobbyId)
  await admin.from('game_players').update({ is_first: false }).eq('user_id', players[1 - firstPlayerIdx].user_id).eq('lobby_id', lobbyId)

  const initialState: GameState = {
    turn: 1,
    phase: 'untap',
    activePlayerId: firstPlayerId,
    priorityPlayerId: firstPlayerId,
    firstPlayerId,
    combat: { phase: null, attackers: [], blockers: [], damageAssigned: false },
    players: playerStates,
    lastActionSeq: 0,
  }

  // Create game state
  await admin.from('game_states').insert({
    lobby_id: lobbyId,
    state_data: initialState as unknown as Record<string, unknown>,
    turn_number: 1,
    active_player_id: firstPlayerId,
    phase: 'untap',
  })

  // Update lobby status
  await admin.from('game_lobbies').update({ status: 'playing', started_at: new Date().toISOString() }).eq('id', lobbyId)

  // First log entry
  await admin.from('game_log').insert({
    lobby_id: lobbyId,
    seq: 1,
    player_id: null,
    action: 'game_start',
    data: { firstPlayerId },
    text: `Game started. ${players[firstPlayerIdx].user_id === user.id ? 'You go' : 'Opponent goes'} first.`,
  })

  return NextResponse.json({ started: true, firstPlayerId })
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/lobbies/
git commit -m "feat(mp): lobby API routes — create, join, ready, start"
```

---

## Task 5: Game Action API Route

**Files:**
- Create: `src/app/api/game/[id]/route.ts`
- Create: `src/app/api/game/[id]/action/route.ts`

- [ ] **Step 1: Create game state GET route**

Create `src/app/api/game/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lobbyId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify player is in this game
  const { data: player } = await supabase
    .from('game_players')
    .select('*')
    .eq('lobby_id', lobbyId)
    .eq('user_id', user.id)
    .single()

  if (!player) return NextResponse.json({ error: 'Not in this game' }, { status: 404 })

  // Get game state
  const { data: gameState } = await supabase
    .from('game_states')
    .select('*')
    .eq('lobby_id', lobbyId)
    .single()

  // Get all players
  const { data: players } = await supabase
    .from('game_players')
    .select('user_id, deck_id, is_first, seat_position')
    .eq('lobby_id', lobbyId)

  // Build card map from both decks
  const cardMap: Record<string, unknown> = {}
  for (const p of players ?? []) {
    const { data: deckCards } = await supabase
      .from('deck_cards')
      .select('card_id, quantity, board, card:cards!card_id(*)')
      .eq('deck_id', p.deck_id)

    for (const dc of deckCards ?? []) {
      if (!dc.card) continue
      const card = dc.card as unknown as Record<string, unknown>
      // Map by card ID — instances reference card IDs
      cardMap[String(card.id)] = {
        cardId: card.id,
        name: card.name,
        imageSmall: card.image_small,
        imageNormal: card.image_normal,
        typeLine: card.type_line,
        manaCost: card.mana_cost,
        power: card.power,
        toughness: card.toughness,
        oracleText: card.oracle_text,
      }
    }
  }

  // Get log
  const { data: log } = await supabase
    .from('game_log')
    .select('*')
    .eq('lobby_id', lobbyId)
    .order('seq')

  return NextResponse.json({
    gameState: gameState?.state_data,
    players,
    cardMap,
    log: log ?? [],
    myUserId: user.id,
  })
}
```

- [ ] **Step 2: Create action submission route**

Create `src/app/api/game/[id]/action/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyAction } from '@/lib/game/engine'
import type { GameState, GameAction } from '@/lib/game/types'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lobbyId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify player
  const { data: player } = await supabase
    .from('game_players')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('user_id', user.id)
    .single()

  if (!player) return NextResponse.json({ error: 'Not in this game' }, { status: 404 })

  const action: GameAction = await request.json()

  // Ensure playerId matches authenticated user
  if (action.playerId !== user.id) {
    return NextResponse.json({ error: 'Player ID mismatch' }, { status: 403 })
  }

  const admin = createAdminClient()

  // Get current state
  const { data: gameStateRow } = await admin
    .from('game_states')
    .select('*')
    .eq('lobby_id', lobbyId)
    .single()

  if (!gameStateRow) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  const currentState = gameStateRow.state_data as unknown as GameState

  // Handle concede
  if (action.type === 'concede') {
    const opponentId = Object.keys(currentState.players).find((id) => id !== user.id)!

    await admin.from('game_lobbies').update({ status: 'finished', winner_id: opponentId }).eq('id', lobbyId)

    const newSeq = currentState.lastActionSeq + 1
    await admin.from('game_log').insert({
      lobby_id: lobbyId, seq: newSeq, player_id: user.id,
      action: 'concede', data: {}, text: action.text,
    })

    return NextResponse.json({ conceded: true })
  }

  // Apply action to state
  const newState = applyAction(currentState, action)

  // Append to log
  const newSeq = newState.lastActionSeq
  await admin.from('game_log').insert({
    lobby_id: lobbyId,
    seq: newSeq,
    player_id: action.playerId,
    action: action.type,
    data: action.data as Record<string, unknown>,
    text: action.text,
  })

  // Update game state
  await admin.from('game_states').update({
    state_data: newState as unknown as Record<string, unknown>,
    turn_number: newState.turn,
    active_player_id: newState.activePlayerId,
    phase: newState.phase,
    updated_at: new Date().toISOString(),
  }).eq('lobby_id', lobbyId)

  return NextResponse.json({ state: newState, seq: newSeq })
}
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/game/[id]/"
git commit -m "feat(mp): game state GET and action POST API routes"
```

---

## Task 6: Play Pages — Lobby & Waiting Room

**Files:**
- Create: `src/app/(app)/play/page.tsx`
- Create: `src/components/play/CreateLobby.tsx`
- Create: `src/components/play/JoinLobby.tsx`
- Create: `src/app/(app)/play/[lobbyId]/page.tsx`
- Create: `src/components/play/WaitingRoom.tsx`
- Modify: `src/components/Navbar.tsx`

- [ ] **Step 1: Add Play to Navbar**

In `src/components/Navbar.tsx`, add to `navItems` array after Decks:

```typescript
import { Swords } from 'lucide-react' // add to imports

// In navItems array, add after Decks:
{ href: "/play", label: "Play", icon: Swords },
```

- [ ] **Step 2: Create lobby page**

Create `src/app/(app)/play/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CreateLobby from '@/components/play/CreateLobby'
import JoinLobby from '@/components/play/JoinLobby'

export default async function PlayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get user's decks for deck selection
  const { data: decks } = await supabase
    .from('decks')
    .select('id, name, format')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  // Get active lobbies the user is in
  const { data: activeGames } = await supabase
    .from('game_players')
    .select('lobby:game_lobbies!lobby_id(id, lobby_code, status, format, created_at)')
    .eq('user_id', user.id)

  const activeLobbies = activeGames
    ?.map((g) => g.lobby)
    .filter((l): l is NonNullable<typeof l> => l !== null && (l.status === 'waiting' || l.status === 'playing'))
    ?? []

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-font-primary">Play</h1>

      {/* Active games */}
      {activeLobbies.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-font-secondary">Active Games</h2>
          <div className="flex flex-col gap-2">
            {activeLobbies.map((lobby) => (
              <a
                key={lobby.id}
                href={lobby.status === 'playing' ? `/play/${lobby.id}/game` : `/play/${lobby.id}`}
                className="flex items-center justify-between rounded-xl border border-border bg-bg-card px-4 py-3 transition-colors hover:bg-bg-hover"
              >
                <div>
                  <span className="text-sm font-medium text-font-primary">Code: {lobby.lobby_code}</span>
                  <span className="ml-2 text-xs text-font-muted">{lobby.format}</span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  lobby.status === 'playing' ? 'bg-bg-green/20 text-bg-green' : 'bg-bg-yellow/20 text-bg-yellow'
                }`}>
                  {lobby.status === 'playing' ? 'In Game' : 'Waiting'}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <CreateLobby decks={decks ?? []} />
        <JoinLobby decks={decks ?? []} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create CreateLobby component**

Create `src/components/play/CreateLobby.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Deck { id: string; name: string; format: string }

export default function CreateLobby({ decks }: { decks: Deck[] }) {
  const router = useRouter()
  const [selectedDeck, setSelectedDeck] = useState(decks[0]?.id ?? '')
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!selectedDeck) return
    setCreating(true)
    const res = await fetch('/api/lobbies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deckId: selectedDeck }),
    })
    if (res.ok) {
      const { lobby } = await res.json()
      router.push(`/play/${lobby.id}`)
    }
    setCreating(false)
  }

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-font-primary">Create Lobby</h2>
      <select
        value={selectedDeck}
        onChange={(e) => setSelectedDeck(e.target.value)}
        className="mb-3 w-full rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-font-primary"
      >
        {decks.map((d) => (
          <option key={d.id} value={d.id}>{d.name} ({d.format})</option>
        ))}
      </select>
      <Button variant="primary" size="sm" onClick={handleCreate} loading={creating} disabled={!selectedDeck}>
        <Plus className="h-4 w-4" /> Create
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Create JoinLobby component**

Create `src/components/play/JoinLobby.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogIn } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Deck { id: string; name: string; format: string }

export default function JoinLobby({ decks }: { decks: Deck[] }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [selectedDeck, setSelectedDeck] = useState(decks[0]?.id ?? '')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleJoin() {
    if (!code || !selectedDeck) return
    setJoining(true)
    setError(null)
    const res = await fetch('/api/lobbies/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.toUpperCase(), deckId: selectedDeck }),
    })
    if (res.ok) {
      const { lobby } = await res.json()
      router.push(`/play/${lobby.id}`)
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to join')
    }
    setJoining(false)
  }

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-font-primary">Join Lobby</h2>
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Enter code (e.g. XKRM42)"
        maxLength={6}
        className="mb-2 w-full rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm font-mono tracking-widest text-font-primary uppercase placeholder:text-font-muted placeholder:tracking-normal placeholder:font-sans"
      />
      <select
        value={selectedDeck}
        onChange={(e) => setSelectedDeck(e.target.value)}
        className="mb-3 w-full rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-font-primary"
      >
        {decks.map((d) => (
          <option key={d.id} value={d.id}>{d.name} ({d.format})</option>
        ))}
      </select>
      {error && <p className="mb-2 text-xs text-bg-red">{error}</p>}
      <Button variant="primary" size="sm" onClick={handleJoin} loading={joining} disabled={code.length < 6 || !selectedDeck}>
        <LogIn className="h-4 w-4" /> Join
      </Button>
    </div>
  )
}
```

- [ ] **Step 5: Create waiting room page and component**

Create `src/app/(app)/play/[lobbyId]/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import WaitingRoom from '@/components/play/WaitingRoom'

export default async function LobbyPage({ params }: { params: Promise<{ lobbyId: string }> }) {
  const { lobbyId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: lobby } = await supabase.from('game_lobbies').select('*').eq('id', lobbyId).single()
  if (!lobby) redirect('/play')
  if (lobby.status === 'playing') redirect(`/play/${lobbyId}/game`)

  const { data: players } = await supabase
    .from('game_players')
    .select('user_id, deck_id, ready, seat_position')
    .eq('lobby_id', lobbyId)
    .order('seat_position')

  const isHost = lobby.host_user_id === user.id
  const isInLobby = players?.some((p) => p.user_id === user.id) ?? false
  if (!isInLobby) redirect('/play')

  return <WaitingRoom lobby={lobby} players={players ?? []} userId={user.id} isHost={isHost} />
}
```

Create `src/components/play/WaitingRoom.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Check, Crown, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

interface Player { user_id: string; deck_id: string; ready: boolean; seat_position: number }
interface Lobby { id: string; lobby_code: string; format: string; host_user_id: string; status: string }

export default function WaitingRoom({ lobby, players: initialPlayers, userId, isHost }: {
  lobby: Lobby; players: Player[]; userId: string; isHost: boolean
}) {
  const router = useRouter()
  const [players, setPlayers] = useState(initialPlayers)
  const [copied, setCopied] = useState(false)
  const [starting, setStarting] = useState(false)

  const myPlayer = players.find((p) => p.user_id === userId)
  const allReady = players.length === 2 && players.every((p) => p.ready)

  // Subscribe to lobby changes
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`lobby-${lobby.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'game_players',
        filter: `lobby_id=eq.${lobby.id}`,
      }, () => {
        // Refetch players
        supabase.from('game_players').select('user_id, deck_id, ready, seat_position')
          .eq('lobby_id', lobby.id).order('seat_position')
          .then(({ data }) => { if (data) setPlayers(data) })
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'game_lobbies',
        filter: `id=eq.${lobby.id}`,
      }, (payload) => {
        if ((payload.new as Lobby).status === 'playing') {
          router.push(`/play/${lobby.id}/game`)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [lobby.id, router])

  async function toggleReady() {
    await fetch(`/api/lobbies/${lobby.id}/ready`, { method: 'PATCH' })
  }

  async function startGame() {
    setStarting(true)
    const res = await fetch(`/api/lobbies/${lobby.id}/start`, { method: 'POST' })
    if (res.ok) {
      router.push(`/play/${lobby.id}/game`)
    }
    setStarting(false)
  }

  function copyCode() {
    navigator.clipboard.writeText(lobby.lobby_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-4 py-12">
      <h1 className="text-xl font-bold text-font-primary">Waiting Room</h1>

      {/* Lobby code */}
      <div className="flex items-center gap-3 rounded-xl bg-bg-card px-6 py-4">
        <span className="font-mono text-3xl font-bold tracking-[0.3em] text-font-accent">{lobby.lobby_code}</span>
        <button onClick={copyCode} className="rounded-lg p-2 text-font-muted hover:bg-bg-hover hover:text-font-primary">
          {copied ? <Check size={18} className="text-bg-green" /> : <Copy size={18} />}
        </button>
      </div>
      <p className="text-xs text-font-muted">Share this code with your opponent</p>

      {/* Players */}
      <div className="w-full space-y-2">
        {players.map((p) => (
          <div key={p.user_id} className="flex items-center justify-between rounded-xl border border-border bg-bg-card px-4 py-3">
            <div className="flex items-center gap-2">
              {p.user_id === lobby.host_user_id && <Crown size={14} className="text-bg-yellow" />}
              <span className="text-sm font-medium text-font-primary">
                {p.user_id === userId ? 'You' : 'Opponent'}
              </span>
              <span className="text-xs text-font-muted">Seat {p.seat_position}</span>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              p.ready ? 'bg-bg-green/20 text-bg-green' : 'bg-bg-cell text-font-muted'
            }`}>
              {p.ready ? 'Ready' : 'Not Ready'}
            </span>
          </div>
        ))}
        {players.length < 2 && (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-border bg-bg-card px-4 py-6">
            <Loader2 size={16} className="mr-2 animate-spin text-font-muted" />
            <span className="text-sm text-font-muted">Waiting for opponent...</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant={myPlayer?.ready ? 'secondary' : 'primary'} size="lg" onClick={toggleReady}>
          {myPlayer?.ready ? 'Unready' : 'Ready'}
        </Button>
        {isHost && (
          <Button variant="primary" size="lg" onClick={startGame} loading={starting} disabled={!allReady}>
            Start Game
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/Navbar.tsx src/app/\(app\)/play/ src/components/play/CreateLobby.tsx src/components/play/JoinLobby.tsx src/components/play/WaitingRoom.tsx
git commit -m "feat(mp): play pages — lobby list, create, join, waiting room"
```

---

## Task 7: Game UI — Main PlayGame Container

**Files:**
- Create: `src/app/(app)/play/[lobbyId]/game/page.tsx`
- Create: `src/components/play/PlayGame.tsx`
- Create: `src/components/play/GameLog.tsx`
- Create: `src/components/play/PriorityIndicator.tsx`
- Create: `src/components/play/GameActionBar.tsx`
- Create: `src/components/play/OpponentField.tsx`

This is the largest task. The `PlayGame.tsx` component:
- Fetches initial state from `GET /api/game/[id]`
- Subscribes to `game_states` via Supabase Realtime
- Renders: opponent field (top), your battlefield (middle), your hand, game log, action bar (bottom)
- Sends actions via `POST /api/game/[id]/action`
- Manages local card resolution (instanceId → card data from cardMap)

Due to the complexity, this task creates the shell with phase display, priority indicator, pass/next actions, and log. Combat UI (attackers/blockers) is Task 8.

- [ ] **Step 1: Create game page (server component loader)**

Create `src/app/(app)/play/[lobbyId]/game/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PlayGame from '@/components/play/PlayGame'

export default async function GamePage({ params }: { params: Promise<{ lobbyId: string }> }) {
  const { lobbyId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: lobby } = await supabase.from('game_lobbies').select('*').eq('id', lobbyId).single()
  if (!lobby || lobby.status !== 'playing') redirect('/play')

  const { data: player } = await supabase.from('game_players').select('id').eq('lobby_id', lobbyId).eq('user_id', user.id).single()
  if (!player) redirect('/play')

  return <PlayGame lobbyId={lobbyId} userId={user.id} />
}
```

- [ ] **Step 2: Create PriorityIndicator component**

Create `src/components/play/PriorityIndicator.tsx`:

```typescript
'use client'

import { Loader2 } from 'lucide-react'

export default function PriorityIndicator({ hasPriority, phase }: { hasPriority: boolean; phase: string }) {
  if (hasPriority) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 animate-pulse rounded-full bg-bg-green" />
        <span className="text-[10px] font-bold text-bg-green">YOUR PRIORITY</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <Loader2 size={12} className="animate-spin text-font-muted" />
      <span className="text-[10px] font-bold text-font-muted">WAITING...</span>
    </div>
  )
}
```

- [ ] **Step 3: Create GameLog component**

Create `src/components/play/GameLog.tsx`:

```typescript
'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { LogEntry } from '@/lib/game/types'

export default function GameLog({ entries, myUserId }: { entries: LogEntry[]; myUserId: string }) {
  const [expanded, setExpanded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries])

  const visibleEntries = expanded ? entries : entries.slice(-3)

  return (
    <div className="border-t border-border bg-bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-1"
      >
        <span className="text-[9px] font-bold tracking-wider text-font-muted">GAME LOG ({entries.length})</span>
        {expanded ? <ChevronDown size={12} className="text-font-muted" /> : <ChevronUp size={12} className="text-font-muted" />}
      </button>
      <div
        ref={scrollRef}
        className={`overflow-y-auto px-3 pb-2 ${expanded ? 'max-h-60' : 'max-h-20'}`}
      >
        {visibleEntries.map((entry) => (
          <div key={entry.seq} className="flex gap-2 py-0.5 text-[10px]">
            <span className="shrink-0 text-font-muted">
              {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className={entry.playerId === myUserId ? 'text-font-accent' : 'text-font-primary'}>
              {entry.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create OpponentField component**

Create `src/components/play/OpponentField.tsx`:

```typescript
'use client'

import { Heart, Layers, Archive, Ban, Crown } from 'lucide-react'
import type { PlayerState, CardMap, BattlefieldCardState } from '@/lib/game/types'

function OpponentCard({ card, cardMap }: { card: BattlefieldCardState; cardMap: CardMap }) {
  const data = cardMap[String(card.cardId)]
  return (
    <div className={`overflow-hidden rounded border transition-transform ${
      card.tapped ? 'rotate-90 border-font-muted' : 'border-border'
    } ${card.attacking ? 'ring-1 ring-bg-red' : ''} ${card.highlighted === 'red' ? 'ring-2 ring-bg-red' : ''}`}
      style={{ width: 48, height: 67 }}
      title={data?.name ?? 'Unknown'}>
      {data?.imageSmall ? (
        <img src={data.imageSmall} alt={data.name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-bg-cell p-0.5">
          <span className="text-center text-[6px] text-font-muted">{data?.name ?? '?'}</span>
        </div>
      )}
    </div>
  )
}

export default function OpponentField({ state, cardMap }: { state: PlayerState; cardMap: CardMap }) {
  const creatures = state.battlefield.filter((c) => {
    const d = cardMap[String(c.cardId)]
    return d?.typeLine?.toLowerCase().includes('creature')
  })
  const lands = state.battlefield.filter((c) => {
    const d = cardMap[String(c.cardId)]
    return d?.typeLine?.toLowerCase().includes('land')
  })
  const other = state.battlefield.filter((c) => {
    const d = cardMap[String(c.cardId)]
    return d && !d.typeLine?.toLowerCase().includes('creature') && !d.typeLine?.toLowerCase().includes('land')
  })

  return (
    <div className="border-b border-border bg-bg-surface/50 px-3 py-2">
      {/* Stats row */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-wider text-font-muted">OPPONENT</span>
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
          <Crown size={9} className="text-bg-yellow" />
          {state.commandZone.map((c) => {
            const d = cardMap[String(c.cardId)]
            return <span key={c.instanceId} className="text-[9px] text-bg-yellow">{d?.name ?? '?'}</span>
          })}
        </div>
      )}

      {/* Battlefield — compact */}
      <div className="flex flex-wrap gap-1">
        {[...creatures, ...other, ...lands].map((c) => (
          <OpponentCard key={c.instanceId} card={c} cardMap={cardMap} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create GameActionBar component**

Create `src/components/play/GameActionBar.tsx`:

```typescript
'use client'

import { Heart, Minus, Plus, Layers, Archive, Ban, BookOpen, SkipForward, Flag } from 'lucide-react'
import PriorityIndicator from './PriorityIndicator'
import { GAME_PHASES, type PhaseDefinition } from '@/lib/game/phases'
import type { GamePhase } from '@/lib/game/types'

interface GameActionBarProps {
  phase: GamePhase
  turn: number
  life: number
  libraryCount: number
  graveyardCount: number
  exileCount: number
  hasPriority: boolean
  isActivePlayer: boolean
  onPassPriority: () => void
  onLifeChange: (amount: number) => void
  onDraw: () => void
  onViewZone: (zone: 'graveyard' | 'exile' | 'library') => void
  onConcede: () => void
  onConfirmUntap?: () => void
}

export default function GameActionBar({
  phase, turn, life, libraryCount, graveyardCount, exileCount,
  hasPriority, isActivePlayer, onPassPriority, onLifeChange, onDraw,
  onViewZone, onConcede, onConfirmUntap,
}: GameActionBarProps) {
  return (
    <div className="border-t border-border bg-bg-surface">
      {/* Phase tracker */}
      <div className="flex items-center gap-0.5 overflow-x-auto px-2 py-1">
        {GAME_PHASES.map((p) => (
          <div key={p.key} className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold tracking-wider ${
            p.key === phase ? 'bg-bg-accent text-font-white' : 'bg-bg-cell text-font-muted'
          }`}>
            {p.label.toUpperCase()}
          </div>
        ))}
      </div>

      {/* Info + priority */}
      <div className="flex items-center justify-between border-t border-border/50 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-font-muted">T{turn}</span>
          <PriorityIndicator hasPriority={hasPriority} phase={phase} />
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={() => onLifeChange(-1)} className="flex h-6 w-6 items-center justify-center rounded bg-bg-cell text-font-secondary active:bg-bg-red">
            <Minus size={10} />
          </button>
          <div className="flex items-center gap-0.5">
            <Heart size={11} className="text-bg-red" />
            <span className="min-w-[20px] text-center text-sm font-bold text-font-primary">{life}</span>
          </div>
          <button onClick={() => onLifeChange(1)} className="flex h-6 w-6 items-center justify-center rounded bg-bg-cell text-font-secondary active:bg-bg-green">
            <Plus size={10} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => onViewZone('graveyard')} className="flex items-center gap-0.5 text-font-secondary">
            <Archive size={10} /><span className="text-[10px]">{graveyardCount}</span>
          </button>
          <button onClick={() => onViewZone('exile')} className="flex items-center gap-0.5 text-font-secondary">
            <Ban size={10} /><span className="text-[10px]">{exileCount}</span>
          </button>
          <button onClick={() => onViewZone('library')} className="flex items-center gap-0.5 text-font-secondary">
            <BookOpen size={10} /><span className="text-[10px]">{libraryCount}</span>
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 border-t border-border/50 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {phase === 'untap' && isActivePlayer ? (
          <button onClick={onConfirmUntap}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-bg-accent py-2.5 text-sm font-bold text-font-white">
            Done Untapping
          </button>
        ) : hasPriority ? (
          <>
            <button onClick={onDraw} disabled={!isActivePlayer}
              className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-bg-cell py-2 text-font-secondary disabled:opacity-30">
              <Layers size={16} /><span className="text-[8px] font-bold">DRAW</span>
            </button>
            <button onClick={onPassPriority}
              className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-bg-green py-2 text-font-white">
              <SkipForward size={16} /><span className="text-[8px] font-bold">OK</span>
            </button>
            <button onClick={onConcede}
              className="flex flex-col items-center gap-0.5 rounded-xl bg-bg-cell px-3 py-2 text-font-muted">
              <Flag size={14} /><span className="text-[8px] font-bold">GG</span>
            </button>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center py-3 text-xs text-font-muted">
            Waiting for opponent...
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Create PlayGame container**

Create `src/components/play/PlayGame.tsx` — the main orchestrator. This is the largest component. It:
- Fetches state on mount
- Subscribes to Realtime
- Renders opponent field, your field, hand, log, action bar
- Dispatches actions

```typescript
'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createPassPriority, createPlayCard, createUntap, createConfirmUntap, createMoveZone, createLifeChange, createDraw, createDiscard, createConcede } from '@/lib/game/actions'
import { getOpponentId } from '@/lib/game/phases'
import type { GameState, CardMap, LogEntry } from '@/lib/game/types'
import { getCardZone } from '@/lib/utils/card'
import OpponentField from './OpponentField'
import BattlefieldZone from '@/components/goldfish/BattlefieldZone'
import HandArea from '@/components/goldfish/HandArea'
import GameLog from './GameLog'
import GameActionBar from './GameActionBar'
import CardZoneViewer from '@/components/goldfish/CardZoneViewer'

export default function PlayGame({ lobbyId, userId }: { lobbyId: string; userId: string }) {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [cardMap, setCardMap] = useState<CardMap>({})
  const [log, setLog] = useState<LogEntry[]>([])
  const [viewingZone, setViewingZone] = useState<'graveyard' | 'exile' | 'library' | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch initial state
  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/game/${lobbyId}`)
      if (res.ok) {
        const data = await res.json()
        setGameState(data.gameState)
        setCardMap(data.cardMap)
        setLog(data.log.map((l: Record<string, unknown>) => ({
          id: l.id, seq: l.seq, playerId: l.player_id, action: l.action,
          data: l.data, text: l.text, createdAt: l.created_at,
        })))
      }
      setLoading(false)
    }
    load()
  }, [lobbyId])

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`game-${lobbyId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'game_states',
        filter: `lobby_id=eq.${lobbyId}`,
      }, (payload) => {
        const newState = (payload.new as { state_data: GameState }).state_data
        setGameState(newState)
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'game_log',
        filter: `lobby_id=eq.${lobbyId}`,
      }, (payload) => {
        const row = payload.new as Record<string, unknown>
        setLog((prev) => [...prev, {
          id: row.id as string, seq: row.seq as number, playerId: row.player_id as string | null,
          action: row.action as string, data: row.data as Record<string, unknown> | null,
          text: row.text as string, createdAt: row.created_at as string,
        }])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [lobbyId])

  // Send action helper
  const sendAction = useCallback(async (action: ReturnType<typeof createPassPriority>) => {
    await fetch(`/api/game/${lobbyId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    })
  }, [lobbyId])

  // Derived state
  const myState = gameState?.players[userId]
  const opponentId = gameState ? getOpponentId(gameState, userId) : null
  const opponentState = opponentId ? gameState?.players[opponentId] : null
  const hasPriority = gameState?.priorityPlayerId === userId
  const isActivePlayer = gameState?.activePlayerId === userId

  // Resolve cards for display
  const resolveCard = useCallback((instanceId: string, cardId: number) => {
    return cardMap[String(cardId)]
  }, [cardMap])

  // Build battlefield cards for BattlefieldZone (needs card data for display)
  const myBattlefieldCards = useMemo(() => {
    if (!myState) return []
    return myState.battlefield.map((c) => {
      const data = cardMap[String(c.cardId)]
      return {
        instanceId: c.instanceId,
        card: {
          id: c.cardId,
          name: data?.name ?? 'Unknown',
          type_line: data?.typeLine ?? '',
          image_small: data?.imageSmall ?? null,
          image_normal: data?.imageNormal ?? null,
          mana_cost: data?.manaCost ?? null,
          power: data?.power ?? null,
          toughness: data?.toughness ?? null,
          oracle_text: data?.oracleText ?? null,
        } as Record<string, unknown>,
        tapped: c.tapped,
      }
    })
  }, [myState, cardMap])

  // Hand cards
  const myHandCards = useMemo(() => {
    if (!myState) return []
    // Need to figure out which cardId each instanceId maps to
    // The state stores instanceIds but we need cardIds for display
    // In the start route, we stored instanceIds in order — we need to track the mapping
    // For now, we store cardId alongside instanceId in the state (already done in battlefield/graveyard)
    // For hand/library, we only have instanceIds — we need a separate mapping
    // This is built at game start and kept in the state or cardMap
    return []  // TODO: resolve in Task 8 after refining instance→card mapping
  }, [myState, cardMap])

  if (loading || !gameState || !myState || !opponentState) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-dark">
        <span className="text-font-muted">Loading game...</span>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg-dark">
      {/* Opponent field */}
      <OpponentField state={opponentState} cardMap={cardMap} />

      {/* Your battlefield */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {/* TODO: Your commander zone, battlefield zones */}
        <div className="text-center text-xs text-font-muted py-8">
          Your battlefield — full implementation in Task 8
        </div>
      </div>

      {/* Hand */}
      <div className="border-t border-border bg-bg-card px-3 py-2">
        {/* TODO: HandArea with resolved cards */}
        <div className="text-center text-xs text-font-muted py-4">
          Your hand ({myState.handCount} cards) — full implementation in Task 8
        </div>
      </div>

      {/* Game Log */}
      <GameLog entries={log} myUserId={userId} />

      {/* Action Bar */}
      <GameActionBar
        phase={gameState.phase}
        turn={gameState.turn}
        life={myState.life}
        libraryCount={myState.libraryCount}
        graveyardCount={myState.graveyard.length}
        exileCount={myState.exile.length}
        hasPriority={hasPriority}
        isActivePlayer={isActivePlayer}
        onPassPriority={() => sendAction(createPassPriority(userId, 'You'))}
        onLifeChange={(amount) => sendAction(createLifeChange(userId, 'You', userId, 'You', amount))}
        onDraw={() => sendAction(createDraw(userId, userId))}
        onViewZone={setViewingZone}
        onConcede={() => sendAction(createConcede(userId, 'You'))}
        onConfirmUntap={() => sendAction(createConfirmUntap(userId, 'You'))}
      />

      {/* Zone viewers */}
      {viewingZone === 'graveyard' && myState && (
        <CardZoneViewer
          title="Graveyard"
          cards={myState.graveyard.map((c) => ({
            instanceId: c.instanceId,
            card: { id: c.cardId, name: cardMap[String(c.cardId)]?.name ?? '?', type_line: cardMap[String(c.cardId)]?.typeLine ?? '', image_small: cardMap[String(c.cardId)]?.imageSmall ?? null } as Record<string, unknown>,
          }))}
          onClose={() => setViewingZone(null)}
          groupByType
        />
      )}
    </div>
  )
}
```

Note: This is a **shell** — Task 8 completes the hand/battlefield rendering with proper instance→card resolution and combat UI. The shell is intentionally partial to keep this task manageable.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/play/[lobbyId]/game/" src/components/play/
git commit -m "feat(mp): game UI shell — opponent field, action bar, log, priority"
```

---

## Task 8: Complete Game UI — Hand, Battlefield, Instance Mapping, Combat

This task completes the PlayGame shell from Task 7:
- Instance → card ID mapping (so hand/library cards can be resolved)
- Your battlefield with untap highlight, attack/block states
- Hand rendering with play/discard actions
- Combat attacker/blocker declaration UI

**This is the final and most complex task.** Due to its size, it should be broken into sub-steps and committed incrementally.

**Files:**
- Modify: `src/lib/game/types.ts` — add instance→cardId mapping to state
- Modify: `src/app/api/lobbies/[id]/start/route.ts` — store instance→cardId map in state
- Modify: `src/components/play/PlayGame.tsx` — complete hand/battlefield rendering
- Create: `src/components/play/CombatAttackers.tsx`
- Create: `src/components/play/CombatBlockers.tsx`
- Create: `src/components/play/DiscardSelector.tsx`

- [ ] **Step 1: Add instanceMap to GameState**

In `src/lib/game/types.ts`, add to `GameState`:

```typescript
export interface GameState {
  // ... existing fields ...
  instanceMap: Record<string, number>  // instanceId → cardId mapping for all cards
}
```

- [ ] **Step 2: Update start route to include instanceMap**

In `src/app/api/lobbies/[id]/start/route.ts`, build the instanceMap alongside the library/hand:

Add after building each player's library:
```typescript
const instanceMap: Record<string, number> = {}
// ... when creating each instance, also add to instanceMap:
// instanceMap[iid] = card.id
```

Include `instanceMap` in the `initialState`.

- [ ] **Step 3: Complete PlayGame with hand and battlefield rendering**

Update `src/components/play/PlayGame.tsx` to use `gameState.instanceMap` to resolve instanceIds to card data for hand and battlefield display. Wire up play card, move zone, tap/untap actions.

- [ ] **Step 4: Create CombatAttackers component**

Create `src/components/play/CombatAttackers.tsx` — shown during `declare_attackers` phase when you're the active player. Lets you select creatures to attack, then confirm.

- [ ] **Step 5: Create CombatBlockers component**

Create `src/components/play/CombatBlockers.tsx` — shown during `declare_blockers` phase when you're the non-active player. Lets you assign blockers to attackers, then confirm.

- [ ] **Step 6: Create DiscardSelector component**

Create `src/components/play/DiscardSelector.tsx` — shown during cleanup when hand > 7. Lets you select cards to discard.

- [ ] **Step 7: Integration test — full game flow**

Manual test:
1. Open two browser windows, log in as two different users
2. Create lobby in window 1, join in window 2
3. Both ready up, start game
4. Verify: phases advance, priority passes, cards can be played
5. Enter combat, declare attackers/blockers, verify damage
6. Continue until one player concedes

- [ ] **Step 8: Commit**

```bash
git add src/lib/game/ src/app/api/ src/components/play/
git commit -m "feat(mp): complete game UI — hand, battlefield, combat, discard"
```

---

## Summary

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1 | Database schema & types | Low |
| 2 | Game types & phases | Low |
| 3 | Game engine (state machine) | High |
| 4 | Lobby API routes | Medium |
| 5 | Game action API | Medium |
| 6 | Play pages & waiting room | Medium |
| 7 | Game UI shell | High |
| 8 | Complete game UI + combat | Very High |

Tasks 1-3 are pure logic (no UI). Tasks 4-5 are API plumbing. Tasks 6-8 are the UI.
