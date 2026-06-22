#!/usr/bin/env node
/**
 * Import a batch of public Moxfield decks under a given user profile.
 *
 * Flow:
 *   1. Launch Chromium (real browser → passes Moxfield's Cloudflare gate).
 *   2. Scrape public deck IDs from https://moxfield.com/decks.
 *   3. For each deck, fetch api.moxfield.com/v2/decks/all/<id> from the page
 *      context (Cloudflare-cleared) and extract a compact card list.
 *   4. Resolve every card by scryfall_id against the `cards` table; for any
 *      missing, fetch Scryfall /cards/<id> and upsert (reusing mapScryfallCard
 *      field mapping).
 *   5. Insert each deck (public, description credits the original Moxfield
 *      author) + its deck_cards under the target user_id.
 *
 * Uses service_role (admin) — bypasses RLS. Standalone script per project
 * convention (no web route for bulk ops).
 *
 * Usage: node scripts/import-moxfield-decks.mjs [COUNT]   (default 12)
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

// ilnanni — Giovanni's main app profile (has existing decks).
const TARGET_USER_ID = 'f0e76951-3a55-435a-a690-c3e107218199'
const COUNT = parseInt(process.argv[2] ?? '12', 10) || 12

const BOARD_MAP = {
  commanders: 'commander',
  mainboard: 'main',
  sideboard: 'sideboard',
  maybeboard: 'maybeboard',
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// --- mapScryfallCard: replicated from src/lib/scryfall.ts (TS not importable
// in .mjs). Maps a Scryfall card JSON to the app's `cards` row shape. ---
function mapScryfallCard(card) {
  const frontFace = card.card_faces?.[0]
  const imageUris = card.image_uris ?? frontFace?.image_uris
  const num = (v) => {
    const n = v ? parseFloat(v) : null
    return Number.isNaN(n) ? null : n
  }
  return {
    scryfall_id: card.id,
    name: card.name,
    mana_cost: card.mana_cost ?? frontFace?.mana_cost ?? null,
    cmc: card.cmc ?? 0,
    type_line: card.type_line ?? frontFace?.type_line ?? 'Unknown',
    oracle_text: card.oracle_text ?? frontFace?.oracle_text ?? null,
    colors: card.colors ?? frontFace?.colors ?? null,
    color_identity: card.color_identity ?? [],
    rarity: card.rarity ?? 'common',
    set_code: card.set,
    set_name: card.set_name ?? card.set,
    collector_number: card.collector_number ?? '0',
    image_small: imageUris?.small ?? null,
    image_normal: imageUris?.normal ?? null,
    image_art_crop: imageUris?.art_crop ?? null,
    prices_usd: num(card.prices?.usd),
    prices_usd_foil: num(card.prices?.usd_foil),
    prices_eur: num(card.prices?.eur),
    prices_eur_foil: num(card.prices?.eur_foil),
    cardmarket_uri: card.purchase_uris?.cardmarket ?? null,
    released_at: card.released_at ?? null,
    legalities: card.legalities ?? null,
    power: card.power ?? frontFace?.power ?? null,
    toughness: card.toughness ?? frontFace?.toughness ?? null,
    keywords: card.keywords ?? null,
    produced_mana: card.produced_mana ?? null,
    layout: card.layout ?? null,
    card_faces: card.card_faces ?? null,
    updated_at: new Date().toISOString(),
  }
}

async function scrapeDeckIds(page, count) {
  await page.goto('https://moxfield.com/decks/public', { waitUntil: 'domcontentloaded', timeout: 60000 })
  // Deck cards are in a virtualized grid (present in DOM but not "visible"
  // per Playwright). Wait for attached presence, then a small settle.
  await page.waitForSelector('a[href*="/decks/"]', { state: 'attached', timeout: 30000 })
  await page.waitForTimeout(1500)
  const ids = await page.evaluate(() => {
    const re = /^https?:\/\/(www\.)?moxfield\.com\/decks\/([A-Za-z0-9_-]+)$/
    const seen = new Set()
    for (const a of document.querySelectorAll('a[href*="/decks/"]')) {
      const m = re.exec(a.href)
      if (m && !['public', 'following', 'liked'].includes(m[2])) seen.add(m[2])
    }
    return [...seen]
  })
  return ids.slice(0, count)
}

async function fetchDeck(page, id) {
  return page.evaluate(async (deckId) => {
    const r = await fetch(`https://api.moxfield.com/v2/decks/all/${deckId}`, {
      headers: { Accept: 'application/json' },
    })
    if (!r.ok) return { error: r.status }
    const j = await r.json()
    const cards = []
    for (const [b, board] of Object.entries({
      commanders: 'commander',
      mainboard: 'main',
      sideboard: 'sideboard',
      maybeboard: 'maybeboard',
    })) {
      const obj = j[b]
      if (!obj) continue
      for (const [, e] of Object.entries(obj)) {
        if (e.card && e.card.scryfall_id) {
          cards.push({ s: e.card.scryfall_id, q: e.quantity, b: board, f: !!e.isFoil })
        }
      }
    }
    return {
      name: j.name,
      format: j.format,
      author: j.authors?.[0]?.userName ?? 'unknown',
      description: j.description ?? '',
      cards,
    }
  }, id)
}

async function resolveCards(scryfallIds) {
  const map = new Map()
  // Keep only valid uuids — a single malformed id in a Postgres = ANY(uuid[])
  // cast nukes the whole chunk query, marking every card in it as missing.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const valid = scryfallIds.filter((s) => UUID.test(s))
  const skipped = scryfallIds.length - valid.length
  if (skipped) console.log(`  skipping ${skipped} non-uuid scryfall_ids`)
  // Query existing in small chunks — PostgREST builds a GET URL with the
  // full `in.(...)` list, and large chunks exceed URL limits → "fetch failed".
  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100)
    const { data, error } = await supabase
      .from('cards')
      .select('id, scryfall_id')
      .in('scryfall_id', chunk)
    if (error) {
      console.error(`  cards lookup error (chunk ${i}): ${error.message}`)
      continue
    }
    for (const c of data ?? []) map.set(c.scryfall_id, c.id)
  }
  const missing = valid.filter((s) => !map.has(s))
  console.log(`  cards: ${map.size}/${valid.length} in DB, ${missing.length} to fetch from Scryfall`)
  for (const sfid of missing) {
    try {
      const r = await fetch(`https://api.scryfall.com/cards/${sfid}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'AdunataDeckImporter/1.0' },
      })
      if (r.ok) {
        const row = mapScryfallCard(await r.json())
        const { data, error } = await supabase
          .from('cards')
          .upsert(row, { onConflict: 'scryfall_id' })
          .select('id, scryfall_id')
        if (error) console.error(`  upsert ${sfid}: ${error.message}`)
        else if (data?.[0]) map.set(sfid, data[0].id)
      } else {
        console.error(`  scryfall ${sfid}: ${r.status}`)
      }
    } catch (e) {
      console.error(`  scryfall ${sfid}: ${e.message}`)
    }
    // Scryfall rate limit (~100ms between requests).
    await new Promise((res) => setTimeout(res, 120))
  }
  return map
}

async function createDeck(deck, cardMap) {
  const credit = `Imported from Moxfield — original author: ${deck.author}`
  const description = deck.description ? `${deck.description}\n\n${credit}` : credit
  const { data: deckRow, error } = await supabase
    .from('decks')
    .insert({
      user_id: TARGET_USER_ID,
      name: deck.name,
      format: deck.format,
      visibility: 'public',
      description,
    })
    .select('id')
    .single()
  if (error) {
    console.error(`  deck "${deck.name}": ${error.message}`)
    return null
  }
  const deckId = deckRow.id
  const rows = []
  let unresolved = 0
  for (const c of deck.cards) {
    const cardId = cardMap.get(c.s)
    if (!cardId) { unresolved++; continue }
    rows.push({
      deck_id: deckId,
      card_id: cardId,
      quantity: c.q,
      board: c.b,
      is_foil: c.f,
    })
  }
  if (rows.length) {
    const { error: e2 } = await supabase.from('deck_cards').insert(rows)
    if (e2) console.error(`  deck_cards "${deck.name}": ${e2.message}`)
  }
  console.log(
    `  ✓ ${deck.name} [${deck.format}] by ${deck.author} — ${rows.length} cards` +
      (unresolved ? ` (${unresolved} unresolved)` : ''),
  )
  return deckId
}

async function main() {
  console.log(`Launching Chromium…`)
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  })
  const ctx = await browser.newContext({ userAgent: UA })
  // navigator.webdriver = false → looks like a normal browser to Cloudflare.
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })
  const page = await ctx.newPage()

  console.log(`Scraping ${COUNT} public deck IDs from Moxfield…`)
  const ids = await scrapeDeckIds(page, COUNT)
  console.log(`  found ${ids.length} deck IDs: ${ids.join(', ')}`)

  const decks = []
  for (const id of ids) {
    const d = await fetchDeck(page, id)
    if (d.error) {
      console.error(`  skip ${id}: HTTP ${d.error}`)
      continue
    }
    decks.push({ id, ...d })
    console.log(`  fetched: ${d.name} [${d.format}] by ${d.author} (${d.cards.length} cards)`)
    await page.waitForTimeout(450) // polite rate limit
  }
  await browser.close()

  if (!decks.length) {
    console.log('No decks fetched. Aborting.')
    return
  }

  const allSids = [...new Set(decks.flatMap((d) => d.cards.map((c) => c.s)))]
  console.log(`\nResolving ${allSids.length} unique cards…`)
  const cardMap = await resolveCards(allSids)

  console.log(`\nCreating ${decks.length} decks under user ${TARGET_USER_ID}…`)
  let created = 0
  for (const deck of decks) {
    if (await createDeck(deck, cardMap)) created++
  }
  console.log(`\n✅ Done: ${created}/${decks.length} decks created.`)
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
