import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types/supabase'

// Thin local alias — we only read lastActionSeq from the state blob here,
// so we don't need to pull in the full GameState type.
type GameStateLike = { lastActionSeq?: number } & Record<string, unknown>

async function generateGameName(admin: ReturnType<typeof createAdminClient>, lobbyId: string): Promise<string> {
  const { data: players } = await admin
    .from('game_players')
    .select('user_id, deck_id, seat_position')
    .eq('lobby_id', lobbyId)
    .order('seat_position')

  if (!players || players.length < 2) return `Game ${lobbyId.slice(0, 6)}`

  const names: string[] = []
  for (const p of players) {
    const { data: userData } = await admin.auth.admin.getUserById(p.user_id)
    const playerName = userData?.user?.email?.split('@')[0] ?? 'Player'
    const { data: deck } = await admin.from('decks').select('name').eq('id', p.deck_id).single()
    const deckName = deck?.name ?? 'Unknown Deck'
    names.push(`${deckName} — ${playerName}`)
  }

  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${names[0]} vs ${names[1]} — ${date}`
}

/**
 * DELETE /api/lobbies/[id]
 *
 * Behavior depends on lobby status and the caller's role:
 * - `waiting` + caller is host → hard-delete the lobby (cascade removes
 *   game_players, game_states, and game_log).
 * - `waiting` + caller is guest → remove just the caller's game_players row.
 * - `playing` → mark as `finished`, setting the opponent as winner (same
 *   effect as the in-game concede action). Appends a concede log entry.
 * - `finished` → noop (idempotent 200).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: lobby } = await supabase
    .from('game_lobbies')
    .select('id, host_user_id, status')
    .eq('id', lobbyId)
    .single()

  if (!lobby) {
    return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
  }

  const { data: myPlayer } = await supabase
    .from('game_players')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('user_id', user.id)
    .maybeSingle()

  const isHost = lobby.host_user_id === user.id
  const isPlayer = myPlayer !== null

  if (!isHost && !isPlayer) {
    return NextResponse.json({ error: 'Not a participant in this lobby' }, { status: 403 })
  }

  const admin = createAdminClient()

  // Finished lobbies → hard-delete
  if (lobby.status === 'finished') {
    const { error } = await admin.from('game_lobbies').delete().eq('id', lobbyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: true })
  }

  // ── Waiting lobbies ──────────────────────────────────────────────────
  if (lobby.status === 'waiting') {
    if (isHost) {
      // Hard-delete the lobby; cascades remove players, game_states, game_log
      const { error } = await admin.from('game_lobbies').delete().eq('id', lobbyId)
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ deleted: true })
    }

    // Guest leaving a waiting lobby → just remove their game_players row
    const { error } = await admin
      .from('game_players')
      .delete()
      .eq('lobby_id', lobbyId)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ left: true })
  }

  // ── Playing lobbies: concede on behalf of the caller ────────────────
  if (lobby.status === 'playing') {
    const { data: allPlayers } = await admin
      .from('game_players')
      .select('user_id')
      .eq('lobby_id', lobbyId)

    const opponentId =
      allPlayers?.find((p) => p.user_id !== user.id)?.user_id ?? null

    // Mark lobby finished with opponent as winner
    const gameName = await generateGameName(admin, lobbyId)
    const { error: lobbyErr } = await admin
      .from('game_lobbies')
      .update({ status: 'finished', winner_id: opponentId, name: gameName })
      .eq('id', lobbyId)

    if (lobbyErr) {
      return NextResponse.json({ error: lobbyErr.message }, { status: 500 })
    }

    // Append a concede log entry so the game log reflects what happened
    const { data: gameStateRow } = await admin
      .from('game_states')
      .select('id, state_data')
      .eq('lobby_id', lobbyId)
      .maybeSingle()

    if (gameStateRow) {
      const state = gameStateRow.state_data as GameStateLike
      const nextSeq = (state.lastActionSeq ?? 0) + 1
      await admin.from('game_log').insert({
        lobby_id: lobbyId,
        seq: nextSeq,
        player_id: user.id,
        action: 'concede',
        data: { winnerId: opponentId } as unknown as Json,
        text: 'Player left the game.',
      })
      await admin
        .from('game_states')
        .update({
          state_data: { ...state, lastActionSeq: nextSeq } as unknown as Json,
        })
        .eq('id', gameStateRow.id)
    }

    return NextResponse.json({ conceded: true, winnerId: opponentId })
  }

  return NextResponse.json({ error: 'Invalid lobby status' }, { status: 400 })
}

/**
 * PATCH /api/lobbies/[id]
 * Rename a game. Only participants can rename.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: myPlayer } = await supabase
    .from('game_players')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!myPlayer) return NextResponse.json({ error: 'Not a participant' }, { status: 403 })

  const { name } = await request.json() as { name: string }
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('game_lobbies')
    .update({ name: name.trim() })
    .eq('id', lobbyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
