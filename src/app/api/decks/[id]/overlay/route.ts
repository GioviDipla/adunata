import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Deck owned/missing overlay.
 *
 * For each `deck_cards` row aggregates the caller's `user_cards` across
 * foil/language/condition splits — players rarely care about matching
 * condition when asking "do I own this?". Returns per-card rows plus
 * summary totals (owned, needed, missingEur, missingUsd).
 *
 * RLS on `user_cards` already scopes the aggregate to the caller; we
 * also check the session here so an unauthenticated hit gets a 401
 * rather than an empty overlay (which would falsely read as "you own
 * nothing").
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: deckId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: deckCards, error: e1 } = await supabase
    .from('deck_cards')
    .select('card_id, quantity, board')
    .eq('deck_id', deckId)
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

  const cardIds = Array.from(
    new Set((deckCards ?? []).map((d) => d.card_id)),
  )
  if (cardIds.length === 0) {
    return NextResponse.json({
      overlay: [],
      owned: 0,
      needed: 0,
      missingEur: 0,
      missingUsd: 0,
    })
  }

  const { data: owned, error: e2 } = await supabase
    .from('user_cards')
    .select('card_id, quantity')
    .eq('user_id', user.id)
    .in('card_id', cardIds)
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  const ownedMap = new Map<number, number>()
  for (const row of owned ?? []) {
    ownedMap.set(row.card_id, (ownedMap.get(row.card_id) ?? 0) + row.quantity)
  }

  const { data: cards, error: e3 } = await supabase
    .from('cards')
    .select('id, prices_eur, prices_usd, name')
    .in('id', cardIds)
  if (e3) return NextResponse.json({ error: e3.message }, { status: 500 })

  const priceMap = new Map(
    (cards ?? []).map((c) => [
      c.id,
      {
        eur: c.prices_eur != null ? Number(c.prices_eur) : 0,
        usd: c.prices_usd != null ? Number(c.prices_usd) : 0,
        name: c.name,
      },
    ]),
  )

  interface OverlayRow {
    card_id: number
    needed: number
    owned: number
    missing: number
    missing_eur: number
    missing_usd: number
    name: string
  }

  const perCardNeed = new Map<number, number>()
  for (const dc of deckCards ?? []) {
    perCardNeed.set(
      dc.card_id,
      (perCardNeed.get(dc.card_id) ?? 0) + dc.quantity,
    )
  }

  const overlay: OverlayRow[] = []
  let totalOwned = 0
  let totalNeeded = 0
  let missingEur = 0
  let missingUsd = 0
  for (const [cardId, need] of perCardNeed) {
    const have = ownedMap.get(cardId) ?? 0
    const missing = Math.max(0, need - have)
    const p = priceMap.get(cardId) ?? { eur: 0, usd: 0, name: '' }
    totalOwned += Math.min(have, need)
    totalNeeded += need
    missingEur += missing * p.eur
    missingUsd += missing * p.usd
    overlay.push({
      card_id: cardId,
      needed: need,
      owned: have,
      missing,
      missing_eur: missing * p.eur,
      missing_usd: missing * p.usd,
      name: p.name,
    })
  }

  return NextResponse.json({
    overlay,
    owned: totalOwned,
    needed: totalNeeded,
    missingEur,
    missingUsd,
  })
}
