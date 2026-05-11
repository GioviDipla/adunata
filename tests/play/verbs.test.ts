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
