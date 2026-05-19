import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { readPngDimensions, sha256Hex } from '@/lib/card-images/image-metadata'
import { buildCardImageStoragePath } from '@/lib/card-images/storage-path'
import { resolveCardImageSources, type CardImageSourceCard } from '@/lib/card-images/source-url'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BUCKET = 'card-images-hd'
const CACHE_HEADER = 'public, s-maxage=31536000, max-age=86400, immutable'
const MAX_SOURCE_BYTES = 15 * 1024 * 1024

type AssetRow = {
  id: string
  storage_path: string | null
}

type EnsureResult = {
  cardId: string | null
  scryfallId: string | null
  faceIndex: number
  status: 'cached' | 'ready' | 'failed'
  storagePath?: string
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

function contentExtension(contentType: string | null, sourceUrl: string): string {
  if (contentType?.includes('png')) return '.png'
  if (contentType?.includes('webp')) return '.webp'
  if (contentType?.includes('jpeg') || contentType?.includes('jpg')) return '.jpg'
  try {
    const ext = path.extname(new URL(sourceUrl).pathname).toLowerCase()
    return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.png'
  } catch {
    return '.png'
  }
}

function runRealEsrgan2x(inputPath: string, outputPath: string): Promise<void> {
  const bin = process.env.REALESRGAN_BIN
  const modelPath = process.env.REALESRGAN_MODEL_PATH
  const model = process.env.REALESRGAN_MODEL ?? 'realesr-animevideov3'
  const tileSize = process.env.REALESRGAN_TILE_SIZE ?? '0'
  if (!bin) throw new Error('Missing REALESRGAN_BIN')
  if (!modelPath) throw new Error('Missing REALESRGAN_MODEL_PATH')

  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-o', outputPath,
      '-m', modelPath,
      '-n', model,
      '-s', '2',
      '-t', tileSize,
      '-f', 'png',
    ]
    const child = spawn(bin, args)
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`realesrgan exited ${code}: ${stderr.slice(0, 1000)}`))
    })
  })
}

async function downloadAsset(supabase: SupabaseAdmin, storagePath: string): Promise<NextResponse | null> {
  const { data: blob, error } = await supabase.storage
    .from(BUCKET)
    .download(storagePath)

  if (error || !blob) return null

  const buffer = await blob.arrayBuffer()
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': blob.type || 'image/png',
      'Cache-Control': CACHE_HEADER,
    },
  })
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

async function markFailed(supabase: SupabaseAdmin, assetId: string | null, error: unknown) {
  if (!assetId) return
  const message = error instanceof Error ? error.message : String(error)
  await (supabase as any)
    .from('card_image_assets')
    .update({
      status: 'failed',
      last_error: message.slice(0, 1000),
      locked_at: null,
      locked_by: null,
    })
    .eq('id', assetId)
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

  if (!process.env.REALESRGAN_BIN || !process.env.REALESRGAN_MODEL_PATH) {
    return { ...resultBase, status: 'failed', error: 'upscaler unavailable' }
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
  const workDir = path.join(os.tmpdir(), 'card-image-hd2x-upscale', randomUUID())
  await mkdir(workDir, { recursive: true })
  let assetId: string | null = null

  try {
    const { data: upserted, error: upsertError } = await (supabase as any)
      .from('card_image_assets')
      .upsert({
        card_id: source.cardId,
        scryfall_id: source.scryfallId,
        face_index: source.faceIndex,
        source_url: source.sourceUrl,
        storage_path: storagePath,
        target_profile: 'hd-2x',
        model: process.env.REALESRGAN_MODEL ?? 'realesr-animevideov3',
        scale: 2,
        target_dpi: 600,
        status: 'processing',
        attempts: 1,
        last_error: null,
        locked_at: new Date().toISOString(),
        locked_by: `on-demand-${process.pid}`,
      }, {
        onConflict: 'card_id,face_index,target_profile',
        ignoreDuplicates: false,
      })
      .select('id')
      .single()

    if (upsertError) throw upsertError
    assetId = (upserted as { id: string }).id

    const upstream = await fetch(source.sourceUrl, { cache: 'force-cache', next: { revalidate: 31536000 } })
    if (!upstream.ok) throw new Error(`source download failed: HTTP ${upstream.status}`)

    const sourceBytes = new Uint8Array(await upstream.arrayBuffer())
    if (sourceBytes.byteLength > MAX_SOURCE_BYTES) throw new Error('source image too large')

    const inputPath = path.join(workDir, `source${contentExtension(upstream.headers.get('content-type'), source.sourceUrl)}`)
    const outputPath = path.join(workDir, 'output.png')
    await writeFile(inputPath, sourceBytes)
    await runRealEsrgan2x(inputPath, outputPath)

    const outputBytes = await readFile(outputPath)
    const dimensions = readPngDimensions(outputBytes)
    const checksum = sha256Hex(outputBytes)

    const upload = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, outputBytes, {
        contentType: 'image/png',
        upsert: true,
      })
    if (upload.error) throw upload.error

    await (supabase as any)
      .from('card_image_assets')
      .update({
        status: 'ready',
        width_px: dimensions.width,
        height_px: dimensions.height,
        bytes: outputBytes.byteLength,
        mime_type: 'image/png',
        checksum,
        completed_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
      })
      .eq('id', assetId)

    return {
      cardId: source.cardId,
      scryfallId: source.scryfallId,
      faceIndex: source.faceIndex,
      status: 'ready',
      storagePath,
    }
  } catch (err) {
    await markFailed(supabase, assetId, err)
    return {
      cardId: source.cardId,
      scryfallId: source.scryfallId,
      faceIndex: source.faceIndex,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    await rm(workDir, { recursive: true, force: true })
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
    const cached = await downloadAsset(supabase, asset.storage_path)
    if (cached) return cached
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
  const ready = results.filter((item) => item.status === 'ready').length
  const failed = results.filter((item) => item.status === 'failed').length

  return NextResponse.json({
    total: results.length,
    cached,
    ready,
    failed,
    results,
  }, { status: failed > 0 ? 207 : 200 })
}
