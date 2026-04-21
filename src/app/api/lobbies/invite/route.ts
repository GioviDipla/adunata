import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

/**
 * Send a 1v1 invitation to another user.
 *
 * In one shot: creates the lobby (sender as host/player 1 with their
 * chosen deck) and the `lobby_invitations` row addressed to the
 * recipient. The sender is then expected to navigate to the waiting
 * room; the recipient sees the invite pop up in /play via Realtime.
 *
 * Body: `{ toUserId: string; deckId: string }`
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { toUserId, deckId } = await request.json()
  if (!toUserId || !deckId) {
    return NextResponse.json({ error: 'toUserId and deckId required' }, { status: 400 })
  }
  if (toUserId === user.id) {
    return NextResponse.json({ error: 'You cannot invite yourself' }, { status: 400 })
  }

  // Verify deck ownership and grab its format
  const { data: deck } = await supabase
    .from('decks').select('id, format').eq('id', deckId).eq('user_id', user.id).single()
  if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 })

  // Verify the recipient exists and has a profile (community membership)
  const { data: target } = await supabase
    .from('profiles').select('id').eq('id', toUserId).single()
  if (!target) return NextResponse.json({ error: 'Recipient not found' }, { status: 404 })

  const { data: lobby, error: lobbyErr } = await supabase
    .from('game_lobbies').insert({
      host_user_id: user.id,
      lobby_code: generateCode(),
      format: deck.format,
      status: 'waiting',
      max_players: 2,
    })
    .select('id, lobby_code, format, status, max_players, host_user_id')
    .single()
  if (lobbyErr || !lobby) {
    return NextResponse.json({ error: lobbyErr?.message ?? 'Lobby creation failed' }, { status: 500 })
  }

  const { error: playerErr } = await supabase.from('game_players').insert({
    lobby_id: lobby.id, user_id: user.id, deck_id: deckId, seat_position: 1,
  })
  if (playerErr) {
    // Clean up orphan lobby so we don't leave empty rows littering the table.
    await supabase.from('game_lobbies').delete().eq('id', lobby.id)
    return NextResponse.json({ error: playerErr.message }, { status: 500 })
  }

  const { data: invitation, error: inviteErr } = await supabase
    .from('lobby_invitations').insert({
      lobby_id: lobby.id, from_user_id: user.id, to_user_id: toUserId, status: 'pending',
    })
    .select('id, lobby_id, from_user_id, to_user_id, status, created_at')
    .single()
  if (inviteErr || !invitation) {
    // Same cleanup — the lobby exists only to host this invite.
    await supabase.from('game_lobbies').delete().eq('id', lobby.id)
    return NextResponse.json({ error: inviteErr?.message ?? 'Invitation failed' }, { status: 500 })
  }

  return NextResponse.json({ lobby, invitation }, { status: 201 })
}
