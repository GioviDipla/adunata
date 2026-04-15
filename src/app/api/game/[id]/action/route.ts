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

    // Update lobby with winner and finished status
    await admin
      .from('game_lobbies')
      .update({ winner_id: winnerId, status: 'finished' })
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
  if (action.type === 'library_view' || action.type === 'peak') {
    const newSeq = currentState.lastActionSeq + 1
    const updatedState = { ...currentState, lastActionSeq: newSeq }
    await admin.from('game_log').insert({
      lobby_id: lobbyId, seq: newSeq, player_id: action.playerId,
      action: action.type, data: (action.data as Json) ?? null, text: action.text,
    })
    await admin.from('game_states').update({
      state_data: updatedState as unknown as Json, updated_at: new Date().toISOString(),
    }).eq('id', gameStateRow.id)
    return NextResponse.json({ state: updatedState, seq: newSeq })
  }

  // Apply action through the engine
  let newState = applyAction(currentState, action)

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
    const autoAction: GameAction = {
      type: 'pass_priority',
      playerId: newState.priorityPlayerId,
      data: {},
      text: 'Auto-pass',
    }
    newState = applyAction(newState, autoAction)
    autoPassCount++
  }

  // Append to game log
  await admin.from('game_log').insert({
    lobby_id: lobbyId,
    seq: newState.lastActionSeq,
    player_id: action.playerId,
    action: action.type,
    data: (action.data as Json) ?? null,
    text: action.text,
  })

  // Update game state
  await admin
    .from('game_states')
    .update({
      state_data: newState as unknown as Json,
      turn_number: newState.turn,
      active_player_id: newState.activePlayerId,
      phase: newState.phase,
      updated_at: new Date().toISOString(),
    })
    .eq('id', gameStateRow.id)

  return NextResponse.json({ state: newState, seq: newState.lastActionSeq })
}
