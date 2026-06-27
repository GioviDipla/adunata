import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyAction } from '@/lib/game/engine'
import { ActionRejectedError } from '@/lib/game/errors'
import { GAME_STATE_COLUMNS, CARD_GAME_COLUMNS } from '@/lib/supabase/columns'
import type { GameState, GameAction, CardMap } from '@/lib/game/types'
import type { Json } from '@/types/supabase'
import { botDecideActionHeuristic, needsAIDecision } from '@/lib/game/smart-bot'
import { generateGoblinAIText, GoblinAINotConfiguredError } from '@/lib/goblinai/deepseek'
import { BOT_SYSTEM_PROMPT, parseBotResponse } from '@/lib/goblinai/bot-prompt'
import { buildBotPrompt } from '@/lib/goblinai/bot-context'
import { toCardMapEntry } from '@/lib/game/card-map'

async function buildCardMap(lobbyId: string, admin: ReturnType<typeof createAdminClient>): Promise<CardMap> {
  const { data: players } = await admin
    .from('game_players')
    .select('user_id, deck_id')
    .eq('lobby_id', lobbyId)
  const cardMap: CardMap = {}
  let globalCounter = 0
  if (!players) return cardMap
  type CardGameRow = Parameters<typeof toCardMapEntry>[1] & { id: number }
  for (const player of players) {
    const { data: deckCards } = await admin
      .from('deck_cards')
      .select(`card_id, quantity, board, card:cards!card_id(${CARD_GAME_COLUMNS})`)
      .eq('deck_id', player.deck_id)
    if (!deckCards) continue
    for (const dc of deckCards) {
      if (!dc.card) continue
      const card = dc.card as unknown as CardGameRow
      if (dc.board === 'commander') {
        cardMap[`ci-${++globalCounter}`] = toCardMapEntry(card.id, card, { isCommander: true, isToken: false })
      } else if (dc.board === 'main') {
        for (let i = 0; i < dc.quantity; i++) {
          cardMap[`ci-${++globalCounter}`] = toCardMapEntry(card.id, card, { isCommander: false, isToken: false })
        }
      }
    }
  }
  return cardMap
}

/** Runs the bot's turn server-side. Returns the full logs + final state. */
async function runBotTurn(
  lobbyId: string,
  botId: string,
  state: GameState,
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ state: GameState; logEntries: Array<{ seq: number; playerId: string | null; action: string; data: Json; text: string }> }> {
  const cardMap = await buildCardMap(lobbyId, admin)
  let s = state
  const logEntries: Array<{ seq: number; playerId: string | null; action: string; data: Json; text: string }> = []
  let iterations = 0

  while (iterations < 100) {
    // Mulligan: auto-keep
    if (s.mulliganStage) {
      const botDecision = s.mulliganStage.playerDecisions[botId]
      if (botDecision && !botDecision.decided) {
        s = applyAction(s, { type: 'keep_hand', playerId: botId, data: {}, text: '' })
        logEntries.push({ seq: s.lastActionSeq, playerId: botId, action: 'keep_hand', data: {} as Json, text: 'GoblinAI keeps hand.' })
        iterations++; continue
      }
    }

    // Bot priority
    if (s.priorityPlayerId === botId) {
      const heuristicAction = botDecideActionHeuristic(s, botId, cardMap)
      if (heuristicAction) {
        s = applyAction(s, heuristicAction)
        logEntries.push({ seq: s.lastActionSeq, playerId: botId, action: heuristicAction.type, data: (heuristicAction.data ?? {}) as Json, text: heuristicAction.text || '' })
        iterations++; continue
      }

      // AI decision
      if (needsAIDecision(s, botId, cardMap)) {
        try {
          const gamePrompt = buildBotPrompt(s, botId, cardMap)
          const { text } = await generateGoblinAIText({ system: BOT_SYSTEM_PROMPT, prompt: gamePrompt, temperature: 0.4 })
          const parsed = parseBotResponse(text, botId)
          if (parsed) {
            const bp = s.players[botId]
            const oppId = Object.keys(s.players).find((pid) => pid !== botId) ?? ''
            let aiAction: GameAction | null = null
            switch (parsed.action) {
              case 'play_card': {
                const iid = parsed.instanceId
                if (iid && bp.hand.includes(iid)) {
                  const card = cardMap[iid]
                  const isInstantOrSorcery = (card?.typeLine?.toLowerCase() ?? '').includes('instant') || (card?.typeLine?.toLowerCase() ?? '').includes('sorcery')
                  aiAction = { type: 'play_card', playerId: botId, data: { instanceId: iid, cardId: card?.cardId ?? 0, from: 'hand', to: isInstantOrSorcery ? 'graveyard' : 'battlefield', isCommander: card?.isCommander ?? false, isToken: false }, text: `GoblinAI casts ${card?.name ?? 'a card'}.` }
                }
                break
              }
              case 'declare_attackers': {
                const ids = (parsed.attackerIds ?? []).filter((id: string) => bp.battlefield.some((c) => c.instanceId === id && !c.tapped))
                aiAction = { type: 'declare_attackers', playerId: botId, data: { attackerIds: ids, targetPlayerId: oppId }, text: `GoblinAI attacks with ${ids.length} creature${ids.length !== 1 ? 's' : ''}.` }
                break
              }
              case 'declare_blockers': {
                const valid = new Set(bp.battlefield.filter((c) => !c.tapped).map((c) => c.instanceId))
                const assignments = (parsed.blockerAssignments ?? []).filter((b: { blockerId: string }) => valid.has(b.blockerId))
                aiAction = { type: 'declare_blockers', playerId: botId, data: { blockerAssignments: assignments }, text: `GoblinAI blocks with ${assignments.length} creature${assignments.length !== 1 ? 's' : ''}.` }
                break
              }
            }
            if (aiAction) {
              s = applyAction(s, aiAction)
              logEntries.push({ seq: s.lastActionSeq, playerId: botId, action: aiAction.type, data: (aiAction.data ?? {}) as Json, text: aiAction.text || '' })
              iterations++; continue
            }
          }
        } catch (err) { if (!(err instanceof GoblinAINotConfiguredError)) console.error('[Bot AI]', err) }
      }

      // Fallback: pass
      s = applyAction(s, { type: 'pass_priority', playerId: botId, data: {}, text: '' })
      iterations++; continue
    }

    // Auto-pass for human during bot's turn
    if (s.activePlayerId === botId && s.priorityPlayerId !== botId) {
      s = applyAction(s, { type: 'pass_priority', playerId: s.priorityPlayerId, data: {}, text: '' })
      iterations++; continue
    }

    // Auto-pass for human during own end_step/cleanup
    if (s.activePlayerId !== botId && s.priorityPlayerId !== botId && (s.phase === 'end_step' || s.phase === 'cleanup')) {
      s = applyAction(s, { type: 'pass_priority', playerId: s.priorityPlayerId, data: {}, text: '' })
      iterations++; continue
    }

    break
  }

  return { state: s, logEntries }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const { id: lobbyId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: myPlayer } = await supabase
    .from('game_players').select('id, user_id').eq('lobby_id', lobbyId).eq('user_id', user.id).single()
  if (!myPlayer) return NextResponse.json({ error: 'Not a player in this game' }, { status: 403 })

  const action: GameAction = await request.json()
  if (action.playerId !== user.id) return NextResponse.json({ error: 'Player ID mismatch' }, { status: 403 })

  const admin = createAdminClient()

  const { data: gameStateRow } = await admin
    .from('game_states').select(GAME_STATE_COLUMNS).eq('lobby_id', lobbyId).single()
  if (!gameStateRow) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  const currentState = gameStateRow.state_data as unknown as GameState

  // Check if bot is in this game (botUserId stored in game state during lobby creation)
  const botUserId = (currentState as GameState & { botUserId?: string }).botUserId ?? null

  // Handle concede
  if (action.type === 'concede') {
    const playerIds = Object.keys(currentState.players)
    const winnerId = playerIds.find((id) => id !== user.id)!
    const { data: gamePlayers } = await admin.from('game_players').select('user_id, deck_id, seat_position').eq('lobby_id', lobbyId).order('seat_position')
    let gameName = `Game ${lobbyId.slice(0, 6)}`
    if (gamePlayers && gamePlayers.length >= 2) {
      const parts: string[] = []
      for (const p of gamePlayers) {
        const { data: userData } = botUserId === p.user_id ? { data: { user: { email: 'goblinai@adunata.local' } } } : await admin.auth.admin.getUserById(p.user_id)
        const pName = userData?.user?.email?.split('@')[0] ?? 'Player'
        const { data: deck } = await admin.from('decks').select('name').eq('id', p.deck_id).single()
        parts.push(`${deck?.name ?? 'Unknown'} — ${pName}`)
      }
      const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      gameName = `${parts[0]} vs ${parts[1]} — ${date}`
    }
    await admin.from('game_lobbies').update({ winner_id: winnerId, status: 'finished', name: gameName }).eq('id', lobbyId)
    const newSeq = currentState.lastActionSeq + 1
    await admin.from('game_log').insert({ lobby_id: lobbyId, seq: newSeq, player_id: user.id, action: 'concede', data: { winnerId } as unknown as Json, text: action.text || 'Player conceded.' })
    const updatedState: GameState = { ...currentState, lastActionSeq: newSeq }
    await admin.from('game_states').update({ state_data: updatedState as unknown as Json }).eq('id', gameStateRow.id)
    return NextResponse.json({ state: updatedState, seq: newSeq, conceded: true, winnerId })
  }

  // Log-only actions
  if (action.type === 'library_view' || action.type === 'peak' || action.type === 'chat_message') {
    const newSeq = currentState.lastActionSeq + 1
    const updatedState = { ...currentState, lastActionSeq: newSeq }
    await admin.rpc('process_game_action', {
      p_lobby_id: lobbyId, p_player_id: action.playerId, p_action: action.type,
      p_action_data: (action.data as Json) ?? null, p_action_text: action.text,
      p_action_seq: newSeq, p_new_state: updatedState as unknown as Json,
      p_turn_number: updatedState.turn, p_active_player_id: updatedState.activePlayerId,
      p_phase: updatedState.phase, p_log_type: action.type === 'chat_message' ? 'chat' : 'action',
    })
    return NextResponse.json({ state: updatedState, seq: newSeq })
  }

  // Apply action with OCC
  let retries = 0
  let stateToProcess = currentState
  while (retries < 3) {
    const expectedSeq = stateToProcess.lastActionSeq
    let newState: GameState
    try { newState = applyAction(stateToProcess, action) }
    catch (e) { if (e instanceof ActionRejectedError) return NextResponse.json({ error: e.code, meta: e.meta ?? null }, { status: 409 }); throw e }

    // Save the human's action seq BEFORE bot processing overwrites it
    const humanActionSeq = newState.lastActionSeq

    // Auto-pass loop for players with autoPass enabled
    let autoPassCount = 0
    while (autoPassCount < 50 && newState.priorityPlayerId && newState.players[newState.priorityPlayerId]?.autoPass && !newState.pendingCommanderChoice && !newState.mulliganStage && !newState.players[newState.priorityPlayerId]?.revealedCards) {
      newState = applyAction(newState, { type: 'pass_priority', playerId: newState.priorityPlayerId, data: {}, text: 'Auto-pass' })
      autoPassCount++
    }

    // Bot processing: run bot's turn server-side
    if (botUserId) {
      try {
        const { state: botState, logEntries } = await runBotTurn(lobbyId, botUserId, newState, admin)
        newState = botState
        // Insert bot log entries (AFTER human's seq, BEFORE RPC updates state)
        if (logEntries.length > 0) {
          for (const le of logEntries) {
            await admin.from('game_log').insert({
              lobby_id: lobbyId, seq: le.seq, player_id: le.playerId,
              action: le.action, data: le.data, text: le.text,
            })
          }
        }
      } catch (err) { console.error('[Bot processing error]', err) }
    }

    // Save via RPC — use humanActionSeq for the log entry
    const { data: rpcResult, error: rpcError } = await admin.rpc('process_game_action', {
      p_lobby_id: lobbyId, p_player_id: action.playerId, p_action: action.type,
      p_action_data: (action.data ?? null) as Json, p_action_text: action.text,
      p_action_seq: humanActionSeq, p_new_state: newState as unknown as Json,
      p_turn_number: newState.turn, p_active_player_id: newState.activePlayerId,
      p_phase: newState.phase, p_expected_seq: expectedSeq,
    })
    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 })

    const result = rpcResult as { error?: string; ok?: boolean } | null
    if (result?.error === 'stale_state') {
      const { data: freshRow } = await admin.from('game_states').select(GAME_STATE_COLUMNS).eq('lobby_id', lobbyId).single()
      if (!freshRow) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
      stateToProcess = freshRow.state_data as unknown as GameState
      retries++; continue
    }

    return NextResponse.json({ state: newState, seq: newState.lastActionSeq })
  }

  return NextResponse.json({ error: 'Action conflict, please retry' }, { status: 409 })
  } catch (err) {
    console.error('[action route crash]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
