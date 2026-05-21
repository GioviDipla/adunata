import { NextRequest, NextResponse } from 'next/server'
import { buildCardImageStoragePath } from '@/lib/card-images/storage-path'
import { resolveCardImageSources, type CardImageSourceCard } from '@/lib/card-images/source-url'
import { buildR2PublicUrl } from '@/lib/r2/public-url'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CACHE_HEADER = 'public, s-maxage=31536000, max-age=86400, immutable'

type AssetRow = {
  id: string
  status?: string
  storage_path: string | null
}

type EnsureResult = {
  cardId: string | null
  scryfallId: string | null
  faceIndex: number
  status: 'cached' | 'queued' | 'disabled' | 'failed'
  storagePath?: string
  assetId?: string
  error?: string
}

type CardRow = CardImageSourceCard & {
  id: string
  name?: string | null
}

type SupabaseAdmin = ReturnType<typeof createAdminClient>

const MAX_BATCH_ITEMS = 250

function faceIndexFromParam(value: string | null): number {
  return value === 'back' || value === '1' ? 1 : 0
}

function faceIndexFromValue(value: unknown): number {
  return value === 'back' || value === 1 || value === '1' ? 1 : 0
}

function isOnDemandQueueEnabled(): boolean {
  const value = process.env.CARD_IMAGE_UPSCALE_QUEUE_ON_DEMAND
  return !['0', 'false', 'off', 'no', 'disabled'].includes((value ?? 'true').toLowerCase())
}

async function findReadyAsset(
  supabase: SupabaseAdmin,
  params: { cardId: string | null; scryfallId: string | null; faceIndex: number; profile: string },
): Promise<AssetRow | null> {
  let query = (supabase as any)
    .from('card_image_assets')
    .select('id,storage_path')
    .eq('target_profile', params.profile)
    .eq('face_index', params.faceIndex)
    .eq('status', 'ready')
    .not('storage_path', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)

  query = params.cardId ? query.eq('card_id', params.cardId) : query.eq('scryfall_id', params.scryfallId)

  const { data, error } = await query
  if (error) return null
  return (data as AssetRow[] | null)?.[0] ?? null
}

async function findExistingAsset(
  supabase: SupabaseAdmin,
  params: { cardId: string | null; scryfallId: string | null; faceIndex: number; profile: string },
): Promise<AssetRow | null> {
  let query = (supabase as any)
    .from('card_image_assets')
    .select('id,status,storage_path')
    .eq('target_profile', params.profile)
    .eq('face_index', params.faceIndex)
    .order('updated_at', { ascending: false })
    .limit(1)

  query = params.cardId ? query.eq('card_id', params.cardId) : query.eq('scryfall_id', params.scryfallId)

  const { data, error } = await query
  if (error) return null
  return (data as AssetRow[] | null)?.[0] ?? null
}

async function findCard(supabase: SupabaseAdmin, cardId: string | null, scryfallId: string | null): Promise<CardRow | null> {
  let cardQuery = (supabase as any)
    .from('cards')
    .select('id,scryfall_id,name,image_normal,card_faces')
    .limit(1)

  cardQuery = cardId ? cardQuery.eq('id', cardId) : cardQuery.eq('scryfall_id', scryfallId)
  const { data: cards, error: cardError } = await cardQuery
  const card = (cards as CardRow[] | null)?.[0]
  if (cardError || !card) return null
  return card
}

async function ensureUpscaledAsset(
  supabase: SupabaseAdmin,
  params: { cardId: string | null; scryfallId: string | null; faceIndex: number },
): Promise<EnsureResult> {
  const resultBase = {
    cardId: params.cardId,
    scryfallId: params.scryfallId,
    faceIndex: params.faceIndex,
  }
  const ready = await findReadyAsset(supabase, { ...params, profile: 'hd-2x' })
  if (ready?.storage_path) {
    return { ...resultBase, status: 'cached', storagePath: ready.storage_path }
  }

  if (!isOnDemandQueueEnabled()) {
    return { ...resultBase, status: 'disabled', error: 'on-demand queue disabled' }
  }

  const existing = await findExistingAsset(supabase, { ...params, profile: 'hd-2x' })
  if (existing?.status === 'queued' || existing?.status === 'processing') {
    return {
      ...resultBase,
      status: 'queued',
      assetId: existing.id,
      storagePath: existing.storage_path ?? undefined,
    }
  }

  const card = await findCard(supabase, params.cardId, params.scryfallId)
  if (!card) {
    return { ...resultBase, status: 'failed', error: 'card not found' }
  }

  const source = resolveCardImageSources(card).find((candidate) => candidate.faceIndex === params.faceIndex)
  if (!source) {
    return { ...resultBase, status: 'failed', error: 'source not found' }
  }

  const storagePath = buildCardImageStoragePath({
    scryfallId: source.scryfallId,
    faceName: source.faceName,
    profile: 'hd-2x',
  })

  try {
    const row = {
      card_id: source.cardId,
      scryfall_id: source.scryfallId,
      face_index: source.faceIndex,
      source_url: source.sourceUrl,
      storage_path: storagePath,
      target_profile: 'hd-2x',
      model: process.env.REALESRGAN_MODEL ?? 'realesr-animevideov3',
      scale: 2,
      target_dpi: 600,
      status: 'queued',
      attempts: 0,
      last_error: null,
      locked_at: null,
      locked_by: null,
      completed_at: null,
    }
    const query = existing
      ? (supabase as any)
        .from('card_image_assets')
        .update(row)
        .eq('id', existing.id)
        .select('id,storage_path')
        .single()
      : (supabase as any)
        .from('card_image_assets')
        .insert(row)
        .select('id,storage_path')
        .single()

    const { data: queuedData, error: queueError } = await query

    if (queueError) throw queueError
    const queued = queuedData as { id: string; storage_path: string | null }

    return {
      cardId: source.cardId,
      scryfallId: source.scryfallId,
      faceIndex: source.faceIndex,
      status: 'queued',
      assetId: queued.id,
      storagePath: queued.storage_path ?? storagePath,
    }
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505') {
      return {
        cardId: source.cardId,
        scryfallId: source.scryfallId,
        faceIndex: source.faceIndex,
        status: 'queued',
        storagePath,
      }
    }
    return {
      cardId: source.cardId,
      scryfallId: source.scryfallId,
      faceIndex: source.faceIndex,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function GET(req: NextRequest) {
  const cardId = req.nextUrl.searchParams.get('cardId')
  const scryfallId = req.nextUrl.searchParams.get('scryfallId')
  const profile = req.nextUrl.searchParams.get('profile') ?? 'hd-2x'
  const faceIndex = faceIndexFromParam(req.nextUrl.searchParams.get('face'))

  if (profile !== 'hd-2x') {
    return NextResponse.json({ error: 'profile not supported' }, { status: 400 })
  }
  if (!cardId && !scryfallId) {
    return NextResponse.json({ error: 'missing card id' }, { status: 400 })
  }

  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !secretKey) {
    return NextResponse.json({ error: 'upscaled image cache unavailable' }, { status: 404 })
  }

  const supabase = createAdminClient()
  const asset = await findReadyAsset(supabase, { cardId, scryfallId, faceIndex, profile })
  if (asset?.storage_path) {
    return NextResponse.redirect(buildR2PublicUrl(asset.storage_path), {
      status: 302,
      headers: { 'Cache-Control': CACHE_HEADER },
    })
  }

  return NextResponse.json({ error: 'upscaled image not found' }, { status: 404 })
}

export async function POST(req: NextRequest) {
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !secretKey) {
    return NextResponse.json({ error: 'upscaled image cache unavailable' }, { status: 503 })
  }

  const body = await req.json().catch(() => null)
  const rawItems = body && typeof body === 'object' && Array.isArray((body as { items?: unknown }).items)
    ? (body as { items: unknown[] }).items
    : []

  if (rawItems.length === 0) {
    return NextResponse.json({ error: 'missing items' }, { status: 400 })
  }
  if (rawItems.length > MAX_BATCH_ITEMS) {
    return NextResponse.json({ error: `too many items; max ${MAX_BATCH_ITEMS}` }, { status: 413 })
  }

  const deduped = new Map<string, { cardId: string | null; scryfallId: string | null; faceIndex: number }>()
  for (const item of rawItems) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const cardId = typeof record.cardId === 'string' && record.cardId.length > 0 ? record.cardId : null
    const scryfallId = typeof record.scryfallId === 'string' && record.scryfallId.length > 0 ? record.scryfallId : null
    if (!cardId && !scryfallId) continue
    const faceIndex = faceIndexFromValue(record.face ?? record.faceIndex)
    deduped.set(`${cardId ?? scryfallId}:${faceIndex}`, { cardId, scryfallId, faceIndex })
  }

  if (deduped.size === 0) {
    return NextResponse.json({ error: 'missing valid items' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const results: EnsureResult[] = []
  for (const item of deduped.values()) {
    results.push(await ensureUpscaledAsset(supabase, item))
  }

  const cached = results.filter((item) => item.status === 'cached').length
  const queued = results.filter((item) => item.status === 'queued').length
  const disabled = results.filter((item) => item.status === 'disabled').length
  const failed = results.filter((item) => item.status === 'failed').length

  return NextResponse.json({
    total: results.length,
    cached,
    queued,
    disabled,
    failed,
    queueEnabled: isOnDemandQueueEnabled(),
    results,
  }, { status: failed > 0 ? 207 : 200 })
}
