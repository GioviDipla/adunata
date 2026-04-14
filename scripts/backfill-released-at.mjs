#!/usr/bin/env node
/**
 * Backfill released_at for existing cards via Scryfall /cards/collection.
 * Usage: node scripts/backfill-released-at.mjs
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BATCH_SIZE = 75
const DELAY = 120

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  console.log('Backfilling released_at...')
  let offset = 0
  let totalUpdated = 0
  let hasMore = true

  while (hasMore) {
    const { data: cards, error } = await supabase
      .from('cards')
      .select('id, scryfall_id')
      .is('released_at', null)
      .not('scryfall_id', 'is', null)
      .order('id')
      .range(offset, offset + 999)

    if (error) { console.error('DB error:', error.message); break }
    if (!cards || cards.length === 0) { hasMore = false; break }

    console.log(`Offset ${offset}, ${cards.length} cards...`)

    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
      const batch = cards.slice(i, i + BATCH_SIZE)
      try {
        const res = await fetch('https://api.scryfall.com/cards/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifiers: batch.map(c => ({ id: c.scryfall_id })) }),
        })
        if (!res.ok) { await sleep(DELAY); continue }
        const data = await res.json()
        const dateMap = new Map()
        for (const sc of data.data || []) {
          if (sc.released_at) dateMap.set(sc.id, sc.released_at)
        }
        let batchUpdated = 0
        for (const card of batch) {
          const relDate = dateMap.get(card.scryfall_id)
          if (relDate) {
            const { error: ue } = await supabase.from('cards').update({ released_at: relDate }).eq('id', card.id)
            if (!ue) batchUpdated++
          }
        }
        totalUpdated += batchUpdated
        process.stdout.write(`  Batch ${Math.floor(i/BATCH_SIZE)+1}: ${batchUpdated}/${batch.length} (total: ${totalUpdated})\r`)
      } catch (err) { console.error('Error:', err.message) }
      await sleep(DELAY)
    }
    console.log()
    offset += cards.length
    if (cards.length < 1000) hasMore = false
  }
  console.log(`\nDone! Updated ${totalUpdated} cards with released_at.`)
}

main().catch(console.error)
