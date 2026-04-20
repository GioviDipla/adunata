#!/usr/bin/env node
/**
 * Backfill `cards.name_it` from Scryfall's `default_cards` bulk data.
 *
 * `oracle_cards` (the bulk we normally sync from) only contains one
 * canonical English printing per card, so it has no Italian name info.
 * `default_cards` instead contains every printing in every language —
 * about 500MB of JSON. We only care about the Italian printings:
 * we build a `{ oracle_id -> printed_name }` map from them, then
 * update each row in our `cards` table whose `oracle_id` matches.
 *
 * Usage:
 *   node --max-old-space-size=4096 scripts/sync-italian-names.mjs
 *   node --max-old-space-size=4096 scripts/sync-italian-names.mjs --force
 *
 * The script is idempotent: running it twice is safe.
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createWriteStream, readFileSync, unlinkSync, existsSync } from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

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
const TMP_FILE = resolve(__dirname, '..', '.tmp-default-cards.json')

async function main() {
  console.log('🔄 Fetching Scryfall bulk catalog…')
  const bulkRes = await fetch('https://api.scryfall.com/bulk-data')
  const { data: bulkList } = await bulkRes.json()
  const entry = bulkList.find((d) => d.type === 'default_cards')
  if (!entry) {
    console.error('default_cards bulk entry not found')
    process.exit(1)
  }

  console.log(`📦 default_cards — ${(entry.size / 1024 / 1024).toFixed(0)} MB — updated ${entry.updated_at}`)

  if (!force) {
    const { data: meta } = await supabase
      .from('sync_metadata')
      .select('value')
      .eq('key', 'italian_names_sync')
      .maybeSingle()
    if (meta?.value === entry.updated_at) {
      console.log('✅ Italian names already up to date. Use --force to re-run.')
      process.exit(0)
    }
  }

  console.log('⬇️  Downloading default_cards.json…')
  const dlRes = await fetch(entry.download_uri)
  if (!dlRes.ok) {
    console.error('Download failed')
    process.exit(1)
  }
  let dlBytes = 0
  const countStream = new (await import('stream')).Transform({
    transform(chunk, _enc, cb) {
      dlBytes += chunk.length
      process.stdout.write(`\r  ${(dlBytes / 1048576).toFixed(0)} MB`)
      cb(null, chunk)
    },
  })
  await pipeline(Readable.fromWeb(dlRes.body), countStream, createWriteStream(TMP_FILE))
  console.log(' — done')

  console.log('📖 Parsing JSON…')
  const raw = readFileSync(TMP_FILE, 'utf-8')
  const allPrintings = JSON.parse(raw)
  console.log(`   ${allPrintings.length.toLocaleString()} total printings`)

  // Build { oracle_id -> italian printed name }. First IT printing wins.
  const byOracle = new Map()
  let italianPrintings = 0
  for (const p of allPrintings) {
    if (p.lang !== 'it') continue
    italianPrintings++
    if (!p.oracle_id || !p.printed_name) continue
    if (!byOracle.has(p.oracle_id)) byOracle.set(p.oracle_id, p.printed_name)
  }
  console.log(`   ${italianPrintings.toLocaleString()} Italian printings, ${byOracle.size.toLocaleString()} unique oracle ids`)

  // We need to map oracle_id → scryfall_id in our DB. Our DB was synced
  // from oracle_cards which embeds the oracle_id as `oracle_id` on each
  // canonical EN card. Rather than add a column, walk default_cards a
  // second pass looking only at `lang === 'en'` printings — first EN
  // printing per oracle_id gives us a scryfall_id that's present in our
  // DB (since oracle_cards picks one EN printing per oracle).
  const enCanonical = new Map() // oracle_id -> scryfall_id
  for (const p of allPrintings) {
    if (p.lang !== 'en') continue
    if (!p.oracle_id || !p.id) continue
    if (!enCanonical.has(p.oracle_id)) enCanonical.set(p.oracle_id, p.id)
  }

  // Build the final list of { scryfall_id, name_it }
  const updates = []
  for (const [oracleId, itName] of byOracle.entries()) {
    const scryId = enCanonical.get(oracleId)
    if (scryId) updates.push({ scryfall_id: scryId, name_it: itName })
  }
  console.log(`   ${updates.length.toLocaleString()} rows to touch in our DB`)

  // Apply updates in batches. We can't upsert because rows are keyed
  // by a different primary key — use individual update statements
  // keyed by scryfall_id, batched via unnest() in a single SQL call.
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
      // Fallback: if the RPC isn't installed, do individual updates.
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

  try { unlinkSync(TMP_FILE) } catch { /* noop */ }

  await supabase.from('sync_metadata').upsert(
    { key: 'italian_names_sync', value: entry.updated_at },
    { onConflict: 'key' },
  )

  console.log(`\n\n✅ Done in ${((Date.now() - t0) / 1000).toFixed(0)}s — ${updated.toLocaleString()} rows updated`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  try { if (existsSync(TMP_FILE)) unlinkSync(TMP_FILE) } catch { /* noop */ }
  process.exit(1)
})
