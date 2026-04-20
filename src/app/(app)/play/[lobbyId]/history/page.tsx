import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import { GAME_LOG_COLUMNS, CARD_GAME_COLUMNS } from '@/lib/supabase/columns'
import GameHistoryView from '@/components/play/GameHistoryView'
import type { CardMap, LogEntry } from '@/lib/game/types'
import { toCardMapEntry } from '@/lib/game/card-map'

export default async function GameHistoryPage({
  params,
}: {
  params: Promise<{ lobbyId: string }>
}) {
  const { lobbyId } = await params
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const admin = createAdminClient()

  // Verify user is participant
  const { data: myPlayer } = await supabase
    .from('game_players')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!myPlayer) redirect('/play')

  // Fetch lobby metadata
  const { data: lobby } = await supabase
    .from('game_lobbies')
    .select('id, name, lobby_code, status, winner_id, started_at, updated_at')
    .eq('id', lobbyId)
    .single()

  if (!lobby || lobby.status !== 'finished') redirect('/play')

  // Fetch players
  const { data: players } = await supabase
    .from('game_players')
    .select('user_id, deck_id, seat_position, is_first')
    .eq('lobby_id', lobbyId)
    .order('seat_position')

  // Build player names
  const playerNames: Record<string, string> = {}
  for (const p of players ?? []) {
    const { data: userData } = await admin.auth.admin.getUserById(p.user_id)
    playerNames[p.user_id] = userData?.user?.email?.split('@')[0] ?? 'Player'
  }

  // Build cardMap (same logic as GET /api/game/[id])
  const cardMap: CardMap = {}
  let globalCounter = 0

  for (const player of players ?? []) {
    const { data: deckCards } = await admin
      .from('deck_cards')
      .select(`card_id, quantity, board, card:cards!card_id(${CARD_GAME_COLUMNS})`)
      .eq('deck_id', player.deck_id)

    if (!deckCards) continue

    const commanderCardIds = new Set<number>()
    for (const dc of deckCards) {
      if (dc.board === 'commander' && dc.card) commanderCardIds.add((dc.card as unknown as { id: number }).id)
    }

    type CardGameRow = Parameters<typeof toCardMapEntry>[1] & { id: number }
    for (const dc of deckCards) {
      if (!dc.card) continue
      const card = dc.card as unknown as CardGameRow

      if (dc.board === 'commander') {
        const iid = `ci-${++globalCounter}`
        cardMap[iid] = toCardMapEntry(card.id, card, { isCommander: true, isToken: false })
      } else if (dc.board === 'main') {
        for (let i = 0; i < dc.quantity; i++) {
          const iid = `ci-${++globalCounter}`
          cardMap[iid] = toCardMapEntry(card.id, card, { isCommander: commanderCardIds.has(card.id), isToken: false })
        }
      }
    }
  }

  // Fetch full game log
  const { data: logRows } = await supabase
    .from('game_log')
    .select(GAME_LOG_COLUMNS)
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

  return (
    <GameHistoryView
      gameName={lobby.name ?? lobby.lobby_code}
      winnerId={lobby.winner_id}
      playerNames={playerNames}
      userId={user.id}
      log={log}
      cardMap={cardMap}
      startedAt={lobby.started_at}
      finishedAt={lobby.updated_at}
    />
  )
}
