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
    // Search local DB first (English name)
    const { data: localCards } = await supabase
      .from('cards')
      .select(CARD_GRID_COLUMNS)
      .ilike('name', `%${query}%`)
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

    // For Italian results, we need the English oracle version.
    // Scryfall Italian cards have the english `name` field, so we can use that.
    // Merge results, deduplicate by oracle_id or name
    const seen = new Set<string>()
    const merged: ScryfallCard[] = []

    for (const card of [...enCards, ...itCards]) {
      const key = card.name
      if (!seen.has(key)) {
        seen.add(key)
        merged.push(card)
      }
    }

    if (merged.length === 0) {
      return NextResponse.json({ cards: localCards ?? [], source: 'database' })
    }

    // For Italian results, fetch the English version to store canonical data
    const toUpsert = merged.slice(0, 10).map(mapScryfallCard)

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

    // Fallback: return local results if Scryfall fails
    const { data: fallback } = await supabase
      .from('cards')
      .select(CARD_GRID_COLUMNS)
      .ilike('name', `%${query}%`)
      .limit(10)

    return NextResponse.json({ cards: fallback ?? [], source: 'fallback' })
  }
}
