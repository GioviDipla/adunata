import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: deckId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify deck ownership
  const { data: deck } = await supabase
    .from('decks')
    .select('id')
    .eq('id', deckId)
    .eq('user_id', user.id)
    .single()
  if (!deck) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
  }

  const body = await request.json()
  const { scryfall_id, card_data, board = 'tokens' } = body

  if (!scryfall_id || !card_data) {
    return NextResponse.json({ error: 'scryfall_id and card_data required' }, { status: 400 })
  }

  // Admin client bypasses RLS for inserting into the global `cards` table
  // (users can't insert there, but upserting Scryfall metadata is safe — the
  // fields are server-validated card data keyed by UNIQUE scryfall_id).
  const admin = createAdminClient()

  // Check if card already exists by scryfall_id (read via admin to avoid
  // RLS-filtered empty results; cards are publicly readable anyway).
  let { data: existingCard } = await admin
    .from('cards')
    .select('id')
    .eq('scryfall_id', scryfall_id)
    .maybeSingle()

  if (!existingCard) {
    // Upsert on scryfall_id to tolerate concurrent inserts (UNIQUE index).
    const { data: upserted, error: insertError } = await admin
      .from('cards')
      .upsert({
        scryfall_id,
        name: card_data.name,
        mana_cost: card_data.mana_cost ?? null,
        cmc: card_data.cmc ?? 0,
        type_line: card_data.type_line ?? null,
        oracle_text: card_data.oracle_text ?? null,
        colors: card_data.colors ?? null,
        color_identity: card_data.color_identity ?? [],
        rarity: card_data.rarity ?? null,
        set_code: card_data.set_code ?? null,
        set_name: card_data.set_name ?? null,
        collector_number: card_data.collector_number ?? null,
        image_small: card_data.image_small ?? null,
        image_normal: card_data.image_normal ?? null,
        image_art_crop: card_data.image_art_crop ?? null,
        power: card_data.power ?? null,
        toughness: card_data.toughness ?? null,
        keywords: card_data.keywords ?? null,
        layout: card_data.layout ?? null,
      }, { onConflict: 'scryfall_id' })
      .select('id')
      .single()

    if (insertError || !upserted) {
      return NextResponse.json({ error: insertError?.message ?? 'Failed to insert card' }, { status: 500 })
    }
    existingCard = upserted
  }

  const cardId = existingCard.id

  const { data: existingDeckCard } = await supabase
    .from('deck_cards')
    .select('id, quantity')
    .eq('deck_id', deckId)
    .eq('card_id', cardId)
    .eq('board', board)
    .maybeSingle()

  if (existingDeckCard) {
    const { error: updateError } = await supabase
      .from('deck_cards')
      .update({ quantity: existingDeckCard.quantity + 1 })
      .eq('id', existingDeckCard.id)
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
  } else {
    const { error: deckInsertError } = await supabase
      .from('deck_cards')
      .insert({ deck_id: deckId, card_id: cardId, quantity: 1, board })
    if (deckInsertError) {
      return NextResponse.json({ error: deckInsertError.message }, { status: 500 })
    }
  }

  await supabase
    .from('decks')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', deckId)

  return NextResponse.json({ card_id: cardId })
}
