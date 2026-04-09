import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous chars
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { deckId, format } = await request.json()
  if (!deckId) return NextResponse.json({ error: 'deckId required' }, { status: 400 })

  // Verify deck ownership
  const { data: deck } = await supabase.from('decks').select('id, format').eq('id', deckId).eq('user_id', user.id).single()
  if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 })

  const lobbyCode = generateCode()

  const { data: lobby, error } = await supabase.from('game_lobbies').insert({
    host_user_id: user.id,
    lobby_code: lobbyCode,
    format: format || deck.format,
    status: 'waiting',
    max_players: 2,
  }).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Add host as first player
  await supabase.from('game_players').insert({
    lobby_id: lobby.id,
    user_id: user.id,
    deck_id: deckId,
    seat_position: 1,
  })

  return NextResponse.json({ lobby }, { status: 201 })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: lobbies } = await supabase
    .from('game_players')
    .select('lobby:game_lobbies!lobby_id(*)')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ lobbies: lobbies?.map((l) => l.lobby).filter(Boolean) ?? [] })
}
