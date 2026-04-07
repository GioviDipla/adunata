// ---------------------------------------------------------------------------
// Scryfall API client for The Gathering
// ---------------------------------------------------------------------------

import type { Database } from '@/types/supabase'

// ── Type definitions ────────────────────────────────────────────────────────

/** Subset of the Scryfall card object we care about. */
export interface ScryfallCard {
  id: string
  name: string
  mana_cost?: string
  cmc?: number
  type_line?: string
  oracle_text?: string
  colors?: string[]
  color_identity?: string[]
  rarity?: string
  set: string
  set_name?: string
  collector_number?: string
  layout?: string
  image_uris?: {
    small?: string
    normal?: string
    art_crop?: string
    [key: string]: string | undefined
  }
  card_faces?: ScryfallCardFace[]
  prices?: {
    usd?: string | null
    usd_foil?: string | null
    [key: string]: string | null | undefined
  }
  legalities?: Record<string, string>
  power?: string
  toughness?: string
  keywords?: string[]
  produced_mana?: string[]
}

export interface ScryfallCardFace {
  name: string
  mana_cost?: string
  type_line?: string
  oracle_text?: string
  colors?: string[]
  power?: string
  toughness?: string
  image_uris?: {
    small?: string
    normal?: string
    art_crop?: string
    [key: string]: string | undefined
  }
}

export interface ScryfallBulkData {
  object: 'list'
  has_more: boolean
  data: {
    object: 'bulk_data'
    id: string
    type: string
    name: string
    description: string
    download_uri: string
    updated_at: string
    size: number
    content_type: string
    content_encoding: string
  }[]
}

export interface ScryfallSearchResult {
  object: 'list'
  total_cards: number
  has_more: boolean
  data: ScryfallCard[]
}

type CardInsert = Database['public']['Tables']['cards']['Insert']

// ── Rate limiter ────────────────────────────────────────────────────────────

let lastRequestTime = 0

async function rateLimitedFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const now = Date.now()
  const elapsed = now - lastRequestTime
  if (elapsed < 100) {
    await new Promise((r) => setTimeout(r, 100 - elapsed))
  }
  lastRequestTime = Date.now()
  return fetch(url, init)
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch the download URL for the "default_cards" bulk data file from Scryfall.
 */
export async function fetchBulkDataUrl(): Promise<string> {
  const res = await rateLimitedFetch('https://api.scryfall.com/bulk-data')
  if (!res.ok) {
    throw new Error(`Scryfall bulk-data endpoint returned ${res.status}`)
  }

  const body = (await res.json()) as ScryfallBulkData
  const defaultCards = body.data.find((d) => d.type === 'default_cards')
  if (!defaultCards) {
    throw new Error('Could not find default_cards bulk data entry')
  }

  return defaultCards.download_uri
}

/**
 * Stream bulk card data from the given URL and yield ScryfallCard objects one
 * at a time.
 *
 * The Scryfall bulk file is a large JSON array. We stream the response body
 * and use a lightweight incremental approach: we accumulate text, detect
 * top-level object boundaries by tracking brace depth, and parse each object
 * individually. This avoids loading the entire file into memory.
 */
export async function* streamBulkCards(
  url: string
): AsyncGenerator<ScryfallCard> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to download bulk data: ${res.status}`)
  }

  const reader = res.body?.getReader()
  if (!reader) {
    throw new Error('Response body is not readable')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let depth = 0
  let inString = false
  let escape = false
  let objectStart = -1

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    let i = 0
    while (i < buffer.length) {
      const ch = buffer[i]

      if (escape) {
        escape = false
        i++
        continue
      }

      if (ch === '\\' && inString) {
        escape = true
        i++
        continue
      }

      if (ch === '"') {
        inString = !inString
        i++
        continue
      }

      if (inString) {
        i++
        continue
      }

      if (ch === '{') {
        if (depth === 0) {
          objectStart = i
        }
        depth++
      } else if (ch === '}') {
        depth--
        if (depth === 0 && objectStart !== -1) {
          const jsonStr = buffer.slice(objectStart, i + 1)
          try {
            const card = JSON.parse(jsonStr) as ScryfallCard
            yield card
          } catch {
            // Skip malformed objects
          }
          // Trim the buffer up to just past this object
          buffer = buffer.slice(i + 1)
          i = 0
          objectStart = -1
          continue
        }
      }

      i++
    }

    // If we have an object in progress, keep from objectStart onward
    if (objectStart > 0) {
      buffer = buffer.slice(objectStart)
      objectStart = 0
    }
  }
}

/**
 * Look up a single card by (fuzzy) name via the Scryfall API.
 */
export async function searchCardByName(
  name: string
): Promise<ScryfallCard | null> {
  const url = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`
  const res = await rateLimitedFetch(url)

  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`Scryfall named search returned ${res.status}`)
  }

  return (await res.json()) as ScryfallCard
}

/**
 * Full-text search for cards via the Scryfall API.
 */
export async function searchCards(
  query: string
): Promise<ScryfallSearchResult> {
  const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`
  const res = await rateLimitedFetch(url)

  if (res.status === 404) {
    return { object: 'list', total_cards: 0, has_more: false, data: [] }
  }
  if (!res.ok) {
    throw new Error(`Scryfall search returned ${res.status}`)
  }

  return (await res.json()) as ScryfallSearchResult
}

// ── Mapper ──────────────────────────────────────────────────────────────────

/**
 * Map a Scryfall card object to a record matching our `cards` table schema.
 *
 * Handles double-faced / multi-face cards: if the card has no top-level
 * `image_uris` we pull images from the first face, and we always store the
 * full `card_faces` array.
 */
export function mapScryfallCard(card: ScryfallCard): CardInsert {
  // For double-faced cards, image_uris lives on each face, not at the top level
  const frontFace = card.card_faces?.[0]
  const imageUris = card.image_uris ?? frontFace?.image_uris

  const priceUsd = card.prices?.usd ? parseFloat(card.prices.usd) : null
  const priceUsdFoil = card.prices?.usd_foil
    ? parseFloat(card.prices.usd_foil)
    : null

  return {
    scryfall_id: card.id,
    name: card.name,
    mana_cost: card.mana_cost ?? frontFace?.mana_cost ?? null,
    cmc: card.cmc ?? 0,
    type_line: card.type_line ?? frontFace?.type_line ?? 'Unknown',
    oracle_text: card.oracle_text ?? frontFace?.oracle_text ?? null,
    colors: card.colors ?? frontFace?.colors ?? null,
    color_identity: card.color_identity ?? [],
    rarity: card.rarity ?? 'common',
    set_code: card.set,
    set_name: card.set_name ?? card.set,
    collector_number: card.collector_number ?? '0',
    image_small: imageUris?.small ?? null,
    image_normal: imageUris?.normal ?? null,
    image_art_crop: imageUris?.art_crop ?? null,
    prices_usd: isNaN(priceUsd as number) ? null : priceUsd,
    prices_usd_foil: isNaN(priceUsdFoil as number) ? null : priceUsdFoil,
    legalities: card.legalities ?? null,
    power: card.power ?? frontFace?.power ?? null,
    toughness: card.toughness ?? frontFace?.toughness ?? null,
    keywords: card.keywords ?? null,
    produced_mana: card.produced_mana ?? null,
    layout: card.layout ?? null,
    card_faces: card.card_faces
      ? (card.card_faces as unknown as Database['public']['Tables']['cards']['Row']['card_faces'])
      : null,
    updated_at: new Date().toISOString(),
  }
}
