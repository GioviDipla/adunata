'use client'

import { useMemo } from 'react'
import {
  computeDeckStats,
  type DeckCardEntry,
  type DeckStatsResult,
} from './deckStatsCompute'

export type { DeckCardEntry, DeckStatsResult }

export function useDeckStats(cards: DeckCardEntry[]): DeckStatsResult {
  return useMemo(() => computeDeckStats(cards), [cards])
}
