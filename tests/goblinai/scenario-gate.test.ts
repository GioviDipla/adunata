import { describe, expect, it } from 'vitest'
import { requiresConfirmation } from '../../src/lib/goblinai/context-builder'

describe('requiresConfirmation', () => {
  it('requires confirmation for 2+ mentions', () => {
    expect(requiresConfirmation({
      mentionsLen: 2,
      interactionKeywords: [],
      message: 'cosa succede?',
    })).toBe(true)
  })

  it('requires confirmation when triggered ability present', () => {
    expect(requiresConfirmation({
      mentionsLen: 1,
      interactionKeywords: ['triggered_ability'],
      message: 'cosa succede?',
    })).toBe(true)
  })

  it('requires confirmation when replacement effect present', () => {
    expect(requiresConfirmation({
      mentionsLen: 1,
      interactionKeywords: ['replacement_effect'],
      message: 'cosa succede?',
    })).toBe(true)
  })

  it('does not require confirmation for keyword-only question with no mentions', () => {
    expect(requiresConfirmation({
      mentionsLen: 0,
      interactionKeywords: [],
      message: 'Cosa significa lifelink?',
    })).toBe(false)
  })

  it('detects zone terms in Italian text', () => {
    expect(requiresConfirmation({
      mentionsLen: 1,
      interactionKeywords: [],
      message: 'Se esilio una carta dal cimitero...',
    })).toBe(true)
  })

  it('detects ETB phrasing in Italian', () => {
    expect(requiresConfirmation({
      mentionsLen: 1,
      interactionKeywords: [],
      message: 'Quando entra nel campo di battaglia...',
    })).toBe(true)
  })
})
