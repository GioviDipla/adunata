import { describe, expect, it } from 'vitest'
import { deriveInteractionKeywords } from '../../src/lib/goblinai/interaction-keywords'

describe('deriveInteractionKeywords', () => {
  it('detects Anikthea style token/copy/zone trigger', () => {
    const keywords = deriveInteractionKeywords({
      oracle_text: 'Whenever Anikthea enters or attacks, exile up to one target non-Aura enchantment card from your graveyard. Create a token that is a copy of that card, except it is a 3/3 black Zombie creature in addition to its other types.',
      keywords: [],
      type_line: 'Legendary Enchantment Creature - Demigod',
      card_faces: null,
    })
    expect(keywords).toEqual([
      'attack_trigger',
      'copy_effect',
      'etb_trigger',
      'targeting',
      'token_creation',
      'triggered_ability',
      'zone_change',
    ])
  })

  it('detects Doubling Season replacement and counters', () => {
    const keywords = deriveInteractionKeywords({
      oracle_text: 'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead. If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.',
      keywords: [],
      type_line: 'Enchantment',
      card_faces: null,
    })
    expect(keywords).toEqual([
      'counter_placement',
      'replacement_effect',
      'token_creation',
    ])
  })

  it('detects lifelink and double strike from keyword array', () => {
    const keywords = deriveInteractionKeywords({
      oracle_text: null,
      keywords: ['Lifelink', 'Double strike'],
      type_line: 'Creature - Human Knight',
      card_faces: null,
    })
    expect(keywords).toEqual(['double_strike', 'keyword_lifelink'])
  })

  it('returns empty array for vanilla creature', () => {
    const keywords = deriveInteractionKeywords({
      oracle_text: null,
      keywords: [],
      type_line: 'Creature - Grizzly Bears',
      card_faces: null,
    })
    expect(keywords).toEqual([])
  })

  it('scans card_faces oracle text for split cards', () => {
    const keywords = deriveInteractionKeywords({
      oracle_text: null,
      keywords: [],
      type_line: 'Instant',
      card_faces: [
        { oracle_text: 'Target creature gains lifelink until end of turn.' },
        { oracle_text: 'Exile target creature you control, then return it to the battlefield.' },
      ],
    })
    expect(keywords).toEqual([
      'etb_trigger',
      'keyword_lifelink',
      'targeting',
      'zone_change',
    ])
  })

  it('detects saga lore counter pattern', () => {
    const keywords = deriveInteractionKeywords({
      oracle_text: 'As this Saga enters and after your draw step, add a lore counter. I — Create a 2/2 Knight token.',
      keywords: [],
      type_line: 'Enchantment — Saga',
      card_faces: null,
    })
    expect(keywords).toEqual([
      'counter_placement',
      'saga_lore_counter',
      'token_creation',
    ])
  })
})
