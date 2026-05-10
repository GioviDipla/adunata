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
  const MAX_RUNTIME = 295_000

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

  // 2. Short-circuit if we already processed this bulk version AND no
  //    partial cursor exists from a previous aborted run.
  const admin = createAdminClient()
  const META_KEY = 'daily_bulk_sync_oracle'
  const CURSOR_KEY = 'daily_bulk_sync_oracle_cursor'

  const { data: meta } = await admin
    .from('sync_metadata')
    .select('value')
    .eq('key', META_KEY)
    .maybeSingle()

  const { data: cursorRow } = await admin
    .from('sync_metadata')
    .select('value')
    .eq('key', CURSOR_KEY)
    .maybeSingle()

  if (meta?.value === entry.updated_at && !cursorRow) {
    return NextResponse.json({
      skipped: true,
      reason: 'already up to date',
      version: entry.updated_at,
    })
  }

  // New bulk version → reset cursor
  if (meta?.value !== entry.updated_at && cursorRow) {
    await admin.from('sync_metadata').delete().eq('key', CURSOR_KEY)
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

  // Resume from last checkpoint if previous run aborted
  const startIndex = cursorRow ? parseInt(cursorRow.value, 10) : 0

  let upserted = 0
  let errors = 0
  let aborted = false
  let lastProcessedIndex = startIndex

  for (let i = startIndex; i < toUpsert.length; i += BATCH) {
    if (Date.now() - startTime >= MAX_RUNTIME) {
      aborted = true
      break
    }
    const batch = toUpsert.slice(i, i + BATCH)

    // Retry once on transient failures before counting as an error
    let result = await admin
      .from('cards')
      .upsert(batch, { onConflict: 'scryfall_id' })
    if (result.error) {
      await new Promise((r) => setTimeout(r, 1000))
      result = await admin
        .from('cards')
        .upsert(batch, { onConflict: 'scryfall_id' })
    }

    if (result.error) {
      errors++
      console.error(`daily-sync batch ${i}: ${result.error.message}`)
    } else {
      upserted += batch.length
      lastProcessedIndex = i + BATCH
    }

    // Save cursor every 5 batches so aborted runs can resume
    if ((i - startIndex) / BATCH % 5 === 0) {
      await admin.from('sync_metadata').upsert(
        { key: CURSOR_KEY, value: String(lastProcessedIndex) },
        { onConflict: 'key' },
      )
    }
  }

  // 5. Checkpoint on clean run; clear the cursor
  if (!aborted && errors === 0) {
    await admin.from('sync_metadata').upsert(
      { key: META_KEY, value: entry.updated_at },
      { onConflict: 'key' },
    )
    await admin.from('sync_metadata')
      .delete()
      .eq('key', CURSOR_KEY)
    await admin.rpc('refresh_mv_cards_sets' as never)
  } else if (aborted) {
    // Save final cursor so next run resumes
    await admin.from('sync_metadata').upsert(
      { key: CURSOR_KEY, value: String(lastProcessedIndex) },
      { onConflict: 'key' },
    )
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
