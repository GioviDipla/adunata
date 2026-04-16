import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import PlayGame from '@/components/play/PlayGame'
import { GHOST_BOT } from '@/lib/game/bot'
import { CARD_GAME_COLUMNS, DECK_DETAIL_COLUMNS } from '@/lib/supabase/columns'
import type { GameState, CardMap, PlayerState, CombatState } from '@/lib/game/types'
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
      cardMap[iid] = {
        cardId: card.id as unknown as number,
        name: card.name,
        imageSmall: card.image_small,
        imageNormal: card.image_normal,
        typeLine: card.type_line,
        manaCost: card.mana_cost,
        power: card.power,
        toughness: card.toughness,
        oracleText: card.oracle_text,
        isCommander: true,
        isToken: false,
      }
    } else {
      for (let i = 0; i < dc.quantity; i++) {
        const iid = `ci-${++instanceCounter}`
        library.push(iid)
        cardMap[iid] = {
          cardId: card.id as unknown as number,
          name: card.name,
          imageSmall: card.image_small,
          imageNormal: card.image_normal,
          typeLine: card.type_line,
          manaCost: card.mana_cost,
          power: card.power,
          toughness: card.toughness,
          oracleText: card.oracle_text,
          isCommander: false,
          isToken: false,
        }
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

  // Ghost state — empty everything
  const ghostState: PlayerState = {
    life: GHOST_BOT.life,
    library: [],
    libraryCount: 0,
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
