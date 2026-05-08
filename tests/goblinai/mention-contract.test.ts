import { describe, expect, it } from 'vitest'
import { extractMentionIds } from '../../src/lib/goblinai/context-builder'

describe('extractMentionIds', () => {
  it('extracts mention IDs from structured mentions', () => {
    const ids = extractMentionIds([
      { id: '1', name: 'Anikthea, Hand of Erebos' },
      { id: '2', name: 'Doubling Season' },
    ])
    expect(ids).toEqual(['1', '2'])
  })

  it('preserves mention order', () => {
    const ids = extractMentionIds([
      { id: '3', name: 'Summon: Bahamut' },
      { id: '1', name: 'Anikthea'},
      { id: '2', name: 'Doubling Season'},
    ])
    expect(ids).toEqual(['3', '1', '2'])
  })

  it('returns empty for no mentions', () => {
    expect(extractMentionIds([])).toEqual([])
  })
})
