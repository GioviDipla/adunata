# Multiplayer 1v1 — Design Spec

## Overview

Real-time 1v1 tabletop-style MTG matches with lobby system, priority passing, combat phases, and persistent game log. No rule enforcement — players are trusted, the log exists for post-game verification.

## Lobby System

### Creating a Game
- Host navigates to `/play`, clicks "Create Lobby"
- Selects a deck from their collection
- System generates a 6-character alphanumeric code (e.g. `XKRM42`)
- Host shares the code out-of-band (chat, voice, etc.)

### Joining a Game
- Guest navigates to `/play`, enters the lobby code
- Selects a deck from their collection
- Both players see each other in the waiting room

### Starting
- When both players are ready, host clicks "Start Game"
- Coin flip determines who goes first (winner chooses)
- Both players draw 7, London mulligan flow
- First player skips draw on turn 1

## What Each Player Sees

### Own Side
- Hand (full card details, interactive)
- Battlefield (lands, creatures, other permanents — tappable, selectable)
- Command zone (if Commander format)
- Graveyard, exile (browsable with type filters)
- Library (count only during game, browsable via dedicated action)

### Opponent Side (top of screen)
- Battlefield (cards visible, tapped/untapped state)
- Hand count (number only, no card details)
- Library count
- Graveyard, exile (browsable)
- Command zone
- Life total

## Game Phases — Detailed

### Beginning Phase

**Untap Step**
- AP's tapped permanents get a blue highlight border
- AP taps each permanent they want to untap (manual control for effects like Stasis, Winter Orb)
- On phase advance the blue highlight clears from remaining tapped permanents
- No priority — advances immediately after AP confirms or clicks "Next"

**Upkeep Step**
- AP receives priority — can play instants/abilities
- If AP passes → NAP receives priority
- Both pass → advance

**Draw Step**
- AP draws 1 card automatically (skipped turn 1 for the starting player)
- AP receives priority
- NAP receives priority
- Both pass → advance

### Main Phase 1

- AP has priority. Can play any card type or activate abilities. No restrictions enforced — tabletop trust.
- **On every card played:** NAP receives priority automatically
  - NAP sees the card in the game log
  - NAP can: **"OK"** (pass) or play a card/ability in response
  - If NAP responds → AP receives priority again
  - Loop until both pass consecutively
- AP clicks **"Go to Combat"** to exit
  - NAP receives priority one last time before combat begins

### Combat Phase

**Beginning of Combat**
- AP receives priority (last chance before declaring attackers)
- NAP receives priority
- Both pass → Declare Attackers

**Declare Attackers**
- AP's untapped creatures become selectable (highlighted border)
- AP taps to select/deselect attackers (red attack border when selected)
- Selected attackers auto-tap unless the player manually prevents it (for vigilance — no enforcement, player decides)
- AP clicks "Confirm Attackers"
- AP receives priority after declaration
- NAP receives priority (can play instants, e.g. removal on an attacker)
- Both pass → Declare Blockers

**Declare Blockers**
- NAP's untapped creatures become selectable
- For each creature, NAP taps it then taps the attacker it blocks
- Visual line connects blocker → attacker
- NAP clicks "Confirm Blockers"
- AP receives priority (combat tricks)
- NAP receives priority
- Both pass → Combat Damage

**Combat Damage**
- Calculated automatically:
  - Unblocked attacker → damage to defending player (life -= power)
  - Blocked attacker vs blocker → mutual damage (power vs toughness comparison)
  - Creatures with accumulated damage >= toughness are highlighted in red (not removed yet)
- Log records all damage assignments
- AP receives priority, then NAP
- Both pass → End of Combat

**End of Combat**
- Red-highlighted creatures are moved to graveyard
- Priority AP → NAP → advance
- Attack/block designations clear

### Main Phase 2

- Identical to Main Phase 1
- AP clicks **"Go to End"** to exit

### End Phase

**End Step**
- AP receives priority → NAP → both pass

**Cleanup Step**
- If AP has more than 7 cards in hand → must discard down to 7 (manual selection)
- No priority (triggered abilities ignored for v1)
- Turn passes to the other player

## Priority Loop

The core mechanism. After every game action:

```
AP performs action (plays card / activates ability)
  → NAP receives priority
    → NAP passes ("OK"): action resolves
    → NAP responds (plays card): AP receives priority
      → AP passes: NAP's response resolves, then back to original
      → AP responds: ... (recursive until both pass)

AP passes without action
  → NAP receives priority
    → NAP passes: advance to next phase/step
    → NAP acts: AP receives priority (loop)
```

### UI for Priority

**When you have priority:**
- Green pulsing bar at bottom
- "OK" button (large, green) to pass
- Can interact with hand (play cards) and battlefield (activate abilities)

**When opponent has priority:**
- "Waiting for opponent..." with spinner
- Cannot interact — read-only view
- Opponent's actions appear in log in real-time

## Game Log

Append-only event log. This is the **source of truth** — game state is a projection of the log.

### Log Entry Format
```json
{
  "id": "uuid",
  "ts": 1712345678000,
  "playerId": "uuid",
  "action": "play_card | pass_priority | declare_attackers | declare_blockers | combat_damage | draw | discard | tap | untap | move_zone | life_change | game_start | phase_change",
  "data": {
    "cardName": "Lightning Bolt",
    "instanceId": "ci-42",
    "from": "hand",
    "to": "battlefield",
    "targets": ["player:uuid-marco"],
    "damage": 3
  },
  "text": "Giovanni plays Lightning Bolt targeting Marco"
}
```

### Log UI
- Always visible at bottom (last 2-3 lines)
- Tap/swipe to expand to fullscreen scrollable view
- Different colors per player
- Timestamps on each entry
- Persistent — saved in database for post-game review

## Architecture

### Database Schema Changes

Extend existing `game_lobbies`, `game_players`, `game_states` tables:

**game_lobbies** (existing, minor additions):
- Add `winner_id uuid` — set when game ends
- Add `started_at timestamptz` — when game actually begins

**game_players** (existing, add fields):
- Add `ready boolean default false` — ready check in lobby
- Add `is_first boolean` — goes first after coin flip

**game_log** (new table):
```sql
create table public.game_log (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references game_lobbies(id) on delete cascade,
  seq integer not null,  -- monotonic sequence for ordering
  player_id uuid references auth.users(id),
  action text not null,
  data jsonb,
  text text not null,
  created_at timestamptz not null default now(),
  unique(lobby_id, seq)
);
create index idx_game_log_lobby on game_log(lobby_id, seq);
```

**game_states** (existing, redefine state_data):
- `state_data` JSONB contains the current game state snapshot
- Updated by the server after each action (projection of log)
- Clients subscribe to changes on this table via Supabase Realtime

### State Data Structure

```json
{
  "turn": 3,
  "phase": "main1",
  "activePlayerId": "uuid",
  "priorityPlayerId": "uuid",
  "firstPlayerId": "uuid",
  "combat": {
    "phase": null,
    "attackers": [],
    "blockers": [],
    "damageAssigned": false
  },
  "players": {
    "uuid-1": {
      "life": 20,
      "libraryCount": 52,
      "handCount": 4,
      "hand": ["ci-1", "ci-2", "ci-3", "ci-4"],
      "library": ["ci-5", "ci-6", ...],
      "battlefield": [
        { "instanceId": "ci-10", "cardId": 1234, "tapped": false, "attacking": false, "blocking": null, "damageMarked": 0, "highlighted": null }
      ],
      "graveyard": [{ "instanceId": "ci-20", "cardId": 5678 }],
      "exile": [],
      "commandZone": []
    },
    "uuid-2": { "...same structure" }
  }
}
```

Each client receives the full state but only renders:
- Own hand/library card details (resolved from a local cardId → CardRow map built at game start)
- Opponent hand/library as counts only
- Both battlefields, graveyards, exiles fully visible

### Real-time Flow

1. Player performs action → `POST /api/game/[id]/action` with action payload
2. Server appends to `game_log`, computes new state, updates `game_states.state_data`
3. Supabase Realtime pushes the updated `game_states` row to both clients
4. Clients re-render based on new state

### API Routes

- `POST /api/lobbies` — create lobby, returns lobby_code
- `POST /api/lobbies/join` — join with code + deck_id
- `PATCH /api/lobbies/[id]/ready` — toggle ready status
- `POST /api/lobbies/[id]/start` — host starts game (both must be ready)
- `POST /api/game/[id]/action` — submit game action
- `GET /api/game/[id]` — get initial state + card map

## Pages & Components

### New Pages
- `/play` — lobby list, create, join
- `/play/[lobbyId]` — waiting room (deck select, ready check, start)
- `/play/[lobbyId]/game` — the game itself

### New Components
- `PlayLobby.tsx` — create/join lobby UI
- `PlayWaitingRoom.tsx` — pre-game setup, ready check
- `PlayGame.tsx` — main game container (orchestrates state, realtime subscription)
- `OpponentField.tsx` — compact view of opponent's battlefield + stats
- `PriorityIndicator.tsx` — green pulse / waiting spinner
- `CombatDeclareAttackers.tsx` — attacker selection UI
- `CombatDeclareBlockers.tsx` — blocker assignment UI (connect lines)
- `GameLog.tsx` — collapsible log panel
- `GameActionBar.tsx` — phase display, OK button, zone counts

### Reused from Goldfish
- `BattlefieldZone.tsx` — card display on field (add attacking/blocking/damage states)
- `HandArea.tsx` — hand display (reuse with priority-aware interaction)
- `CardZoneViewer.tsx` — graveyard/exile browser (already has type filters)
- `PhaseTracker.tsx` — phase display (reuse, add priority indicator)

## Scope Boundaries (v1)

### Included
- 1v1 only
- Lobby with 6-char code
- All phases with manual priority passing
- Combat with attacker/blocker declaration and auto-damage
- Manual untap with blue highlight
- Persistent game log
- Commander zone support
- Discard to 7 in cleanup

### Excluded (future)
- Multiplayer (3-4 players)
- Stack visualization (cards "on the stack")
- Rule enforcement (mana costs, timing restrictions, targeting validation)
- Spectator mode
- Chat between players (use external comms)
- Timer/clock per player
- Rematch functionality

### Reconnection
If a player refreshes or disconnects, they can rejoin by navigating back to `/play/[lobbyId]/game`. The server has the full state in `game_states` and the card map is rebuilt from `game_players.deck_id` at load time. No game data is lost — the JSONB state + log are persistent.

### Combat Damage Tracking
`damageMarked` on battlefield cards is cumulative within a single combat phase only. It resets to 0 at End of Combat when damage is cleaned up and lethal creatures are moved to graveyard.
