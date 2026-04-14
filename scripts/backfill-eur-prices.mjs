#!/usr/bin/env node
/**
 * Backfill prices_eur, prices_eur_foil, and released_at for existing cards.
 * Uses Scryfall /cards/collection endpoint (75 cards per batch).
 *
 * Uses cursor-based pagination (id > last_id) to avoid skipping rows
 * when the filter condition changes during iteration.
 *
 * Usage: node scripts/backfill-eur-prices.mjs
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BATCH_SIZE = 75
const DELAY = 100

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  console.log('Backfilling prices_eur + released_at for ALL cards missing either...')
  let lastId = '00000000-0000-0000-0000-000000000000'
  let totalUpdated = 0
  let totalProcessed = 0

  while (true) {
    // Cursor-based: get next 750 cards where EUR or released_at is missing
    const { data: cards, error } = await supabase
      .from('cards')
      .select('id, scryfall_id')
      .or('prices_eur.is.null,released_at.is.null')
      .not('scryfall_id', 'is', null)
      .gt('id', lastId)
      .order('id', { ascending: true })
      .limit(750)

    if (error) { console.error('DB error:', error.message); break }
    if (!cards || cards.length === 0) break

    lastId = cards[cards.length - 1].id
    totalProcessed += cards.length
    console.log(`Processing ${cards.length} cards (total processed: ${totalProcessed})...`)

    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
      const batch = cards.slice(i, i + BATCH_SIZE)
      try {
        const res = await fetch('https://api.scryfall.com/cards/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifiers: batch.map(c => ({ id: c.scryfall_id })) }),
        })
        if (!res.ok) { console.error(`Scryfall ${res.status}`); await sleep(DELAY); continue }

        const data = await res.json()
        const infoMap = new Map()
        for (const sc of data.data || []) {
          infoMap.set(sc.id, {
            eur: sc.prices?.eur ? parseFloat(sc.prices.eur) : null,
            eur_foil: sc.prices?.eur_foil ? parseFloat(sc.prices.eur_foil) : null,
            released_at: sc.released_at || null,
          })
        }

        let batchUpdated = 0
        for (const card of batch) {
          const info = infoMap.get(card.scryfall_id)
          if (!info) continue
          const update = {}
          if (info.eur !== null) update.prices_eur = info.eur
          if (info.eur_foil !== null) update.prices_eur_foil = info.eur_foil
          if (info.released_at !== null) update.released_at = info.released_at
          if (Object.keys(update).length > 0) {
            const { error: ue } = await supabase.from('cards').update(update).eq('id', card.id)
            if (!ue) batchUpdated++
          }
        }
        totalUpdated += batchUpdated
        process.stdout.write(`  ${totalUpdated} updated\r`)
      } catch (err) { console.error('Error:', err.message) }
      await sleep(DELAY)
    }
    console.log()
  }
  console.log(`\nDone! Updated ${totalUpdated} cards total.`)
}

main().catch(console.error)
