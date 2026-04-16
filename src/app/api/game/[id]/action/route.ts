import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyAction } from '@/lib/game/engine'
import type { GameState, GameAction } from '@/lib/game/types'
import type { Json } from '@/types/supabase'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const { id: lobbyId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify user is a player in this lobby
  const { data: myPlayer } = await supabase
    .from('game_players')
    .select('id, user_id')
    .eq('lobby_id', lobbyId)
    .eq('user_id', user.id)
    .single()

  if (!myPlayer) {
    return NextResponse.json({ error: 'Not a player in this game' }, { status: 403 })
  }

  const action: GameAction = await request.json()

  // Ensure action.playerId matches authenticated user
  if (action.playerId !== user.id) {
    return NextResponse.json({ error: 'Player ID mismatch' }, { status: 403 })
  }

  const admin = createAdminClient()

  // Get current game state
  const { data: gameStateRow } = await admin
    .from('game_states')
    .select('*')
    .eq('lobby_id', lobbyId)
    .single()

  if (!gameStateRow) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }

  const currentState = gameStateRow.state_data as unknown as GameState

  // Handle concede
  if (action.type === 'concede') {
    const playerIds = Object.keys(currentState.players)
    const winnerId = playerIds.find((id) => id !== user.id)!

    // Auto-generate game name
    const { data: gamePlayers } = await admin
      .from('game_players')
      .select('user_id, deck_id, seat_position')
      .eq('lobby_id', lobbyId)
      .order('seat_position')

    let gameName = `Game ${lobbyId.slice(0, 6)}`
    if (gamePlayers && gamePlayers.length >= 2) {
      const parts: string[] = []
      for (const p of gamePlayers) {
        const { data: userData } = await admin.auth.admin.getUserById(p.user_id)
        const pName = userData?.user?.email?.split('@')[0] ?? 'Player'
        const { data: deck } = await admin.from('decks').select('name').eq('id', p.deck_id).single()
        parts.push(`${deck?.name ?? 'Unknown'} — ${pName}`)
      }
      const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      gameName = `${parts[0]} vs ${parts[1]} — ${date}`
    }

    // Update lobby with winner and finished status
    await admin
      .from('game_lobbies')
      .update({ winner_id: winnerId, status: 'finished', name: gameName })
      .eq('id', lobbyId)

    // Append concede to game log
    const newSeq = currentState.lastActionSeq + 1
    await admin.from('game_log').insert({
      lobby_id: lobbyId,
      seq: newSeq,
      player_id: user.id,
      action: 'concede',
      data: { winnerId } as unknown as Json,
      text: action.text || 'Player conceded.',
    })

    // Update state seq
    const updatedState: GameState = {
      ...currentState,
      lastActionSeq: newSeq,
    }

    await admin
      .from('game_states')
      .update({
        state_data: updatedState as unknown as Json,
      })
      .eq('id', gameStateRow.id)

    return NextResponse.json({ state: updatedState, seq: newSeq, conceded: true, winnerId })
  }

  // Log-only actions (no state change)
  if (action.type === 'library_view' || action.type === 'peak' || action.type === 'chat_message') {
    const newSeq = currentState.lastActionSeq + 1
    const updatedState = { ...currentState, lastActionSeq: newSeq }
    await admin.rpc('process_game_action', {
      p_lobby_id: lobbyId,
      p_player_id: action.playerId,
      p_action: action.type,
      p_action_data: (action.data as Json) ?? null,
      p_action_text: action.text,
      p_action_seq: newSeq,
      p_new_state: updatedState as unknown as Json,
      p_turn_number: updatedState.turn ?? currentState.turn,
      p_active_player_id: updatedState.activePlayerId ?? currentState.activePlayerId,
      p_phase: updatedState.phase ?? currentState.phase,
      p_log_type: action.type === 'chat_message' ? 'chat' : 'action',
    })
    return NextResponse.json({ state: updatedState, seq: newSeq })
  }

  // Apply action with optimistic concurrency control (retry on stale state)
  let retries = 0
  let stateToProcess = currentState
  while (retries < 3) {
    const expectedSeq = stateToProcess.lastActionSeq

    // Apply action through the engine
    let newState = applyAction(stateToProcess, action)

    // Auto-pass loop: chain pass_priority for players with autoPass enabled
    let autoPassCount = 0
    while (
      autoPassCount < 50 &&
      newState.priorityPlayerId &&
      newState.players[newState.priorityPlayerId]?.autoPass &&
      !newState.pendingCommanderChoice &&
      !newState.mulliganStage &&
      !newState.players[newState.priorityPlayerId]?.revealedCards
    ) {
      newState = applyAction(newState, {
        type: 'pass_priority',
        playerId: newState.priorityPlayerId,
        data: {},
        text: 'Auto-pass',
      })
      autoPassCount++
    }

    // Batch log insert + state update via RPC with OCC check
    const { data: rpcResult, error: rpcError } = await admin.rpc('process_game_action', {
      p_lobby_id: lobbyId,
      p_player_id: action.playerId,
      p_action: action.type,
      p_action_data: (action.data ?? null) as Json,
      p_action_text: action.text,
      p_action_seq: newState.lastActionSeq,
      p_new_state: newState as unknown as Json,
      p_turn_number: newState.turn,
      p_active_player_id: newState.activePlayerId,
      p_phase: newState.phase,
      p_expected_seq: expectedSeq,
    })

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }

    // Check for stale state conflict
    const result = rpcResult as { error?: string; ok?: boolean } | null
    if (result?.error === 'stale_state') {
      // Re-read fresh state and retry
      const { data: freshRow } = await admin
        .from('game_states')
        .select('*')
        .eq('lobby_id', lobbyId)
        .single()
      if (!freshRow) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
      stateToProcess = freshRow.state_data as unknown as GameState
      retries++
      continue
    }

    return NextResponse.json({ state: newState, seq: newState.lastActionSeq })
  }

  return NextResponse.json({ error: 'Action conflict, please retry' }, { status: 409 })
  } catch (err) {
    console.error('[action route crash]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
