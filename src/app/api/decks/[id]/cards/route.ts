import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function verifyDeckOwnership(supabase: Awaited<ReturnType<typeof createClient>>, deckId: string, userId: string) {
  const { data: deck } = await supabase
    .from('decks')
    .select('id')
    .eq('id', deckId)
    .eq('user_id', userId)
    .single()
  return !!deck
}

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

  if (!(await verifyDeckOwnership(supabase, deckId, user.id))) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
  }

  const body = await request.json()
  const { card_id, quantity = 1, board = 'main' } = body

  if (!card_id) {
    return NextResponse.json({ error: 'card_id is required' }, { status: 400 })
  }

  // Check if card already exists in this deck+board
  const { data: existing } = await supabase
    .from('deck_cards')
    .select('id, quantity')
    .eq('deck_id', deckId)
    .eq('card_id', card_id)
    .eq('board', board)
    .single()

  if (existing) {
    // Update quantity
    const { data: updated, error } = await supabase
      .from('deck_cards')
      .update({ quantity: existing.quantity + quantity })
      .eq('id', existing.id)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Update deck timestamp
    await supabase
      .from('decks')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', deckId)

    return NextResponse.json({ deck_card: updated })
  }

  // Insert new
  const { data: deckCard, error } = await supabase
    .from('deck_cards')
    .insert({ deck_id: deckId, card_id, quantity, board })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update deck timestamp
  await supabase
    .from('decks')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', deckId)

  return NextResponse.json({ deck_card: deckCard }, { status: 201 })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: deckId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!(await verifyDeckOwnership(supabase, deckId, user.id))) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
  }

  const body = await request.json()
  const { card_id, quantity, board } = body

  if (!card_id) {
    return NextResponse.json({ error: 'card_id is required' }, { status: 400 })
  }

  // If quantity is 0 or less, remove the card
  if (quantity !== undefined && quantity <= 0) {
    const { error } = await supabase
      .from('deck_cards')
      .delete()
      .eq('deck_id', deckId)
      .eq('card_id', card_id)
      .eq('board', board || 'main')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await supabase
      .from('decks')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', deckId)

    return NextResponse.json({ deleted: true })
  }

  const updateData: { quantity?: number; board?: string } = {}
  if (quantity !== undefined) updateData.quantity = quantity
  if (board !== undefined) updateData.board = board

  const { data: updated, error } = await supabase
    .from('deck_cards')
    .update(updateData)
    .eq('deck_id', deckId)
    .eq('card_id', card_id)
    .eq('board', body.current_board || board || 'main')
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase
    .from('decks')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', deckId)

  return NextResponse.json({ deck_card: updated })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: deckId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!(await verifyDeckOwnership(supabase, deckId, user.id))) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
  }

  const body = await request.json()
  const { card_id, board = 'main' } = body

  if (!card_id) {
    return NextResponse.json({ error: 'card_id is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('deck_cards')
    .delete()
    .eq('deck_id', deckId)
    .eq('card_id', card_id)
    .eq('board', board)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase
    .from('decks')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', deckId)

  return NextResponse.json({ success: true })
}
