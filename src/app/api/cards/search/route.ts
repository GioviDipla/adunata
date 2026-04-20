import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { searchCards, mapScryfallCard, type ScryfallCard } from '@/lib/scryfall'
import { CARD_GRID_COLUMNS } from '@/lib/supabase/columns'
import { enforceLimit, getClientId, searchLimiter } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')

  if (!q || q.trim().length < 2) {
    return NextResponse.json({ cards: [] })
  }

  const limited = await enforceLimit(searchLimiter, getClientId(request))
  if (limited) return limited

  const supabase = createAdminClient()
  const query = q.trim()

  try {
    // Search local DB first — now covers both English `name` and Italian `name_it`.
    const { data: localCards } = await supabase
      .from('cards')
      .select(CARD_GRID_COLUMNS)
      .or(`name.ilike.%${query}%,name_it.ilike.%${query}%`)
      .limit(10)

    if (localCards && localCards.length >= 5) {
      return NextResponse.json({ cards: localCards, source: 'database' })
    }

    // Search Scryfall in English and Italian in parallel
    const [enResult, itResult] = await Promise.allSettled([
      searchCards(query),
      searchCards(`lang:it ${query}`),
    ])

    const enCards = enResult.status === 'fulfilled' ? enResult.value.data : []
    const itCards = itResult.status === 'fulfilled' ? itResult.value.data : []

    // Dedup by English `name` (Italian printings carry the English name field).
    const seen = new Set<string>()
    const merged: ScryfallCard[] = []
    const italianNameByKey = new Map<string, string>()

    for (const card of [...enCards, ...itCards]) {
      const key = card.name
      if (card.lang === 'it' && card.printed_name) {
        italianNameByKey.set(key, card.printed_name)
      }
      if (!seen.has(key)) {
        seen.add(key)
        merged.push(card)
      }
    }

    if (merged.length === 0) {
      return NextResponse.json({ cards: localCards ?? [], source: 'database' })
    }

    // Italian printings have Italian images. Fetch the English canonical
    // version so we store the English artwork and English-lang metadata.
    const canonical: ScryfallCard[] = []
    for (const c of merged.slice(0, 10)) {
      if (c.lang && c.lang !== 'en') {
        try {
          const res = await fetch(
            `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(c.name)}`,
          )
          if (res.ok) {
            canonical.push(await res.json() as ScryfallCard)
            continue
          }
        } catch { /* fall through to using the IT card */ }
      }
      canonical.push(c)
    }

    const toUpsert = canonical.map((c) => ({
      ...mapScryfallCard(c),
      // Attach the Italian printed name when we found one for this card
      name_it: italianNameByKey.get(c.name) ?? null,
    }))

    const { data: upserted } = await supabase
      .from('cards')
      .upsert(toUpsert, { onConflict: 'scryfall_id' })
      .select(CARD_GRID_COLUMNS)

    return NextResponse.json({
      cards: upserted ?? toUpsert,
      source: 'scryfall',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Card search failed:', message)

    const { data: fallback } = await supabase
      .from('cards')
      .select(CARD_GRID_COLUMNS)
      .or(`name.ilike.%${query}%,name_it.ilike.%${query}%`)
      .limit(10)

    return NextResponse.json({ cards: fallback ?? [], source: 'fallback' })
  }
}
