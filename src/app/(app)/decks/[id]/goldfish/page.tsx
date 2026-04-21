import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import PlayGame from '@/components/play/PlayGame'
import { GHOST_BOT } from '@/lib/game/bot'
import { CARD_GAME_COLUMNS, DECK_DETAIL_COLUMNS } from '@/lib/supabase/columns'
import type { GameState, CardMap, PlayerState, CombatState } from '@/lib/game/types'
import { toCardMapEntry } from '@/lib/game/card-map'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

const BOT_ID = 'bot-ghost'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default async function GoldfishPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const [{ data: deck, error: deckError }, { data: deckCards }] = await Promise.all([
    supabase.from('decks').select(DECK_DETAIL_COLUMNS).eq('id', id).single(),
    supabase
      .from('deck_cards')
      .select(`id, card_id, quantity, board, created_at, card:cards!card_id(${CARD_GAME_COLUMNS})`)
      .eq('deck_id', id)
      .in('board', ['main', 'commander', 'tokens']),
  ])

  if (deckError || !deck) redirect('/decks')
  if (deck.user_id !== user.id) redirect('/decks')

  // Build card instances and CardMap
  const cardMap: CardMap = {}
  const library: string[] = []
  const commandZone: { instanceId: string; cardId: number }[] = []
  // Ghost opponent mirrors the player's main deck as its library so the
  // library count reflects the deck's format (Standard 60, Commander 99,
  // Pauper 60, etc.) without us having to hard-code format sizes. The
  // ghost does NOT get a commander — only the main-deck cards.
  const ghostLibrary: string[] = []
  let instanceCounter = 0

  interface DeckCardFromDB {
    id: string; card_id: number; quantity: number; board: string; created_at: string
    card: CardRow
  }

  for (const dc of (deckCards ?? []) as unknown as DeckCardFromDB[]) {
    if (!dc.card) continue
    if (dc.board === 'tokens') continue // tokens are handled separately in deckTokensList
    const card = dc.card

    if (dc.board === 'commander') {
      const iid = `ci-${++instanceCounter}`
      commandZone.push({ instanceId: iid, cardId: card.id as unknown as number })
      cardMap[iid] = toCardMapEntry(card.id as unknown as number, card, { isCommander: true, isToken: false })
    } else {
      for (let i = 0; i < dc.quantity; i++) {
        const iid = `ci-${++instanceCounter}`
        library.push(iid)
        cardMap[iid] = toCardMapEntry(card.id as unknown as number, card, { isCommander: false, isToken: false })

        // Ghost gets its own independent instance for the same card.
        // Fresh instanceId prefix (gi-) so tap-state, counters, and
        // graveyard/exile movements never collide with the player's.
        const gid = `gi-${++instanceCounter}`
        ghostLibrary.push(gid)
        cardMap[gid] = toCardMapEntry(card.id as unknown as number, card, { isCommander: false, isToken: false })
      }
    }
  }

  if (library.length === 0 && commandZone.length === 0) {
    redirect(`/decks/${id}`)
  }

  const shuffledLibrary = shuffle(library)
  const hand = shuffledLibrary.splice(0, 7)

  // Player state
  const playerState: PlayerState = {
    life: 20,
    library: shuffledLibrary,
    libraryCount: shuffledLibrary.length,
    hand,
    handCount: hand.length,
    battlefield: [],
    graveyard: [],
    exile: [],
    commandZone,
    commanderCastCount: 0,
    autoPass: false,
  }

  // Ghost state — library mirrors the player's main deck size so
  // "mill X", "exile top N", and the library counter all show realistic
  // numbers. Hand stays empty (goldfish = no opponent plays).
  const shuffledGhostLibrary = shuffle(ghostLibrary)
  const ghostState: PlayerState = {
    life: GHOST_BOT.life,
    library: shuffledGhostLibrary,
    libraryCount: shuffledGhostLibrary.length,
    hand: [],
    handCount: 0,
    battlefield: [],
    graveyard: [],
    exile: [],
    commandZone: [],
    commanderCastCount: 0,
    autoPass: true,
  }

  const combat: CombatState = {
    phase: null,
    attackers: [],
    blockers: [],
    damageAssigned: false,
    damageApplied: false,
  }

  const initialState: GameState = {
    turn: 1,
    phase: 'untap',
    activePlayerId: user.id,
    priorityPlayerId: user.id,
    firstPlayerId: user.id,
    combat,
    players: {
      [user.id]: playerState,
      [BOT_ID]: ghostState,
    },
    lastActionSeq: 0,
    mulliganStage: {
      playerDecisions: {
        [user.id]: { mulliganCount: 0, decided: false, needsBottomCards: 0, bottomCardsDone: false },
        [BOT_ID]: { mulliganCount: 0, decided: false, needsBottomCards: 0, bottomCardsDone: false },
      },
    },
  }

  // Build deck tokens list from deck_cards with board='tokens'
  const deckTokensList = ((deckCards ?? []) as unknown as DeckCardFromDB[])
    .filter(dc => dc.board === 'tokens' && dc.card)
    .map(dc => ({
      name: dc.card.name,
      power: dc.card.power ?? '',
      toughness: dc.card.toughness ?? '',
      colors: dc.card.colors ?? [],
      typeLine: dc.card.type_line ?? 'Token Creature',
      keywords: dc.card.keywords ?? [],
      imageSmall: dc.card.image_small ?? null,
      imageNormal: dc.card.image_normal ?? null,
    }))

  return (
    <PlayGame
      mode="goldfish"
      userId={user.id}
      initialState={initialState}
      initialCardMap={cardMap}
      botId={BOT_ID}
      botConfig={GHOST_BOT}
      deckId={id}
      deckTokens={deckTokensList}
    />
  )
}
