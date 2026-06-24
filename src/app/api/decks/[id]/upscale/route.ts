import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCardImageSources } from '@/lib/card-images/source-url'
import { buildCardImageStoragePath } from '@/lib/card-images/storage-path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function isOnDemandQueueEnabled(): boolean {
  const value = process.env.CARD_IMAGE_UPSCALE_QUEUE_ON_DEMAND
  return !['0', 'false', 'off', 'no', 'disabled'].includes((value ?? 'true').toLowerCase())
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: deckId } = await params

  if (!isOnDemandQueueEnabled()) {
    return NextResponse.json({ error: 'on-demand queue disabled' }, { status: 503 })
  }

  const supabase = createAdminClient()

  // Fetch all cards in the deck with image source data
  const { data: deckCards, error: deckError } = await (supabase as any)
    .from('deck_cards')
    .select('card_id, card:cards!card_id(id, scryfall_id, image_normal, card_faces, name)')
    .eq('deck_id', deckId)
    .not('card', 'is', null)

  if (deckError) {
    return NextResponse.json({ error: 'failed to load deck cards' }, { status: 500 })
  }

  if (!deckCards || deckCards.length === 0) {
    return NextResponse.json({ error: 'deck not found or empty' }, { status: 404 })
  }

  // Deduplicate by card_id — a card may appear in multiple boards (main + sideboard)
  const seen = new Set<string>()
  const uniqueCards: Array<{
    id: string
    scryfall_id: string | null
    image_normal: string | null
    card_faces: unknown
    name: string | null
  }> = []

  for (const row of deckCards) {
    const card = row.card
    if (!card || seen.has(card.id)) continue
    seen.add(card.id)
    uniqueCards.push(card)
  }

  // Build the upsert payload: one row per (card, face) pair
  const model = process.env.REALESRGAN_MODEL ?? 'realesr-animevideov3'
  const toUpsert: Array<Record<string, unknown>> = []
  const skipped: string[] = []

  for (const card of uniqueCards) {
    const sources = resolveCardImageSources(card as any)
    if (sources.length === 0) {
      skipped.push(card.name ?? card.id)
      continue
    }
    for (const source of sources) {
      toUpsert.push({
        card_id: source.cardId,
        scryfall_id: source.scryfallId,
        face_index: source.faceIndex,
        source_url: source.sourceUrl,
        storage_path: buildCardImageStoragePath({
          scryfallId: source.scryfallId,
          faceName: source.faceName,
          profile: 'hd-2x',
        }),
        target_profile: 'hd-2x',
        model,
        scale: 2,
        target_dpi: 600,
        status: 'queued',
        attempts: 0,
        last_error: null,
        locked_at: null,
        locked_by: null,
        completed_at: null,
      })
    }
  }

  if (toUpsert.length === 0) {
    return NextResponse.json({
      ok: false,
      total: 0,
      queued: 0,
      alreadyCached: 0,
      skipped: skipped.length,
      skippedCards: skipped,
    })
  }

  // Upsert: if a row for the same (card_id, face_index, target_profile) already
  // exists and is 'ready', leave it alone. Otherwise reset to 'queued'.
  const { data: existing, error: fetchError } = await (supabase as any)
    .from('card_image_assets')
    .select('id, card_id, face_index, status')
    .in('card_id', uniqueCards.map((c) => c.id))
    .eq('target_profile', 'hd-2x')

  // Build maps for quick lookup
  const existingByKey = new Map<string, { id: string; status: string }>()
  if (!fetchError && existing) {
    for (const row of existing) {
      existingByKey.set(`${row.card_id}:${row.face_index}`, { id: row.id, status: row.status })
    }
  }

  let queued = 0
  let alreadyCached = 0

  for (const asset of toUpsert) {
    const key = `${asset.card_id}:${asset.face_index}`
    const existingRow = existingByKey.get(key)

    if (existingRow?.status === 'ready') {
      alreadyCached++
      continue
    }

    if (existingRow) {
      // Reset to queued
      const { error: updateError } = await (supabase as any)
        .from('card_image_assets')
        .update({ status: 'queued', attempts: 0, last_error: null, locked_at: null, locked_by: null, completed_at: null })
        .eq('id', existingRow.id)
      if (!updateError) queued++
    } else {
      // Insert new row
      const { error: insertError } = await (supabase as any)
        .from('card_image_assets')
        .insert(asset)
      if (!insertError) queued++
    }
  }

  return NextResponse.json({
    ok: true,
    total: uniqueCards.length,
    totalFaces: toUpsert.length,
    queued,
    alreadyCached,
    skipped: skipped.length,
    skippedCards: skipped.length > 0 ? skipped : undefined,
  })
}
