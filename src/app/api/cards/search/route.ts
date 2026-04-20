import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { searchCards, mapScryfallCard, type ScryfallCard } from '@/lib/scryfall'
import { CARD_GRID_COLUMNS } from '@/lib/supabase/columns'
import { enforceLimit, getClientId, searchLimiter } from '@/lib/rate-limit'

const LOCAL_LANGS = new Set(['en', 'it'])
const ALLOWED_LANGS = new Set(['en', 'it', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'ru', 'zhs', 'zht'])

/**
 * Card search API.
 *
 * Query params:
 *   q     — search string (min 2 chars)
 *   lang  — language code; 'en' and 'it' are stored locally in the DB,
 *           everything else queries Scryfall directly. Defaults to 'en'.
 *
 * Always stores the English canonical artwork/metadata when upserting,
 * regardless of which language the user searched in.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')
  const rawLang = request.nextUrl.searchParams.get('lang') ?? 'en'
  const lang = ALLOWED_LANGS.has(rawLang) ? rawLang : 'en'

  if (!q || q.trim().length < 2) {
    return NextResponse.json({ cards: [] })
  }

  const limited = await enforceLimit(searchLimiter, getClientId(request))
  if (limited) return limited

  const supabase = createAdminClient()
  const query = q.trim()

  try {
    // Only hit the DB for languages we store locally.
    if (LOCAL_LANGS.has(lang)) {
      const column = lang === 'it' ? 'name_it' : 'name'
      const { data: localCards } = await supabase
        .from('cards')
        .select(CARD_GRID_COLUMNS)
        .ilike(column, `%${query}%`)
        .limit(10)

      if (localCards && localCards.length >= 5) {
        return NextResponse.json({ cards: localCards, source: 'database' })
      }
    }

    // Scryfall fallback. For non-local languages we scope directly; for
    // local languages we run EN + IT in parallel so a typo on one side
    // can still land via the other.
    const scryQueries: string[] = []
    if (lang === 'en') {
      scryQueries.push(query, `lang:it ${query}`)
    } else if (lang === 'it') {
      scryQueries.push(query, `lang:it ${query}`)
    } else {
      scryQueries.push(`lang:${lang} ${query}`)
    }

    const results = await Promise.allSettled(scryQueries.map((q) => searchCards(q)))
    const allCards: ScryfallCard[] = results.flatMap((r) =>
      r.status === 'fulfilled' ? r.value.data : [],
    )

    // Dedup by English `name` (every Scryfall printing carries the English name).
    const seen = new Set<string>()
    const merged: ScryfallCard[] = []
    const italianNameByKey = new Map<string, string>()

    for (const card of allCards) {
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
      return NextResponse.json({ cards: [], source: 'scryfall' })
    }

    // Always upsert the English canonical printing so we store English
    // artwork + metadata, regardless of the query language.
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
        } catch { /* fall through to using the non-EN card */ }
      }
      canonical.push(c)
    }

    const toUpsert = canonical.map((c) => ({
      ...mapScryfallCard(c),
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

    // Fallback to whatever local match we can make.
    const column = lang === 'it' ? 'name_it' : 'name'
    const { data: fallback } = await supabase
      .from('cards')
      .select(CARD_GRID_COLUMNS)
      .ilike(column, `%${query}%`)
      .limit(10)

    return NextResponse.json({ cards: fallback ?? [], source: 'fallback' })
  }
}
