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

    // Pass-priority skip rule: hide pass_priority entirely. The badge / phase
    // banners convey turn/phase advancement; per-pass rows add no signal.
    if (e.action === 'pass_priority') {
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
