# Goldfish Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make goldfish a mode of the existing multiplayer `PlayGame.tsx` — same engine, same UI — eliminating the separate `GoldfishGame.tsx`. Introduce a bot config system for future AI opponents.

**Architecture:** PlayGame receives a discriminated union prop (`mode: 'multiplayer' | 'goldfish'`). In goldfish mode, state is local-only (no API, no Realtime), actions run through the same `applyAction` engine, and a bot-response loop auto-passes for the ghost opponent. The goldfish page builds `GameState` + `CardMap` server-side and passes them as props.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase (read-only for deck loading)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/game/bot.ts` | Create | BotConfig type, GHOST_BOT preset, `applyWithBotLoop()` |
| `src/components/play/PlayGame.tsx` | Modify | Add mode prop, conditional init/sendAction/UI |
| `src/components/play/GameActionBar.tsx` | Modify | Add `mode` prop to hide priority/concede label in goldfish |
| `src/app/(app)/decks/[id]/goldfish/page.tsx` | Modify | Build GameState + CardMap, render PlayGame instead of GoldfishGame |
| `src/components/goldfish/GoldfishGame.tsx` | Delete | Replaced by PlayGame in goldfish mode |
| `src/components/goldfish/PhaseTracker.tsx` | Delete | Goldfish now uses GameActionBar |

---

### Task 1: Create bot config and response loop

**Files:**
- Create: `src/lib/game/bot.ts`

- [ ] **Step 1: Create the bot module**

Create `src/lib/game/bot.ts`:

```typescript
import { applyAction } from './engine'
import type { GameState, GameAction } from './types'

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

/**
 * Apply a player action then auto-respond for the bot until
 * priority returns to a human player or no more bot actions needed.
 * Mirrors the server-side auto-pass loop but also handles mulligan auto-keep.
 */
export function applyWithBotLoop(
  state: GameState,
  action: GameAction,
  botId: string,
  config: BotConfig,
): GameState {
  let s = applyAction(state, action)

  let iterations = 0
  while (iterations < 100) {
    // Bot mulligan: auto-keep immediately
    if (s.mulliganStage) {
      const botDecision = s.mulliganStage.playerDecisions[botId]
      if (botDecision && !botDecision.decided) {
        s = applyAction(s, {
          type: 'keep_hand',
          playerId: botId,
          data: {},
          text: '',
        })
        iterations++
        continue
      }
    }

    // Bot priority: auto-pass
    if (s.priorityPlayerId === botId) {
      if (config.type === 'ghost') {
        s = applyAction(s, {
          type: 'pass_priority',
          playerId: botId,
          data: {},
          text: '',
        })
        iterations++
        continue
      }
      // Future bot types: decision logic goes here
      // if (config.type === 'bot') { ... }
    }

    break
  }

  return s
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/game/bot.ts
git commit -m "feat(game): add bot config system with ghost preset and applyWithBotLoop"
```

---

### Task 2: Update PlayGame.tsx props and initialization

**Files:**
- Modify: `src/components/play/PlayGame.tsx`

This task changes the component signature and initialization logic. The rendering changes come in Task 4.

- [ ] **Step 1: Add BotConfig import and update props type**

At the top of `src/components/play/PlayGame.tsx`, add the import:

```typescript
import { applyWithBotLoop } from '@/lib/game/bot'
import type { BotConfig } from '@/lib/game/bot'
```

Replace the current component signature (line 130):

```typescript
// Before:
export default function PlayGame({ lobbyId, userId }: { lobbyId: string; userId: string }) {

// After:
type PlayGameProps = { userId: string } & (
  | { mode: 'multiplayer'; lobbyId: string }
  | { mode: 'goldfish'; initialState: GameState; initialCardMap: CardMap; botId: string; botConfig: BotConfig; deckTokens?: { name: string; power: string; toughness: string; colors: string[]; typeLine: string; keywords: string[] }[] }
)

export default function PlayGame(props: PlayGameProps) {
  const { userId } = props
  const mode = 'mode' in props ? props.mode : 'multiplayer'
  const lobbyId = mode === 'multiplayer' ? (props as { lobbyId: string }).lobbyId : null
```

- [ ] **Step 2: Update the initial state fetch useEffect**

Replace the existing fetch useEffect (lines 147-169) with a conditional one:

```typescript
  // Fetch initial state (multiplayer) or set from props (goldfish)
  useEffect(() => {
    if (mode === 'goldfish') {
      const gProps = props as PlayGameProps & { mode: 'goldfish' }
      setGameState(gProps.initialState)
      setCardMap(gProps.initialCardMap)
      setPlayerNames({ [userId]: 'You', [gProps.botId]: gProps.botConfig.name })
      if (gProps.deckTokens) setDeckTokens(gProps.deckTokens)
      setLoading(false)
      return
    }

    // Multiplayer: fetch from API
    async function load() {
      const res = await fetch(`/api/game/${lobbyId}`)
      if (res.ok) {
        const data = await res.json()
        setGameState(data.gameState)
        setCardMap(data.cardMap)
        if (data.playerNames) setPlayerNames(data.playerNames)
        setLog(data.log.map((l: Record<string, unknown>) => ({
          id: l.id as string,
          seq: l.seq as number,
          playerId: l.player_id ?? l.playerId ?? null,
          action: l.action as string,
          data: l.data as Record<string, unknown> | null,
          text: l.text as string,
          createdAt: (l.created_at ?? l.createdAt) as string,
        })))
      }
      setLoading(false)
    }
    load()
  }, [mode, lobbyId, userId])
```

- [ ] **Step 3: Wrap the deck tokens fetch in a multiplayer guard**

The existing deck tokens fetch useEffect (lines 171-201) calls Supabase to get `game_players` — this doesn't exist in goldfish. Wrap it:

```typescript
  // Fetch deck tokens for token creator (multiplayer only — goldfish passes them as props)
  useEffect(() => {
    if (mode !== 'multiplayer') return
    let cancelled = false
    async function fetchDeckTokens() {
      // ... existing code unchanged ...
    }
    fetchDeckTokens()
    return () => { cancelled = true }
  }, [mode, lobbyId, userId])
```

- [ ] **Step 4: Wrap the Realtime subscription in a multiplayer guard**

The existing Realtime subscription useEffect (lines 203-247) subscribes to Supabase channels — skip in goldfish:

```typescript
  // Realtime subscription (multiplayer only)
  useEffect(() => {
    if (mode !== 'multiplayer' || !lobbyId) return
    // ... existing subscription code unchanged ...
  }, [mode, lobbyId])
```

- [ ] **Step 5: Update sendAction for goldfish mode**

Replace the current sendAction (lines 250-271) with:

```typescript
  const sendAction = useCallback(async (action: ReturnType<typeof createPassPriority>) => {
    if (mode === 'goldfish') {
      const gProps = props as PlayGameProps & { mode: 'goldfish' }
      setGameState(prev => prev ? applyWithBotLoop(prev, action, gProps.botId, gProps.botConfig) : prev)
      return
    }

    // Multiplayer: optimistic update + POST
    const isStateMutating = action.type !== 'chat_message'
      && action.type !== 'library_view'
      && action.type !== 'peak'
      && action.type !== 'concede'

    if (isStateMutating) {
      setGameState(prev => prev ? applyAction(prev, action) : prev)
    }

    fetch(`/api/game/${lobbyId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    }).catch(() => {})
  }, [mode, lobbyId, props])
```

- [ ] **Step 6: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: Errors about the call sites passing old props (`lobbyId` directly). These will be fixed in Task 3 (goldfish page) — the multiplayer page already passes `lobbyId`. For now, fix the multiplayer game page to pass `mode="multiplayer"`.

Open `src/app/(app)/play/[lobbyId]/game/page.tsx` and update the PlayGame usage:

```typescript
// Before:
<PlayGame lobbyId={lobbyId} userId={user.id} />

// After:
<PlayGame mode="multiplayer" lobbyId={lobbyId} userId={user.id} />
```

Run: `npx tsc --noEmit`
Expected: No errors (goldfish page still renders old GoldfishGame, not PlayGame yet — that's Task 3).

- [ ] **Step 7: Commit**

```bash
git add src/components/play/PlayGame.tsx src/app/(app)/play/[lobbyId]/game/page.tsx
git commit -m "feat(game): add goldfish mode to PlayGame with conditional init and sendAction"
```

---

### Task 3: Rewrite goldfish page to build GameState and render PlayGame

**Files:**
- Modify: `src/app/(app)/decks/[id]/goldfish/page.tsx`

The goldfish page currently fetches deck data and renders `GoldfishGame`. We keep the same data fetching but build a proper `GameState` + `CardMap` and render `PlayGame` with `mode="goldfish"` instead.

- [ ] **Step 1: Rewrite the goldfish page**

Replace the entire content of `src/app/(app)/decks/[id]/goldfish/page.tsx` with:

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import PlayGame from '@/components/play/PlayGame'
import { GHOST_BOT } from '@/lib/game/bot'
import type { GameState, CardMap, PlayerState, CombatState } from '@/lib/game/types'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

const BOT_ID = 'bot-ghost'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default async function GoldfishPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const [{ data: deck, error: deckError }, { data: deckCards }] = await Promise.all([
    supabase.from('decks').select('*').eq('id', id).single(),
    supabase
      .from('deck_cards')
      .select(`id, card_id, quantity, board, created_at, card:cards!card_id(*)`)
      .eq('deck_id', id)
      .in('board', ['main', 'commander']),
  ])

  if (deckError || !deck) redirect('/decks')
  if (deck.user_id !== user.id) redirect('/decks')

  // Build card instances and CardMap
  const cardMap: CardMap = {}
  const library: string[] = []
  const commandZone: { instanceId: string; cardId: number }[] = []
  let instanceCounter = 0

  interface DeckCardFromDB {
    id: string; card_id: number; quantity: number; board: string; created_at: string
    card: CardRow
  }

  for (const dc of (deckCards ?? []) as unknown as DeckCardFromDB[]) {
    if (!dc.card) continue
    const card = dc.card

    if (dc.board === 'commander') {
      const iid = `ci-${++instanceCounter}`
      commandZone.push({ instanceId: iid, cardId: card.id as unknown as number })
      cardMap[iid] = {
        cardId: card.id as unknown as number,
        name: card.name,
        imageSmall: card.image_small,
        imageNormal: card.image_normal,
        typeLine: card.type_line,
        manaCost: card.mana_cost,
        power: card.power,
        toughness: card.toughness,
        oracleText: card.oracle_text,
        isCommander: true,
        isToken: false,
      }
    } else {
      for (let i = 0; i < dc.quantity; i++) {
        const iid = `ci-${++instanceCounter}`
        library.push(iid)
        cardMap[iid] = {
          cardId: card.id as unknown as number,
          name: card.name,
          imageSmall: card.image_small,
          imageNormal: card.image_normal,
          typeLine: card.type_line,
          manaCost: card.mana_cost,
          power: card.power,
          toughness: card.toughness,
          oracleText: card.oracle_text,
          isCommander: false,
          isToken: false,
        }
      }
    }
  }

  if (library.length === 0 && commandZone.length === 0) {
    redirect(`/decks/${id}`)
  }

  const shuffledLibrary = shuffle(library)
  const hand = shuffledLibrary.splice(0, 7)

  // Player state
  const playerState: PlayerState = {
    life: 20,
    library: shuffledLibrary,
    libraryCount: shuffledLibrary.length,
    hand,
    handCount: hand.length,
    battlefield: [],
    graveyard: [],
    exile: [],
    commandZone,
    commanderCastCount: 0,
    autoPass: false,
  }

  // Ghost state — empty everything
  const ghostState: PlayerState = {
    life: GHOST_BOT.life,
    library: [],
    libraryCount: 0,
    hand: [],
    handCount: 0,
    battlefield: [],
    graveyard: [],
    exile: [],
    commandZone: [],
    commanderCastCount: 0,
    autoPass: true,
  }

  const combat: CombatState = {
    phase: null,
    attackers: [],
    blockers: [],
    damageAssigned: false,
    damageApplied: false,
  }

  const initialState: GameState = {
    turn: 1,
    phase: 'untap',
    activePlayerId: user.id,
    priorityPlayerId: user.id,
    firstPlayerId: user.id,
    combat,
    players: {
      [user.id]: playerState,
      [BOT_ID]: ghostState,
    },
    lastActionSeq: 0,
    mulliganStage: {
      playerDecisions: {
        [user.id]: { mulliganCount: 0, decided: false, needsBottomCards: 0, bottomCardsDone: false },
        [BOT_ID]: { mulliganCount: 0, decided: false, needsBottomCards: 0, bottomCardsDone: false },
      },
    },
  }

  // Fetch deck tokens
  let deckTokensList: { name: string; power: string; toughness: string; colors: string[]; typeLine: string; keywords: string[] }[] = []
  try {
    const { data: tokens } = await supabase
      .from('deck_tokens')
      .select('name, power, toughness, colors, type_line, keywords')
      .eq('deck_id', id)
    if (tokens) {
      deckTokensList = tokens.map(t => ({
        name: t.name,
        power: t.power ?? '',
        toughness: t.toughness ?? '',
        colors: t.colors ?? [],
        typeLine: t.type_line ?? 'Token Creature',
        keywords: t.keywords ?? [],
      }))
    }
  } catch { /* deck_tokens table may not exist */ }

  return (
    <PlayGame
      mode="goldfish"
      userId={user.id}
      initialState={initialState}
      initialCardMap={cardMap}
      botId={BOT_ID}
      botConfig={GHOST_BOT}
      deckTokens={deckTokensList}
    />
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors (the page now renders PlayGame with goldfish mode props).

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/decks/[id]/goldfish/page.tsx
git commit -m "feat(goldfish): rewrite page to build GameState and render PlayGame"
```

---

### Task 4: Add goldfish UI conditionals to PlayGame.tsx

**Files:**
- Modify: `src/components/play/PlayGame.tsx`
- Modify: `src/components/play/GameActionBar.tsx`

This task adds all the visual conditionals so goldfish hides the opponent field, game log, priority controls, and changes "Concede" to "Restart".

- [ ] **Step 1: Add mode-derived helpers at the top of the render**

In `PlayGame.tsx`, after the existing derived state block (around line 273), add:

```typescript
  const isGoldfish = mode === 'goldfish'
  const botId = isGoldfish ? (props as PlayGameProps & { mode: 'goldfish' }).botId : null
```

- [ ] **Step 2: Hide OpponentField in goldfish, show ghost life instead**

Replace the OpponentField rendering (lines 895-901) with:

```typescript
        {/* Opponent field — full in multiplayer, minimal life counter in goldfish */}
        {!isGoldfish ? (
          <OpponentField
            state={opponentState}
            cardMap={cardMap}
            expanded={opponentExpanded}
            onToggleExpand={() => setOpponentExpanded((v) => !v)}
            onCardPreview={(card, instanceId) => setPreview({ card, zone: 'opponentBattlefield' as PreviewZone, instanceId })}
          />
        ) : opponentState ? (
          <div className="flex items-center justify-center gap-3 px-3 py-2">
            <span className="text-[10px] font-bold text-font-muted uppercase tracking-wider">{playerNames[botId!] ?? 'Goldfish'}</span>
            <div className="flex items-center gap-1">
              <Heart className="h-3.5 w-3.5 text-red-400" fill="currentColor" />
              <span className="text-sm font-bold text-font-primary">{opponentState.life}</span>
            </div>
          </div>
        ) : null}
```

Import `Heart` from lucide-react if not already imported (check existing imports — it's used in other components but may not be imported in PlayGame.tsx. If not, add it).

- [ ] **Step 3: Hide GameLog in goldfish**

Wrap the GameLog rendering (line 978) with a multiplayer guard:

```typescript
      {/* Game Log — multiplayer only */}
      {!isGoldfish && (
        <GameLog entries={log} myUserId={userId} onSendChat={handleSendChat} />
      )}
```

- [ ] **Step 4: Update GameActionBar to support goldfish mode**

In `src/components/play/GameActionBar.tsx`, add a `mode` prop:

Add to the `GameActionBarProps` interface:

```typescript
  mode?: 'multiplayer' | 'goldfish'
```

Add to the destructured props:

```typescript
  mode = 'multiplayer',
```

Make these changes inside the component JSX:

1. Hide PriorityIndicator in goldfish — find the line `<PriorityIndicator hasPriority={hasPriority} />` and wrap it:
```typescript
{mode !== 'goldfish' && <PriorityIndicator hasPriority={hasPriority} />}
```

2. Change the Pass Priority button: in goldfish mode, hide it (priority is auto-handled by the bot loop). Find the Pass Priority button (the `<button>` with `onPassPriority`) and wrap it:
```typescript
{mode !== 'goldfish' && (
  <button ...existing pass priority button...>
    ...
  </button>
)}
```

3. Change the Concede button label: find the button with `onConcede` and change its content:
```typescript
<button ... onClick={onConcede} ...>
  <Flag className="h-3 w-3" />
  <span className="hidden sm:inline">{mode === 'goldfish' ? 'Restart' : 'Concede'}</span>
</button>
```

4. Hide auto-pass toggle in goldfish (meaningless without opponent):
```typescript
{mode !== 'goldfish' && autoPass !== undefined && onToggleAutoPass && (
  ... existing auto-pass toggle ...
)}
```

- [ ] **Step 5: Pass mode to GameActionBar from PlayGame.tsx**

In `PlayGame.tsx`, update the `<GameActionBar>` rendering (line 1014) to pass the mode:

```typescript
      <GameActionBar
        mode={mode}
        phase={gameState.phase}
        ... rest unchanged ...
      />
```

- [ ] **Step 6: Handle "Restart" (concede in goldfish = reset state)**

In `PlayGame.tsx`, update the concede handler. Currently `onConcede` in the GameActionBar sends `createConcede(userId, myName)`. In goldfish mode, we want to reset the state instead.

Replace the `onConcede` prop in the GameActionBar rendering:

```typescript
        onConcede={isGoldfish
          ? () => {
            const gProps = props as PlayGameProps & { mode: 'goldfish' }
            setGameState(structuredClone(gProps.initialState))
            setGameOver(null)
          }
          : () => sendAction(createConcede(userId, myName))
        }
```

- [ ] **Step 7: Hide CombatBlockers in goldfish (ghost never blocks)**

The `showBlockerUI` condition (around the CombatBlockers rendering, line 1140) already checks `!isActivePlayer && hasPriority`. In goldfish, the human is always the active player, so blockers UI never shows. No code change needed — verify this is the case by checking the condition.

- [ ] **Step 8: Handle mill opponent in goldfish — target ghost**

In the SpecialActionsMenu `onMill` handler (around line 1247), `opponentId` is used for the "opponent" target. Verify that `opponentId` resolves to `botId` in goldfish mode. Check the existing code:

```typescript
const opponentId = gameState ? getOpponentId(gameState, userId) : null
```

`getOpponentId` finds the other key in `gameState.players` — in goldfish, that's `botId`. So this works automatically. No code change needed.

- [ ] **Step 9: Handle the "Waiting for opponent" mulligan screen**

In the mulligan rendering logic (around lines 882-888), there's a "Waiting for opponent to finish mulligan..." screen. In goldfish, the ghost auto-keeps instantly via `applyWithBotLoop`, so this screen should never appear. But as a safety net, skip it in goldfish mode:

Find the block that renders the "Waiting for opponent" message and wrap it:

```typescript
    // Waiting for opponent to finish (multiplayer only — ghost auto-keeps)
    if (!isGoldfish) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-dark">
          <span className="text-sm text-font-muted">Waiting for opponent to finish mulligan...</span>
        </div>
      )
    }
```

- [ ] **Step 10: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 11: Commit**

```bash
git add src/components/play/PlayGame.tsx src/components/play/GameActionBar.tsx
git commit -m "feat(goldfish): add UI conditionals — hide opponent/log/priority, restart button"
```

---

### Task 5: Delete old GoldfishGame and PhaseTracker

**Files:**
- Delete: `src/components/goldfish/GoldfishGame.tsx`
- Delete: `src/components/goldfish/PhaseTracker.tsx`

- [ ] **Step 1: Verify no other files import GoldfishGame**

Run: `grep -r 'GoldfishGame' src/ --include='*.tsx' --include='*.ts'`

Expected: Only `src/app/(app)/decks/[id]/goldfish/page.tsx` imported it, but Task 3 already replaced that import. If any other file imports it, update that file first.

- [ ] **Step 2: Verify no other files import PhaseTracker**

Run: `grep -r 'PhaseTracker' src/ --include='*.tsx' --include='*.ts'`

Expected: Only `GoldfishGame.tsx` imported it.

- [ ] **Step 3: Delete the files**

```bash
rm src/components/goldfish/GoldfishGame.tsx
rm src/components/goldfish/PhaseTracker.tsx
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors. The remaining shared components in `src/components/goldfish/` (BattlefieldZone, HandArea, CardZoneViewer) are still used by PlayGame.tsx.

- [ ] **Step 5: Commit**

```bash
git add -u src/components/goldfish/
git commit -m "refactor: delete GoldfishGame and PhaseTracker, replaced by PlayGame goldfish mode"
```

---

### Task 6: Handle goldfish mulligan auto-keep on first render

**Files:**
- Modify: `src/components/play/PlayGame.tsx`

The `initialState` has a `mulliganStage` with the ghost marked as `decided: false`. The first time the human takes a mulligan action (keep/mulligan), `applyWithBotLoop` will auto-keep for the ghost. But we need to trigger this on first render so the ghost is already "decided" when the mulligan UI first renders.

- [ ] **Step 1: Add a useEffect to auto-keep for the ghost on mount**

In `PlayGame.tsx`, after the initial state useEffect, add:

```typescript
  // Goldfish: auto-keep mulligan for bot on mount
  useEffect(() => {
    if (mode !== 'goldfish') return
    const gProps = props as PlayGameProps & { mode: 'goldfish' }
    setGameState(prev => {
      if (!prev?.mulliganStage) return prev
      const botDecision = prev.mulliganStage.playerDecisions[gProps.botId]
      if (botDecision && !botDecision.decided) {
        return applyAction(prev, {
          type: 'keep_hand',
          playerId: gProps.botId,
          data: {},
          text: '',
        })
      }
      return prev
    })
  }, [mode])
```

This runs once after the initial state is set and auto-keeps for the ghost.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/play/PlayGame.tsx
git commit -m "fix(goldfish): auto-keep mulligan for ghost on mount"
```

---

### Task 7: Manual testing and final verification

**Files:** None (testing only)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Test goldfish mode**

1. Navigate to a deck page → click "Goldfish" button
2. Verify: Mulligan screen appears with your 7 cards, no "Waiting for opponent" message
3. Keep hand → game starts
4. Verify: Opponent area shows just "Goldfish" name + life counter (20)
5. Verify: No game log visible
6. Verify: No "Pass Priority" button, no priority indicator
7. Verify: Phase tracker shows phases, turn counter works
8. Verify: "Restart" button appears where "Concede" was
9. Tap a card → instant response
10. Play a card from hand → moves to battlefield instantly
11. Click "Pass Priority" equivalent or advance phases → phases advance smoothly through bot auto-pass
12. Test combat: declare attackers → blockers phase auto-skips → damage applies to ghost life
13. Test special actions: scry, surveil, draw X, mill (self and opponent), create token
14. Click "Restart" → game resets to initial state
15. Test mulligan → take mulligan → verify bottom cards selection works

- [ ] **Step 3: Test multiplayer mode (regression)**

1. Create a game lobby, join with 2 accounts
2. Start game → verify everything works as before
3. Play a few turns → verify actions, combat, concede all work
4. Verify Realtime updates still work

- [ ] **Step 4: Push**

```bash
git push
```
