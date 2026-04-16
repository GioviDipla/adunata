import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  // Check if card already exists by scryfall_id
  let { data: existingCard } = await supabase
    .from('cards')
    .select('id')
    .eq('scryfall_id', scryfall_id)
    .single()

  if (!existingCard) {
    // Insert the card
    const { data: newCard, error: insertError } = await supabase
      .from('cards')
      .insert({
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
      })
      .select('id')
      .single()

    if (insertError || !newCard) {
      return NextResponse.json({ error: insertError?.message ?? 'Failed to insert card' }, { status: 500 })
    }
    existingCard = newCard
  }

  const cardId = existingCard.id

  // Check if already in deck
  const { data: existingDeckCard } = await supabase
    .from('deck_cards')
    .select('id, quantity')
    .eq('deck_id', deckId)
    .eq('card_id', cardId)
    .eq('board', board)
    .single()

  if (existingDeckCard) {
    await supabase
      .from('deck_cards')
      .update({ quantity: existingDeckCard.quantity + 1 })
      .eq('id', existingDeckCard.id)
  } else {
    await supabase
      .from('deck_cards')
      .insert({ deck_id: deckId, card_id: cardId, quantity: 1, board })
  }

  await supabase
    .from('decks')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', deckId)

  return NextResponse.json({ card_id: cardId })
}
