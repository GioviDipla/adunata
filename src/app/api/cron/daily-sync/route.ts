import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapScryfallCard, type ScryfallCard } from '@/lib/scryfall'

export const maxDuration = 300
// Memory = 2048 MB configured in vercel.json.

const SKIP_LAYOUTS = new Set(['token', 'double_faced_token', 'emblem', 'art_series'])
const BATCH = 500

type BulkEntry = {
  type: string
  download_uri: string
  updated_at: string
}

/**
 * Daily unified sync: downloads Scryfall's `default_cards` bulk data and
 * upserts the whole catalog in one pass. Uses streaming JSON parsing to
 * avoid Node.js string-length limit (0x1fffffe8 ≈ 512MB) on the bulk payload.
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
  const entry = bulkList.find((d) => d.type === 'default_cards')
  if (!entry) {
    return NextResponse.json({ error: 'default_cards entry not found' }, { status: 500 })
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

  // 3. Stream-download & parse. Avoid Response.json() — the bulk JSON can
  //    exceed Node's max string length (~512MB) since mid-2026.
  const dlRes = await fetch(entry.download_uri)
  if (!dlRes.ok || !dlRes.body) {
    return NextResponse.json({ error: 'download failed' }, { status: 502 })
  }

  const stampNow = new Date().toISOString()
  const reader = dlRes.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let total = 0
  let upsertedTotal = 0
  let errors = 0
  let aborted = false

  // Streaming JSON-array state machine
  let depth = 0
  let inString = false
  let escape = false
  let objectStart = -1

  const batch: ReturnType<typeof mapScryfallCard>[] = []

  async function flushBatch() {
    if (batch.length === 0) return
    const toUpsert = batch.splice(0)
    const { error } = await admin
      .from('cards')
      .upsert(toUpsert, { onConflict: 'scryfall_id' })
    if (error) {
      errors++
      console.error(`daily-sync batch ~${total}: ${error.message}`)
    } else {
      upsertedTotal += toUpsert.length
    }
  }

  while (true) {
    if (Date.now() - startTime >= MAX_RUNTIME) {
      aborted = true
      break
    }

    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    for (let i = 0; i < buffer.length; i++) {
      const ch = buffer[i]

      if (escape) { escape = false; continue }
      if (ch === '\\' && inString) { escape = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue

      if (ch === '{') {
        if (depth === 0) objectStart = i
        depth++
      } else if (ch === '}') {
        depth--
        if (depth === 0 && objectStart !== -1) {
          const jsonStr = buffer.slice(objectStart, i + 1)
          objectStart = -1

          try {
            const card = JSON.parse(jsonStr) as ScryfallCard
            if (!SKIP_LAYOUTS.has(card.layout ?? '')) {
              batch.push({
                ...mapScryfallCard(card),
                last_price_update: stampNow,
              })
              total++
            }
            if (batch.length >= BATCH) await flushBatch()
          } catch {
            errors++
          }
        }
      }
    }

    // Keep the trailing fragment (incomplete object) for the next chunk
    if (objectStart !== -1) {
      buffer = buffer.slice(objectStart)
      objectStart = 0
    } else {
      // Discard everything after the last complete object
      const lastBracket = Math.max(buffer.lastIndexOf(','), buffer.lastIndexOf(']'))
      if (lastBracket !== -1) {
        buffer = buffer.slice(lastBracket + 1)
      }
    }
  }

  // Flush any remaining objects
  await flushBatch()

  // 4. Save checkpoint only on clean run
  if (!aborted && errors === 0) {
    await admin.from('sync_metadata').upsert(
      { key: 'daily_bulk_sync', value: entry.updated_at },
      { onConflict: 'key' },
    )
    await admin.rpc('refresh_mv_cards_sets' as never)
  }

  return NextResponse.json({
    total,
    upserted: upsertedTotal,
    errors,
    aborted,
    durationMs: Date.now() - startTime,
    version: entry.updated_at,
  })
}
