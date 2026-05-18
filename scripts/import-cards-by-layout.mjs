#!/usr/bin/env node
/**
 * Generic Scryfall layout importer.
 *
 * Targets a single Scryfall `layout:` value, paginates unique prints, and
 * upserts each row into the cards table via the service-role client. Used
 * to backfill layouts the bulk sync historically skipped (token,
 * double_faced_token for dungeons) without re-downloading the full
 * default_cards bulk dump (~163 MB).
 *
 * Usage:
 *   node scripts/import-cards-by-layout.mjs --layout=token
 *   node scripts/import-cards-by-layout.mjs --layout=double_faced_token
 *   node scripts/import-cards-by-layout.mjs --layout=emblem
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

const TRIGGER_PATTERNS = {
  upkeep: /at the beginning of [^.]*upkeep/i,
  etb: /(when|whenever) [^.]*enters/i,
  attacks: /whenever [^.]*attacks/i,
  dies: /(when|whenever) [^.]*dies/i,
  end_step: /at the beginning of [^.]*end step/i,
  cast: /(when|whenever) [^.]*casts?\s/i,
}

function mapCard(card) {
  const ff = card.card_faces?.[0]
  const img = card.image_uris ?? ff?.image_uris
  const pu = card.prices?.usd ? parseFloat(card.prices.usd) : null
  const puf = card.prices?.usd_foil ? parseFloat(card.prices.usd_foil) : null
  const pe = card.prices?.eur ? parseFloat(card.prices.eur) : null
  const pef = card.prices?.eur_foil ? parseFloat(card.prices.eur_foil) : null
  const oracle = card.oracle_text ?? ff?.oracle_text ?? null
  const oracleFull = card.card_faces?.length
    ? card.card_faces.map(f => f.oracle_text ?? '').join('\n')
    : oracle ?? ''
  return {
    scryfall_id: card.id,
    name: card.name,
    flavor_name: card.flavor_name ?? null,
    mana_cost: card.mana_cost ?? ff?.mana_cost ?? null,
    cmc: card.cmc ?? 0,
    type_line: card.type_line ?? ff?.type_line ?? 'Unknown',
    oracle_text: oracle,
    colors: card.colors ?? ff?.colors ?? null,
    color_identity: card.color_identity ?? [],
    rarity: card.rarity ?? 'common',
    set_code: card.set,
    set_name: card.set_name ?? card.set,
    collector_number: card.collector_number ?? '0',
    image_small: img?.small ?? null,
    image_normal: img?.normal ?? null,
    image_art_crop: img?.art_crop ?? null,
    prices_usd: isNaN(pu) ? null : pu,
    prices_usd_foil: isNaN(puf) ? null : puf,
    prices_eur: isNaN(pe) ? null : pe,
    prices_eur_foil: isNaN(pef) ? null : pef,
    released_at: card.released_at ?? null,
    legalities: card.legalities ?? null,
    power: card.power ?? ff?.power ?? null,
    toughness: card.toughness ?? ff?.toughness ?? null,
    keywords: card.keywords ?? null,
    produced_mana: card.produced_mana ?? null,
    layout: card.layout ?? null,
    card_faces: card.card_faces ?? null,
    has_upkeep_trigger: TRIGGER_PATTERNS.upkeep.test(oracleFull),
    has_etb_trigger: TRIGGER_PATTERNS.etb.test(oracleFull),
    has_attacks_trigger: TRIGGER_PATTERNS.attacks.test(oracleFull),
    has_dies_trigger: TRIGGER_PATTERNS.dies.test(oracleFull),
    has_end_step_trigger: TRIGGER_PATTERNS.end_step.test(oracleFull),
    has_cast_trigger: TRIGGER_PATTERNS.cast.test(oracleFull),
    updated_at: new Date().toISOString(),
  }
}

async function fetchAllPages(url) {
  const all = []
  let next = url
  while (next) {
    const res = await fetch(next)
    if (!res.ok) throw new Error(`Scryfall ${res.status}: ${next}`)
    const body = await res.json()
    if (Array.isArray(body.data)) all.push(...body.data)
    next = body.has_more && body.next_page ? body.next_page : null
    await new Promise(r => setTimeout(r, 100))
  }
  return all
}

async function main() {
  const args = process.argv.slice(2)
  const layout = args.find(a => a.startsWith('--layout='))?.split('=')[1]
  if (!layout) {
    console.error('Missing --layout=<value>. Examples: token, double_faced_token, emblem')
    process.exit(1)
  }
  console.log(`Fetching layout:${layout} from Scryfall...`)
  const url = `https://api.scryfall.com/cards/search?q=layout%3A${encodeURIComponent(layout)}&unique=prints&order=released`
  const cards = await fetchAllPages(url)
  console.log(`  ${cards.length} cards found`)

  // Skip placeholders without imagery (Scryfall sometimes lists them).
  const importable = cards.filter(c => {
    if (!c.id) return false
    if (!c.image_uris && !c.card_faces?.[0]?.image_uris) return false
    return true
  })
  console.log(`  ${importable.length} importable (skipped ${cards.length - importable.length} without imagery)`)

  const mapped = importable.map(mapCard)
  const BATCH = 200
  let upserted = 0
  for (let i = 0; i < mapped.length; i += BATCH) {
    const slice = mapped.slice(i, i + BATCH)
    const { error } = await supabase.from('cards').upsert(slice, { onConflict: 'scryfall_id' })
    if (error) {
      console.error('Upsert error:', error)
      process.exit(1)
    }
    upserted += slice.length
    console.log(`  upserted ${upserted}/${mapped.length}`)
  }

  console.log(`Done. ${upserted} cards with layout:${layout} upserted.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
