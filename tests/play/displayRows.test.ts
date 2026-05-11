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
