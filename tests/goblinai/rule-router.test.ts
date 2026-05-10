import { describe, expect, it } from 'vitest'
import { getRuleFamiliesForKeywords } from '../../src/lib/goblinai/rule-router'

describe('getRuleFamiliesForKeywords', () => {
  it('routes token replacement Saga scenario', () => {
    expect(getRuleFamiliesForKeywords([
      'token_creation',
      'replacement_effect',
      'copy_effect',
      'counter_placement',
      'saga_lore_counter',
    ])).toEqual(['111', '122', '614', '616', '707', '714'])
  })

  it('deduplicates multiple keywords pointing to same family', () => {
    expect(getRuleFamiliesForKeywords([
      'etb_trigger',
      'dies_trigger',
      'attack_trigger',
    ])).toEqual(['603', '700'])
  })

  it('handles empty keywords', () => {
    expect(getRuleFamiliesForKeywords([])).toEqual([])
  })

  it('handles unknown keyword gracefully', () => {
    expect(getRuleFamiliesForKeywords(['etb_trigger']))
      .toEqual(['603'])
  })
})
