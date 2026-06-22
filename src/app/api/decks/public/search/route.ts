import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PAGE_SIZE = 10
const MAX_OFFSET = 1000

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sp = request.nextUrl.searchParams
  const rawOffset = parseInt(sp.get('offset') ?? '0', 10)
  const offset = Number.isFinite(rawOffset)
    ? Math.max(0, Math.min(rawOffset, MAX_OFFSET))
    : 0
  const cardMode = sp.get('cardMode') === 'or' ? 'or' : 'and'
  const VALID_SORTS = ['updated', 'created', 'name', 'likes', 'price'] as const
  const sortParam = sp.get('sort') ?? 'updated'
  const sort = (VALID_SORTS as readonly string[]).includes(sortParam)
    ? sortParam
    : 'updated'

  const { data, error } = await supabase.rpc('search_public_decks', {
    p_name: sp.get('name') ?? '',
    p_creator: sp.get('creator') ?? '',
    p_commander: sp.get('commander') ?? '',
    p_colors: sp.get('colors') ?? '',
    p_color_identity: sp.get('ci') ?? '',
    p_cards: sp.get('cards') ?? '',
    p_card_mode: cardMode,
    p_format: sp.get('format') ?? '',
    p_sort: sort,
    p_limit: PAGE_SIZE,
    p_offset: offset,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ decks: data ?? [] })
}
