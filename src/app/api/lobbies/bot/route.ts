import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types/supabase'
import type { GameState } from '@/lib/game/types'

const BOT_EMAIL = 'goblinai@adunata.local'
const BOT_PASSWORD = 'goblinai-bot-internal-2026'
const BOT_ID_CACHE = new Map<string, string>() // singleton cache per process

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

async function getOrCreateBotUser(admin: ReturnType<typeof createAdminClient>): Promise<string> {
  const cached = BOT_ID_CACHE.get('bot')
  if (cached) return cached

  // Try to find existing bot user
  const { data: existing } = await admin.auth.admin.listUsers({ perPage: 100 })
  const botUser = existing?.users?.find(
    (u) => u.email === BOT_EMAIL || (u.user_metadata as Record<string, unknown>)?.bot === true
  )

  if (botUser) {
    BOT_ID_CACHE.set('bot', botUser.id)
    return botUser.id
  }

  // Create bot user
  const { data: created, error } = await admin.auth.admin.createUser({
    email: BOT_EMAIL,
    password: BOT_PASSWORD,
    email_confirm: true,
    user_metadata: { bot: true, display_name: 'GoblinAI' },
  })

  if (error) throw new Error(`Failed to create bot user: ${error.message}`)
  BOT_ID_CACHE.set('bot', created.user.id)
  return created.user.id
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { deckId } = await request.json()
  if (!deckId) return NextResponse.json({ error: 'deckId required' }, { status: 400 })

  // Verify deck ownership
  const { data: deck } = await supabase
    .from('decks')
    .select('id, format')
    .eq('id', deckId)
    .eq('user_id', user.id)
    .single()

  if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 })

  const admin = createAdminClient()

  // Get or create bot user
  const botUserId = await getOrCreateBotUser(admin)

  // Create lobby
  const lobbyCode = generateCode()
  const { data: lobby, error: lobbyErr } = await admin
    .from('game_lobbies')
    .insert({
      host_user_id: user.id,
      lobby_code: lobbyCode,
      format: deck.format,
      status: 'waiting',
      max_players: 2,
    })
    .select('id')
    .single()

  if (lobbyErr || !lobby) {
    return NextResponse.json({ error: lobbyErr?.message ?? 'Failed to create lobby' }, { status: 500 })
  }

  // Add human as player 1
  await admin.from('game_players').insert({
    lobby_id: lobby.id,
    user_id: user.id,
    deck_id: deckId,
    seat_position: 1,
    ready: true,
  })

  // Add bot as player 2 (same deck for now — cards get copied during start)
  await admin.from('game_players').insert({
    lobby_id: lobby.id,
    user_id: botUserId,
    deck_id: deckId,
    seat_position: 2,
    ready: true,
  })

  // Auto-start the game (no waiting room for bot games)
  const players = [
    { user_id: user.id, deck_id: deckId, seat_position: 1 },
    { user_id: botUserId, deck_id: deckId, seat_position: 2 },
  ]

  const playerStates: Record<string, GameState['players'][string]> = {}
  let instanceCounter = 0

  for (const player of players) {
    const { data: deckCards } = await admin
      .from('deck_cards')
      .select('card_id, quantity, board, card:cards!card_id(id)')
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

    // Shuffle
    for (let i = library.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [library[i], library[j]] = [library[j], library[i]]
    }

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
      commanderCastCount: 0,
      autoPass: false,
    }
  }

  // Human goes first (always — bot goes second)
  const firstPlayerId = user.id

  const mulliganDecisions: Record<string, { mulliganCount: number; decided: boolean; needsBottomCards: number; bottomCardsDone: boolean }> = {}
  for (const p of players) {
    mulliganDecisions[p.user_id] = {
      mulliganCount: 0,
      decided: false,
      needsBottomCards: 0,
      bottomCardsDone: false,
    }
  }

  const initialState: GameState & { botUserId: string } = {
    turn: 1,
    phase: 'untap',
    activePlayerId: firstPlayerId,
    priorityPlayerId: firstPlayerId,
    firstPlayerId,
    combat: { phase: null, attackers: [], blockers: [], damageAssigned: false, damageApplied: false },
    players: playerStates,
    lastActionSeq: 1,
    mulliganStage: { playerDecisions: mulliganDecisions },
    botUserId,
  }

  // Create game state
  await admin.from('game_states').insert({
    lobby_id: lobby.id,
    state_data: initialState as unknown as Json,
    turn_number: 1,
    active_player_id: firstPlayerId,
    phase: 'untap',
  })

  // Update lobby status to playing
  await admin.from('game_lobbies').update({
    status: 'playing',
    started_at: new Date().toISOString(),
  }).eq('id', lobby.id)

  // Game start log entry
  await admin.from('game_log').insert({
    lobby_id: lobby.id,
    seq: 1,
    player_id: null,
    action: 'game_start',
    data: { firstPlayerId },
    text: `Game started vs GoblinAI. You go first!`,
  })

  return NextResponse.json({ lobbyId: lobby.id, started: true, botUserId })
}
