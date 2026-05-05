import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

interface BulkItem {
  card_id: string | number
  quantity: number
  foil?: boolean
}

/**
 * Add a hand-picked subset of cards to the caller's collection.
 *
 * Expected JSON body: `{ items: [{ card_id, quantity, foil? }, ...] }`.
 * Merges on (user, card, foil, language='en', condition='NM') by bumping
 * quantity — same semantics as POST /api/collection but in batch.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const items = Array.isArray(body.items) ? (body.items as BulkItem[]) : []
  if (items.length === 0) {
    return NextResponse.json({ error: 'no items' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let inserted = 0
  let skipped = 0

  for (const raw of items) {
    const cardId = raw.card_id
    const qty = Number(raw.quantity ?? 1)
    if (cardId == null || !Number.isFinite(qty) || qty < 1) {
      skipped++
      continue
    }
    const foil = !!raw.foil

    const { data: existing } = await supabase
      .from('user_cards')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('card_id', cardId as never)
      .eq('foil', foil)
      .eq('language', 'en')
      .eq('condition', 'NM')
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('user_cards')
        .update({ quantity: existing.quantity + qty })
        .eq('id', existing.id)
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else {
      const { error } = await supabase.from('user_cards').insert({
        user_id: user.id,
        card_id: cardId as never,
        quantity: qty,
        foil,
        language: 'en',
        condition: 'NM',
      })
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }
    inserted++
  }

  revalidatePath('/collection')
  return NextResponse.json({ inserted, skipped, total: items.length })
}
