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
      [me]:  {
        life: 20, library: [], libraryCount: 0, hand: [], handCount: 0,
        battlefield: [{
          instanceId: 'c1', cardId: 1, tapped: false,
          attacking: false, blocking: null, damageMarked: 0,
          highlighted: null, counters: [], powerMod: 0, toughnessMod: 0,
        }],
        graveyard: [], exile: [], commandZone: [], commanderCastCount: 0, autoPass: false,
      },
      [opp]: {
        life: 20, library: [], libraryCount: 0, hand: [], handCount: 0,
        battlefield: [], graveyard: [], exile: [], commandZone: [], commanderCastCount: 0, autoPass: false,
      },
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
