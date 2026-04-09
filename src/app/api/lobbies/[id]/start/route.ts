import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types/supabase'
import type { GameState } from '@/lib/game/types'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lobbyId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify host
  const { data: lobby } = await supabase
    .from('game_lobbies')
    .select('*')
    .eq('id', lobbyId)
    .eq('host_user_id', user.id)
    .eq('status', 'waiting')
    .single()

  if (!lobby) return NextResponse.json({ error: 'Not host or lobby not found' }, { status: 404 })

  // Get players
  const { data: players } = await supabase
    .from('game_players')
    .select('*')
    .eq('lobby_id', lobbyId)
    .order('seat_position')

  if (!players || players.length !== 2) {
    return NextResponse.json({ error: 'Need exactly 2 players' }, { status: 400 })
  }

  if (!players.every((p) => p.ready)) {
    return NextResponse.json({ error: 'All players must be ready' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Build decks for each player
  const playerStates: Record<string, GameState['players'][string]> = {}
  let instanceCounter = 0

  for (const player of players) {
    const { data: deckCards } = await admin
      .from('deck_cards')
      .select('card_id, quantity, board, card:cards!card_id(*)')
      .eq('deck_id', player.deck_id)

    const library: string[] = []
    const commandZone: { instanceId: string; cardId: number }[] = []

    for (const dc of deckCards ?? []) {
      if (!dc.card) continue
      const card = dc.card as unknown as { id: number }

      if (dc.board === 'commander') {
        const iid = `ci-${++instanceCounter}`
        commandZone.push({ instanceId: iid, cardId: card.id })
      } else if (dc.board === 'main') {
        for (let i = 0; i < dc.quantity; i++) {
          library.push(`ci-${++instanceCounter}`)
        }
      }
    }

    // Shuffle library
    for (let i = library.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [library[i], library[j]] = [library[j], library[i]]
    }

    // Draw 7
    const hand = library.splice(0, 7)

    playerStates[player.user_id] = {
      life: 20,
      library,
      libraryCount: library.length,
      hand,
      handCount: hand.length,
      battlefield: [],
      graveyard: [],
      exile: [],
      commandZone,
    }
  }

  // Coin flip
  const firstPlayerIdx = Math.random() < 0.5 ? 0 : 1
  const firstPlayerId = players[firstPlayerIdx].user_id

  await admin.from('game_players').update({ is_first: true }).eq('user_id', firstPlayerId).eq('lobby_id', lobbyId)
  await admin.from('game_players').update({ is_first: false }).eq('user_id', players[1 - firstPlayerIdx].user_id).eq('lobby_id', lobbyId)

  const initialState: GameState = {
    turn: 1,
    phase: 'untap',
    activePlayerId: firstPlayerId,
    priorityPlayerId: firstPlayerId,
    firstPlayerId,
    combat: { phase: null, attackers: [], blockers: [], damageAssigned: false },
    players: playerStates,
    lastActionSeq: 0,
  }

  // Create game state
  await admin.from('game_states').insert({
    lobby_id: lobbyId,
    state_data: initialState as unknown as Json,
    turn_number: 1,
    active_player_id: firstPlayerId,
    phase: 'untap',
  })

  // Update lobby status
  await admin.from('game_lobbies').update({ status: 'playing', started_at: new Date().toISOString() }).eq('id', lobbyId)

  // First log entry
  await admin.from('game_log').insert({
    lobby_id: lobbyId,
    seq: 1,
    player_id: null,
    action: 'game_start',
    data: { firstPlayerId },
    text: `Game started. ${players[firstPlayerIdx].user_id === user.id ? 'You go' : 'Opponent goes'} first.`,
  })

  return NextResponse.json({ started: true, firstPlayerId })
}
