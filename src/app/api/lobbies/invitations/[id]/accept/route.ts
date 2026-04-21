import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Recipient accepts a pending invitation and joins the lobby with
 * their chosen deck. Mirrors `/api/lobbies/join` but skips the code
 * step — the invitation itself is the authorization.
 *
 * Body: `{ deckId: string }`
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { deckId } = await request.json()
  if (!deckId) return NextResponse.json({ error: 'deckId required' }, { status: 400 })

  const { data: invitation } = await supabase
    .from('lobby_invitations')
    .select('id, lobby_id, from_user_id, to_user_id, status')
    .eq('id', id)
    .single()
  if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  if (invitation.to_user_id !== user.id) {
    return NextResponse.json({ error: 'This invitation is for someone else' }, { status: 403 })
  }
  if (invitation.status !== 'pending') {
    return NextResponse.json({ error: `Invitation is ${invitation.status}` }, { status: 409 })
  }

  const { data: lobby } = await supabase
    .from('game_lobbies')
    .select('id, status, max_players')
    .eq('id', invitation.lobby_id)
    .single()
  if (!lobby) return NextResponse.json({ error: 'Lobby no longer exists' }, { status: 404 })
  if (lobby.status !== 'waiting') {
    return NextResponse.json({ error: 'Lobby already started or finished' }, { status: 409 })
  }

  const { data: deck } = await supabase
    .from('decks').select('id').eq('id', deckId).eq('user_id', user.id).single()
  if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 })

  // Guard against accepting twice (defensive — unique constraint on
  // (lobby_id, to_user_id) already blocks double invitations).
  const { data: existing } = await supabase
    .from('game_players').select('id').eq('lobby_id', lobby.id).eq('user_id', user.id).maybeSingle()
  if (!existing) {
    const { count } = await supabase
      .from('game_players').select('id', { count: 'exact', head: true })
      .eq('lobby_id', lobby.id)
    if ((count ?? 0) >= lobby.max_players) {
      return NextResponse.json({ error: 'Lobby is full' }, { status: 409 })
    }
    const { error: joinErr } = await supabase.from('game_players').insert({
      lobby_id: lobby.id, user_id: user.id, deck_id: deckId, seat_position: 2,
    })
    if (joinErr) return NextResponse.json({ error: joinErr.message }, { status: 500 })
  }

  const { error: updateErr } = await supabase
    .from('lobby_invitations')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ lobbyId: lobby.id })
}
