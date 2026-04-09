#!/usr/bin/env node
/**
 * Bulk sync — downloads Scryfall oracle_cards and upserts into Supabase.
 *
 * Usage:
 *   node scripts/bulk-sync.mjs
 *   node scripts/bulk-sync.mjs --force
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '..', '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const args = process.argv.slice(2)
const bulkType = args.find(a => a.startsWith('--type='))?.split('=')[1] || 'oracle_cards'
const force = args.includes('--force')
const TMP_FILE = resolve(__dirname, '..', `.tmp-bulk-${bulkType}.json`)

const SKIP_LAYOUTS = new Set(['token', 'double_faced_token', 'emblem', 'art_series'])

function mapCard(card) {
  const ff = card.card_faces?.[0]
  const img = card.image_uris ?? ff?.image_uris
  const pu = card.prices?.usd ? parseFloat(card.prices.usd) : null
  const pf = card.prices?.usd_foil ? parseFloat(card.prices.usd_foil) : null
  return {
    scryfall_id: card.id, name: card.name,
    mana_cost: card.mana_cost ?? ff?.mana_cost ?? null,
    cmc: card.cmc ?? 0,
    type_line: card.type_line ?? ff?.type_line ?? 'Unknown',
    oracle_text: card.oracle_text ?? ff?.oracle_text ?? null,
    colors: card.colors ?? ff?.colors ?? null,
    color_identity: card.color_identity ?? [],
    rarity: card.rarity ?? 'common',
    set_code: card.set, set_name: card.set_name ?? card.set,
    collector_number: card.collector_number ?? '0',
    image_small: img?.small ?? null, image_normal: img?.normal ?? null,
    image_art_crop: img?.art_crop ?? null,
    prices_usd: isNaN(pu) ? null : pu, prices_usd_foil: isNaN(pf) ? null : pf,
    legalities: card.legalities ?? null,
    power: card.power ?? ff?.power ?? null,
    toughness: card.toughness ?? ff?.toughness ?? null,
    keywords: card.keywords ?? null, produced_mana: card.produced_mana ?? null,
    layout: card.layout ?? null, card_faces: card.card_faces ?? null,
    updated_at: new Date().toISOString(),
  }
}

async function main() {
  console.log(`🔄 Fetching Scryfall bulk data catalog...`)
  const bulkRes = await fetch('https://api.scryfall.com/bulk-data')
  const { data: bulkList } = await bulkRes.json()
  const entry = bulkList.find(d => d.type === bulkType)
  if (!entry) { console.error(`Unknown type: ${bulkType}`); process.exit(1) }

  console.log(`📦 ${bulkType} — ${(entry.size / 1024 / 1024).toFixed(0)} MB — updated ${entry.updated_at}`)

  if (!force) {
    const { data: meta } = await supabase.from('sync_metadata').select('value').eq('key', `bulk_sync_${bulkType}`).single()
    if (meta?.value === entry.updated_at) {
      console.log('✅ Already up to date. Use --force to re-sync.')
      process.exit(0)
    }
  }

  // Step 1: Download
  console.log(`⬇️  Downloading...`)
  const dlRes = await fetch(entry.download_uri)
  if (!dlRes.ok) { console.error('Download failed'); process.exit(1) }
  let dlBytes = 0
  const countStream = new (await import('stream')).Transform({
    transform(chunk, _enc, cb) { dlBytes += chunk.length; process.stdout.write(`\r  ${(dlBytes/1048576).toFixed(0)} MB`); cb(null, chunk) }
  })
  await pipeline(Readable.fromWeb(dlRes.body), countStream, createWriteStream(TMP_FILE))
  console.log(` — done`)

  // Step 2: Parse JSON (whole file — ~163MB fits in memory)
  console.log(`📖 Parsing JSON...`)
  const raw = readFileSync(TMP_FILE, 'utf-8')
  const allCards = JSON.parse(raw)
  console.log(`   ${allCards.length.toLocaleString()} cards in bulk data`)

  // Step 3: Map & filter
  const mapped = []
  let skipped = 0
  for (const card of allCards) {
    if (SKIP_LAYOUTS.has(card.layout)) { skipped++; continue }
    mapped.push(mapCard(card))
  }
  console.log(`   ${mapped.length.toLocaleString()} to upsert (${skipped} tokens/emblems skipped)`)

  // Step 4: Upsert in batches
  const BATCH = 500
  let upserted = 0
  let errors = 0
  const t0 = Date.now()

  for (let i = 0; i < mapped.length; i += BATCH) {
    const batch = mapped.slice(i, i + BATCH)
    const { error } = await supabase.from('cards').upsert(batch, { onConflict: 'scryfall_id', ignoreDuplicates: false })
    if (error) { console.error(`\n  ❌ batch ${i}: ${error.message}`); errors++ }
    else { upserted += batch.length }
    process.stdout.write(`\r  📊 ${upserted.toLocaleString()} / ${mapped.length.toLocaleString()} upserted (${((Date.now()-t0)/1000).toFixed(0)}s)`)
  }

  // Cleanup
  try { unlinkSync(TMP_FILE) } catch {}
  await supabase.from('sync_metadata').upsert({ key: `bulk_sync_${bulkType}`, value: entry.updated_at }, { onConflict: 'key' })

  console.log(`\n\n✅ Done in ${((Date.now()-t0)/1000).toFixed(0)}s — ${upserted.toLocaleString()} upserted, ${errors} errors`)
}

main().catch(err => {
  console.error('Fatal:', err)
  try { if (existsSync(TMP_FILE)) unlinkSync(TMP_FILE) } catch {}
  process.exit(1)
})
