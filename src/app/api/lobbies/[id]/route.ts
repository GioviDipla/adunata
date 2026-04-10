import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types/supabase'

// Thin local alias — we only read lastActionSeq from the state blob here,
// so we don't need to pull in the full GameState type.
type GameStateLike = { lastActionSeq?: number } & Record<string, unknown>

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

  // Idempotent: already finished → nothing to do.
  if (lobby.status === 'finished') {
    return NextResponse.json({ status: 'finished', noop: true })
  }

  const admin = createAdminClient()

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
    const { error: lobbyErr } = await admin
      .from('game_lobbies')
      .update({ status: 'finished', winner_id: opponentId })
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
