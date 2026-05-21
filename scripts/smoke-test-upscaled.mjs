#!/usr/bin/env node
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
const r2Base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, '')

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase env vars')
  process.exit(1)
}
if (!r2Base) {
  console.error('Missing R2_PUBLIC_BASE_URL')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)

console.log('=== Smoke Test: Upscaled Image Flow ===\n')

// 1. Find cards with has_upscaled_2x = true (limit 3)
console.log('1. Finding cards with has_upscaled_2x=true...')
const { data: cards, error: cardErr } = await supabase
  .from('cards')
  .select('id, scryfall_id, name, has_upscaled_2x, image_normal')
  .eq('has_upscaled_2x', true)
  .limit(3)

if (cardErr) {
  console.error('Error fetching cards:', cardErr)
  process.exit(1)
}
console.log(`   Found ${cards.length} cards\n`)

if (cards.length === 0) {
  console.log('No cards with upscaled images. Nothing to test.')
  process.exit(0)
}

for (const card of cards) {
  console.log(`--- Card: ${card.name} (${card.scryfall_id}) ---`)

  // 2. Find ready asset in card_image_assets
  const { data: assets, error: assetErr } = await supabase
    .from('card_image_assets')
    .select('id, status, storage_path, face_index, source_url, completed_at')
    .eq('card_id', card.id)
    .eq('target_profile', 'hd-2x')
    .eq('status', 'ready')
    .not('storage_path', 'is', null)

  if (assetErr) {
    console.error(`  Error fetching assets: ${assetErr.message}`)
    continue
  }

  console.log(`  Ready assets: ${assets.length}`)

  for (const asset of assets) {
    const face = asset.face_index === 0 ? 'front' : 'back'
    console.log(`  - face_index=${asset.face_index} (${face})`)
    console.log(`    storage_path: ${asset.storage_path}`)

    // 3. Build and test R2 URL
    const r2Url = `${r2Base}/${asset.storage_path.replace(/^\/+/, '')}`
    console.log(`    R2 URL: ${r2Url}`)

    try {
      const res = await fetch(r2Url, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
      console.log(`    R2 HEAD → HTTP ${res.status} (${res.headers.get('content-type')}, ${res.headers.get('content-length')} bytes)`)
    } catch (err) {
      console.error(`    R2 HEAD → FAILED: ${err.message}`)
    }

    // 4. Simulate what the GET endpoint does
    console.log(`    GET /api/card-image/upscaled?cardId=${card.id}&scryfallId=${card.scryfall_id}&face=${face}&profile=hd-2x`)
    console.log(`    → Would redirect to: ${r2Url}`)
  }
  console.log()
}

// 5. Count overall status
const { data: statusCounts } = await supabase
  .from('card_image_assets')
  .select('status')
  .not('status', 'is', null)

const counts = {}
for (const row of (statusCounts ?? [])) {
  counts[row.status] = (counts[row.status] ?? 0) + 1
}
console.log('=== card_image_assets status counts ===')
for (const [status, count] of Object.entries(counts).sort()) {
  console.log(`  ${status}: ${count}`)
}

// 6. Test the actual Next.js API endpoint (if dev server is running)
console.log('\n=== Testing API endpoint ===')
const firstCard = cards[0]
const testUrl = `http://localhost:3000/api/card-image/upscaled?cardId=${firstCard.id}&scryfallId=${firstCard.scryfall_id}&face=front&profile=hd-2x`
try {
  const res = await fetch(testUrl, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
  console.log(`  GET ${testUrl}`)
  console.log(`  → HTTP ${res.status}`)
  if (res.status === 302) {
    console.log(`  → Location: ${res.headers.get('location')}`)
  } else {
    const body = await res.text()
    console.log(`  → Body: ${body.slice(0, 200)}`)
  }
} catch (err) {
  console.log(`  Dev server not running or endpoint unreachable: ${err.message}`)
}

console.log('\n=== Smoke test complete ===')
