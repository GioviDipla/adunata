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
  // Every failure branch below logs with enough context to diagnose from
  // the Vercel function tail when a user reports a silent failure — the
  // Supabase error object serialized includes the message, code, and hint.
  const fail = (step: string, status: number, err: unknown, fallback: string) => {
    const message =
      (err as { message?: string } | null | undefined)?.message ?? fallback
    console.error(`[/api/lobbies/invite] ${step} failed`, {
      from: user.id,
      to: toUserId,
      deckId,
      error: err,
    })
    return NextResponse.json({ error: `${step}: ${message}` }, { status })
  }

  const { data: deck, error: deckErr } = await supabase
    .from('decks').select('id, format').eq('id', deckId).eq('user_id', user.id).single()
  if (deckErr || !deck) return fail('deck lookup', 404, deckErr, 'Deck not found')

  // Verify the recipient exists and has a profile (community membership)
  const { data: target, error: targetErr } = await supabase
    .from('profiles').select('id').eq('id', toUserId).single()
  if (targetErr || !target) return fail('recipient lookup', 404, targetErr, 'Recipient not found')

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
  if (lobbyErr || !lobby) return fail('lobby insert', 500, lobbyErr, 'Lobby creation failed')

  const { error: playerErr } = await supabase.from('game_players').insert({
    lobby_id: lobby.id, user_id: user.id, deck_id: deckId, seat_position: 1,
  })
  if (playerErr) {
    // Clean up orphan lobby so we don't leave empty rows littering the table.
    await supabase.from('game_lobbies').delete().eq('id', lobby.id)
    return fail('player insert', 500, playerErr, 'Could not seat sender')
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
    return fail('invitation insert', 500, inviteErr, 'Invitation failed')
  }

  console.log('[/api/lobbies/invite] sent', {
    invitationId: invitation.id,
    lobbyId: lobby.id,
    from: user.id,
    to: toUserId,
  })
  return NextResponse.json({ lobby, invitation }, { status: 201 })
}
