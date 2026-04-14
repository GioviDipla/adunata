import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ScryfallCard } from '@/lib/scryfall'

export const maxDuration = 300 // 5 min max on Vercel

const BATCH_SIZE = 75
const DELAY = 100

/**
 * Cron job: update prices_eur, prices_eur_foil, and released_at
 * for cards missing these fields.
 *
 * Protected by Vercel cron secret (Authorization header).
 * Scheduled weekly via vercel.json crons.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  let lastId = '00000000-0000-0000-0000-000000000000'
  let totalUpdated = 0
  let totalProcessed = 0
  const startTime = Date.now()
  const MAX_RUNTIME = 270_000 // 4.5 min safety margin

  while (Date.now() - startTime < MAX_RUNTIME) {
    const { data: cards, error } = await admin
      .from('cards')
      .select('id, scryfall_id')
      .or('prices_eur.is.null,released_at.is.null')
      .not('scryfall_id', 'is', null)
      .gt('id', lastId)
      .order('id', { ascending: true })
      .limit(750)

    if (error || !cards || cards.length === 0) break

    lastId = String(cards[cards.length - 1].id)
    totalProcessed += cards.length

    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
      if (Date.now() - startTime >= MAX_RUNTIME) break

      const batch = cards.slice(i, i + BATCH_SIZE)
      try {
        const res = await fetch('https://api.scryfall.com/cards/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifiers: batch.map(c => ({ id: c.scryfall_id })) }),
        })

        if (!res.ok) {
          await new Promise(r => setTimeout(r, DELAY))
          continue
        }

        const data = await res.json() as { data: ScryfallCard[] }
        const infoMap = new Map<string, { eur: number | null; eur_foil: number | null; released_at: string | null }>()
        for (const sc of data.data || []) {
          infoMap.set(sc.id, {
            eur: sc.prices?.eur ? parseFloat(sc.prices.eur) : null,
            eur_foil: sc.prices?.usd_foil ? parseFloat(sc.prices.usd_foil) : null,
            released_at: sc.released_at ?? null,
          })
        }

        for (const card of batch) {
          const info = infoMap.get(card.scryfall_id)
          if (!info) continue
          const update: { prices_eur?: number; prices_eur_foil?: number; released_at?: string } = {}
          if (info.eur !== null) update.prices_eur = info.eur
          if (info.eur_foil !== null) update.prices_eur_foil = info.eur_foil
          if (info.released_at !== null) update.released_at = info.released_at
          if (Object.keys(update).length > 0) {
            const { error: ue } = await admin.from('cards').update(update).eq('id', card.id)
            if (!ue) totalUpdated++
          }
        }
      } catch {
        // continue on error
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
