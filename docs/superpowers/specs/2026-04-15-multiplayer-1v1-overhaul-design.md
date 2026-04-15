# Multiplayer 1v1 Overhaul — Design Spec

**Date:** 2026-04-15
**Scope:** 13 features across layout, game engine, UI, and DeckBuilder
**Decomposition:** 5 sequential phases, each self-contained and deployable

---

## Phase 1 — Layout & Visuals

No engine or type changes. Pure CSS/component restructuring.

### 1A. Battlefield Bottom-Aligned & Compact

**Current:** Battlefield fills from top of screen down. Large gaps between zones.
**Target:** Battlefield starts just above the hand area and grows upward. Zones are tighter.

**Implementation:**
- PlayGame layout switches to `flex-col-reverse` stacking: hand at bottom, then player battlefield, then opponent field at top.
- Reduce inter-zone gaps from `gap-3`/`gap-4` to `gap-1.5`.
- BattlefieldZone card size stays 68x95px but zone headers become single-line compact.
- The scrollable area is the middle section (both battlefields); hand and action bar stay fixed.

**Layout (mobile, top to bottom on screen):**
```
[GameActionBar — fixed top]
[Opponent Field — scrollable top]
[--- divider ---]
[Player Battlefield — scrollable bottom]
[Commander Zone | Hand Area — fixed bottom]
```

### 1B. Opponent Field Expandable + Card Preview

**Current:** OpponentField shows 48x67px cards, no interaction beyond viewing.
**Target:** Toggle button switches between compact (48px) and expanded (same 68x95px as player). Hover (web) or long-press (mobile) on any opponent card opens CardPreviewOverlay in read-only mode (no action buttons).

**Implementation:**
- Add `expanded: boolean` state to PlayGame, passed to OpponentField.
- Toggle button (expand/collapse icon) in opponent field header.
- When expanded, cards render at 68x95px with the same BattlefieldZone component used for player cards, but with `readOnly=true` (no context menu actions).
- Add `onCardPreview` callback to OpponentField cards. Wire `useLongPress` for mobile, `onMouseEnter` with 300ms delay for desktop hover preview.
- CardPreviewOverlay receives `readOnly` prop — when true, shows card image only, no action buttons.

### 1C. Commander Zone Right of Hand

**Current:** Commander zone rendered at top of player battlefield.
**Target:** Dedicated section pinned to the right of HandArea.

**Implementation:**
- In the fixed bottom bar layout: `[HandArea (flex-1)] [CommanderZone (shrink-0, 68px wide)]`.
- CommanderZone shows the commander card(s) as small thumbnails (48x68px) with gold border.
- Tap/click opens CardPreviewOverlay with zone='commandZone' (existing behavior, just repositioned).
- If no commander, section is hidden (no empty space).

### 1D. Library Viewer — Split Filters & Cards

**Current:** CardZoneViewer has filter buttons overlapping the card grid.
**Target:** Two distinct sections: a sticky filter bar at top, scrollable card grid below.

**Implementation:**
- Wrap CardZoneViewer content in two divs:
  1. `div.sticky.top-0.z-10.bg-bg-surface` — filter buttons row (horizontal scroll on mobile).
  2. `div.flex-1.overflow-y-auto` — card grid.
- Add a subtle border/shadow between sections for visual separation.
- Filter bar gets a `pb-2 border-b border-border` for clear visual split.

---

## Phase 2 — Engine Core Extensions

### 2A. Counters on Cards

**Type changes:**
```typescript
// Add to BattlefieldCardState
counters: { name: string; value: number }[]
```

**New action types:** `add_counter`, `remove_counter`, `set_counter`

**Engine handlers:**
- `handleAddCounter(state, action)` — adds or increments a named counter on a battlefield card.
- `handleRemoveCounter(state, action)` — decrements or removes a named counter.
- `handleSetCounter(state, action)` — sets a counter to an exact value.

**UI:**
- Counters displayed as small badges on the card (bottom-right corner): "+1/+1: 2", "Loyalty: 4".
- CardPreviewOverlay gets a "Counters" section: list of current counters with +/- buttons, plus "Add Counter" button that opens a small form (name input + number).
- Context menu on battlefield cards adds "Add Counter" option.

**Logging:** "Player added +1/+1 counter to [Card] (now 2)" / "Player removed loyalty counter from [Card] (now 3)"

### 2B. Token Creation

**Database — new table `deck_tokens`:**
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
-- RLS: same as deck_cards (owner can CRUD, public decks readable)
```

**DeckBuilder changes:**
- New "Tokens" tab in DeckEditor alongside Main/Sideboard/Maybeboard.
- Token list shows name, P/T, type, colors.
- "Add Token" button opens a form: name (required), P/T, color checkboxes (W/U/B/R/G), type line, keywords (comma-separated), image URL (optional).
- Edit/delete existing tokens.
- API: new routes `GET/POST/PUT/DELETE /api/decks/[id]/tokens`.

**In-game token creation:**
- "Create Token" button in Special Actions menu (or GameActionBar).
- Modal shows:
  1. **Deck tokens** — list of tokens defined in the deck, one-tap to create.
  2. **Custom** — same form as DeckBuilder (name, P/T, colors, type).
  3. **Copy** — select an existing token on battlefield to duplicate.
- Quantity input (create N copies at once).

**Engine/state:**
- Tokens get instanceIds like regular cards: `tk-{counter}`.
- CardMap extended: `isToken: true` flag, all card fields filled from token definition.
- `handleCreateToken(state, action)` — creates N BattlefieldCardState entries, adds to CardMap.
- When a token leaves the battlefield (graveyard, exile, hand, library), it ceases to exist — removed from state entirely. Brief flash in graveyard for visual feedback, then removed.
- **Engine invariant:** Every `handleMoveZone` call must check `cardMap[instanceId].isToken`. If token and destination is not battlefield, skip the move and remove the token from state + cardMap instead.

**Logging:** "Player created 2x 1/1 White Soldier tokens"

### 2C. Commander Death Choice

**Type changes:**
```typescript
// Add to PlayerState
commanderCastCount: number  // starts at 0, incremented on each cast from CZ

// Add to GameState
pendingCommanderChoice?: {
  playerId: string
  instanceId: string
  cardId: number
  cardName: string
  source: 'graveyard' | 'exile'  // where it would go normally
}
```

**Engine flow:**
1. Whenever a commander card would move to graveyard or exile (via combat damage, destroy effect, exile effect):
   - Instead of moving immediately, set `pendingCommanderChoice`.
   - Pause game flow (priority held by the commander's owner).
2. Player chooses destination via modal:
   - **Command Zone** — shows current tax: "Next cast costs {2N} more" where N = commanderCastCount.
   - **Graveyard** — goes to graveyard normally.
   - **Exile** — goes to exile normally.
   - **Hand** — returns to hand.
3. `handleCommanderChoice(state, action)` — moves the commander to chosen zone, clears `pendingCommanderChoice`.
4. When casting from command zone: `commanderCastCount++`.

**UI:**
- Full-screen modal (like CombatAttackers overlay) showing the commander card image and 4 destination buttons.
- Tax display on Command Zone button: "Command Zone (+2 tax, next cast: {baseCost} + {2N})".
- In-game, the commander zone badge shows current tax cost.

**Detection:** `handleMoveZone` and `handleCombatDamage` check if the moving card `isCommander`. If yes and destination is graveyard or exile, trigger pending choice instead of immediate move.

**Priority override:** When `pendingCommanderChoice` is set, it takes precedence over normal priority. The commander's owner MUST resolve the choice before ANY other action can be processed. The engine rejects all non-`commander_choice` actions while this is pending.

**Logging:** "Player chose to return [Commander] to command zone (tax: 4)" / "Player let [Commander] go to graveyard"

### 2D. Library Card Movement Extensions

**Current:** CardZoneViewer for library has "Return to Hand" and "Return to Battlefield" buttons.
**Target:** Full set of destination options when viewing any library card.

**Actions from library:**
- Move to Hand
- Move to Battlefield
- Move to Graveyard
- Move to Exile
- Move to Bottom of Library

**Implementation:**
- Extend CardZoneViewer action buttons when `zone === 'library'`.
- `handleMoveZone` in engine already supports `from: 'library'` for hand. Extend for battlefield, graveyard, exile.
- "Move to Bottom" = remove from current position, push to end of library array.
- All movements from library are logged: "Player moved [Card] from library to hand"

**Library consultation logging:**
- When a player opens the library viewer, log: "Player is searching their library"
- This uses a new action type `library_view` that only creates a log entry, no state change.

---

## Phase 3 — Priority & Combat

### 3A. Auto-Pass Priority ("Procedi Sempre")

**Type changes:**
```typescript
// Add to PlayerState
autoPass: boolean  // default false
```

**Engine behavior:**
- When `autoPass` is true for the priority player, the engine auto-generates a `pass_priority` action immediately (server-side).
- **Reset trigger:** Whenever a card is added to the player's hand (draw, tutor, return to hand, etc.), set `autoPass = false`. This check must be enforced in ALL handlers that add cards to hand: `handleDraw`, `handleDrawX`, `handleMoveZone` (when `to === 'hand'`), `handleResolveRevealed` (cards sent to hand), and `handleCommanderChoice` (when destination is hand).
- **Toggle:** New action type `toggle_auto_pass`. Client sends it, engine flips the flag.
- **Server-side auto-pass:** After applying any action, if the new `priorityPlayerId`'s `autoPass` is true, immediately apply another `pass_priority` in the same request. Loop until a player without autoPass has priority or a phase advances.

**UI:**
- Toggle button in GameActionBar: "Auto-Pass" with on/off indicator (green dot when active).
- When active, the priority indicator changes: "AUTO-PASSING..." instead of "YOUR PRIORITY".
- When opponent's auto-pass is active, their turns resolve faster (server chains pass actions).
- Visual toast/notification when auto-pass is deactivated by a draw: "Auto-pass disabled: new card drawn."

**Logging:** "Player enabled auto-pass" / "Player's auto-pass disabled (drew a card)"

### 3B. Combat Damage Priority (Before Graveyard)

**Current flow:** `handleCombatDamage` → calculate damage → move dead creatures to graveyard → phase to main2.
**New flow:** Split into two sub-steps.

**Type changes:**
```typescript
// Add to CombatState
damageApplied: boolean  // true after damage calculated but before cleanup
```

**Engine changes:**

Step 1 — `handleCombatDamage` (modified):
1. Calculate damage amounts (same as current).
2. Apply `damageMarked` to creatures (same as current).
3. Highlight creatures with lethal damage in red (same as current).
4. Set `combat.damageApplied = true`.
5. **Do NOT move dead creatures to graveyard.**
6. Give priority to AP.

Step 2 — New handler `handleResolveCombatDamage`:
- Triggered when both players pass priority during `combat_damage` phase AND `combat.damageApplied === true`.
- Moves all creatures with `damageMarked >= toughness` to graveyard (checking for commander cards → trigger pendingCommanderChoice).
- Reset combat state, advance to main2.

**Priority pass modification:**
- In `handlePassPriority`: when phase is `combat_damage` and `combat.damageApplied === true`, both players passing triggers `handleResolveCombatDamage` instead of normal phase advance.

**UI:**
- After damage is applied, creatures show damage number overlaid in red.
- Both players see "Priority — Respond to combat damage" in the action bar.
- Players can cast instants, activate abilities (play cards from hand, etc.) before passing.
- When both pass, dead creatures animate to graveyard.

---

## Phase 4 — Library Mechanics

### 4A. Special Actions Menu

**UI component: `SpecialActionsMenu`**
- Dropdown/popover in GameActionBar, accessible when player has priority.
- Actions: **Peak**, **Scry**, **Surveil**, **Mill**, **Draw X**.
- Each action shows a number input (1-10) and a "Go" button.

### 4B. Peak

**Flow:**
1. Player selects Peak N from Special Actions.
2. Engine action `peak` — reveals top N cards of player's library.
3. UI shows a modal with the N cards displayed. View-only, no actions.
4. "Done" button closes the modal. Cards remain in same order.
5. Logged: "Player peeked at top 3 cards of their library"

**Engine:** No state change. The action sends the top N instanceIds to the client. The client resolves them via CardMap. Since the player's own library cards are in their `library[]` array, the client can read them directly.

### 4C. Scry / Surveil / Generic "Reveal & Choose"

Since the user wants Top/Bottom/Graveyard/Hand/Exile buttons for each card, all library-top actions use the same UI. The action name determines the log text and any restrictions.

**Flow:**
1. Player selects action (Scry/Surveil) and N.
2. Engine action `reveal_top` — sets a new state field:
   ```typescript
   // Add to PlayerState
   revealedCards?: {
     action: 'scry' | 'surveil' | 'peak'
     instanceIds: string[]
     decisions: Record<string, 'top' | 'bottom' | 'graveyard' | 'hand' | 'exile'>
     topOrder: string[]  // ordered list of cards going to top
   }
   ```
3. Client renders `RevealedCardsChooser` modal:
   - Shows each revealed card with destination buttons: Top / Bottom / Graveyard / Hand / Exile.
   - Cards assigned to "Top" appear in a reorderable list (drag or up/down arrows).
   - "Confirm" button enabled when all cards have a destination.
4. Engine action `resolve_revealed` — processes all decisions:
   - Cards to "top" → placed on top of library in specified order.
   - Cards to "bottom" → placed at bottom of library in specified order.
   - Cards to "graveyard" → moved to graveyard.
   - Cards to "hand" → moved to hand. **Triggers auto-pass reset.**
   - Cards to "exile" → moved to exile.
5. Clear `revealedCards` from state.

**Logging:**
- "Player scried 3: [Card A] to top, [Card B] to bottom, [Card C] to graveyard"
- "Player surveilled 2: [Card A] to graveyard, [Card B] to top"

### 4D. Mill

**Flow:**
1. Player selects Mill N from Special Actions.
2. Engine action `mill` — moves top N cards from library to graveyard.
3. No UI needed beyond confirmation — cards are milled automatically.
4. Brief toast showing which cards were milled.

**Targeting:** Mill can target self or opponent. The Special Actions menu should have "Mill Self" and "Mill Opponent" options (or a target selector).

**Logging:** "Player milled 3 cards: [Card A], [Card B], [Card C]"

### 4E. Draw X

**Flow:**
1. Player selects Draw X and enters N.
2. Engine processes N sequential draws (same as `handleDraw` but batched).
3. **Triggers auto-pass reset** (new cards in hand).
4. Logged: "Player drew 3 cards"

---

## Phase 5 — Chat

### 5A. Chat Messages in Game Log

**Database — extend game_log:**
- Add `type` column: `'action' | 'chat'` (default 'action').
- Chat messages use the same table, same realtime subscription.

**Actually — simpler approach:** Use a new `message` field in the log entry alongside `text`. The existing `text` field is for action descriptions. For chat, `text` is the chat message and a new `type` field distinguishes it.

**Migration:**
```sql
alter table public.game_log add column type text not null default 'action';
```

**API:**
- New action type `chat_message` in the game action route.
- Bypasses engine (no state change), just inserts a log entry with `type: 'chat'`.

**UI:**
- Chat input field at the bottom of the GameLog component: a text input + send button.
- Chat messages in the log rendered with a distinct style: player name in accent color, message in italics, no timestamp prefix (or lighter timestamp).
- GameLog renders both action and chat entries in chronological order.

**Logging:** Chat messages appear as: "[PlayerName]: message text"

---

## Summary of Type Changes

```typescript
// types.ts additions

interface BattlefieldCardState {
  // ... existing fields ...
  counters: { name: string; value: number }[]  // NEW
}

interface PlayerState {
  // ... existing fields ...
  commanderCastCount: number   // NEW — tracks CZ cast tax
  autoPass: boolean            // NEW — auto-pass priority toggle
  revealedCards?: {            // NEW — scry/surveil in progress
    action: 'scry' | 'surveil' | 'peak'
    instanceIds: string[]
    decisions: Record<string, 'top' | 'bottom' | 'graveyard' | 'hand' | 'exile'>
    topOrder: string[]
  }
}

interface CombatState {
  // ... existing fields ...
  damageApplied: boolean  // NEW — damage calculated but not resolved
}

interface GameState {
  // ... existing fields ...
  pendingCommanderChoice?: {  // NEW
    playerId: string
    instanceId: string
    cardId: number
    cardName: string
    source: 'graveyard' | 'exile'
  }
}

interface CardMapEntry {
  // ... existing fields ...
  isToken: boolean  // NEW
}
```

## New Action Types

| Action | Handler | State Change |
|--------|---------|-------------|
| `add_counter` | handleAddCounter | battlefield card counters |
| `remove_counter` | handleRemoveCounter | battlefield card counters |
| `set_counter` | handleSetCounter | battlefield card counters |
| `create_token` | handleCreateToken | battlefield + cardMap |
| `commander_choice` | handleCommanderChoice | pendingCommanderChoice + zone move |
| `toggle_auto_pass` | handleToggleAutoPass | autoPass flag |
| `reveal_top` | handleRevealTop | revealedCards |
| `resolve_revealed` | handleResolveRevealed | library/graveyard/hand/exile |
| `peak` | handlePeak | log only |
| `mill` | handleMill | library → graveyard |
| `draw_x` | handleDrawX | library → hand |
| `library_view` | — (log only) | no state change |
| `chat_message` | — (log only) | no state change |
| `resolve_combat_damage` | handleResolveCombatDamage | graveyard + combat reset |

## New UI Components

| Component | Phase | Purpose |
|-----------|-------|---------|
| `SpecialActionsMenu` | 4 | Dropdown in GameActionBar for Scry/Surveil/Mill/Peak/Draw X |
| `RevealedCardsChooser` | 4 | Modal for Scry/Surveil card destination selection + reordering |
| `CounterManager` | 2 | Inline counter display + add/edit in CardPreviewOverlay |
| `TokenCreator` | 2 | Modal for creating tokens (deck list + custom form) |
| `CommanderChoiceModal` | 2 | Full-screen overlay for commander death destination |
| `ChatInput` | 5 | Text input in GameLog for sending chat messages |
| `DeckTokenEditor` | 2 | Token tab in DeckEditor with CRUD |

## Modified Components

| Component | Phases | Changes |
|-----------|--------|---------|
| `PlayGame` | 1-5 | Layout restructure, new handlers, auto-pass UI, chat |
| `OpponentField` | 1 | Expandable toggle, card preview on hover/longpress |
| `HandArea` | 1 | Commander zone pinned right |
| `CardPreviewOverlay` | 1,2 | ReadOnly mode, counter management, commander actions |
| `GameActionBar` | 1,3,4 | Compact layout, auto-pass toggle, special actions menu |
| `BattlefieldZone` | 2 | Counter badges on cards |
| `CardZoneViewer` | 1,2 | Split filters/cards, extended library actions |
| `GameLog` | 5 | Chat messages rendering + input |
| `DeckEditor` | 2 | Tokens tab |
| Engine (`engine.ts`) | 2,3,4 | ~12 new handlers |
| Types (`types.ts`) | 2,3,4 | Extended interfaces |

## Database Changes

| Change | Phase |
|--------|-------|
| `CREATE TABLE deck_tokens` | 2 |
| `ALTER TABLE game_log ADD COLUMN type` | 5 |
| RLS policies for deck_tokens | 2 |

## File Count Estimates

| Phase | New Files | Modified Files | ~New Lines |
|-------|-----------|---------------|------------|
| 1 | 0 | 6 | ~300 |
| 2 | 6 | 8 | ~800 |
| 3 | 0 | 3 | ~200 |
| 4 | 2 | 4 | ~500 |
| 5 | 1 | 4 | ~200 |
| **Total** | **9** | **~15** | **~2000** |
