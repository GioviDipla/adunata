import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapScryfallCard, type ScryfallCard } from '@/lib/scryfall'

export const maxDuration = 300

/**
 * Sync cards from Scryfall bulk data (oracle_cards).
 * Streams the JSON file and upserts cards in batches.
 *
 * Protected by CRON_SECRET — must be called with:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Usage:
 *   curl -X POST https://your-app.vercel.app/api/sync-cards \
 *     -H "Authorization: Bearer YOUR_SECRET"
 *
 * Query params:
 *   ?type=oracle_cards (default) | default_cards | unique_artwork
 *   ?force=true  — skip the "already up to date" check
 */

function checkAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    // No secret configured = endpoint disabled
    return false
  }
  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${cronSecret}`
}

async function syncCards(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const bulkType = request.nextUrl.searchParams.get('type') || 'oracle_cards'
  const force = request.nextUrl.searchParams.get('force') === 'true'

  try {
    // 1. Get the bulk data download URL
    const bulkRes = await fetch('https://api.scryfall.com/bulk-data')
    if (!bulkRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch bulk data catalog' }, { status: 502 })
    }
    const bulkData = await bulkRes.json()
    const entry = bulkData.data.find((d: { type: string }) => d.type === bulkType)
    if (!entry) {
      return NextResponse.json({ error: `Unknown bulk type: ${bulkType}` }, { status: 400 })
    }

    const supabase = createAdminClient()

    // 2. Check if we already synced this version
    if (!force) {
      const { data: meta } = await supabase
        .from('sync_metadata')
        .select('value')
        .eq('key', `bulk_sync_${bulkType}`)
        .single()

      if (meta?.value === entry.updated_at) {
        return NextResponse.json({
          success: true,
          skipped: true,
          message: 'Already up to date',
          bulkUpdatedAt: entry.updated_at,
        })
      }
    }

    // 3. Stream-download and parse the JSON array
    const downloadRes = await fetch(entry.download_uri)
    if (!downloadRes.ok || !downloadRes.body) {
      return NextResponse.json({ error: 'Failed to download bulk data' }, { status: 502 })
    }

    const reader = downloadRes.body.getReader()
    const decoder = new TextDecoder()

    let buffer = ''
    let depth = 0
    let inString = false
    let escape = false
    let objectStart = -1
    const BATCH_SIZE = 500
    const batch: ReturnType<typeof mapScryfallCard>[] = []
    let totalProcessed = 0
    let totalUpserted = 0
    let errors = 0

    async function flushBatch() {
      if (batch.length === 0) return
      const toUpsert = batch.splice(0)
      const { error } = await supabase
        .from('cards')
        .upsert(toUpsert, { onConflict: 'scryfall_id', ignoreDuplicates: false })

      if (error) {
        console.error(`Upsert error at batch ending at ${totalProcessed}:`, error.message)
        errors++
      } else {
        totalUpserted += toUpsert.length
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      for (let i = 0; i < buffer.length; i++) {
        const ch = buffer[i]

        if (escape) {
          escape = false
          continue
        }
        if (ch === '\\' && inString) {
          escape = true
          continue
        }
        if (ch === '"') {
          inString = !inString
          continue
        }
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
              if (
                card.layout === 'token' ||
                card.layout === 'double_faced_token' ||
                card.layout === 'emblem' ||
                card.layout === 'art_series'
              ) {
                continue
              }
              batch.push(mapScryfallCard(card))
              totalProcessed++

              if (batch.length >= BATCH_SIZE) {
                await flushBatch()
              }
            } catch {
              errors++
            }
          }
        }
      }

      if (objectStart !== -1) {
        buffer = buffer.slice(objectStart)
        objectStart = 0
      } else {
        const lastBracket = Math.max(buffer.lastIndexOf(','), buffer.lastIndexOf(']'))
        if (lastBracket !== -1) {
          buffer = buffer.slice(lastBracket + 1)
        }
      }
    }

    await flushBatch()

    // 4. Save sync timestamp so next call can skip if unchanged
    await supabase
      .from('sync_metadata')
      .upsert(
        { key: `bulk_sync_${bulkType}`, value: entry.updated_at },
        { onConflict: 'key' }
      )

    return NextResponse.json({
      success: true,
      type: bulkType,
      totalProcessed,
      totalUpserted,
      errors,
      bulkUpdatedAt: entry.updated_at,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Sync failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return syncCards(request)
}

export async function POST(request: NextRequest) {
  return syncCards(request)
}
