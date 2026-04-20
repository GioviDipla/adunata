import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ScryfallCard } from '@/lib/scryfall'

export const maxDuration = 300 // 5 min max on Vercel

const BATCH_SIZE = 75
const DELAY = 100

/**
 * Nightly cron: refresh prices_eur / prices_eur_foil / released_at from
 * Scryfall (which sources EUR from Cardmarket).
 *
 * Rolling stale-first strategy — orders cards by `last_price_update` ASC
 * NULLS FIRST, refreshes as many as the Vercel 5 min budget allows, and
 * stamps `last_price_update = now()` on every processed row (so the same
 * card is not picked again until everything else has been touched).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  let totalUpdated = 0
  let totalProcessed = 0
  const startTime = Date.now()
  const MAX_RUNTIME = 270_000 // 4.5 min safety margin

  while (Date.now() - startTime < MAX_RUNTIME) {
    const { data: cards, error } = await admin
      .from('cards')
      .select('id, scryfall_id')
      .not('scryfall_id', 'is', null)
      .order('last_price_update', { ascending: true, nullsFirst: true })
      .order('id', { ascending: true })
      .limit(750)

    if (error || !cards || cards.length === 0) break

    totalProcessed += cards.length
    const now = new Date().toISOString()

    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
      if (Date.now() - startTime >= MAX_RUNTIME) break

      const batch = cards.slice(i, i + BATCH_SIZE)
      const infoMap = new Map<string, { eur: number | null; eur_foil: number | null; released_at: string | null }>()

      try {
        const res = await fetch('https://api.scryfall.com/cards/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifiers: batch.map(c => ({ id: c.scryfall_id })) }),
        })

        if (res.ok) {
          const data = await res.json() as { data: ScryfallCard[] }
          for (const sc of data.data || []) {
            infoMap.set(sc.id, {
              eur: sc.prices?.eur ? parseFloat(sc.prices.eur) : null,
              eur_foil: sc.prices?.eur_foil ? parseFloat(sc.prices.eur_foil) : null,
              released_at: sc.released_at ?? null,
            })
          }
        }
      } catch {
        // fall through — we still stamp last_price_update to avoid a tight loop
      }

      for (const card of batch) {
        const info = infoMap.get(card.scryfall_id)
        // Always stamp to rotate the sliding window; merge in fresh data when we have it.
        const update: {
          last_price_update: string
          prices_eur?: number | null
          prices_eur_foil?: number | null
          released_at?: string
        } = { last_price_update: now }
        if (info) {
          update.prices_eur = info.eur
          update.prices_eur_foil = info.eur_foil
          if (info.released_at) update.released_at = info.released_at
        }
        const { error: ue } = await admin.from('cards').update(update).eq('id', card.id)
        if (!ue && info) totalUpdated++
      }

      await new Promise(r => setTimeout(r, DELAY))
    }
  }

  return NextResponse.json({
    updated: totalUpdated,
    processed: totalProcessed,
    durationMs: Date.now() - startTime,
  })
}
