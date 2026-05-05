import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Narrow select: only what the `/collection` page renders. `scryfall_id`
// + `released_at` are included so the tile can match the full CardItem
// behaviour (printings query + sort by release).
const COLLECTION_SELECT = `id, quantity, foil, language, condition, acquired_price_eur, notes,
   card:cards!card_id(id, scryfall_id, name, name_it, mana_cost, type_line, image_small, image_normal, cmc, rarity, set_code, color_identity, prices_eur, prices_usd, released_at)`

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 500)
  const offset = Number(url.searchParams.get('offset') ?? 0)

  const { data, error, count } = await supabase
    .from('user_cards')
    .select(COLLECTION_SELECT, { count: 'exact' })
    .eq('user_id', user.id)
    .order('acquired_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Null-guard join (CLAUDE.md): `card:cards!card_id(...)` can be null
  // when the FK target disappeared between the query plan and the read.
  const items = (data ?? []).filter((r) => (r as { card: unknown }).card != null)
  return NextResponse.json({ items, total: count ?? 0 })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const cardIdRaw = body.card_id
  const card_id = typeof cardIdRaw === 'number' || typeof cardIdRaw === 'string' ? cardIdRaw : null
  const quantity = Number(body.quantity ?? 1)
  const foil = !!body.foil
  const language = typeof body.language === 'string' ? body.language : 'en'
  const condition = typeof body.condition === 'string' ? body.condition : 'NM'
  const price_eur = typeof body.acquired_price_eur === 'number' ? body.acquired_price_eur : null
  const notes = typeof body.notes === 'string' ? body.notes : null
  if (card_id == null || !Number.isFinite(quantity) || quantity < 1) {
    return NextResponse.json({ error: 'card_id and quantity required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Merge on (user, card, foil, language, condition): if row exists bump quantity,
  // otherwise insert fresh. The unique constraint in the migration is a belt-and-
  // braces guard; the existence check is the common path.
  const { data: existing } = await supabase
    .from('user_cards')
    .select('id, quantity')
    // card_id comes in as number|string depending on the caller; the
    // Supabase client normalises it as-is. Our hand-maintained types
    // treat `cards.id` as `number`, but the real column is `text`.
    .eq('user_id', user.id)
    .eq('card_id', card_id as never)
    .eq('foil', foil)
    .eq('language', language)
    .eq('condition', condition)
    .maybeSingle()

  let row: { id: string; quantity: number; foil: boolean; language: string; condition: string | null } | null
  if (existing) {
    const { data, error } = await supabase
      .from('user_cards')
      .update({ quantity: existing.quantity + quantity })
      .eq('id', existing.id)
      .select('id, quantity, foil, language, condition')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    row = data
  } else {
    const { data, error } = await supabase
      .from('user_cards')
      .insert({
        user_id: user.id,
        card_id: card_id as never,
        quantity,
        foil,
        language,
        condition: condition as 'M' | 'NM' | 'LP' | 'MP' | 'HP' | 'D',
        acquired_price_eur: price_eur,
        notes,
      })
      .select('id, quantity, foil, language, condition')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    row = data
  }

  revalidatePath('/collection')
  return NextResponse.json({ item: row })
}
