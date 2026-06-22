import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MAX_LIMIT = 20

// Card autocomplete for filter dropdowns (Pub Decks commander + card-list).
// DB-first, relevance-ordered, deduped per card name. Unlike /api/cards/search
// (unordered limit-10 + Scryfall fallback that discards DB matches when < 5),
// this always returns DB matches ranked — so specific cards like
// "Ashling, the Limitless" surface even when only one DB row matches.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) {
    return NextResponse.json({ cards: [] })
  }

  const rawLimit = parseInt(request.nextUrl.searchParams.get('limit') ?? '10', 10)
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(rawLimit, MAX_LIMIT))
    : 10

  const { data, error } = await supabase.rpc('search_cards_autocomplete', {
    p_query: q,
    p_limit: limit,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ cards: data ?? [] })
}
