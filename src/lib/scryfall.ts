// ---------------------------------------------------------------------------
// Scryfall API client for Adunata
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
  lang?: string
  printed_name?: string
  prices?: {
    usd?: string | null
    usd_foil?: string | null
    eur?: string | null
    eur_foil?: string | null
    [key: string]: string | null | undefined
  }
  legalities?: Record<string, string>
  power?: string
  toughness?: string
  keywords?: string[]
  produced_mana?: string[]
  released_at?: string
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
 * Exact name lookup, optionally pinned to a set. Unlike `/cards/collection`
 * this endpoint also matches Universes Beyond flavor names — so pasting
 * `Paradise Chocobo (FIC)` resolves to Birds of Paradise (FIC 483) and
 * `Balin's Tomb (LTC)` resolves to Ancient Tomb (LTC 357). The batch
 * endpoint only matches the canonical `name` and returns these as
 * not_found, so this is the fallback the bulk importer uses for anything
 * still missing after the batch passes.
 */
export async function searchCardByExactName(
  name: string,
  setCode?: string,
): Promise<ScryfallCard | null> {
  const params = new URLSearchParams({ exact: name })
  if (setCode) params.set('set', setCode.toLowerCase())
  const url = `https://api.scryfall.com/cards/named?${params.toString()}`
  const res = await rateLimitedFetch(url)

  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`Scryfall exact search returned ${res.status}`)
  }

  return (await res.json()) as ScryfallCard
}

/**
 * Batch lookup cards by name using Scryfall's /cards/collection endpoint.
 * Accepts up to 75 identifiers per request. For larger batches, splits into
 * multiple requests automatically.
 */
export async function lookupCardsByNames(
  names: string[]
): Promise<{ found: ScryfallCard[]; notFound: string[] }> {
  return lookupCardsByIdentifiers(names.map((name) => ({ name })))
}

/**
 * Batch lookup cards by `(name, set?)` identifiers. Supplying `set` pins the
 * result to that specific printing — critical for deck imports where the user
 * paste-listed an edition, otherwise Scryfall returns its "preferred" printing
 * (usually the most recent) which is wrong.
 *
 * Up to 75 identifiers per request; larger batches split automatically.
 */
export async function lookupCardsByIdentifiers(
  identifiers: Array<{ name: string; set?: string }>
): Promise<{ found: ScryfallCard[]; notFound: string[] }> {
  const found: ScryfallCard[] = []
  const notFound: string[] = []

  const BATCH_SIZE = 75
  for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
    const batch = identifiers.slice(i, i + BATCH_SIZE)
    const payload = batch.map((id) =>
      id.set ? { name: id.name, set: id.set.toLowerCase() } : { name: id.name }
    )

    const res = await rateLimitedFetch(
      'https://api.scryfall.com/cards/collection',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: payload }),
      }
    )

    if (!res.ok) {
      notFound.push(...batch.map((id) => id.name))
      continue
    }

    const data = (await res.json()) as {
      data: ScryfallCard[]
      not_found: { name: string }[]
    }

    found.push(...(data.data ?? []))
    for (const nf of data.not_found ?? []) {
      notFound.push(nf.name)
    }
  }

  return { found, notFound }
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
  const priceEur = card.prices?.eur ? parseFloat(card.prices.eur) : null
  const priceEurFoil = card.prices?.eur_foil
    ? parseFloat(card.prices.eur_foil)
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
    prices_eur: isNaN(priceEur as number) ? null : priceEur,
    prices_eur_foil: isNaN(priceEurFoil as number) ? null : priceEurFoil,
    released_at: card.released_at ?? null,
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
