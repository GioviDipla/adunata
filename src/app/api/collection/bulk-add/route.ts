import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

interface BulkItem {
  card_id: string | number
  quantity: number
  foil?: boolean
  language?: string
  condition?: string
}

const VALID_CONDITIONS = ['M', 'NM', 'LP', 'MP', 'HP', 'D'] as const
type Condition = typeof VALID_CONDITIONS[number]

/**
 * Add a hand-picked subset of cards to the caller's collection.
 *
 * Body: `{ items: [{ card_id, quantity, foil?, language?, condition? }, ...] }`.
 * Merges on (user, card, foil, language, condition) by bumping quantity.
 * Defaults: foil=false, language='en', condition='NM'.
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
    const language = typeof raw.language === 'string' && raw.language.length <= 5
      ? raw.language
      : 'en'
    const conditionRaw = typeof raw.condition === 'string' ? raw.condition : 'NM'
    const condition: Condition = (VALID_CONDITIONS as readonly string[]).includes(conditionRaw)
      ? (conditionRaw as Condition)
      : 'NM'

    const { data: existing } = await supabase
      .from('user_cards')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('card_id', cardId as never)
      .eq('foil', foil)
      .eq('language', language)
      .eq('condition', condition)
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
        language,
        condition,
      })
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }
    inserted++
  }

  revalidatePath('/collection')
  revalidatePath('/cards')
  return NextResponse.json({ inserted, skipped, total: items.length })
}
