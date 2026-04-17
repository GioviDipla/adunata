#!/usr/bin/env node
/**
 * Backfill prices_eur (and prices_eur_foil, released_at) for cards that
 * have prices_usd but no prices_eur. Pulls from Scryfall /cards/collection
 * (75 ids per request, 100ms delay between batches).
 *
 * Usage:
 *   node scripts/backfill-eur.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '..', '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const PAGE = 1500 // rows fetched per cursor page
const BATCH = 75 // Scryfall max per /cards/collection request
const DELAY = 120 // ms between Scryfall requests

async function main() {
  let cursor = '00000000-0000-0000-0000-000000000000'
  let totalSeen = 0
  let totalUpdated = 0
  let totalNoEur = 0
  const startedAt = Date.now()

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: rows, error } = await supabase
      .from('cards')
      .select('id, scryfall_id')
      .is('prices_eur', null)
      .not('prices_usd', 'is', null)
      .not('scryfall_id', 'is', null)
      .gt('id', cursor)
      .order('id', { ascending: true })
      .limit(PAGE)

    if (error) {
      console.error('supabase select error:', error)
      break
    }
    if (!rows || rows.length === 0) break

    cursor = rows[rows.length - 1].id
    totalSeen += rows.length

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const res = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: batch.map(r => ({ id: r.scryfall_id })) }),
      })

      if (!res.ok) {
        console.warn('scryfall batch failed:', res.status)
        await sleep(DELAY)
        continue
      }

      const json = await res.json()
      const info = new Map()
      for (const sc of json.data || []) {
        info.set(sc.id, {
          eur: sc.prices?.eur ? parseFloat(sc.prices.eur) : null,
          eur_foil: sc.prices?.eur_foil ? parseFloat(sc.prices.eur_foil) : null,
          released_at: sc.released_at ?? null,
        })
      }

      for (const row of batch) {
        const v = info.get(row.scryfall_id)
        if (!v) continue
        if (v.eur === null) { totalNoEur++; continue }

        const update = { prices_eur: v.eur }
        if (v.eur_foil !== null) update.prices_eur_foil = v.eur_foil
        if (v.released_at !== null) update.released_at = v.released_at

        const { error: ue } = await supabase.from('cards').update(update).eq('id', row.id)
        if (!ue) totalUpdated++
      }

      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
      process.stdout.write(`\rseen ${totalSeen} · updated ${totalUpdated} · no-eur-on-scryfall ${totalNoEur} · ${elapsed}s`)
      await sleep(DELAY)
    }
  }

  console.log(`\nDone. seen=${totalSeen} updated=${totalUpdated} no-eur-on-scryfall=${totalNoEur}`)
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

main().catch(err => {
  console.error(err)
  process.exit(1)
})
