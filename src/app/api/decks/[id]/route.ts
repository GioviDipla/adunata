import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: deck, error } = await supabase
    .from('decks')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !deck) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
  }

  const { data: deckCards, error: cardsError } = await supabase
    .from('deck_cards')
    .select(`
      id,
      card_id,
      quantity,
      board,
      created_at,
      card:cards!card_id(*)
    `)
    .eq('deck_id', id)

  if (cardsError) {
    return NextResponse.json({ error: cardsError.message }, { status: 500 })
  }

  return NextResponse.json({ deck, cards: deckCards ?? [] })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, description, format, cover_card_id } = body

  const { data: deck, error } = await supabase
    .from('decks')
    .update({
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(format !== undefined && { format }),
      ...(cover_card_id !== undefined && { cover_card_id }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ deck })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Delete deck_cards first (cascade might handle this, but be explicit)
  await supabase.from('deck_cards').delete().eq('deck_id', id)

  const { error } = await supabase
    .from('decks')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
