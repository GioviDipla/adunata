#!/usr/bin/env node
/**
 * Backfill prices_eur and prices_eur_foil for existing cards.
 * Uses Scryfall /cards/collection endpoint (75 cards per batch).
 *
 * Usage: node scripts/backfill-eur-prices.mjs
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BATCH_SIZE = 75
const SCRYFALL_DELAY = 120 // ms between requests

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  // Get all cards with scryfall_id that don't have EUR price yet
  console.log('Fetching cards without EUR prices...')

  let offset = 0
  let totalUpdated = 0
  let hasMore = true

  while (hasMore) {
    const { data: cards, error } = await supabase
      .from('cards')
      .select('id, scryfall_id, name')
      .is('prices_eur', null)
      .not('scryfall_id', 'is', null)
      .order('id')
      .range(offset, offset + 999)

    if (error) {
      console.error('DB fetch error:', error.message)
      break
    }

    if (!cards || cards.length === 0) {
      hasMore = false
      break
    }

    console.log(`Processing batch starting at offset ${offset}, ${cards.length} cards...`)

    // Process in Scryfall batches of 75
    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
      const batch = cards.slice(i, i + BATCH_SIZE)
      const identifiers = batch.map((c) => ({ id: c.scryfall_id }))

      try {
        const res = await fetch('https://api.scryfall.com/cards/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifiers }),
        })

        if (!res.ok) {
          console.error(`Scryfall error ${res.status} for batch at ${i}`)
          await sleep(SCRYFALL_DELAY)
          continue
        }

        const data = await res.json()
        const scryfallCards = data.data || []

        // Build scryfall_id -> prices map
        const priceMap = new Map()
        for (const sc of scryfallCards) {
          priceMap.set(sc.id, {
            eur: sc.prices?.eur ? parseFloat(sc.prices.eur) : null,
            eur_foil: sc.prices?.eur_foil ? parseFloat(sc.prices.eur_foil) : null,
          })
        }

        // Update each card
        let batchUpdated = 0
        for (const card of batch) {
          const prices = priceMap.get(card.scryfall_id)
          if (prices && (prices.eur !== null || prices.eur_foil !== null)) {
            const { error: updateErr } = await supabase
              .from('cards')
              .update({
                prices_eur: prices.eur,
                prices_eur_foil: prices.eur_foil,
              })
              .eq('id', card.id)

            if (!updateErr) batchUpdated++
          }
        }

        totalUpdated += batchUpdated
        process.stdout.write(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchUpdated}/${batch.length} updated (total: ${totalUpdated})\r`)
      } catch (err) {
        console.error(`Fetch error for batch at ${i}:`, err.message)
      }

      await sleep(SCRYFALL_DELAY)
    }

    console.log()
    offset += cards.length

    // If we got less than 1000, we're done
    if (cards.length < 1000) {
      hasMore = false
    }
  }

  console.log(`\nDone! Updated ${totalUpdated} cards with EUR prices.`)
}

main().catch(console.error)
