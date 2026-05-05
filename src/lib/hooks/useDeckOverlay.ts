'use client'

import { useEffect, useState } from 'react'

export interface OverlayRow {
  card_id: number
  needed: number
  owned: number
  missing: number
  missing_eur: number
  missing_usd: number
  name: string
}

export interface OverlayData {
  overlay: OverlayRow[]
  owned: number
  needed: number
  missingEur: number
  missingUsd: number
}

/**
 * Fetches the deck owned/missing overlay for the signed-in user.
 *
 * AbortController cleanup per CLAUDE.md — the enabled flag flipping on/off
 * quickly (or the deckId changing) would otherwise let a late response
 * overwrite a newer one.
 */
export function useDeckOverlay(
  deckId: string,
  enabled: boolean,
): OverlayData | null {
  const [data, setData] = useState<OverlayData | null>(null)

  useEffect(() => {
    if (!enabled) {
      queueMicrotask(() => setData(null))
      return
    }
    const ctrl = new AbortController()
    fetch(`/api/decks/${deckId}/overlay`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: OverlayData | null) => {
        if (!ctrl.signal.aborted && d) setData(d)
      })
      .catch(() => {
        // network abort or parse failure — caller renders "no overlay"
      })
    return () => ctrl.abort()
  }, [deckId, enabled])

  return data
}
