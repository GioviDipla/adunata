import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

  // Batch-check existing rows
  const rows = Array.from(aggregated.values())
  const cardIds = rows.map((r) => r.card_id)
  const existingMap = new Map<string, { id: string; quantity: number }>()
  const { data: existingRows } = await supabase
    .from('user_cards')
    .select('id, card_id, quantity, foil')
    .eq('user_id', user.id)
    .in('card_id', cardIds)
  for (const ex of existingRows ?? []) {
    const key = `${ex.card_id}::${ex.foil ? 1 : 0}`
    existingMap.set(key, { id: ex.id, quantity: ex.quantity })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toInsert: Array<any> = []
  const toUpdate: Array<{ id: string; quantity: number }> = []

  for (const row of rows) {
    const key = `${row.card_id}::${row.foil ? 1 : 0}`
    const existing = existingMap.get(key)
    if (existing) {
      toUpdate.push({ id: existing.id, quantity: existing.quantity + row.quantity })
    } else {
      toInsert.push({
        user_id: user.id,
        card_id: row.card_id,
        quantity: row.quantity,
        foil: row.foil,
        language: 'en',
        condition: 'NM',
      })
    }
  }

  if (toInsert.length > 0) {
    const { error: insErr } = await supabase.from('user_cards').insert(toInsert)
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  let skipped = 0
  if (toUpdate.length > 0) {
    const admin = await createAdminClient()
    const { error: upErr } = await admin.rpc(
      'batch_update_user_cards_quantity',
      { p_updates: toUpdate },
    )
    if (upErr) { skipped = toUpdate.length }
  }

  const inserted = rows.reduce((sum, r) => sum + r.quantity, 0) - skipped

  revalidatePath('/collection')
  return NextResponse.json({
    inserted,
    skipped,
    total: aggregated.size,
  })
}
