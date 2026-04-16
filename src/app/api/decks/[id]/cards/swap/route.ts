import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DECK_CARD_COLUMNS } from '@/lib/supabase/columns'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: deckId } = await params
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

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
  const { old_card_id, new_card_id } = body

  if (!old_card_id || !new_card_id) {
    return NextResponse.json(
      { error: 'old_card_id and new_card_id are required' },
      { status: 400 }
    )
  }

  // Update all deck_cards rows that reference the old card
  const { data: updated, error } = await supabase
    .from('deck_cards')
    .update({ card_id: new_card_id })
    .eq('deck_id', deckId)
    .eq('card_id', old_card_id)
    .select(DECK_CARD_COLUMNS)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update deck timestamp
  await supabase
    .from('decks')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', deckId)

  return NextResponse.json({ updated })
}
