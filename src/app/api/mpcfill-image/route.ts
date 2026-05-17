import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// MPCFill HD scan proxy.
//
// Looks up cards.mpcfill_drive_id by scryfall_id. If the cached Drive ID is
// valid, streams the corresponding JPEG from the MPCFill image worker CDN.
// If the lookup is cold, calls MPCFill's editorSearch endpoint to discover
// the best community scan, caches the result in the DB, and serves the bytes.
//
// Requires MPCFILL_BACKEND_URL env. MPCFill has no chilli-axe-hosted public
// backend — users self-host the Django app. When this env is missing the
// route returns 503 so the client cascade falls back to Scryfall PNG.
//
// Cache semantics:
//   mpcfill_drive_id IS NULL → never searched.
//   mpcfill_drive_id = ''    → searched and missing (sentinel, no retry).
//   mpcfill_drive_id = <id>  → resolved Drive file ID.

const IMAGE_WORKER_URL = 'https://img.mpcautofill.com'
const SEARCH_TIMEOUT_MS = 5000
const FETCH_TIMEOUT_MS = 15000
const CACHE_HEADER = 'public, s-maxage=31536000, max-age=86400, immutable'

interface EditorSearchResponseShape {
  results?: Record<string, Record<string, string[] | undefined>>
}

interface SourceShape {
  pk: number
}

interface SourcesResponseShape {
  results?: Record<string, SourceShape>
}

let cachedSourceIds: number[] | null = null
let cachedSourceIdsAt = 0
const SOURCE_CACHE_TTL_MS = 60 * 60 * 1000

async function fetchAllSourceIds(backendURL: string): Promise<number[]> {
  const now = Date.now()
  if (cachedSourceIds && now - cachedSourceIdsAt < SOURCE_CACHE_TTL_MS) {
    return cachedSourceIds
  }
  const res = await fetch(`${backendURL.replace(/\/$/, '')}/2/sources/`, {
    method: 'GET',
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`sources ${res.status}`)
  const body = (await res.json()) as SourcesResponseShape
  const ids = Object.values(body.results ?? {}).map((s) => s.pk).filter((p): p is number => typeof p === 'number')
  cachedSourceIds = ids
  cachedSourceIdsAt = now
  return ids
}

async function searchDriveId(backendURL: string, cardName: string): Promise<string | null> {
  const sourceIds = await fetchAllSourceIds(backendURL)
  const sourceSettings = {
    sources: sourceIds.map((pk) => [pk, true] as Array<number | boolean>),
  }
  const res = await fetch(`${backendURL.replace(/\/$/, '')}/2/editorSearch/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      queries: [{ cardType: 'CARD', query: cardName }],
      searchSettings: {
        filterSettings: {
          excludesTags: [],
          includesTags: [],
          languages: ['EN'],
          maximumDPI: 1500,
          maximumSize: 999_999_999,
          minimumDPI: 0,
        },
        searchTypeSettings: { filterCardbacks: false, fuzzySearch: true },
        sourceSettings,
      },
    }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`editorSearch ${res.status}`)
  const body = (await res.json()) as EditorSearchResponseShape
  const queryResults = body.results?.[cardName]
  const ids = queryResults?.CARD ?? []
  return ids.length > 0 ? ids[0] : null
}

async function fetchCdnImage(driveId: string, dpi: number, quality: number): Promise<Response> {
  const url = `${IMAGE_WORKER_URL}/images/google_drive/full/${driveId}.jpg?dpi=${dpi}&jpgQuality=${quality}`
  return fetch(url, {
    next: { revalidate: 31_536_000 },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
}

export async function GET(req: NextRequest) {
  const scryfallId = req.nextUrl.searchParams.get('scryfall_id')
  if (!scryfallId) {
    return NextResponse.json({ error: 'missing scryfall_id' }, { status: 400 })
  }

  const dpi = Number(req.nextUrl.searchParams.get('dpi') ?? 600)
  const quality = Number(req.nextUrl.searchParams.get('quality') ?? 95)
  if (!Number.isFinite(dpi) || dpi <= 0 || dpi > 1500) {
    return NextResponse.json({ error: 'invalid dpi' }, { status: 400 })
  }
  if (!Number.isFinite(quality) || quality <= 0 || quality > 100) {
    return NextResponse.json({ error: 'invalid quality' }, { status: 400 })
  }

  const backendURL = process.env.MPCFILL_BACKEND_URL
  if (!backendURL) {
    // No backend configured — short-circuit so the client cascade falls back
    // to Scryfall immediately without paying the round-trip to this route.
    return NextResponse.json({ error: 'mpcfill backend not configured' }, { status: 503 })
  }

  const admin = createAdminClient()
  const { data: card, error: cardError } = await admin
    .from('cards')
    .select('id, name, mpcfill_drive_id')
    .eq('scryfall_id', scryfallId)
    .maybeSingle()

  if (cardError) {
    return NextResponse.json({ error: 'db error' }, { status: 500 })
  }
  if (!card) {
    return NextResponse.json({ error: 'card not found' }, { status: 404 })
  }

  let driveId: string | null = card.mpcfill_drive_id ?? null

  if (driveId === null) {
    try {
      driveId = await searchDriveId(backendURL, card.name)
    } catch {
      // Upstream search failure → return 502 so the client falls back to
      // Scryfall this time, but don't cache the miss in case it's transient.
      return NextResponse.json({ error: 'mpcfill search failed' }, { status: 502 })
    }
    await admin
      .from('cards')
      .update({ mpcfill_drive_id: driveId ?? '' })
      .eq('id', card.id)
  }

  if (driveId === null || driveId === '') {
    return NextResponse.json({ error: 'no mpcfill scan' }, { status: 404 })
  }

  let upstream: Response
  try {
    upstream = await fetchCdnImage(driveId, dpi, quality)
  } catch {
    return NextResponse.json({ error: 'cdn fetch failed' }, { status: 502 })
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: `cdn ${upstream.status}` }, { status: 502 })
  }

  const buffer = await upstream.arrayBuffer()
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': CACHE_HEADER,
    },
  })
}
