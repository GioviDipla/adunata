import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: decks, error } = await supabase
    .from('decks')
    .select(`
      *,
      cover_card:cards!cover_card_id(id, name, image_small, image_normal, image_art_crop),
      deck_cards(quantity)
    `)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const decksWithCount = (decks ?? []).map((deck) => ({
    ...deck,
    card_count: (deck.deck_cards as { quantity: number }[])?.reduce(
      (sum: number, dc: { quantity: number }) => sum + dc.quantity,
      0
    ) ?? 0,
  }))

  return NextResponse.json({ decks: decksWithCount })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, description, format } = body

  if (!name || !format) {
    return NextResponse.json(
      { error: 'Name and format are required' },
      { status: 400 }
    )
  }

  const { data: deck, error } = await supabase
    .from('decks')
    .insert({
      user_id: user.id,
      name,
      description: description || null,
      format,
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ deck }, { status: 201 })
}
