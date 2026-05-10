import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapScryfallCard, type ScryfallCard } from '@/lib/scryfall'

export const maxDuration = 300

const SKIP_LAYOUTS = new Set(['token', 'double_faced_token', 'emblem', 'art_series'])
const BATCH = 500

type BulkEntry = {
  type: string
  download_uri: string
  updated_at: string
}

/**
 * Daily unified sync: downloads Scryfall's `oracle_cards` bulk (~50MB
 * compressed, ~150MB uncompressed, ~35k unique cards) and upserts the
 * catalog. Uses direct JSON.parse — oracle_cards stays well under Node's
 * string-length limit (~512MB), unlike default_cards.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  const MAX_RUNTIME = 280_000

  // 1. Resolve latest oracle_cards bulk entry
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
  const META_KEY = 'daily_bulk_sync_oracle'
  const { data: meta } = await admin
    .from('sync_metadata')
    .select('value')
    .eq('key', META_KEY)
    .maybeSingle()
  if (meta?.value === entry.updated_at) {
    return NextResponse.json({
      skipped: true,
      reason: 'already up to date',
      version: entry.updated_at,
    })
  }

  // 3. Download bulk into memory. oracle_cards is ~150MB uncompressed —
  //    safely under Node's ~512MB string ceiling.
  const dlRes = await fetch(entry.download_uri)
  if (!dlRes.ok) {
    return NextResponse.json({ error: 'download failed' }, { status: 502 })
  }

  const text = await dlRes.text()
  const allCards = JSON.parse(text) as ScryfallCard[]

  if (Date.now() - startTime >= MAX_RUNTIME) {
    return NextResponse.json({
      total: 0,
      upserted: 0,
      errors: 0,
      aborted: true,
      durationMs: Date.now() - startTime,
      version: entry.updated_at,
    })
  }

  // 4. Map & batch-upsert
  const stampNow = new Date().toISOString()
  const toUpsert = allCards
    .filter((c) => !SKIP_LAYOUTS.has(c.layout ?? ''))
    .map((c) => ({
      ...mapScryfallCard(c),
      last_price_update: stampNow,
    }))

  let upserted = 0
  let errors = 0
  let aborted = false

  // Upsert in 2 concurrent lanes to stay within 300s timeout.
  // Each lane processes every other batch — lane A takes even indices,
  // lane B takes odd. This halves wall-clock upsert time while keeping
  // individual request size under Supabase's 2MB limit.
  async function upsertLane(startIdx: number) {
    for (let i = startIdx; i < toUpsert.length; i += BATCH * 2) {
      if (Date.now() - startTime >= MAX_RUNTIME || aborted) {
        aborted = true
        return
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
  }

  await Promise.all([upsertLane(0), upsertLane(BATCH)])

  // 5. Checkpoint only on clean run
  if (!aborted && errors === 0) {
    await admin.from('sync_metadata').upsert(
      { key: META_KEY, value: entry.updated_at },
      { onConflict: 'key' },
    )
    await admin.rpc('refresh_mv_cards_sets' as never)
  }

  return NextResponse.json({
    total: toUpsert.length,
    upserted,
    errors,
    aborted,
    durationMs: Date.now() - startTime,
    version: entry.updated_at,
  })
}
