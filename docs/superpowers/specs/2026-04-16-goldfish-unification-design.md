# Goldfish Unification — Design Spec

## Goal

Eliminate the separate Goldfish codebase (`GoldfishGame.tsx`, 650 lines) and make goldfish a **mode** of the existing multiplayer `PlayGame.tsx`. Same engine, same UI components, same action system — just no real opponent. A bot config system is introduced so the ghost opponent can be replaced by AI bots in the future.

## Architecture

PlayGame.tsx receives a discriminated union prop that determines the mode:

```typescript
type PlayGameProps = { userId: string } & (
  | { mode: 'multiplayer'; lobbyId: string }
  | { mode: 'goldfish'; initialState: GameState; initialCardMap: CardMap; botId: string; botConfig: BotConfig }
)
```

In `goldfish` mode:
- No API calls, no Realtime subscriptions
- State lives entirely in React (`useState`)
- Actions applied locally via the same `applyAction` engine
- After each action, a bot-response loop auto-passes for the ghost
- The goldfish page builds `GameState` + `CardMap` server-side and passes them as props

In `multiplayer` mode: everything unchanged.

## Bot Config System

### Types (`src/lib/game/bot.ts`)

```typescript
export type BotType = 'ghost' | 'bot'

export interface BotConfig {
  type: BotType
  name: string
  life: number
}

export const GHOST_BOT: BotConfig = {
  type: 'ghost',
  name: 'Goldfish',
  life: 20,
}
```

The ghost is a trivial bot: auto-passes priority, auto-keeps mulligan, never blocks, never plays cards. Its PlayerState has empty library/hand/battlefield.

### Bot Response Loop (`applyWithBotLoop`)

```typescript
export function applyWithBotLoop(
  state: GameState,
  action: GameAction,
  botId: string,
  config: BotConfig
): GameState {
  let s = applyAction(state, action)

  let iterations = 0
  while (iterations < 100) {
    // Bot mulligan: auto-keep
    if (s.mulliganStage) {
      const botDecision = s.mulliganStage.playerDecisions[botId]
      if (botDecision && !botDecision.decided) {
        s = applyAction(s, { type: 'keep_hand', playerId: botId, data: {}, text: '' })
        iterations++
        continue
      }
    }

    // Bot priority: auto-pass
    if (s.priorityPlayerId === botId) {
      if (config.type === 'ghost') {
        s = applyAction(s, { type: 'pass_priority', playerId: botId, data: {}, text: '' })
        iterations++
        continue
      }
      // Future: bot AI decision-making goes here
      // if (config.type === 'bot') { s = botDecide(s, botId, config); ... }
    }

    break  // No more bot actions needed
  }

  return s
}
```

This mirrors the server-side auto-pass loop but is more general: it handles mulligan auto-keep and priority auto-pass. The `while` loop with `continue` allows chaining multiple bot responses (e.g., mulligan keep → priority pass → phase advance → priority pass again).

**Extensibility for future bots:** The `config.type === 'bot'` branch is the hook. A future bot would add fields to `BotConfig` (e.g., `deckId`, `strategy`) and implement decision logic in a separate function called from this loop.

## State Initialization (Goldfish)

The goldfish page (`src/app/(app)/decks/[id]/goldfish/page.tsx`) builds the `GameState` and `CardMap` server-side, reusing the same logic as the multiplayer start route:

1. Fetch deck cards from Supabase
2. Assign instanceIds (`ci-1`, `ci-2`, ...) — commanders first, then main deck
3. Build `CardMap` (instanceId → card data)
4. Build player's `PlayerState` (shuffle library, draw 7, set up command zone)
5. Build ghost's `PlayerState` (empty everything, `life: botConfig.life`, `autoPass: true`)
6. Create `GameState` with both players, `mulliganStage` for both
7. Generate a stable `botId` (e.g., `'bot-ghost'`)
8. Pass everything to `<PlayGame mode="goldfish" ... />`

The ghost player's mulligan will be auto-resolved by `applyWithBotLoop` on the first user action.

## PlayGame.tsx Changes

### Conditional initialization

```typescript
// Multiplayer: fetch from API + subscribe to Realtime (existing code)
// Goldfish: use props directly, no fetch, no subscription

useEffect(() => {
  if (mode === 'multiplayer') {
    // Existing fetch logic
  } else {
    // Goldfish: set state from props
    setGameState(initialState)
    setCardMap(initialCardMap)
    setPlayerNames({ [userId]: userName, [botId]: botConfig.name })
    setLoading(false)
  }
}, [...])

// Realtime subscription: only in multiplayer
useEffect(() => {
  if (mode !== 'multiplayer') return
  // Existing subscription code
}, [mode, ...])
```

### Conditional sendAction

```typescript
const sendAction = useCallback(async (action) => {
  if (mode === 'goldfish') {
    // Apply locally with bot response loop
    setGameState(prev => prev ? applyWithBotLoop(prev, action, botId, botConfig) : prev)
    return
  }

  // Multiplayer: existing optimistic + POST flow
  const isStateMutating = ...
  if (isStateMutating) {
    setGameState(prev => prev ? applyAction(prev, action) : prev)
  }
  fetch(...).catch(...)
}, [mode, lobbyId, botId, botConfig])
```

### Conditional UI elements

| Element | Multiplayer | Goldfish |
|---------|-------------|----------|
| `OpponentField` | Full opponent battlefield | Minimal: just ghost life counter as damage target |
| `GameLog` | Visible with chat | Hidden |
| `GameActionBar` Pass Priority | Button visible | Hidden (auto-handled by bot loop) |
| `PriorityIndicator` | Shows who has priority | Hidden |
| Concede button | "Concede" | "Restart" — resets state to `initialState` prop |
| Chat input | Visible | Hidden |
| All other features | As-is | As-is (combat, tokens, special actions, counters, etc.) |

### Restart (goldfish only)

The "Concede" button becomes "Restart" in goldfish mode. Instead of sending a concede action, it resets state:

```typescript
if (mode === 'goldfish') {
  // Re-shuffle library, re-draw 7, reset ghost
  // Use a fresh copy of initialState (deep clone)
  setGameState(structuredClone(initialState))
  setGameOver(null)
}
```

Note: this reuses the same initial shuffle. For a proper re-shuffle, the page could pass `fullDeck` + `commanders` so the client can rebuild state with a new shuffle. But `structuredClone(initialState)` is simpler and good enough for v1 — the user can navigate away and back for a fresh shuffle.

## File Changes Summary

| File | Action |
|------|--------|
| `src/lib/game/bot.ts` | **Create** — BotConfig type, GHOST_BOT preset, applyWithBotLoop |
| `src/components/play/PlayGame.tsx` | **Modify** — Add mode prop, conditional init/sendAction/UI |
| `src/app/(app)/decks/[id]/goldfish/page.tsx` | **Modify** — Build GameState + CardMap, render PlayGame instead of GoldfishGame |
| `src/components/goldfish/GoldfishGame.tsx` | **Delete** — Replaced by PlayGame in goldfish mode |
| `src/components/goldfish/PhaseTracker.tsx` | **Delete** — Goldfish uses same GameActionBar as multiplayer |

### Files NOT changed (shared components already used by both)

- `src/components/goldfish/BattlefieldZone.tsx` — stays as-is
- `src/components/goldfish/HandArea.tsx` — stays as-is
- `src/components/goldfish/CardZoneViewer.tsx` — stays as-is
- `src/components/game/CardPreviewOverlay.tsx` — stays as-is

## Edge Cases

**Mulligan in goldfish:** The GameState starts with `mulliganStage`. The ghost auto-keeps immediately (via `applyWithBotLoop`). The human player mulligans normally — same UI as multiplayer. Once the human keeps, the mulligan stage resolves and the game begins.

**Combat in goldfish:** The human declares attackers against the ghost. In `declare_blockers` phase, the ghost has priority as NAP — `applyWithBotLoop` auto-passes, so no blockers are declared. Combat damage applies to the ghost's life total. The ghost life is visible in the opponent area.

**Phase advancement:** The priority system works identically. When the human passes priority, `applyWithBotLoop` auto-passes for the ghost, phases advance automatically. The human experience is: press "Pass Priority" → phase advances immediately (no waiting for opponent).

**Auto-pass for human:** Works the same — if the human has `autoPass: true`, the engine auto-passes for them too. Combined with the ghost auto-pass, phases fly through quickly.

**Game over:** If the ghost's life reaches 0, the engine should detect it (if it has win-condition checking). Currently the engine doesn't auto-detect life <= 0 as a win. The goldfish tracks ghost life as a damage clock metric — the human decides when to stop.
