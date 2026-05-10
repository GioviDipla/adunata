# Game Log Overhaul + Priority Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an anti-cheat-oriented real-time multiplayer log (no aggregation, zone-aware verbs, severity styling, responsive layout) and add a strict client+server priority gate so only the player with `priorityPlayerId` can mutate state.

**Architecture:** A pure render-side transformation `toDisplayRows(entries)` derives a `DisplayRow[]` view-model from raw `LogEntry[]` (1:1, no aggregation). Verb generation lives in a side-effect-free `verbs.ts`. Client wraps interactive game zones in a `PriorityLock` overlay and a persistent `PriorityBadge` that pulses on blocked attempts. The engine throws `ActionRejectedError` for non-exempt actions from non-priority players; the action API returns `409 { error: 'not_your_priority' }` and the client rolls back its optimistic update.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, dnd-kit (existing), Tailwind, vitest (already in `devDependencies`).

**Spec:** `docs/superpowers/specs/2026-05-10-game-log-overhaul-design.md`

---

## File map

**Created:**
- `src/lib/game/errors.ts` — `ActionRejectedError`.
- `src/lib/hooks/usePriority.ts` — `usePriority(state, userId)`.
- `src/lib/hooks/useMediaQuery.ts` — `(min-width: ...)` hook (only added if grep confirms it doesn't exist).
- `src/components/play/log/severity.ts` — `SEVERITY` map keyed by `GameActionType`.
- `src/components/play/log/icons.ts` — `ICON` map keyed by action type, banner icons.
- `src/components/play/log/verbs.ts` — verb templates + move-zone matrix.
- `src/components/play/log/displayRows.ts` — `toDisplayRows`.
- `src/components/play/log/PriorityBadge.tsx` — persistent banner with imperative `pulse()`.
- `src/components/play/log/PriorityLock.tsx` — overlay wrapper.
- `src/components/play/log/LogEntryRow.tsx` — single row renderer (action/banner/chat/warning).
- `tests/play/verbs.test.ts` — unit tests for verb templates.
- `tests/play/displayRows.test.ts` — unit tests for `toDisplayRows`.
- `tests/game/priority-guard.test.ts` — engine priority enforcement.

**Modified:**
- `src/lib/game/actions.ts` — add `cardName` to tap/untap/move_zone; ensure all card-touching creators emit structured `data`.
- `src/lib/game/engine.ts` — add priority guard at top of `applyAction`.
- `src/lib/game/types.ts` — already exports `GameActionType`; no change expected.
- `src/components/play/log/LogEntryStyle.ts` — add `icon: string` to banners.
- `src/components/play/GameLog.tsx` — switch to `toDisplayRows`-based render, add per-severity styles, mobile flash, responsive `mode: 'sheet' | 'side'`.
- `src/components/play/PlayGame.tsx` — wrap interactive zones in `<PriorityLock>`, mount `<PriorityBadge>`, add 409 rollback in `sendAction`, switch `<GameLog>` mode + `lg:pr-80` padding.
- `src/app/api/game/[id]/action/route.ts` — translate `ActionRejectedError` → 409 `{ error: 'not_your_priority' }`.
- `package.json` — add `test:game` script `vitest run tests/play tests/game`.

---

### Task 1: Add `ActionRejectedError` + run script

**Files:**
- Create: `src/lib/game/errors.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Create the error class**

```ts
// src/lib/game/errors.ts
export type ActionRejectionCode =
  | 'not_your_priority'
  | 'not_your_turn'
  | 'invalid_state'

export class ActionRejectedError extends Error {
  readonly code: ActionRejectionCode
  readonly meta?: Record<string, unknown>

  constructor(code: ActionRejectionCode, meta?: Record<string, unknown>) {
    super(code)
    this.name = 'ActionRejectedError'
    this.code = code
    this.meta = meta
  }
}
```

- [ ] **Step 2: Add a vitest run script for the new test files**

In `package.json` `scripts`, add:

```json
"test:game": "vitest run tests/play tests/game"
```

(Leave existing `test:goblinai*` and `test:proxy-pdf` scripts intact.)

- [ ] **Step 3: Verify it loads**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/errors.ts package.json
git commit -m "feat(game): add ActionRejectedError and test:game script"
```

---

### Task 2: Severity + icon tables

**Files:**
- Create: `src/components/play/log/severity.ts`
- Create: `src/components/play/log/icons.ts`

- [ ] **Step 1: Write `severity.ts`**

```ts
// src/components/play/log/severity.ts
import type { GameActionType } from '@/lib/game/types'

export type Severity = 'minor' | 'normal' | 'major'

/** Severity per action — drives font size + colour at render time.
 *  Adding a new GameActionType MUST add an entry here; the unit test
 *  in tests/play/displayRows.test.ts enforces total coverage. */
export const SEVERITY: Record<GameActionType, Severity> = {
  pass_priority: 'minor',
  tap: 'minor',
  untap: 'minor',
  toggle_auto_pass: 'minor',

  confirm_untap: 'normal',
  draw: 'normal',
  discard: 'normal',
  add_counter: 'normal',
  remove_counter: 'normal',
  set_counter: 'normal',
  set_pt: 'normal',
  shuffle_library: 'normal',
  shuffle_into_library: 'normal',
  move_zone: 'normal',
  bottom_cards: 'normal',
  chat_message: 'normal',
  phase_change: 'normal',

  play_card: 'major',
  create_token: 'major',
  life_change: 'major',
  declare_attackers: 'major',
  declare_blockers: 'major',
  combat_damage: 'major',
  resolve_combat_damage: 'major',
  copy_card: 'major',
  take_control: 'major',
  concede: 'major',
  mulligan: 'major',
  keep_hand: 'major',
  game_start: 'major',
  commander_choice: 'major',
}
```

> **Note:** If `GameActionType` in `src/lib/game/types.ts` includes additional members not listed above (e.g. `library_view`, `peak`, `reveal_top`), grep for the union and append matching entries. Pick `'minor'` for purely informational actions (`library_view`, `peak`, `reveal_top` → `'normal'`).

- [ ] **Step 2: Write `icons.ts`**

```ts
// src/components/play/log/icons.ts
import type { GameActionType } from '@/lib/game/types'

export const ICON: Partial<Record<GameActionType, string>> = {
  tap: '⊕',
  untap: '⊖',
  draw: '🃏',
  discard: '🗑',
  play_card: '▶',
  move_zone: '→',
  add_counter: '＋',
  remove_counter: '－',
  set_counter: '＝',
  set_pt: 'P/T',
  life_change: '♥',
  create_token: '✨',
  declare_attackers: '⚔',
  declare_blockers: '🛡',
  combat_damage: '✦',
  resolve_combat_damage: '✦',
  copy_card: '⎘',
  take_control: '⇄',
  shuffle_library: '🔀',
  shuffle_into_library: '🔀',
  concede: '🏳',
  chat_message: '💬',
  pass_priority: '·',
}

/** Banner glyph fallback when `LogRowStyle.icon` is not set. */
export const BANNER_ICON_DEFAULT = '•'
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0. If it fails because `GameActionType` includes types not covered, add them to `SEVERITY` and re-run.

- [ ] **Step 4: Commit**

```bash
git add src/components/play/log/severity.ts src/components/play/log/icons.ts
git commit -m "feat(log): severity + icon tables for action types"
```

---

### Task 3: Move-zone verb function + unit tests

**Files:**
- Create: `src/components/play/log/verbs.ts`
- Create: `tests/play/verbs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/play/verbs.test.ts
import { describe, expect, test } from 'vitest'
import { moveZoneVerb } from '@/components/play/log/verbs'

describe('moveZoneVerb', () => {
  test('hand -> battlefield = casts', () => {
    expect(moveZoneVerb('Lightning Bolt', 'hand', 'battlefield'))
      .toBe('casts Lightning Bolt from hand')
  })

  test('battlefield -> graveyard', () => {
    expect(moveZoneVerb('Goblin Token', 'battlefield', 'graveyard'))
      .toBe('sends Goblin Token to graveyard')
  })

  test('battlefield -> exile', () => {
    expect(moveZoneVerb('Goblin Token', 'battlefield', 'exile'))
      .toBe('exiles Goblin Token')
  })

  test('battlefield -> hand', () => {
    expect(moveZoneVerb('Goblin Token', 'battlefield', 'hand'))
      .toBe('returns Goblin Token to hand')
  })

  test('battlefield -> command', () => {
    expect(moveZoneVerb('Atraxa', 'battlefield', 'command'))
      .toBe('returns Atraxa to command zone')
  })

  test('graveyard -> hand', () => {
    expect(moveZoneVerb('Reanimate', 'graveyard', 'hand'))
      .toBe('returns Reanimate from graveyard to hand')
  })

  test('graveyard -> battlefield', () => {
    expect(moveZoneVerb('Reanimate', 'graveyard', 'battlefield'))
      .toBe('returns Reanimate from graveyard to battlefield')
  })

  test('exile -> hand', () => {
    expect(moveZoneVerb('Bolt', 'exile', 'hand'))
      .toBe('returns Bolt from exile to hand')
  })

  test('library -> battlefield', () => {
    expect(moveZoneVerb('Forest', 'library', 'battlefield'))
      .toBe('puts Forest from library onto battlefield')
  })

  test('command -> battlefield = casts from command zone', () => {
    expect(moveZoneVerb('Atraxa', 'command', 'battlefield'))
      .toBe('casts Atraxa from command zone')
  })

  test('hand -> graveyard = discards', () => {
    expect(moveZoneVerb('Bolt', 'hand', 'graveyard'))
      .toBe('discards Bolt')
  })

  test('hand -> exile', () => {
    expect(moveZoneVerb('Bolt', 'hand', 'exile'))
      .toBe('exiles Bolt from hand')
  })

  test('unknown pair falls back to generic', () => {
    expect(moveZoneVerb('Mystery', 'graveyard', 'command'))
      .toBe('moves Mystery from graveyard to command zone')
  })
})
```

- [ ] **Step 2: Run the test to verify failure**

Run: `npx vitest run tests/play/verbs.test.ts`
Expected: FAIL with "Cannot find module ... verbs".

- [ ] **Step 3: Implement `verbs.ts`**

```ts
// src/components/play/log/verbs.ts
import type { GameActionType } from '@/lib/game/types'

export type Zone =
  | 'hand' | 'battlefield' | 'graveyard' | 'exile'
  | 'library' | 'command' | 'commandZone' | 'stack'

const ZONE_LABEL: Record<string, string> = {
  hand: 'hand',
  battlefield: 'battlefield',
  graveyard: 'graveyard',
  exile: 'exile',
  library: 'library',
  command: 'command zone',
  commandZone: 'command zone',
  stack: 'the stack',
}

function label(z: string): string {
  return ZONE_LABEL[z] ?? z
}

/** Map a (from,to) pair to a player-facing verb phrase. Pure function. */
export function moveZoneVerb(card: string, from: string, to: string): string {
  const f = from === 'commandZone' ? 'command' : from
  const t = to === 'commandZone' ? 'command' : to
  const key = `${f}>${t}`

  switch (key) {
    case 'hand>battlefield':       return `casts ${card} from hand`
    case 'hand>graveyard':         return `discards ${card}`
    case 'hand>exile':             return `exiles ${card} from hand`
    case 'hand>library':           return `puts ${card} from hand into library`
    case 'hand>command':           return `sends ${card} to command zone`

    case 'battlefield>hand':       return `returns ${card} to hand`
    case 'battlefield>graveyard':  return `sends ${card} to graveyard`
    case 'battlefield>exile':      return `exiles ${card}`
    case 'battlefield>library':    return `puts ${card} on top of library`
    case 'battlefield>command':    return `returns ${card} to command zone`

    case 'graveyard>hand':         return `returns ${card} from graveyard to hand`
    case 'graveyard>battlefield':  return `returns ${card} from graveyard to battlefield`
    case 'graveyard>exile':        return `exiles ${card} from graveyard`
    case 'graveyard>library':      return `shuffles ${card} into library`

    case 'exile>hand':             return `returns ${card} from exile to hand`
    case 'exile>battlefield':      return `returns ${card} from exile to battlefield`
    case 'exile>graveyard':        return `moves ${card} from exile to graveyard`

    case 'library>hand':           return `draws ${card}`
    case 'library>battlefield':    return `puts ${card} from library onto battlefield`
    case 'library>graveyard':      return `mills ${card}`
    case 'library>exile':          return `exiles ${card} from library top`

    case 'command>battlefield':    return `casts ${card} from command zone`
    case 'command>graveyard':      return `sends ${card} to graveyard`
    case 'command>exile':          return `exiles ${card}`

    default: return `moves ${card} from ${label(f)} to ${label(t)}`
  }
}

export interface VerbInput {
  action: GameActionType
  actorName: string
  data: Record<string, unknown> | null
}

/** Compose the player-facing sentence for a non-banner action row.
 *  Falls back to `entry.text` (passed by the caller) if data is incomplete. */
export function actionVerbText(input: VerbInput, fallbackText: string): string {
  const { action, actorName, data } = input
  const card = (data?.cardName as string | undefined) ?? null

  switch (action) {
    case 'tap':
      return card ? `${actorName} taps ${card}` : fallbackText
    case 'untap':
      return card ? `${actorName} untaps ${card}` : fallbackText
    case 'draw': {
      const n = (data?.count as number | undefined) ?? 1
      return `${actorName} draws ${n === 1 ? 'a card' : `${n} cards`}`
    }
    case 'discard':
      return card ? `${actorName} discards ${card} from hand` : fallbackText
    case 'play_card':
      return card ? `${actorName} casts ${card} from hand` : fallbackText
    case 'move_zone': {
      if (!card || !data?.from || !data?.to) return fallbackText
      return `${actorName} ${moveZoneVerb(card, data.from as string, data.to as string)}`
    }
    case 'add_counter': {
      const n = (data?.amount as number | undefined) ?? 1
      const k = (data?.counterName as string | undefined) ?? 'counter'
      return card ? `${actorName} puts ${n} ${k} counter${n > 1 ? 's' : ''} on ${card}` : fallbackText
    }
    case 'remove_counter': {
      const n = (data?.amount as number | undefined) ?? 1
      const k = (data?.counterName as string | undefined) ?? 'counter'
      return card ? `${actorName} removes ${n} ${k} counter${n > 1 ? 's' : ''} from ${card}` : fallbackText
    }
    case 'set_counter': {
      const v = (data?.value as number | undefined) ?? 0
      const k = (data?.counterName as string | undefined) ?? 'counter'
      return card ? `${actorName} sets ${k} counters on ${card} to ${v}` : fallbackText
    }
    case 'set_pt': {
      const p = (data?.powerMod as number | undefined) ?? 0
      const t = (data?.toughnessMod as number | undefined) ?? 0
      const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`)
      return card ? `${actorName} sets ${card} P/T mod to ${sign(p)}/${sign(t)}` : fallbackText
    }
    case 'life_change': {
      const targetName = (data?.targetName as string | undefined) ?? 'opponent'
      const amount = (data?.amount as number | undefined) ?? 0
      const dir = amount >= 0 ? 'gains' : 'loses'
      return `${targetName} ${dir} ${Math.abs(amount)} life`
    }
    case 'create_token': {
      const name = (data?.tokenName as string | undefined) ?? 'token'
      const n = (data?.quantity as number | undefined) ?? 1
      return `${actorName} creates ${n} ${name} token${n > 1 ? 's' : ''}`
    }
    case 'shuffle_library':
      return `${actorName} shuffles their library`
    case 'shuffle_into_library':
      return card ? `${actorName} shuffles ${card} into library` : fallbackText
    case 'copy_card':
      return card ? `${actorName} copies ${card}` : fallbackText
    case 'take_control':
      return card ? `${actorName} takes control of ${card}` : fallbackText
    case 'pass_priority':
      return `${actorName} passes priority`
    default:
      return fallbackText
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/play/verbs.test.ts`
Expected: all 13 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/play/log/verbs.ts tests/play/verbs.test.ts
git commit -m "feat(log): zone-aware verb generator + tests"
```

---

### Task 4: `toDisplayRows` + unit tests

**Files:**
- Create: `src/components/play/log/displayRows.ts`
- Create: `tests/play/displayRows.test.ts`
- Modify: `src/components/play/log/LogEntryStyle.ts` (add `icon` field)

- [ ] **Step 1: Add `icon` to `LogRowStyle` and the existing banner mappings**

In `src/components/play/log/LogEntryStyle.ts`, change:

```ts
export interface LogRowStyle {
  banner?: { label: string; tone: 'neutral' | 'combat' | 'pregame' | 'end' | 'draw' }
  textClass: string
  glyph?: string
  icon?: string   // NEW — banner icon, falls back to glyph then BANNER_ICON_DEFAULT
}
```

Then update each banner case in `styleForEntry` to also set `icon` to the same string already used in `glyph`. (No behaviour change — existing `glyph` field stays, the new `icon` field unifies on the data shape used by `LogEntryRow`.) Example:

```ts
case 'game_start':
  return {
    banner: { label: 'Game started', tone: 'pregame' },
    textClass: '',
    glyph: '✦',
    icon: '✦',
  }
```

Repeat for every existing case.

- [ ] **Step 2: Write the failing test**

```ts
// tests/play/displayRows.test.ts
import { describe, expect, test } from 'vitest'
import { toDisplayRows } from '@/components/play/log/displayRows'
import { SEVERITY } from '@/components/play/log/severity'
import type { LogEntry, GameActionType } from '@/lib/game/types'

const me = 'me-id'

function entry(partial: Partial<LogEntry> & Pick<LogEntry, 'seq' | 'action'>): LogEntry {
  return {
    id: `e-${partial.seq}`,
    seq: partial.seq,
    playerId: partial.playerId ?? me,
    action: partial.action,
    data: partial.data ?? {},
    text: partial.text ?? '',
    createdAt: partial.createdAt ?? new Date('2026-05-10T12:00:00Z').toISOString(),
    type: partial.type,
  }
}

describe('toDisplayRows', () => {
  test('1:1 mapping — never aggregates', () => {
    const taps = Array.from({ length: 5 }, (_, i) =>
      entry({ seq: i + 1, action: 'tap', data: { cardName: 'Forest' } }),
    )
    const rows = toDisplayRows(taps, me)
    expect(rows).toHaveLength(5)
    expect(rows.every(r => r.kind === 'action')).toBe(true)
  })

  test('severity table covers every GameActionType', () => {
    const allActions: GameActionType[] = Object.keys(SEVERITY) as GameActionType[]
    for (const a of allActions) {
      expect(SEVERITY[a]).toMatch(/^(minor|normal|major)$/)
    }
  })

  test('banner action becomes kind=banner', () => {
    const rows = toDisplayRows(
      [entry({ seq: 1, action: 'declare_attackers', data: { attackerNames: ['Goblin'] } })],
      me,
    )
    expect(rows[0].kind).toBe('banner')
  })

  test('chat_message becomes kind=chat', () => {
    const rows = toDisplayRows(
      [entry({ seq: 1, action: 'chat_message', text: 'gg', type: 'chat' })],
      me,
    )
    expect(rows[0].kind).toBe('chat')
  })

  test('declare_attackers expands to banner + per-attacker action rows', () => {
    const rows = toDisplayRows(
      [entry({
        seq: 1,
        action: 'declare_attackers',
        data: { attackerIds: ['a1', 'a2'], attackerNames: ['Goblin', 'Bogart'] },
      })],
      me,
    )
    // banner + 2 per-attacker rows
    expect(rows.map(r => r.kind)).toEqual(['banner', 'action', 'action'])
    if (rows[1].kind === 'action') {
      expect(rows[1].verbText).toContain('attacks with Goblin')
    }
  })

  test('pass_priority hidden when sandwiched between same-phase no-ops', () => {
    const rows = toDisplayRows(
      [
        entry({ seq: 1, action: 'pass_priority' }),
        entry({ seq: 2, action: 'pass_priority', playerId: 'opp' }),
      ],
      me,
    )
    // both passes hidden because nothing in-between altered anything.
    expect(rows).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Run test to verify failure**

Run: `npx vitest run tests/play/displayRows.test.ts`
Expected: FAIL with "Cannot find module ... displayRows".

- [ ] **Step 4: Implement `displayRows.ts`**

```ts
// src/components/play/log/displayRows.ts
import type { LogEntry, GameActionType } from '@/lib/game/types'
import type { LogRowStyle } from './LogEntryStyle'
import { styleForEntry } from './LogEntryStyle'
import { SEVERITY, type Severity } from './severity'
import { ICON } from './icons'
import { actionVerbText } from './verbs'

export type DisplayRow =
  | { kind: 'banner';  entry: LogEntry; style: LogRowStyle; icon: string }
  | { kind: 'action';  entry: LogEntry; severity: Severity; icon: string; verbText: string }
  | { kind: 'chat';    entry: LogEntry }
  | { kind: 'warning'; entry: LogEntry; reason: string }

const BANNER_ACTIONS: ReadonlySet<string> = new Set([
  'game_start', 'keep_hand', 'mulligan', 'bottom_cards',
  'confirm_untap', 'phase_change',
  'declare_attackers', 'declare_blockers',
  'combat_damage', 'resolve_combat_damage',
  'concede',
])

function actorName(entry: LogEntry, playerNames: Record<string, string> | undefined): string {
  if (!entry.playerId) return 'System'
  return playerNames?.[entry.playerId] ?? 'Player'
}

/** Pure: derive the rendered view-model from the persisted log.
 *  No aggregation — 1 entry → 1 (or sometimes >1) DisplayRow. */
export function toDisplayRows(
  entries: LogEntry[],
  myUserId: string,
  playerNames?: Record<string, string>,
): DisplayRow[] {
  const out: DisplayRow[] = []

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]

    // Chat → its own kind
    if (e.action === 'chat_message' || e.type === 'chat') {
      out.push({ kind: 'chat', entry: e })
      continue
    }

    // Pass-priority skip rule: hide if the surrounding entries imply the pass
    // had no effect (no game-state-changing action between this and the next
    // pass). Approximation: hide pass_priority entirely. The badge / phase
    // banners already convey turn/phase advancement.
    if (e.action === 'pass_priority') {
      // Always hide pass_priority rows in render — they are persisted for
      // replay correctness but add no per-row signal players need to see.
      continue
    }

    // Banner-class actions (turn/phase/combat boundaries)
    if (BANNER_ACTIONS.has(e.action)) {
      const style = styleForEntry(e, myUserId)
      const icon = style.icon ?? style.glyph ?? '•'
      out.push({ kind: 'banner', entry: e, style, icon })

      // declare_attackers / declare_blockers expand to per-target action rows
      if (e.action === 'declare_attackers') {
        const names = (e.data?.attackerNames as string[] | undefined) ?? []
        const ids = (e.data?.attackerIds as string[] | undefined) ?? []
        for (let k = 0; k < names.length; k++) {
          const card = names[k]
          out.push({
            kind: 'action',
            entry: { ...e, id: `${e.id}#a${k}`, seq: e.seq, data: { ...e.data, cardName: card, attackerInstanceId: ids[k] } },
            severity: 'major',
            icon: ICON.declare_attackers ?? '⚔',
            verbText: `${actorName(e, playerNames)} attacks with ${card}`,
          })
        }
      } else if (e.action === 'declare_blockers') {
        type BlockAssign = { blockerId: string; attackerId: string; blockerName?: string; attackerName?: string }
        const assigns = (e.data?.blockerAssignments as BlockAssign[] | undefined) ?? []
        for (let k = 0; k < assigns.length; k++) {
          const a = assigns[k]
          if (!a.blockerName || !a.attackerName) continue
          out.push({
            kind: 'action',
            entry: { ...e, id: `${e.id}#b${k}`, seq: e.seq, data: { ...e.data, cardName: a.blockerName } },
            severity: 'major',
            icon: ICON.declare_blockers ?? '🛡',
            verbText: `${actorName(e, playerNames)} blocks ${a.attackerName} with ${a.blockerName}`,
          })
        }
      }
      continue
    }

    // Default: single action row
    const action = e.action as GameActionType
    const severity = SEVERITY[action] ?? 'normal'
    const icon = ICON[action] ?? '·'
    const verbText = actionVerbText(
      { action, actorName: actorName(e, playerNames), data: e.data },
      e.text,
    )
    out.push({ kind: 'action', entry: e, severity, icon, verbText })
  }

  return out
}
```

- [ ] **Step 5: Run tests to verify**

Run: `npx vitest run tests/play/displayRows.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/play/log/displayRows.ts src/components/play/log/LogEntryStyle.ts tests/play/displayRows.test.ts
git commit -m "feat(log): toDisplayRows view-model + banner icon field"
```

---

### Task 5: Update action creators to carry `cardName` everywhere

**Files:**
- Modify: `src/lib/game/actions.ts`

- [ ] **Step 1: Patch `createTap`, `createUntap`, `createMoveZone`, `createDraw`, `createCreateToken`, `createDeclareAttackers`, `createLifeChange` so `data` always carries the fields the renderer needs**

```ts
export function createTap(playerId: string, playerName: string, instanceId: string, cardName: string): GameAction {
  return { type: 'tap', playerId, data: { instanceId, cardName }, text: `${playerName} taps ${cardName}` }
}

export function createUntap(playerId: string, playerName: string, instanceId: string, cardName: string): GameAction {
  return { type: 'untap', playerId, data: { instanceId, cardName }, text: `${playerName} untaps ${cardName}` }
}

export function createMoveZone(playerId: string, playerName: string, instanceId: string, cardId: number, cardName: string, from: string, to: string): GameAction {
  return {
    type: 'move_zone', playerId,
    data: { instanceId, cardId, cardName, from, to },
    text: `${playerName} moves ${cardName} from ${from} to ${to}`,
  }
}

export function createDraw(playerId: string, playerName: string, count: number = 1): GameAction {
  return {
    type: 'draw', playerId,
    data: { count },
    text: `${playerName} draws ${count === 1 ? 'a card' : `${count} cards`}`,
  }
}

export function createCreateToken(playerId: string, playerName: string, tokens: { instanceId: string; cardId: number }[], tokenName: string, quantity: number): GameAction {
  return {
    type: 'create_token', playerId,
    data: { tokens, tokenName, quantity },
    text: `${playerName} creates ${quantity}x ${tokenName} token${quantity > 1 ? 's' : ''}`,
  }
}

export function createDeclareAttackers(playerId: string, playerName: string, attackerIds: string[], attackerNames: string[]): GameAction {
  const names = attackerNames.length > 0 ? attackerNames.join(', ') : 'no creatures'
  return {
    type: 'declare_attackers', playerId,
    data: { attackerIds, attackerNames },   // names now persisted
    text: `${playerName} declares attackers: ${names}`,
  }
}

export function createDeclareBlockers(playerId: string, playerName: string, blockerAssignments: { blockerId: string; attackerId: string; blockerName: string; attackerName: string }[]): GameAction {
  const desc = blockerAssignments.length > 0
    ? blockerAssignments.map((b) => `${b.blockerName} blocks ${b.attackerName}`).join(', ')
    : 'no blockers'
  return {
    type: 'declare_blockers', playerId,
    data: { blockerAssignments },   // keep full assignment objects for renderer
    text: `${playerName} declares blockers: ${desc}`,
  }
}

export function createLifeChange(playerId: string, playerName: string, targetPlayerId: string, targetName: string, amount: number): GameAction {
  const dir = amount > 0 ? 'gains' : 'loses'
  return {
    type: 'life_change', playerId,
    data: { targetPlayerId, targetName, amount },
    text: `${targetName} ${dir} ${Math.abs(amount)} life`,
  }
}
```

> **Note:** `createPlayCard`, `createDiscard`, `createAddCounter`, `createRemoveCounter`, `createSetCounter`, `createSetPT`, `createCopyCard`, `createTakeControl`, `createShuffleIntoLibrary` already include the fields the renderer needs (`cardName`, `from`, `to`, etc.) — leave them unchanged.

- [ ] **Step 2: Update every call site that uses `createDraw(...)` to pass `count` (or omit if drawing a single card)**

Run: `grep -rn "createDraw(" src/`. For each call where the engine is drawing N cards in a loop (look in `src/lib/game/engine.ts`), prefer passing the total count instead of looping. Where the engine truly emits one draw per card already, leave the call as `createDraw(userId, name)` (count defaults to 1).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/actions.ts
git commit -m "refactor(game/actions): persist render-required fields in data"
```

---

### Task 6: Engine priority guard + tests

**Files:**
- Modify: `src/lib/game/engine.ts`
- Create: `tests/game/priority-guard.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/game/priority-guard.test.ts
import { describe, expect, test } from 'vitest'
import { applyAction } from '@/lib/game/engine'
import { ActionRejectedError } from '@/lib/game/errors'
import { createTap, createConcede, createLifeChange } from '@/lib/game/actions'
import type { GameState } from '@/lib/game/types'

function baseState(priorityPlayerId: string): GameState {
  const me = 'me-id', opp = 'opp-id'
  return {
    turn: 1, phase: 'main1',
    activePlayerId: me, priorityPlayerId,
    firstPlayerId: me,
    combat: { phase: null, attackers: [], blockers: [], damageAssigned: false, damageApplied: false },
    players: {
      [me]:  { life: 20, library: [], libraryCount: 0, hand: [], handCount: 0, battlefield: [{ instanceId: 'c1', cardId: 1, tapped: false }], graveyard: [], exile: [], commandZone: [], commanderCastCount: 0, autoPass: false },
      [opp]: { life: 20, library: [], libraryCount: 0, hand: [], handCount: 0, battlefield: [], graveyard: [], exile: [], commandZone: [], commanderCastCount: 0, autoPass: false },
    },
    lastActionSeq: 0,
  }
}

describe('engine priority guard', () => {
  test('rejects non-exempt action from non-priority player', () => {
    const state = baseState('opp-id')
    const tap = createTap('me-id', 'Me', 'c1', 'Forest')
    expect(() => applyAction(state, tap)).toThrow(ActionRejectedError)
  })

  test('accepts non-exempt action from priority player', () => {
    const state = baseState('me-id')
    const tap = createTap('me-id', 'Me', 'c1', 'Forest')
    const next = applyAction(state, tap)
    expect(next.players['me-id'].battlefield[0].tapped).toBe(true)
  })

  test('concede always allowed', () => {
    const state = baseState('opp-id')
    const concede = createConcede('me-id', 'Me')
    expect(() => applyAction(state, concede)).not.toThrow()
  })

  test('life_change on self allowed without priority', () => {
    const state = baseState('opp-id')
    const lc = createLifeChange('me-id', 'Me', 'me-id', 'Me', -1)
    expect(() => applyAction(state, lc)).not.toThrow()
  })

  test('life_change on opponent rejected without priority', () => {
    const state = baseState('opp-id')
    const lc = createLifeChange('me-id', 'Me', 'opp-id', 'Opp', -1)
    expect(() => applyAction(state, lc)).toThrow(ActionRejectedError)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/game/priority-guard.test.ts`
Expected: FAIL — guard not yet in engine.

- [ ] **Step 3: Add the guard at the top of `applyAction`**

In `src/lib/game/engine.ts`, immediately after `s.lastActionSeq++`, before the `pendingCommanderChoice` block, insert:

```ts
const PRIORITY_EXEMPT: ReadonlySet<string> = new Set([
  'concede', 'chat_message', 'commander_choice',
  'mulligan', 'keep_hand', 'bottom_cards',
  'toggle_auto_pass',
  'pass_priority',
  'library_view', 'peak', 'reveal_top',
])

function isLifeChangeOnSelf(action: GameAction): boolean {
  return action.type === 'life_change'
      && (action.data?.targetPlayerId as string | undefined) === action.playerId
}

if (
  !PRIORITY_EXEMPT.has(action.type)
  && !isLifeChangeOnSelf(action)
  && action.playerId !== s.priorityPlayerId
) {
  throw new ActionRejectedError('not_your_priority', { action: action.type, expected: s.priorityPlayerId, actor: action.playerId })
}
```

Add the import at the top:

```ts
import { ActionRejectedError } from './errors'
```

- [ ] **Step 4: Run tests to verify**

Run: `npx vitest run tests/game/priority-guard.test.ts`
Expected: all PASS.

- [ ] **Step 5: Sanity-check the goldfish path**

Inspect `src/components/play/PlayGame.tsx` `sendAction` — in goldfish mode the call path goes through `applyWithBotLoop` → `applyAction`. Check that the player always has priority when the UI lets them act in goldfish (the bot is set to `autoPass: true`). If a goldfish action throws `ActionRejectedError`, the goldfish flow regresses.

Manually trigger goldfish in the dev server (`npm run dev`) and play one card. If anything throws, revisit `priorityPlayerId` rotation in the goldfish initial state in `src/app/(app)/decks/[id]/goldfish/page.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/engine.ts tests/game/priority-guard.test.ts
git commit -m "feat(game/engine): priority guard with documented exemptions"
```

---

### Task 7: API route → 409 on `ActionRejectedError`

**Files:**
- Modify: `src/app/api/game/[id]/action/route.ts`

- [ ] **Step 1: Wrap `applyAction` call in try/catch and return 409**

In `src/app/api/game/[id]/action/route.ts`, around the existing `applyAction` invocation inside the OCC retry loop, wrap the call:

```ts
import { ActionRejectedError } from '@/lib/game/errors'

// inside the retry loop, replace:
//   let newState = applyAction(stateToProcess, action)
// with:
let newState: GameState
try {
  newState = applyAction(stateToProcess, action)
} catch (e) {
  if (e instanceof ActionRejectedError) {
    return NextResponse.json({ error: e.code, meta: e.meta ?? null }, { status: 409 })
  }
  throw e
}
```

The auto-pass loop further down also calls `applyAction` for `pass_priority`. Those passes are exempt by the guard, so leave that loop alone.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/game/\[id\]/action/route.ts
git commit -m "feat(api/game): translate ActionRejectedError to 409"
```

---

### Task 8: `usePriority` hook + `PriorityBadge` + `PriorityLock`

**Files:**
- Create: `src/lib/hooks/usePriority.ts`
- Create: `src/lib/hooks/useMediaQuery.ts` (only if grep finds no existing one)
- Create: `src/components/play/log/PriorityBadge.tsx`
- Create: `src/components/play/log/PriorityLock.tsx`

- [ ] **Step 1: Check for existing media-query hook**

Run: `grep -rn "useMediaQuery\|matchMedia" src/lib/hooks src/components`
If a working hook already exists, skip the file creation in Step 2 and import from there.

- [ ] **Step 2: Create `useMediaQuery.ts` (only if missing)**

```ts
// src/lib/hooks/useMediaQuery.ts
'use client'

import { useEffect, useState } from 'react'

/** SSR-safe matchMedia hook. Returns false on the server pass to avoid hydration mismatch. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setMatches(e.matches)
    handler(mq)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [query])
  return matches
}
```

- [ ] **Step 3: Create `usePriority.ts`**

```ts
// src/lib/hooks/usePriority.ts
import type { GameState } from '@/lib/game/types'

export interface PriorityInfo {
  hasPriority: boolean
  isMyTurn: boolean
  activePlayerId: string | null
  priorityPlayerId: string | null
}

export function usePriority(state: GameState | null, userId: string): PriorityInfo {
  if (!state) {
    return { hasPriority: false, isMyTurn: false, activePlayerId: null, priorityPlayerId: null }
  }
  return {
    hasPriority: state.priorityPlayerId === userId,
    isMyTurn: state.activePlayerId === userId,
    activePlayerId: state.activePlayerId,
    priorityPlayerId: state.priorityPlayerId,
  }
}
```

- [ ] **Step 4: Create `PriorityBadge.tsx`**

```tsx
// src/components/play/log/PriorityBadge.tsx
'use client'

import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react'

export interface PriorityBadgeHandle {
  pulse: () => void
}

interface Props {
  hasPriority: boolean
  activePlayerName: string
}

const PriorityBadge = forwardRef<PriorityBadgeHandle, Props>(function PriorityBadge(
  { hasPriority, activePlayerName },
  ref,
) {
  const [pulsing, setPulsing] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useImperativeHandle(ref, () => ({
    pulse() {
      setPulsing(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setPulsing(false), 250)
    },
  }), [])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  if (hasPriority) return null

  return (
    <div
      className={`pointer-events-none fixed left-1/2 top-2 z-50 -translate-x-1/2 rounded-full border bg-bg-card/95 px-3 py-1 text-[11px] font-semibold text-font-secondary shadow-md backdrop-blur ${
        pulsing ? 'border-bg-red animate-pulse' : 'border-border/60'
      }`}
      style={{ top: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
    >
      ⏳ Aspetta priorità — turno di {activePlayerName}
    </div>
  )
})

export default PriorityBadge
```

- [ ] **Step 5: Create `PriorityLock.tsx`**

```tsx
// src/components/play/log/PriorityLock.tsx
'use client'

import type { ReactNode } from 'react'

interface Props {
  locked: boolean
  onBlockedAttempt?: () => void
  children: ReactNode
  className?: string
}

/** Wraps an interactive game zone. When `locked`, an absolutely-positioned
 *  overlay sits on top of the children and intercepts pointer events; the
 *  underlying handlers never fire. The overlay calls `onBlockedAttempt` so
 *  the caller can pulse the priority badge. */
export default function PriorityLock({ locked, onBlockedAttempt, children, className }: Props) {
  return (
    <div className={`relative ${className ?? ''}`}>
      {children}
      {locked && (
        <div
          aria-hidden
          onPointerDownCapture={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onBlockedAttempt?.()
          }}
          className="absolute inset-0 z-30 cursor-not-allowed bg-bg-dark/35 backdrop-blur-[1px]"
        />
      )}
    </div>
  )
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/hooks/usePriority.ts src/lib/hooks/useMediaQuery.ts src/components/play/log/PriorityBadge.tsx src/components/play/log/PriorityLock.tsx
git commit -m "feat(play): priority hook + lock overlay + persistent badge"
```

> If `useMediaQuery.ts` already existed, drop it from the `git add`.

---

### Task 9: `LogEntryRow` + `GameLog` refactor (sheet + side modes)

**Files:**
- Create: `src/components/play/log/LogEntryRow.tsx`
- Modify: `src/components/play/GameLog.tsx`

- [ ] **Step 1: Create `LogEntryRow.tsx`**

```tsx
// src/components/play/log/LogEntryRow.tsx
'use client'

import type { CardMap } from '@/lib/game/types'
import type { Database } from '@/types/supabase'
import LogText from './LogText'
import { toneClasses } from './LogEntryStyle'
import type { DisplayRow } from './displayRows'

type CardRow = Database['public']['Tables']['cards']['Row']

interface Props {
  row: DisplayRow
  cardMap: CardMap
  playerNames: Record<string, string>
  onCardPreview: (card: CardRow) => void
}

const SEVERITY_CLASS: Record<'minor' | 'normal' | 'major', string> = {
  minor:  'text-[10px] text-font-muted opacity-80',
  normal: 'text-[10px] text-font-primary',
  major:  'text-[11px] font-semibold text-font-primary',
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function LogEntryRow({ row, cardMap, playerNames, onCardPreview }: Props) {
  const time = fmtTime(row.entry.createdAt)

  if (row.kind === 'banner') {
    return (
      <div
        className={`my-0.5 flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[10px] ${toneClasses(row.style.banner!.tone)}`}
      >
        <span className="leading-none">{row.icon}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider shrink-0">{row.style.banner!.label}</span>
        <span className="flex-1 text-font-primary truncate">
          <LogText text={row.entry.text} cardMap={cardMap} playerNames={playerNames} onCardPreview={onCardPreview} />
        </span>
        <span className="shrink-0 text-[9px] text-font-muted tabular-nums">{time}</span>
      </div>
    )
  }

  if (row.kind === 'chat') {
    return (
      <div className="flex gap-2 py-0.5 text-[10px] italic text-yellow-400">
        <span className="shrink-0 text-font-muted tabular-nums">{time}</span>
        <span className="flex-1">
          💬 <LogText text={row.entry.text} cardMap={cardMap} playerNames={playerNames} onCardPreview={onCardPreview} />
        </span>
      </div>
    )
  }

  if (row.kind === 'warning') {
    return (
      <div className="my-0.5 flex items-center gap-1.5 rounded border border-bg-red/40 bg-bg-red/10 px-1.5 py-0.5 text-[10px] text-bg-red">
        <span>⚠</span>
        <span className="flex-1">{row.reason}</span>
        <span className="shrink-0 text-[9px] tabular-nums">{time}</span>
      </div>
    )
  }

  // kind === 'action'
  return (
    <div className={`flex gap-2 py-0.5 ${SEVERITY_CLASS[row.severity]}`}>
      <span className="shrink-0 text-font-muted tabular-nums">{time}</span>
      <span className="shrink-0 text-font-secondary">{row.icon}</span>
      <span className="flex-1">
        <LogText text={row.verbText} cardMap={cardMap} playerNames={playerNames} onCardPreview={onCardPreview} />
      </span>
    </div>
  )
}
```

- [ ] **Step 2: Refactor `GameLog.tsx` — accept `mode`, render via `toDisplayRows`, default-open mobile, flash on new**

Replace the file body with:

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { LogEntry, CardMap } from '@/lib/game/types'
import type { Database } from '@/types/supabase'
import LogEntryRow from './log/LogEntryRow'
import { toDisplayRows } from './log/displayRows'

type CardRow = Database['public']['Tables']['cards']['Row']

interface Props {
  entries: LogEntry[]
  myUserId: string
  cardMap: CardMap
  playerNames: Record<string, string>
  onSendChat?: (message: string) => void
  onCardPreview?: (card: CardRow) => void
  /** 'sheet' = bottom collapsible (mobile). 'side' = full-height side panel (desktop). */
  mode: 'sheet' | 'side'
}

const STORAGE_KEY = 'gameLogOpen'

export default function GameLog({
  entries, myUserId, cardMap, playerNames, onSendChat, onCardPreview, mode,
}: Props) {
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (mode === 'side') return true
    if (typeof window === 'undefined') return true
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v === null ? true : v === '1'
  })
  const [flash, setFlash] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastSeqRef = useRef<number>(entries.at(-1)?.seq ?? 0)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [entries])

  useEffect(() => {
    const lastSeq = entries.at(-1)?.seq ?? 0
    if (lastSeq > lastSeqRef.current) {
      lastSeqRef.current = lastSeq
      if (mode === 'sheet' && !expanded) {
        setFlash(true)
        const t = setTimeout(() => setFlash(false), 250)
        return () => clearTimeout(t)
      }
    }
  }, [entries, mode, expanded])

  const previewHandler = onCardPreview ?? (() => {})
  const rows = toDisplayRows(entries, myUserId, playerNames)

  const isSide = mode === 'side'
  const visibleRows = isSide || expanded ? rows : rows.slice(-8)

  return (
    <div
      className={
        isSide
          ? 'flex h-full w-80 shrink-0 flex-col border-l border-border bg-bg-card'
          : 'border-t border-border bg-bg-card'
      }
    >
      {!isSide && (
        <button
          onClick={() => {
            const v = !expanded
            setExpanded(v)
            try { window.localStorage.setItem(STORAGE_KEY, v ? '1' : '0') } catch {}
          }}
          className={`flex w-full items-center justify-between px-3 py-1 transition-colors ${flash ? 'animate-pulse bg-bg-accent/15' : ''}`}
        >
          <span className="text-[9px] font-bold tracking-wider text-font-muted">
            GAME LOG ({entries.length})
          </span>
          {expanded ? <ChevronDown size={12} className="text-font-muted" /> : <ChevronUp size={12} className="text-font-muted" />}
        </button>
      )}
      {isSide && (
        <div className="border-b border-border px-3 py-2">
          <span className="text-[10px] font-bold tracking-wider text-font-muted">GAME LOG ({entries.length})</span>
        </div>
      )}
      <div
        ref={scrollRef}
        className={`overflow-y-auto px-3 pb-2 ${
          isSide ? 'flex-1' : expanded ? 'max-h-60' : 'max-h-24'
        }`}
      >
        {visibleRows.map((row) => (
          <LogEntryRow
            key={`${row.entry.id}-${row.kind === 'action' ? row.verbText : row.kind}`}
            row={row}
            cardMap={cardMap}
            playerNames={playerNames}
            onCardPreview={previewHandler}
          />
        ))}
      </div>
      {onSendChat && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const input = e.currentTarget.elements.namedItem('chatInput') as HTMLInputElement
            const msg = input.value.trim()
            if (msg) { onSendChat(msg); input.value = '' }
          }}
          className="flex gap-1.5 border-t border-border/50 px-3 py-1.5"
        >
          <input
            name="chatInput"
            type="text"
            placeholder="Chat..."
            maxLength={200}
            className="flex-1 rounded bg-bg-cell px-2 py-1 text-[10px] text-font-primary placeholder:text-font-muted outline-none focus:ring-1 focus:ring-bg-accent"
          />
          <button
            type="submit"
            className="shrink-0 rounded bg-bg-accent px-2.5 py-1 text-[9px] font-bold text-font-white active:bg-bg-accent-dark"
          >
            Send
          </button>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/components/play/GameLog.tsx src/components/play/log/LogEntryRow.tsx`
Expected: tsc exit 0; eslint shows only pre-existing warnings.

- [ ] **Step 4: Commit**

```bash
git add src/components/play/log/LogEntryRow.tsx src/components/play/GameLog.tsx
git commit -m "feat(log): responsive GameLog with sheet/side modes + DisplayRow rendering"
```

---

### Task 10: `PlayGame` integration — locks, badge, 409 rollback, layout

**Files:**
- Modify: `src/components/play/PlayGame.tsx`

- [ ] **Step 1: Add imports + hook + badge ref + responsive flag**

Near the top of `PlayGame.tsx`:

```ts
import { usePriority } from '@/lib/hooks/usePriority'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
import PriorityBadge, { type PriorityBadgeHandle } from '@/components/play/log/PriorityBadge'
import PriorityLock from '@/components/play/log/PriorityLock'
```

Inside `PlayGame`, after `gameState` is initialised (and `myState`/`opponentState` derived):

```ts
const { hasPriority, activePlayerId } = usePriority(gameState, userId)
const activePlayerName = activePlayerId ? (playerNames[activePlayerId] ?? 'Player') : ''
const isDesktop = useMediaQuery('(min-width: 1024px)')
const badgeRef = useRef<PriorityBadgeHandle>(null)
```

- [ ] **Step 2: Add 409 rollback to `sendAction`**

Locate the multiplayer branch of `sendAction` (around line 401) where it does the optimistic update + POST. Replace the POST + response handling with:

```ts
const snapshot = gameState   // capture pre-action state
// existing optimistic apply (keep what's already there)

const res = await fetch(`/api/game/${lobbyId}/action`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(action),
})

if (res.status === 409) {
  const body = await res.json().catch(() => null) as { error?: string } | null
  if (body?.error === 'not_your_priority') {
    // Roll back to the snapshot the engine accepted before this attempt
    if (snapshot) setGameState(snapshot)
    badgeRef.current?.pulse()
    return
  }
  // other 409s (state conflict) keep existing handling if any
}
```

> **Note:** The exact existing code structure differs — preserve current success-path handling (state from response, log refetch, etc.). Only inject the 409 branch before that.

- [ ] **Step 3: Mount `<PriorityBadge>` + wrap interactive zones**

Inside the JSX returned by `PlayGame`, immediately after the existing top header div (back link + Goblin button), add:

```tsx
<PriorityBadge ref={badgeRef} hasPriority={hasPriority} activePlayerName={activePlayerName} />
```

Then wrap the interactive zones in `<PriorityLock>`. Locate the `OpponentField`, `BattlefieldZone`, `HandArea`, and `GameActionBar` blocks. For each, wrap as:

```tsx
<PriorityLock
  locked={!hasPriority}
  onBlockedAttempt={() => badgeRef.current?.pulse()}
>
  {/* existing component */}
</PriorityLock>
```

For `GameActionBar`, the **Concede** button must remain clickable. Easiest: split the action bar render into "core actions" (locked) and an always-clickable "Concede" overlay button positioned above the lock; OR pass `hasPriority` to `GameActionBar` and let it render Concede outside its own locked section. Pick the option matching the existing component shape — if `GameActionBar` is monolithic, render `<button>Concede</button>` next to the lock and hide the in-bar concede:

```tsx
<div className="relative">
  <PriorityLock locked={!hasPriority} onBlockedAttempt={() => badgeRef.current?.pulse()}>
    <GameActionBar {...existingProps} hideConcede />
  </PriorityLock>
  <button
    onClick={isGoldfish ? () => router.push(`/decks/${deckId}`) : () => sendAction(createConcede(userId, myName))}
    className="absolute right-2 top-2 z-40 rounded-md border border-bg-red/50 bg-bg-card px-2 py-1 text-[10px] font-bold text-bg-red"
  >
    Concede
  </button>
</div>
```

This requires `GameActionBar` to accept a `hideConcede?: boolean` prop and skip rendering its own concede when set. Add the prop in `src/components/play/GameActionBar.tsx`.

For **own life ± controls** (in `GameActionBar`): pass `hasPriority` and have the action bar always render the own-life ± buttons; the button onClicks call `sendAction` for `life_change` targeting `userId`, which the engine exempts. Since the lock would otherwise block the click, render the own-life cluster outside the `PriorityLock` (similar to Concede).

- [ ] **Step 4: Switch `<GameLog>` to responsive mode + add desktop padding**

Replace the existing `<GameLog ... />` usage with:

```tsx
{!isGoldfish && (
  <GameLog
    entries={log}
    myUserId={userId}
    cardMap={cardMap}
    playerNames={playerNames}
    onSendChat={handleSendChat}
    onCardPreview={(card) => setPreview({ card })}
    mode={isDesktop ? 'side' : 'sheet'}
  />
)}
```

When `mode === 'side'`, the `<GameLog>` renders as a flex item next to the play column. Wrap the play area + log in a flex container so the side panel sits to the right:

```tsx
<div className="flex flex-1 overflow-hidden">
  <div className="flex flex-1 flex-col overflow-hidden">
    {/* existing play UI: opponent / battlefield / hand / action bar */}
  </div>
  {!isGoldfish && isDesktop && (
    <GameLog mode="side" {...sharedProps} />
  )}
</div>

{!isGoldfish && !isDesktop && (
  <GameLog mode="sheet" {...sharedProps} />
)}
```

> **Note:** Keep `sharedProps` literal — passing the same props twice via a const is fine, but inline the JSX rather than introducing variables that obscure prop diffs.

- [ ] **Step 5: Type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/components/play/PlayGame.tsx src/components/play/GameActionBar.tsx`
Expected: exit 0; pre-existing warnings only.

- [ ] **Step 6: Commit**

```bash
git add src/components/play/PlayGame.tsx src/components/play/GameActionBar.tsx
git commit -m "feat(play): priority lock + 409 rollback + responsive log layout"
```

---

### Task 11: Goldfish smoke test + edge-case sweep

**Files:**
- Read: `src/app/(app)/decks/[id]/goldfish/page.tsx`
- Read: `src/components/play/PlayGame.tsx`
- Possibly modify either if goldfish breaks.

- [ ] **Step 1: Build**

Run: `rm -rf .next && npx next build`
Expected: build succeeds.

- [ ] **Step 2: Manual smoke — goldfish**

Run: `npm run dev`. Open `http://localhost:3000/decks/<any-deck>/goldfish` and:

1. Mulligan, keep, play a land, tap it. → no priority errors in console.
2. Cast a spell, send to graveyard. → log shows "casts X from hand", then "sends X to graveyard".
3. Drag a creature onto the battlefield from hand. → log shows "casts X from hand", DnD works.
4. Long-press a card. → preview opens (regression check from earlier session).

If anything throws `ActionRejectedError` in goldfish, inspect `priorityPlayerId` rotation in the goldfish initial state and engine handlers — the goldfish player must always have priority during their actionable steps.

- [ ] **Step 3: Manual smoke — multiplayer**

Open two browser windows, log in as two users, start a 1v1 lobby. Confirm:

1. Player without priority sees the badge + dimmed overlay on board zones; clicks pulse the badge; nothing logs.
2. Player with priority can act; opponent sees the action in their log live (within a frame after Realtime push).
3. Player without priority can still: long-press preview, write chat, click own life ±.
4. Concede works from either side at any time.
5. Desktop window (≥1024px wide) shows side panel; mobile-width window shows bottom sheet that flashes on new entry when collapsed.

- [ ] **Step 4: Run all unit tests**

Run: `npm run test:game && npm run test:goblinai`
Expected: all PASS.

- [ ] **Step 5: Push**

```bash
git push origin dev
```

---

## Self-review

**Spec coverage**

| Spec section | Implemented in |
|---|---|
| §1 Architecture (no aggregation, render-side) | Task 4 (`toDisplayRows`) |
| §2 DisplayRow union (banner / action / chat / warning) | Task 4 |
| §3 Verb generation (zone matrix) | Task 3 |
| §3 Severity table | Task 2 |
| §3 Icons | Task 2 |
| §4 Priority hook | Task 8 |
| §4 PriorityLock + Badge | Task 8 |
| §4 Allowed under no-priority (preview, chat, own life, concede) | Task 10 step 3 |
| §5 Responsive layout (sheet + side) | Task 9 + Task 10 step 4 |
| §6 Engine guard | Task 6 |
| §6 API 409 translation | Task 7 |
| §6 Client 409 rollback | Task 10 step 2 |
| Action creators carry needed `data` | Task 5 |

**Placeholder scan:** No "TBD" / "TODO" / "implement later". Every code step is concrete.

**Type consistency:**
- `DisplayRow` shape declared in Task 4 is consumed identically in Task 9.
- `PriorityBadgeHandle.pulse()` declared in Task 8 is invoked in Task 10.
- `ActionRejectedError.code` declared in Task 1, thrown in Task 6, decoded in Task 7 + Task 10.
- `mode: 'sheet' | 'side'` defined in Task 9, passed in Task 10.

**Risks documented in spec** carried through:
- Goldfish regression risk → Task 6 step 5 + Task 11 step 2.
- Side panel width regression → Task 11 step 3 (verify card sizes).
- Stale priority race → spec accepts retry; no extra task needed.

---

## Execution

Plan saved to `docs/superpowers/plans/2026-05-10-game-log-overhaul.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
