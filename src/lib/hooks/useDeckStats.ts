'use client'

import { useMemo } from 'react'
import {
  computeDeckStats,
  type DeckCardEntry,
  type DeckStatsOptions,
  type DeckStatsResult,
} from './deckStatsCompute'

export type { DeckCardEntry, DeckStatsOptions, DeckStatsResult }

export function useDeckStats(
  cards: DeckCardEntry[],
  opts: DeckStatsOptions = {},
): DeckStatsResult {
  const format = opts.format
  const commanderIdentity = opts.commanderIdentity
  const identityKey = commanderIdentity ? commanderIdentity.join(',') : ''
  return useMemo(
    () => computeDeckStats(cards, { format, commanderIdentity }),
    // identityKey participates so identity changes trigger recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards, format, identityKey],
  )
}
