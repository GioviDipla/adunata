import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

interface DeckCardLite {
  card_id: number
  quantity: number
  board: string
  is_foil: boolean
}

/**
 * Bulk-add every card in a deck to the user's collection.
 * Boards 'main' / 'sideboard' / 'commander' / 'maybeboard' are eligible;
 * 'tokens' is excluded (token rows aren't ownable cards).
 *
 * Foil rows are tracked separately. Quantities merge into the existing
 * (user, card_id, foil, language='en', condition='NM') row.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: deckId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: deckCards, error: dcErr } = await supabase
    .from('deck_cards')
    .select('card_id, quantity, board, is_foil')
    .eq('deck_id', deckId)
  if (dcErr) return NextResponse.json({ error: dcErr.message }, { status: 500 })

  const eligible = (deckCards ?? []).filter(
    (d): d is DeckCardLite => d.board !== 'tokens' && d.card_id != null,
  )
  if (eligible.length === 0)
    return NextResponse.json({ inserted: 0, skipped: 0, total: 0 })

  // Aggregate by (card_id, foil) — same printing tracked once per foil flag.
  const aggregated = new Map<string, { card_id: number; foil: boolean; quantity: number }>()
  for (const dc of eligible) {
    const key = `${dc.card_id}::${dc.is_foil ? 1 : 0}`
    const cur = aggregated.get(key)
    if (cur) cur.quantity += dc.quantity
    else aggregated.set(key, { card_id: dc.card_id, foil: !!dc.is_foil, quantity: dc.quantity })
  }

  let inserted = 0
  let skipped = 0
  for (const row of aggregated.values()) {
    const { data: existing } = await supabase
      .from('user_cards')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('card_id', row.card_id)
      .eq('foil', row.foil)
      .eq('language', 'en')
      .eq('condition', 'NM')
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('user_cards')
        .update({ quantity: existing.quantity + row.quantity })
        .eq('id', existing.id)
      if (error) { skipped++; continue }
    } else {
      const { error } = await supabase.from('user_cards').insert({
        user_id: user.id,
        card_id: row.card_id,
        quantity: row.quantity,
        foil: row.foil,
        language: 'en',
        condition: 'NM',
      })
      if (error) { skipped++; continue }
    }
    inserted += row.quantity
  }

  revalidatePath('/collection')
  return NextResponse.json({
    inserted,
    skipped,
    total: aggregated.size,
  })
}
