import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { GameState, CardMap, LogEntry } from '@/lib/game/types'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lobbyId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify user is a player in this lobby
  const { data: myPlayer } = await supabase
    .from('game_players')
    .select('id, user_id, deck_id')
    .eq('lobby_id', lobbyId)
    .eq('user_id', user.id)
    .single()

  if (!myPlayer) {
    return NextResponse.json({ error: 'Not a player in this game' }, { status: 403 })
  }

  // Get game state
  const { data: gameStateRow } = await supabase
    .from('game_states')
    .select('*')
    .eq('lobby_id', lobbyId)
    .single()

  if (!gameStateRow) {
    return NextResponse.json({ error: 'Game not started' }, { status: 404 })
  }

  const gameState = gameStateRow.state_data as unknown as GameState

  // Get both players (ordered by seat_position — same order used in start route)
  const { data: players } = await supabase
    .from('game_players')
    .select('user_id, deck_id, seat_position, is_first')
    .eq('lobby_id', lobbyId)
    .order('seat_position')

  if (!players || players.length !== 2) {
    return NextResponse.json({ error: 'Invalid player data' }, { status: 500 })
  }

  // Build card map by replicating the start route's instanceId assignment.
  // The start route iterates players in seat_position order, then deck_cards
  // (commanders first, then main), assigning ci-1, ci-2, ... sequentially.
  const admin = createAdminClient()
  const cardMap: CardMap = {}
  let globalCounter = 0

  for (const player of players) {
    const { data: deckCards } = await admin
      .from('deck_cards')
      .select('card_id, quantity, board, card:cards!card_id(*)')
      .eq('deck_id', player.deck_id)

    if (!deckCards) continue

    // Build cardId → card data lookup
    const cardDataById: Record<number, {
      name: string
      imageSmall: string | null
      imageNormal: string | null
      typeLine: string
      manaCost: string | null
      power: string | null
      toughness: string | null
      oracleText: string | null
    }> = {}

    for (const dc of deckCards) {
      if (!dc.card) continue
      const card = dc.card as unknown as {
        id: number
        name: string
        image_small: string | null
        image_normal: string | null
        type_line: string
        mana_cost: string | null
        power: string | null
        toughness: string | null
        oracle_text: string | null
      }
      cardDataById[card.id] = {
        name: card.name,
        imageSmall: card.image_small,
        imageNormal: card.image_normal,
        typeLine: card.type_line,
        manaCost: card.mana_cost,
        power: card.power,
        toughness: card.toughness,
        oracleText: card.oracle_text,
      }
    }

    // Replicate start route's instanceId assignment to map every instanceId → cardId
    for (const dc of deckCards) {
      if (!dc.card) continue
      const card = dc.card as unknown as { id: number }
      const data = cardDataById[card.id]
      if (!data) continue

      if (dc.board === 'commander') {
        const iid = `ci-${++globalCounter}`
        cardMap[iid] = { cardId: card.id, ...data }
      } else if (dc.board === 'main') {
        for (let i = 0; i < dc.quantity; i++) {
          const iid = `ci-${++globalCounter}`
          cardMap[iid] = { cardId: card.id, ...data }
        }
      }
    }
  }

  // Get game log
  const { data: logRows } = await supabase
    .from('game_log')
    .select('*')
    .eq('lobby_id', lobbyId)
    .order('seq', { ascending: true })

  const log: LogEntry[] = (logRows ?? []).map((row) => ({
    id: row.id,
    seq: row.seq,
    playerId: row.player_id,
    action: row.action,
    data: row.data as Record<string, unknown> | null,
    text: row.text,
    createdAt: row.created_at,
  }))

  // Build players info with display names
  const playerNames: Record<string, string> = {}
  for (const p of players) {
    const { data: userData } = await admin.auth.admin.getUserById(p.user_id)
    const email = userData?.user?.email ?? 'Player'
    // Use part before @ as display name
    playerNames[p.user_id] = email.split('@')[0]
  }

  const playersInfo = players.map((p) => ({
    userId: p.user_id,
    seatPosition: p.seat_position,
    isFirst: p.is_first,
    displayName: playerNames[p.user_id],
  }))

  return NextResponse.json({
    gameState,
    players: playersInfo,
    cardMap,
    log,
    myUserId: user.id,
    playerNames,
  })
}
