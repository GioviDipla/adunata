import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { LOBBY_LIST_COLUMNS } from '@/lib/supabase/columns'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code, deckId } = await request.json()
  if (!code || !deckId) return NextResponse.json({ error: 'code and deckId required' }, { status: 400 })

  // Find lobby — need host_user_id + max_players below
  const { data: lobby } = await supabase
    .from('game_lobbies')
    .select(`${LOBBY_LIST_COLUMNS}, host_user_id, max_players`)
    .eq('lobby_code', code.toUpperCase())
    .eq('status', 'waiting')
    .single()

  if (!lobby) return NextResponse.json({ error: 'Lobby not found or already started' }, { status: 404 })
  if (lobby.host_user_id === user.id) return NextResponse.json({ error: 'Cannot join your own lobby' }, { status: 400 })

  // Check not already joined
  const { data: existing } = await supabase
    .from('game_players')
    .select('id')
    .eq('lobby_id', lobby.id)
    .eq('user_id', user.id)
    .single()

  if (existing) return NextResponse.json({ error: 'Already in this lobby' }, { status: 400 })

  // Check player count
  const { count } = await supabase
    .from('game_players')
    .select('id', { count: 'exact', head: true })
    .eq('lobby_id', lobby.id)

  if ((count ?? 0) >= lobby.max_players) return NextResponse.json({ error: 'Lobby is full' }, { status: 400 })

  // Verify deck ownership
  const { data: deck } = await supabase.from('decks').select('id').eq('id', deckId).eq('user_id', user.id).single()
  if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 })

  // Join
  const { error } = await supabase.from('game_players').insert({
    lobby_id: lobby.id,
    user_id: user.id,
    deck_id: deckId,
    seat_position: 2,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ lobby })
}
