# Game Log Overhaul + Priority Gating

**Date:** 2026-05-10
**Scope:** Multiplayer + goldfish play views (`/play/[lobbyId]/game`, `/decks/[id]/goldfish`)
**Author:** Giovanni
**Status:** Approved — ready for implementation plan

## Problem

Current `GameLog` (in `src/components/play/GameLog.tsx`) was designed before drag-and-drop was added. With DnD live, players generate many more granular actions (each tap, each move-zone) and the existing log surfaces them with weak hierarchy and no zone context. Two problems compound:

1. **Visibility / anti-cheat.** The app has no full MTG rules engine. Players rely on the log to see what the opponent does — extra draws, untaps out of step, sneaky zone moves. Today the log shows raw `text` strings without zone of origin/destination, making cheating attempts hard to spot. Aggregating events would actively harm this property: an attacker could hide a second draw inside a "drew 2 cards" group.
2. **No priority enforcement.** Both players can interact with the board at the same time. Nothing tells a player "wait, it's not your turn", nothing prevents the engine from applying an action from the wrong player.

This spec covers both: a richer real-time log, and a strict client+server priority gate so only the player with `priorityPlayerId` can mutate state (with documented exemptions).

## Non-goals

- Full MTG rules engine. Engine remains permissive (it does not enforce "only one draw per turn", legal blocks, etc.). The log is the anti-cheat surface, not the rules engine.
- Replay player UI changes. `GameHistoryView` reuses the same render pipeline for free, but no new history-specific features.
- Server-side aggregation, batching, or pagination of `LogEntry` storage. Persistence stays one row per action.
- Sound / haptic notifications on new entries.

## Architecture

### Persistence (unchanged)

Each engine action produces exactly one `LogEntry` row in `game_log` (or whatever table backs `LogEntry`). Granular by design: 1 tap = 1 row. Order-by-`seq`.

### Render pipeline (new)

Pure transformation function, no React, no I/O:

```ts
// src/components/play/log/displayRows.ts
export function toDisplayRows(
  entries: LogEntry[],
  myUserId: string,
): DisplayRow[]
```

`DisplayRow` is a discriminated union:

```ts
type DisplayRow =
  | { kind: 'banner'; entry: LogEntry; style: LogRowStyle; icon: string }
  | { kind: 'action'; entry: LogEntry; severity: Severity; icon: string; verbText: string }
  | { kind: 'chat';   entry: LogEntry }
  | { kind: 'warning';entry: LogEntry; reason: string }

type Severity = 'minor' | 'normal' | 'major'
```

- 1 entry → 1 row. **No aggregation.** Real-time visibility is mandatory; aggregating would mask cheating.
- `banner` reuses existing `styleForEntry` + an `icon` field added to `LogRowStyle`.
- `action.severity` controls font size and opacity at render time:
  - `minor` (single tap/untap): `text-[10px] text-font-muted opacity-80`
  - `normal` (move-zone, draw, counter, life-change): `text-[10px] text-font-primary`
  - `major` (cast spell, attack, death, concede): `text-[11px] font-semibold text-font-primary`
- `warning` is reserved for the client-side reflection of a 409 `not_your_priority` response (see §6). It is rendered with red border, `⚠` glyph, and includes the rejected action description.

### Action text generation (revised)

Action creators in `src/lib/game/actions.ts` already produce a free-form `text`. The new render path no longer reads `text` directly for `kind: 'action'`; it derives `verbText` from `entry.action` + `entry.data` so the wording is consistent and zone-aware.

Required `data` fields per action type:

| Action                | Required data fields                              | Verb template                                                     |
|-----------------------|---------------------------------------------------|-------------------------------------------------------------------|
| `tap`                 | `cardName`                                        | "{actor} taps {cardName}"                                         |
| `untap`               | `cardName`                                        | "{actor} untaps {cardName}"                                       |
| `confirm_untap`       | (banner)                                          | "Untap step"                                                      |
| `draw`                | `count`                                           | "{actor} draws {count} card(s)"                                   |
| `play_card`           | `cardName`, `from='hand'`                         | "{actor} casts {cardName} from hand"                              |
| `move_zone`           | `cardName`, `from`, `to`                          | varies by (from,to), see §3                                       |
| `discard`             | `cardName`                                        | "{actor} discards {cardName} from hand"                           |
| `add_counter`         | `cardName`, `counterName`                         | "{actor} puts a {counterName} counter on {cardName}"              |
| `remove_counter`      | `cardName`, `counterName`                         | "{actor} removes a {counterName} counter from {cardName}"         |
| `set_counter`         | `cardName`, `counterName`, `value`                | "{actor} sets {counterName} counters on {cardName} to {value}"    |
| `set_pt`              | `cardName`, `powerMod`, `toughnessMod`            | "{actor} modifies {cardName} P/T by {pMod}/{tMod}"                |
| `life_change`         | `targetId`, `targetName`, `delta`                 | "{actor} {gains|deals} {abs(delta)} life {to {targetName}|}"       |
| `create_token`        | `tokenName`, `count`                              | "{actor} creates {count} {tokenName} token(s)"                    |
| `declare_attackers`   | (banner) — followed by N `attack_with` rows       | "Attackers declared"                                              |
| `attack_with`         | `cardName`                                        | "{actor} attacks with {cardName}"                                 |
| `declare_blockers`    | (banner) — followed by N `block_with` rows        | "Blockers declared"                                               |
| `block_with`          | `cardName`, `attackerName`                        | "{actor} blocks {attackerName} with {cardName}"                   |
| `combat_damage`       | (banner)                                          | "Combat damage"                                                   |
| `copy_card`           | `cardName`                                        | "{actor} copies {cardName}"                                       |
| `take_control`        | `cardName`                                        | "{actor} takes control of {cardName}"                             |
| `shuffle_into_library`| `cardName`                                        | "{actor} shuffles {cardName} into library"                        |
| `shuffle_library`     | (no card)                                         | "{actor} shuffles library"                                        |
| `chat_message`        | `text`                                            | rendered as kind='chat'                                           |
| `concede`             | (banner)                                          | "{actor} concedes"                                                |

#### Move-zone matrix (§3 detail)

| from \ to       | hand               | battlefield                | graveyard            | exile             | library           | command          |
|-----------------|--------------------|----------------------------|----------------------|-------------------|-------------------|------------------|
| **hand**        | (n/a, reorder)     | "casts X from hand"        | "discards X"         | "exiles X from hand"| "puts X from hand on top/bottom of library" | "sends X to command zone" |
| **battlefield** | "returns X to hand"| (n/a)                      | "sends X to graveyard"| "exiles X"      | "puts X on top of library" | "returns X to command zone" |
| **graveyard**   | "returns X from graveyard to hand"| "returns X from graveyard to battlefield"| (n/a)| "exiles X from graveyard"| "shuffles X into library" | (rare) |
| **exile**       | "returns X from exile to hand"| "returns X from exile to battlefield"| "moves X from exile to graveyard"| (n/a)| (rare) | (rare) |
| **library**     | "draws X" *(special: prefer `draw` action)*| "puts X from library onto battlefield"| "mills X"| "exiles X from library top" | (n/a) | (rare) |
| **command**     | (n/a)              | "casts X from command zone"| "sends X to graveyard"| "exiles X"      | (rare)            | (n/a)            |

The verb function lives in `src/components/play/log/verbs.ts` and is unit-testable in isolation.

### Severity classification

```ts
const SEVERITY: Record<GameActionType, Severity> = {
  tap: 'minor', untap: 'minor', confirm_untap: 'normal',
  draw: 'normal', discard: 'normal',
  add_counter: 'normal', remove_counter: 'normal', set_counter: 'normal',
  set_pt: 'normal', shuffle_library: 'normal', shuffle_into_library: 'normal',
  move_zone: 'normal',
  play_card: 'major', create_token: 'major',
  life_change: 'major',
  declare_attackers: 'major', attack_with: 'major',
  declare_blockers: 'major', block_with: 'major',
  combat_damage: 'major', resolve_combat_damage: 'major',
  copy_card: 'major', take_control: 'major',
  concede: 'major',
  chat_message: 'normal', // rendered as kind='chat' anyway
  pass_priority: 'minor', // possibly hidden — see "Open render decision" below
  toggle_auto_pass: 'minor',
  mulligan: 'major', keep_hand: 'major', bottom_cards: 'normal',
  game_start: 'major',
}
```

`life_change` is upgraded to `major` because life is the win condition and any change is anti-cheat-relevant.

### Open render decision

`pass_priority` is logged today as a regular row. Rendering each pass would spam (every priority pass = 1 row). Decision: render as `minor` row but **only when relevant** — i.e. skip rendering pass-priority rows whose only effect is auto-pass through an empty step. Rule: hide if both `(prev == phase)` and `(next == phase)` and no other action between. This is a render-time skip; the entry stays in storage for replay.

## Priority gating (§4 + §6)

### Hook

```ts
// src/lib/hooks/usePriority.ts
export function usePriority(state: GameState | null, userId: string) {
  return {
    hasPriority: state?.priorityPlayerId === userId,
    isMyTurn:    state?.activePlayerId === userId,
    activeName:  state ? playerNames[state.activePlayerId] : '',
  }
}
```

### Client UI lock

When `hasPriority === false`, in `PlayGame.tsx`:

- Wrap each interactive container (`HandArea`, `BattlefieldZone[]`, `OpponentField` action zones, `GameActionBar`, opponent zone counters) in `<PriorityLock locked={true}>...</PriorityLock>`.
- `PriorityLock` renders an absolutely-positioned overlay (`bg-bg-dark/40 backdrop-blur-[1px] cursor-not-allowed`) that sits above the children. It does NOT use `pointer-events: none` on its children; instead the overlay itself captures pointerdown and routes to a handler that flashes the persistent badge (no toast).
- A persistent `PriorityBadge` renders top-of-screen: `⏳ Aspetta priorità — turno di {activeName}`. Has a `data-pulse` ref toggled on each blocked-attempt to trigger a 250ms `animate-pulse` border-flash.

### Allowed under no-priority

Wrappers must let through:

- `CardPreviewOverlay` (long-press / right-click) — already a fixed overlay rendered by `PlayGame`, outside the locked containers.
- Chat input in `GameLog` — chat renders below the log scroll area; the lock applies only to the action panes.
- Hand reordering (local-only sort UI). Currently hand is not reorderable; if added later, the reorder gesture must NOT emit a server action and must NOT be locked.
- Opening own zone viewers (graveyard/exile/library) is **NOT** allowed — explicitly chosen during brainstorm. Buttons in `GameActionBar` open viewers via `onViewZone`; under lock, the viewer-trigger buttons are blocked alongside the rest.
- `Concede` button: rendered outside the lock, always clickable.
- Own life adjustment: `+`/`-` controls on **own** life are exempt. Opponent's life controls remain locked.

### Action menu

`CardActionMenu` (`src/components/game/CardActionMenu.tsx`) opens on tap. Under lock, opening is suppressed (the menu component itself is unmounted because the underlying card click is blocked by the lock overlay).

### Engine validation (server-side)

`src/lib/game/engine.ts` `applyAction(state, action)` adds a guard at the very top:

```ts
const PRIORITY_EXEMPT: ReadonlySet<GameActionType> = new Set([
  'concede', 'chat_message',
  'mulligan', 'keep_hand', 'bottom_cards',
  'toggle_auto_pass',
])

function isLifeChangeOnSelf(action: GameAction): boolean {
  return action.type === 'life_change'
      && action.data.targetId === action.playerId
}

if (
  !PRIORITY_EXEMPT.has(action.type)
  && !isLifeChangeOnSelf(action)
  && action.playerId !== state.priorityPlayerId
) {
  throw new ActionRejectedError('not_your_priority', { action: action.type })
}
```

`ActionRejectedError` is a new error class in `src/lib/game/errors.ts`. It carries a `code` (`'not_your_priority' | …`) and optional `meta`.

The mulligan stage already has its own state machine — exemption above keeps it working. `toggle_auto_pass` is exempt because flipping your own auto-pass preference is purely a client preference echo.

### API surface

`src/app/api/game/[lobbyId]/action/route.ts` (or wherever `applyAction` is invoked from the API) wraps `applyAction` in try/catch:

```ts
try {
  const next = applyAction(state, action)
  // persist + log + broadcast
  return NextResponse.json({ ok: true, state: next })
} catch (e) {
  if (e instanceof ActionRejectedError) {
    return NextResponse.json({ error: e.code, meta: e.meta }, { status: 409 })
  }
  throw e
}
```

The rejected action is **not persisted** and **not logged**. The opponent does not see the attempt. (Brainstorm choice: server rejects + returns error; no warning row in the log for rejected attempts. The `kind: 'warning'` DisplayRow is still in the data model for future use, e.g. if we later want to log "X attempted to draw without priority" — currently unused.)

### Client handling of 409

`sendAction` in `PlayGame.tsx` (currently does optimistic apply + POST):

1. Apply optimistically.
2. POST.
3. On 409: roll back optimistic state (restore pre-action snapshot), pulse the `PriorityBadge`, no toast spam.
4. On other error: existing error handling.

Pulse mechanism: `PriorityBadge` exposes a ref-callable `pulse()` via `useImperativeHandle`. `sendAction` calls it on 409.

## Layout (§5)

### Mobile (`< lg`, default)

Same panel as today (bottom collapsible), with three changes:

1. Default-open on mobile when log has ≥1 entry. Persist `gameLogOpen` in `localStorage` keyed by user (not by lobby — preference, not state).
2. When collapsed and a new entry arrives, briefly border-flash the collapsed header (250ms `animate-pulse` on the header `<button>`) so the player can't miss the opponent's action.
3. Show last **8** entries when collapsed (was 5). Aggregation removed → density higher → showing more last-actions catches more.

### Desktop (`lg:` ≥ 1024px)

New side panel:

- Render `<aside>` to the right of the play area, fixed-width `w-80` (320px), full-height inside the game viewport (between header and bottom safe area).
- Inside: scrollable log entries (newest at bottom, auto-scroll on new), then chat input pinned to bottom.
- Always open, no collapse on desktop. (Real estate is fine; the log is the anti-cheat surface and should always be visible.)
- Battlefield/hand area gets `lg:pr-80` so it does not slide under the panel.

Implementation: `GameLog` becomes a layout-aware shell. Two render modes (`mode: 'sheet' | 'side'`) chosen via `useMediaQuery('(min-width: 1024px)')` to avoid CSS-only duplication. Internals (entries scroller + chat input) shared.

## File map

New:
- `src/components/play/log/displayRows.ts` — `toDisplayRows`, severity table, pass-priority skip rule.
- `src/components/play/log/verbs.ts` — verb templates + move-zone matrix function.
- `src/components/play/log/PriorityBadge.tsx` — persistent banner with imperative `pulse()`.
- `src/components/play/log/PriorityLock.tsx` — overlay wrapper component.
- `src/lib/hooks/usePriority.ts` — `usePriority(state, userId)`.
- `src/lib/hooks/useMediaQuery.ts` — minimal `(min-width: ...)` hook (only if not already present).
- `src/lib/game/errors.ts` — `ActionRejectedError`.

Modified:
- `src/components/play/GameLog.tsx` — accept `mode`, switch to `toDisplayRows`-based render, add per-severity styles, mobile flash, desktop side panel.
- `src/components/play/PlayGame.tsx` — wrap interactive zones in `<PriorityLock>`, mount `<PriorityBadge>`, add 409 rollback in `sendAction`, switch `<GameLog>` mode based on viewport. Padding `lg:pr-80` on the inner play viewport.
- `src/lib/game/engine.ts` — priority guard.
- `src/lib/game/actions.ts` — every creator that touches a card emits `{cardName, from?, to?}` in `data`. Where missing today, add (cards already known at call site).
- `src/components/play/log/LogEntryStyle.ts` — add `icon: string` per banner.
- API route handling action POSTs — translate `ActionRejectedError` → 409.

## Testing strategy

- Unit-test `verbs.ts` move-zone matrix exhaustively (every (from,to) pair → expected text).
- Unit-test `toDisplayRows`:
  - 1:1 mapping (no aggregation under any input).
  - banners stay banners.
  - pass-priority skip rule (renders only when relevant).
  - severity table covers every `GameActionType` (test fails if a new action type is added without a severity).
- Unit-test engine guard:
  - non-priority action rejected.
  - exempt actions accepted regardless of priority.
  - `life_change` on self accepted, on opponent rejected if no priority.
- Manual: drag a card → see real-time row in opponent's log with from/to. Try acting out of turn → overlay appears, badge pulses, server rejects, optimistic apply rolls back.

## Risks

- **Engine guard breaks goldfish.** In goldfish the bot has `autoPass: true` and the player should always have priority during their turn. Verify `priorityPlayerId` actually flips appropriately. If not, goldfish fails after the guard. Pre-flight check: trace existing `applyAction` paths in goldfish and confirm priority rotates as expected before enabling the guard.
- **Latency / race on priority pass.** Player A passes, server confirms, player B's client may still show "no priority" for a frame. Mitigation: optimistic update on `pass_priority` already moves `priorityPlayerId` client-side; a stale 409 from a slow round-trip should already be rare. Worst case the player retries.
- **Mobile bottom-sheet over action bar.** The sheet currently sits above the action bar. Default-open + flash-on-new should be tested for overlap with `GameActionBar`. If overlap occurs, give the action bar `pb` equal to the sheet's collapsed height.
- **Side panel desktop steals battlefield width.** 320px on a 1280px laptop = 25% of width. Verify card sizes still fit. Fallback: reduce panel to `w-72` (288px) if regressions.

## Out-of-scope follow-ups

- Filtering log by player or action type.
- Searching log for a card name.
- Inline replay scrubber.
- Sound on opponent action.
- "Undo my last action" affordance (priority-respecting).
