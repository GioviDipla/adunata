import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapScryfallCard, type ScryfallCard } from '@/lib/scryfall'

export const maxDuration = 300 // 5 min — the Vercel Pro ceiling for crons

const SKIP_LAYOUTS = new Set(['token', 'double_faced_token', 'emblem', 'art_series'])
const BATCH = 500

type BulkEntry = {
  type: string
  download_uri: string
  updated_at: string
}

/**
 * Daily unified sync: downloads Scryfall's `oracle_cards` bulk data and
 * upserts the whole catalog in one pass. This covers both "new cards"
 * (inserts) and "fresh prices" (updates) in a single run, replacing the
 * older rolling /cards/collection strategy.
 *
 * The bulk is ~50MB compressed / ~160MB parsed JSON. Memory peaks at
 * roughly 400-500MB during parse + map, comfortably inside Vercel's
 * 3GB Pro function budget, tight on Hobby (1GB).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  const MAX_RUNTIME = 280_000

  // 1. Resolve latest bulk entry
  const bulkRes = await fetch('https://api.scryfall.com/bulk-data')
  if (!bulkRes.ok) {
    return NextResponse.json({ error: 'bulk-data list failed' }, { status: 502 })
  }
  const bulkList = ((await bulkRes.json()).data ?? []) as BulkEntry[]
  const entry = bulkList.find((d) => d.type === 'oracle_cards')
  if (!entry) {
    return NextResponse.json({ error: 'oracle_cards entry not found' }, { status: 500 })
  }

  // 2. Short-circuit if we already processed this bulk version
  const admin = createAdminClient()
  const { data: meta } = await admin
    .from('sync_metadata')
    .select('value')
    .eq('key', 'daily_bulk_sync')
    .maybeSingle()
  if (meta?.value === entry.updated_at) {
    return NextResponse.json({
      skipped: true,
      reason: 'already up to date',
      version: entry.updated_at,
    })
  }

  // 3. Download + parse the bulk
  const dlRes = await fetch(entry.download_uri)
  if (!dlRes.ok) {
    return NextResponse.json({ error: 'download failed' }, { status: 502 })
  }
  const allCards = (await dlRes.json()) as ScryfallCard[]

  // 4. Map to DB rows. Stamp last_price_update so the rolling stale-first
  //    sort on cards.last_price_update stays monotonic.
  const stampNow = new Date().toISOString()
  const toUpsert = allCards
    .filter((c) => !SKIP_LAYOUTS.has(c.layout ?? ''))
    .map((c) => ({
      ...mapScryfallCard(c),
      last_price_update: stampNow,
    }))

  // 5. Batch upsert — 500 rows per call keeps the payload well under
  //    Supabase's 2MB request limit while staying under 100 calls total.
  let upserted = 0
  let errors = 0
  let aborted = false

  for (let i = 0; i < toUpsert.length; i += BATCH) {
    if (Date.now() - startTime >= MAX_RUNTIME) {
      aborted = true
      break
    }
    const batch = toUpsert.slice(i, i + BATCH)
    const { error } = await admin
      .from('cards')
      .upsert(batch, { onConflict: 'scryfall_id' })
    if (error) {
      errors++
      console.error(`daily-sync batch ${i}: ${error.message}`)
    } else {
      upserted += batch.length
    }
  }

  // 6. Mark this bulk version done only if we finished cleanly
  if (!aborted && errors === 0) {
    await admin.from('sync_metadata').upsert(
      { key: 'daily_bulk_sync', value: entry.updated_at },
      { onConflict: 'key' },
    )
  }

  return NextResponse.json({
    upserted,
    total: toUpsert.length,
    errors,
    aborted,
    durationMs: Date.now() - startTime,
    version: entry.updated_at,
  })
}
