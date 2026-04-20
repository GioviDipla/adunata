#!/usr/bin/env node
/**
 * Backfill `cards.name_it` for every card that has an Italian printing.
 *
 * Earlier iterations walked Scryfall's `default_cards` bulk, but that file
 * only carries ONE printing per card — usually the English one — so you
 * end up with a handful of `lang=it` rows (just the cards that have no
 * English printing at all). To really cover the catalog we page through
 * `/cards/search?q=lang:it+unique:cards`, which returns one record per
 * Italian printing with its English-facing `name` and `oracle_id`.
 *
 * Matching back to our DB:
 *   Scryfall IT hit           →  { oracle_id, printed_name }
 *   Scryfall oracle_cards bulk →  { oracle_id → scryfall_id }  (EN canonical)
 *   Our DB `cards.scryfall_id` matches the EN canonical ids.
 *
 * We fetch the tiny oracle_cards bulk (50MB) once to build the oracle→scry
 * map, then batch-update via the apply_italian_names RPC.
 *
 * Usage:
 *   node --max-old-space-size=4096 scripts/sync-italian-names.mjs
 *   node --max-old-space-size=4096 scripts/sync-italian-names.mjs --force
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
const force = process.argv.includes('--force')

const SEARCH_URL = 'https://api.scryfall.com/cards/search?q=lang%3Ait+unique%3Acards&order=name'
const ORACLE_BULK_TYPE = 'oracle_cards'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchOracleMap() {
  console.log('📦 Fetching oracle_cards bulk (for oracle_id → scryfall_id map)…')
  const bulkRes = await fetch('https://api.scryfall.com/bulk-data')
  const { data: bulkList } = await bulkRes.json()
  const entry = bulkList.find((d) => d.type === ORACLE_BULK_TYPE)
  if (!entry) throw new Error('oracle_cards bulk entry not found')

  const dlRes = await fetch(entry.download_uri)
  if (!dlRes.ok) throw new Error(`oracle_cards download failed: ${dlRes.status}`)

  console.log('   parsing…')
  const oracleCards = await dlRes.json()
  const oracleToScry = new Map()
  for (const c of oracleCards) {
    if (c.oracle_id && c.id) oracleToScry.set(c.oracle_id, c.id)
  }
  console.log(`   ${oracleToScry.size.toLocaleString()} oracle_id → scryfall_id entries`)
  return { map: oracleToScry, version: entry.updated_at }
}

async function fetchItalianNames() {
  console.log('🔎 Paginating Scryfall for Italian printings…')
  const italianByOracle = new Map()
  let url = SEARCH_URL
  let page = 0
  let total = 0

  while (url) {
    page++
    const res = await fetch(url)
    if (res.status === 404) break
    if (!res.ok) {
      throw new Error(`Scryfall search page ${page} returned ${res.status}`)
    }
    const { data, has_more, next_page } = await res.json()
    for (const c of data || []) {
      if (c.oracle_id && c.printed_name && !italianByOracle.has(c.oracle_id)) {
        italianByOracle.set(c.oracle_id, c.printed_name)
        total++
      }
    }
    process.stdout.write(`\r   page ${page} — ${italianByOracle.size.toLocaleString()} IT names so far`)
    if (!has_more) break
    url = next_page
    await sleep(100) // Scryfall asks for ≥50ms between calls; 100ms is safe.
  }
  console.log(`\n   ${italianByOracle.size.toLocaleString()} unique Italian names across ${page} pages`)
  return italianByOracle
}

async function applyUpdates(updates) {
  const BATCH = 500
  let updated = 0
  const t0 = Date.now()

  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH)
    const ids = batch.map((u) => u.scryfall_id)
    const names = batch.map((u) => u.name_it)
    const { error } = await supabase.rpc('apply_italian_names', {
      p_scryfall_ids: ids,
      p_names: names,
    })
    if (error) {
      console.error(`\n  ❌ batch ${i}: ${error.message}`)
      // Per-row fallback in case something odd hit the RPC
      for (const u of batch) {
        const { error: ue } = await supabase
          .from('cards')
          .update({ name_it: u.name_it })
          .eq('scryfall_id', u.scryfall_id)
        if (!ue) updated++
      }
    } else {
      updated += batch.length
    }
    process.stdout.write(`\r  📊 ${updated.toLocaleString()} / ${updates.length.toLocaleString()} (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
  }
  console.log('')
  return updated
}

async function main() {
  if (!force) {
    const { data: meta } = await supabase
      .from('sync_metadata')
      .select('value')
      .eq('key', 'italian_names_sync')
      .maybeSingle()
    if (meta?.value) {
      console.log(`Last sync marker: ${meta.value}. Use --force to re-run regardless.`)
    }
  }

  const [{ map: oracleToScry, version }, italianByOracle] = await Promise.all([
    fetchOracleMap(),
    fetchItalianNames(),
  ])

  const updates = []
  for (const [oracleId, name] of italianByOracle.entries()) {
    const scryId = oracleToScry.get(oracleId)
    if (scryId) updates.push({ scryfall_id: scryId, name_it: name })
  }
  console.log(`✍️  ${updates.length.toLocaleString()} rows to touch in our DB`)

  if (updates.length === 0) {
    console.log('Nothing to do.')
    return
  }

  const updated = await applyUpdates(updates)

  await supabase.from('sync_metadata').upsert(
    { key: 'italian_names_sync', value: version },
    { onConflict: 'key' },
  )

  console.log(`\n✅ Done — ${updated.toLocaleString()} rows updated`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
