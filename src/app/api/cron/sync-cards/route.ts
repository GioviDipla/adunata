import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  fetchBulkDataUrl,
  streamBulkCards,
  mapScryfallCard,
} from '@/lib/scryfall'
import type { Database } from '@/types/supabase'

type CardInsert = Database['public']['Tables']['cards']['Insert']

const BATCH_SIZE = 500

export async function POST(request: NextRequest) {
  // ── Auth check ────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  let syncLogId: number | null = null

  try {
    // ── Create sync log entry ─────────────────────────────────────────
    const { data: syncLog, error: logError } = await supabase
      .from('sync_log')
      .insert({
        status: 'running',
        cards_added: 0,
        cards_updated: 0,
      })
      .select('id')
      .single()

    if (logError) throw logError
    syncLogId = syncLog.id

    // ── Fetch bulk data URL ───────────────────────────────────────────
    const bulkUrl = await fetchBulkDataUrl()

    // ── Process cards in batches ──────────────────────────────────────
    let batch: CardInsert[] = []
    let totalProcessed = 0
    let totalUpserted = 0

    async function flushBatch() {
      if (batch.length === 0) return

      const { data, error } = await supabase
        .from('cards')
        .upsert(batch, { onConflict: 'scryfall_id' })
        .select('id')

      if (error) {
        console.error('Batch upsert error:', error.message)
        // Continue processing even if a batch fails
      } else if (data) {
        totalUpserted += data.length
      }

      // Update progress in sync_log periodically
      await supabase
        .from('sync_log')
        .update({ cards_added: totalUpserted })
        .eq('id', syncLogId!)

      batch = []
    }

    for await (const card of streamBulkCards(bulkUrl)) {
      // Skip non-paper / non-game cards
      if (card.layout === 'art_series' || card.layout === 'token') continue

      batch.push(mapScryfallCard(card))
      totalProcessed++

      if (batch.length >= BATCH_SIZE) {
        await flushBatch()
      }
    }

    // Flush remaining cards
    await flushBatch()

    // ── Mark sync as completed ────────────────────────────────────────
    await supabase
      .from('sync_log')
      .update({
        status: 'completed',
        cards_added: totalUpserted,
        cards_updated: totalUpserted,
        completed_at: new Date().toISOString(),
      })
      .eq('id', syncLogId)

    return NextResponse.json({
      success: true,
      cards_processed: totalProcessed,
      cards_upserted: totalUpserted,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Sync failed:', message)

    // Update sync log with failure
    if (syncLogId) {
      await supabase
        .from('sync_log')
        .update({
          status: 'failed',
          error_message: message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncLogId)
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
