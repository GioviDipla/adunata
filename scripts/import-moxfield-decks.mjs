#!/usr/bin/env node
/**
 * import-moxfield-decks.mjs — Import public Moxfield decks into Adunata.
 *
 * End-to-end, reproducible by anyone with repo access:
 *   1. Launches Chromium (real browser passes Moxfield's Cloudflare gate).
 *      Auto-installs the browser on first run if missing.
 *   2. Scrapes public deck IDs from https://moxfield.com/decks/public.
 *   3. Fetches each deck via api.moxfield.com/v2/decks/all/<id> (page context,
 *      Cloudflare-cleared) and extracts a compact card list.
 *   4. Resolves every card by scryfall_id against the `cards` table; missing
 *      ones are fetched from Scryfall /cards/<id> and upserted (reusing the
 *      mapScryfallCard field mapping from src/lib/scryfall.ts).
 *   5. Inserts each deck (chosen visibility, description credits the original
 *      Moxfield author + deck URL) + its deck_cards under the target user.
 *      Idempotent: decks already imported (same Moxfield URL in description)
 *      are skipped, so re-running is safe.
 *
 * PREREQUISITES
 *   - .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *     (service role bypasses RLS — keep it secret).
 *   - `npm install` done (playwright + @supabase/supabase-js + dotenv).
 *   - Chromium is auto-installed on first run via `npx playwright install`.
 *
 * USAGE
 *   node scripts/import-moxfield-decks.mjs --user=<uuid> [options]
 *
 * OPTIONS
 *   --user=<uuid>       Target profile id (required, unless --find-user/--help).
 *   --count=<n>         How many decks to import (default 12).
 *   --format=<f>        Only import decks whose Moxfield format matches
 *                       (e.g. commander, duelCommander). Default: any.
 *   --visibility=<v>    public | unlisted | private (default public).
 *   --find-user=<q>     Search profiles by username/display_name, print matches
 *                       with their ids, then exit. Use to discover --user.
 *   --help              Show this help.
 *
 * EXAMPLES
 *   node scripts/import-moxfield-decks.mjs --find-user=giovanni
 *   node scripts/import-moxfield-decks.mjs --user=f0e76951-... --count=20
 *   node scripts/import-moxfield-decks.mjs --user=f0e76951-... --format=commander --visibility=unlisted
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

config({ path: '.env.local' })

// ── args ───────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {}
  for (const a of argv.slice(2)) {
    const m = /^--([a-zA-Z-]+)(?:=(.*))?$/.exec(a)
    if (m) out[m[1]] = m[2] ?? true
  }
  return out
}
const args = parseArgs(process.argv)

if (args.help || Object.keys(args).length === 0) {
  console.log(
    [
      'Usage: node scripts/import-moxfield-decks.mjs --user=<uuid> [options]',
      '',
      'Options:',
      '  --user=<uuid>       Target profile id (required).',
      '  --count=<n>         Decks to import (default 12).',
      '  --format=<f>        Filter by Moxfield format (e.g. commander).',
      '  --visibility=<v>    public | unlisted | private (default public).',
      '  --find-user=<q>     Search profiles, print ids, exit.',
      '  --dry-run           Fetch + resolve but do not create decks (test).',
      '  --help              Show full docs.',
      '',
      'Prerequisites: .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.',
    ].join('\n'),
  )
  process.exit(0)
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// ── find-user mode ─────────────────────────────────────────────────────────
if (args['find-user'] !== undefined) {
  const q = String(args['find-user']).trim()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .limit(20)
  if (error) {
    console.error('profile search error:', error.message)
    process.exit(1)
  }
  if (!data?.length) {
    console.log(`No profiles matching "${q}".`)
    process.exit(0)
  }
  console.log('Matching profiles:')
  for (const p of data) {
    console.log(`  ${p.id}  ${p.username}  (${p.display_name})`)
  }
  process.exit(0)
}

// ── config ─────────────────────────────────────────────────────────────────
const TARGET_USER_ID = String(args.user ?? '')
const COUNT = parseInt(String(args.count ?? '12'), 10) || 12
const FORMAT_FILTER = args.format ? String(args.format).toLowerCase() : null
const VISIBILITY = ['public', 'unlisted', 'private'].includes(String(args.visibility))
  ? String(args.visibility)
  : 'public'
const DRY_RUN = !!args['dry-run']
const IDS_FILE = args['ids-file'] ? String(args['ids-file']) : null

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(TARGET_USER_ID)) {
  console.error(`Invalid or missing --user uuid. Use --find-user=<query> to discover a profile id.`)
  process.exit(1)
}

const BOARD_MAP = {
  commanders: 'commander',
  mainboard: 'main',
  sideboard: 'sideboard',
  maybeboard: 'maybeboard',
}
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// ── card mapping (replicated from src/lib/scryfall.ts) ─────────────────────
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

// ── browser launch (auto-install chromium if missing) ──────────────────────
async function launchBrowser() {
  const launchOpts = { headless: true, args: ['--disable-blink-features=AutomationControlled'] }
  try {
    return await chromium.launch(launchOpts)
  } catch (e) {
    if (/executable|doesn't exist|install/i.test(e.message)) {
      console.log('Chromium not installed — running `npx playwright install chromium`…')
      execSync('npx playwright install chromium', { stdio: 'inherit' })
      return await chromium.launch(launchOpts)
    }
    throw e
  }
}

async function scrapeDeckIds(page, count) {
  await page.goto('https://moxfield.com/decks/public', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('a[href*="/decks/"]', { state: 'attached', timeout: 30000 })
  await page.waitForTimeout(1500)
  return page.evaluate(() => {
    const re = /^https?:\/\/(www\.)?moxfield\.com\/decks\/([A-Za-z0-9_-]+)$/
    const seen = new Set()
    for (const a of document.querySelectorAll('a[href*="/decks/"]')) {
      const m = re.exec(a.href)
      if (m && !['public', 'following', 'liked'].includes(m[2])) seen.add(m[2])
    }
    return [...seen]
  })
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
      publicUrl: j.publicUrl || `https://moxfield.com/decks/${deckId}`,
      cards,
    }
  }, id)
}

// ── dedup: skip decks already imported by this user ────────────────────────
async function alreadyImported(userId, publicUrls) {
  if (!publicUrls.length) return new Set()
  // Description contains the Moxfield deck URL for previously imported decks.
  const { data, error } = await supabase
    .from('decks')
    .select('description')
    .eq('user_id', userId)
    .like('description', '%moxfield.com/decks/%')
  if (error) {
    console.error('dedup lookup error:', error.message)
    return new Set()
  }
  const have = new Set()
  for (const d of data ?? []) {
    for (const url of publicUrls) {
      if (d.description?.includes(url)) have.add(url)
    }
  }
  return have
}

async function resolveCards(scryfallIds) {
  const map = new Map()
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const valid = scryfallIds.filter((s) => UUID.test(s))
  const skipped = scryfallIds.length - valid.length
  if (skipped) console.log(`  skipping ${skipped} non-uuid scryfall_ids`)
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
    await new Promise((res) => setTimeout(res, 120))
  }
  return map
}

async function createDeck(deck, cardMap, visibility) {
  if (DRY_RUN) {
    console.log(`  [dry-run] would create: ${deck.name} [${deck.format}] by ${deck.author} — ${deck.cards.length} cards`)
    return 'dry-run'
  }
  const credit = `Imported from Moxfield — original: ${deck.author} (${deck.publicUrl})`
  const description = deck.description ? `${deck.description}\n\n${credit}` : credit
  const { data: deckRow, error } = await supabase
    .from('decks')
    .insert({
      user_id: TARGET_USER_ID,
      name: deck.name,
      format: deck.format,
      visibility,
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
    rows.push({ deck_id: deckId, card_id: cardId, quantity: c.q, board: c.b, is_foil: c.f })
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

// ── main ───────────────────────────────────────────────────────────────────
console.log(`Config: user=${TARGET_USER_ID} count=${COUNT} format=${FORMAT_FILTER || 'any'} visibility=${VISIBILITY}${DRY_RUN ? ' DRY-RUN' : ''}`)

let ids
if (IDS_FILE) {
  ids = JSON.parse(readFileSync(IDS_FILE, 'utf-8'))
  if (!Array.isArray(ids)) { console.error(`--ids-file must be a JSON array of deck IDs`); process.exit(1) }
  console.log(`Loaded ${ids.length} deck IDs from ${IDS_FILE}`)
}

const browser = await launchBrowser()
const ctx = await browser.newContext({ userAgent: UA })
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false })
})
const page = await ctx.newPage()

if (!IDS_FILE) {
  console.log(`Scraping deck IDs from Moxfield /decks/public…`)
  ids = await scrapeDeckIds(page, COUNT)
  console.log(`  found ${ids.length} deck IDs`)
}
ids = ids.slice(0, COUNT)

// Fetch decks (filter by format, collect until COUNT matching or ids exhausted).
const decks = []
const skippedFormat = []
for (const id of ids) {
  if (decks.length >= COUNT) break
  const d = await fetchDeck(page, id)
  if (d.error) {
    console.error(`  skip ${id}: HTTP ${d.error}`)
    continue
  }
  if (FORMAT_FILTER && (d.format || '').toLowerCase() !== FORMAT_FILTER) {
    skippedFormat.push(d.format)
    continue
  }
  decks.push({ id, ...d })
  console.log(`  fetched: ${d.name} [${d.format}] by ${d.author} (${d.cards.length} cards)`)
  await page.waitForTimeout(450)
}
await browser.close()
if (skippedFormat.length) console.log(`  skipped ${skippedFormat.length} decks not matching format=${FORMAT_FILTER}`)
if (!decks.length) {
  console.log('No decks to import. Aborting.')
  process.exit(0)
}

// Dedup against already-imported decks for this user.
const urls = decks.map((d) => d.publicUrl)
const already = await alreadyImported(TARGET_USER_ID, urls)
const fresh = decks.filter((d) => !already.has(d.publicUrl))
console.log(`\nDedup: ${fresh.length}/${decks.length} new (skipping ${already.size} already imported)`)

const allSids = [...new Set(fresh.flatMap((d) => d.cards.map((c) => c.s)))]
console.log(`Resolving ${allSids.length} unique cards…`)
const cardMap = await resolveCards(allSids)

console.log(`\nCreating ${fresh.length} decks (visibility=${VISIBILITY})…`)
let created = 0
for (const deck of fresh) {
  if (await createDeck(deck, cardMap, VISIBILITY)) created++
}
console.log(`\n✅ Done: ${created}/${fresh.length} decks created.`)
