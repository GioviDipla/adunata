'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { Heart, ChevronLeft, Minus, Plus, Layers, Archive, Ban } from 'lucide-react'
import { useLongPress } from '@/lib/hooks/useLongPress'
import { createClient } from '@/lib/supabase/client'
import {
  createPassPriority, createPlayCard, createTap, createUntap,
  createConfirmUntap, createMoveZone, createLifeChange,
  createDraw, createConcede,
  createDeclareAttackers, createDeclareBlockers, createCombatDamage, createDiscard,
  createMulligan, createKeepHand, createBottomCards,
  createAddCounter, createRemoveCounter, createSetCounter, createSetPT, createCreateToken,
  createCommanderChoice, createToggleAutoPass,
  createShuffleIntoLibrary, createShuffleLibrary, createCopyCard, createTakeControl,
} from '@/lib/game/actions'
import { applyAction } from '@/lib/game/engine'
import { applyWithBotLoop } from '@/lib/game/bot'
import type { BotConfig } from '@/lib/game/bot'
import { getOpponentId } from '@/lib/game/phases'
import type { GameState, GameActionType, CardMap, LogEntry } from '@/lib/game/types'
import type { Database } from '@/types/supabase'
import { getCardZone } from '@/lib/utils/card'
import OpponentField from './OpponentField'
import BattlefieldZone from '@/components/goldfish/BattlefieldZone'
import type { BattlefieldCard } from '@/components/goldfish/BattlefieldZone'
import HandArea from '@/components/goldfish/HandArea'
import type { HandCardEntry } from '@/components/goldfish/HandArea'
import GameLog from './GameLog'
import GameActionBar from './GameActionBar'
import CardZoneViewer from '@/components/goldfish/CardZoneViewer'
import CardPreviewOverlay, { type PreviewState, type PreviewZone } from '@/components/game/CardPreviewOverlay'
import CombatAttackers from './CombatAttackers'
import CombatBlockers from './CombatBlockers'
import DiscardSelector from './DiscardSelector'
import TokenCreator, { type TokenDefinition } from './TokenCreator'
import CommanderChoiceModal from './CommanderChoiceModal'
import SpecialActionsMenu from './SpecialActionsMenu'
import RevealedCardsChooser from './RevealedCardsChooser'
import CardActionMenu, { type ActionMenuZone, type ActionMenuDest } from '@/components/game/CardActionMenu'

type CardRow = Database['public']['Tables']['cards']['Row']

/** Build a minimal CardRow-compatible object from CardMap data */
function toCardRow(cardId: number, data: CardMap[string]): CardRow {
  return {
    id: cardId,
    scryfall_id: '',
    name: data.name,
    name_it: null,
    flavor_name: null,
    mana_cost: data.manaCost ?? null,
    cmc: 0,
    type_line: data.typeLine,
    oracle_text: data.oracleText ?? null,
    colors: null,
    color_identity: [],
    rarity: '',
    set_code: '',
    set_name: '',
    collector_number: '',
    image_small: data.imageSmall ?? null,
    image_normal: data.imageNormal ?? null,
    image_art_crop: null,
    prices_usd: null,
    prices_usd_foil: null,
    prices_eur: null,
    prices_eur_foil: null,
    released_at: null,
    legalities: null,
    power: data.power ?? null,
    toughness: data.toughness ?? null,
    keywords: data.keywords ?? null,
    produced_mana: null,
    layout: null,
    card_faces: null,
    search_vector: null,
    last_price_update: null,
    created_at: '',
    updated_at: '',
    has_upkeep_trigger: data.hasUpkeepTrigger,
    has_etb_trigger: data.hasEtbTrigger,
    has_attacks_trigger: data.hasAttacksTrigger,
    has_dies_trigger: data.hasDiesTrigger,
    has_end_step_trigger: data.hasEndStepTrigger,
    has_cast_trigger: data.hasCastTrigger,
  }
}

/** Command zone card button — tap opens the action menu (Cast),
 *  long-press / right-click opens the preview overlay. */
function CommandZoneCard({
  cardId,
  data,
  onOpenPreview,
  onOpenAction,
}: {
  cardId: number
  data: CardMap[string] | undefined
  onOpenPreview: (card: CardRow) => void
  onOpenAction: (card: CardRow, x: number, y: number) => void
}) {
  const longPress = useLongPress({
    onLongPress: () => {
      if (data) onOpenPreview(toCardRow(cardId, data))
    },
    delay: 400,
  })

  const handleClick = (e: React.MouseEvent) => {
    if (longPress.wasLongPress()) return
    if (data) onOpenAction(toCardRow(cardId, data), e.clientX, e.clientY)
  }

  return (
    <button
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault()
        if (data) onOpenPreview(toCardRow(cardId, data))
      }}
      {...longPress}
      className="overflow-hidden rounded-lg border border-yellow-500/50 bg-bg-card select-none"
      style={{ width: 48, height: 67, touchAction: 'manipulation' }}
      title={`${data?.name ?? '?'} — tap to cast, hold to preview`}
    >
      {data?.imageSmall ? (
        <img
          src={data.imageSmall}
          alt={data.name}
          className="h-full w-full object-cover pointer-events-none"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-1">
          <span className="text-center text-[8px] font-semibold text-font-primary">
            {data?.name ?? '?'}
          </span>
        </div>
      )}
    </button>
  )
}

/** Peek card tile — tap opens the action menu, long-press / right-click previews. */
function PeakCardButton({
  card,
  instanceId: _instanceId,
  onOpenAction,
  onOpenPreview,
}: {
  card: CardRow
  instanceId: string
  onOpenAction: (card: CardRow, x: number, y: number) => void
  onOpenPreview: (card: CardRow) => void
}) {
  const longPress = useLongPress({
    onLongPress: () => onOpenPreview(card),
    delay: 400,
  })

  const handleClick = (e: React.MouseEvent) => {
    if (longPress.wasLongPress()) return
    onOpenAction(card, e.clientX, e.clientY)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onContextMenu={(e) => { e.preventDefault(); onOpenPreview(card) }}
      {...longPress}
      className="w-24 select-none"
      style={{ touchAction: 'manipulation' }}
      title={`${card.name} — tap for actions, hold to preview`}
    >
      {card.image_small ? (
        <img src={card.image_small} alt={card.name} className="w-full rounded-lg pointer-events-none" draggable={false} />
      ) : (
        <div className="flex aspect-[5/7] items-center justify-center rounded-lg bg-bg-cell p-2">
          <span className="text-[9px] text-font-primary text-center">{card.name}</span>
        </div>
      )}
    </button>
  )
}

type PlayGameProps = { userId: string } & (
  | { mode: 'multiplayer'; lobbyId: string }
  | { mode: 'goldfish'; initialState: GameState; initialCardMap: CardMap; botId: string; botConfig: BotConfig; deckId: string; deckTokens?: TokenDefinition[] }
)

export default function PlayGame(props: PlayGameProps) {
  const { userId } = props
  const mode = props.mode
  const lobbyId = mode === 'multiplayer' ? props.lobbyId : null
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [cardMap, setCardMap] = useState<CardMap>({})
  const [log, setLog] = useState<LogEntry[]>([])
  const [viewingZone, setViewingZone] = useState<'graveyard' | 'exile' | 'library' | null>(null)
  const [opponentViewingZone, setOpponentViewingZone] = useState<'graveyard' | 'exile' | 'library' | null>(null)
  const [loading, setLoading] = useState(true)
  const [gameOver, setGameOver] = useState<{ winnerId: string } | null>(null)
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [opponentExpanded, setOpponentExpanded] = useState(false)
  const [bottomSelectIds, setBottomSelectIds] = useState<Set<string>>(new Set())
  const [showTokenCreator, setShowTokenCreator] = useState(false)
  const [showSpecialActions, setShowSpecialActions] = useState(false)
  const [peakCards, setPeakCards] = useState<{ instanceId: string; card: CardRow }[] | null>(null)
  const [actionMenu, setActionMenu] = useState<{
    x: number
    y: number
    zone: ActionMenuZone
    instanceId: string
    cardId: number
    cardName: string
    isCommander: boolean
    tapped?: boolean
  } | null>(null)
  const [deckTokens, setDeckTokens] = useState<TokenDefinition[]>([])
  const libraryViewLoggedRef = useRef(false)

  // Fetch initial state (multiplayer) or set from props (goldfish)
  useEffect(() => {
    if (mode === 'goldfish') {
      const gProps = props as PlayGameProps & { mode: 'goldfish' }
      setGameState(gProps.initialState)
      setCardMap(gProps.initialCardMap)
      setPlayerNames({ [userId]: 'You', [gProps.botId]: gProps.botConfig.name })
      if (gProps.deckTokens) setDeckTokens(gProps.deckTokens)
      setLoading(false)
      return
    }

    // Multiplayer: fetch from API
    async function load() {
      const res = await fetch(`/api/game/${lobbyId}`)
      if (res.ok) {
        const data = await res.json()
        setGameState(data.gameState)
        setCardMap(data.cardMap)
        if (data.playerNames) setPlayerNames(data.playerNames)
        setLog(data.log.map((l: Record<string, unknown>) => ({
          id: l.id as string,
          seq: l.seq as number,
          playerId: l.player_id ?? l.playerId ?? null,
          action: l.action as string,
          data: l.data as Record<string, unknown> | null,
          text: l.text as string,
          createdAt: (l.created_at ?? l.createdAt) as string,
        })))
      }
      setLoading(false)
    }
    load()
  }, [mode, lobbyId, userId])

  // Goldfish: auto-keep mulligan for bot on mount
  useEffect(() => {
    if (mode !== 'goldfish') return
    const gProps = props as PlayGameProps & { mode: 'goldfish' }
    setGameState(prev => {
      if (!prev?.mulliganStage) return prev
      const botDecision = prev.mulliganStage.playerDecisions[gProps.botId]
      if (botDecision && !botDecision.decided) {
        return applyAction(prev, {
          type: 'keep_hand',
          playerId: gProps.botId,
          data: {},
          text: '',
        })
      }
      return prev
    })
  }, [mode])

  // Fetch deck tokens for token creator (from deck_cards with board='tokens')
  useEffect(() => {
    if (mode !== 'multiplayer') return
    let cancelled = false
    async function fetchDeckTokens() {
      try {
        const supabase = createClient()
        const { data: lobbyPlayer } = await supabase
          .from('game_players')
          .select('deck_id')
          .eq('lobby_id', lobbyId!)
          .eq('user_id', userId)
          .single()
        if (!lobbyPlayer?.deck_id || cancelled) return
        const { data: tokenCards } = await supabase
          .from('deck_cards')
          .select('card:cards!card_id(name, power, toughness, colors, type_line, keywords, image_small, image_normal)')
          .eq('deck_id', lobbyPlayer.deck_id)
          .eq('board', 'tokens')
        if (tokenCards && !cancelled) {
          const mapped = tokenCards
            .filter((tc: Record<string, unknown>) => tc.card != null)
            .map((tc: Record<string, unknown>) => {
              const c = tc.card as Record<string, unknown>
              return {
                name: c.name as string,
                power: (c.power ?? '') as string,
                toughness: (c.toughness ?? '') as string,
                colors: (c.colors ?? []) as string[],
                typeLine: (c.type_line ?? 'Token Creature') as string,
                keywords: (c.keywords ?? []) as string[],
                imageSmall: (c.image_small ?? null) as string | null,
                imageNormal: (c.image_normal ?? null) as string | null,
              }
            })
          setDeckTokens(mapped)
        }
      } catch { /* ignore */ }
    }
    fetchDeckTokens()
    return () => { cancelled = true }
  }, [mode, lobbyId, userId])

  // Realtime subscription
  useEffect(() => {
    if (mode !== 'multiplayer' || !lobbyId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`game-${lobbyId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'game_states',
        filter: `lobby_id=eq.${lobbyId}`,
      }, (payload) => {
        const newState = (payload.new as { state_data: GameState }).state_data
        setGameState(newState)
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'game_log',
        filter: `lobby_id=eq.${lobbyId}`,
      }, (payload) => {
        const row = payload.new as Record<string, unknown>
        setLog((prev) => [...prev, {
          id: row.id as string,
          seq: row.seq as number,
          playerId: row.player_id as string | null,
          action: row.action as string,
          data: row.data as Record<string, unknown> | null,
          text: row.text as string,
          createdAt: row.created_at as string,
        }])
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'game_lobbies',
        filter: `id=eq.${lobbyId}`,
      }, (payload) => {
        const row = payload.new as Record<string, unknown>
        if (row.status === 'finished' && row.winner_id) {
          setGameOver({ winnerId: row.winner_id as string })
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [mode, lobbyId])

  // Send action helper
  const sendAction = useCallback(async (action: ReturnType<typeof createPassPriority>) => {
    if (mode === 'goldfish') {
      const gProps = props as PlayGameProps & { mode: 'goldfish' }
      setGameState(prev => prev ? applyWithBotLoop(prev, action, gProps.botId, gProps.botConfig) : prev)
      // Local log entry
      if (action.text) {
        setLog(prev => [...prev, {
          id: `local-${Date.now()}`,
          seq: prev.length + 1,
          playerId: action.playerId,
          action: action.type,
          data: action.data as Record<string, unknown> | null,
          text: action.text,
          createdAt: new Date().toISOString(),
        }])
      }
      return
    }

    // Multiplayer: optimistic update + POST
    const isStateMutating = action.type !== 'chat_message'
      && action.type !== 'library_view'
      && action.type !== 'peak'
      && action.type !== 'concede'

    if (isStateMutating) {
      setGameState(prev => prev ? applyAction(prev, action) : prev)
    }

    fetch(`/api/game/${lobbyId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        console.error('[sendAction] server error:', res.status, body)
      }
    }).catch((err) => console.error('[sendAction] network error:', err))
  }, [mode, lobbyId, props])

  // Derived state
  const myState = gameState?.players[userId]
  const opponentId = gameState ? getOpponentId(gameState, userId) : null
  const opponentState = opponentId ? gameState?.players[opponentId] : null
  const hasPriority = gameState?.priorityPlayerId === userId
  const isActivePlayer = gameState?.activePlayerId === userId
  const myName = playerNames[userId] ?? 'Player'

  const isGoldfish = mode === 'goldfish'
  const botId = isGoldfish ? (props as PlayGameProps & { mode: 'goldfish' }).botId : null

  const handleSendChat = useCallback((message: string) => {
    sendAction({
      type: 'chat_message' as GameActionType,
      playerId: userId,
      data: { message },
      text: `${myName}: ${message}`,
    })
  }, [sendAction, userId, myName])

  // Log library consultation when library viewer opens
  useEffect(() => {
    if (viewingZone === 'library' && !libraryViewLoggedRef.current) {
      libraryViewLoggedRef.current = true
      sendAction({ type: 'library_view' as GameActionType, playerId: userId, data: {}, text: `${myName} is searching their library` })
    }
    if (viewingZone !== 'library') {
      libraryViewLoggedRef.current = false
    }
  }, [viewingZone, sendAction, userId, myName])

  // Resolve hand cards for HandArea component
  const myHandCards = useMemo((): HandCardEntry[] => {
    if (!myState) return []
    return myState.hand
      .map((instanceId) => {
        const data = cardMap[instanceId]
        if (!data) return null
        return {
          instanceId,
          card: toCardRow(data.cardId, data),
        }
      })
      .filter((x): x is HandCardEntry => x !== null)
  }, [myState, cardMap])

  // Build battlefield cards grouped by type for BattlefieldZone
  const myBattlefieldByZone = useMemo(() => {
    if (!myState) return { lands: [] as BattlefieldCard[], creatures: [] as BattlefieldCard[], other: [] as BattlefieldCard[], tokens: [] as BattlefieldCard[] }
    const lands: BattlefieldCard[] = []
    const creatures: BattlefieldCard[] = []
    const other: BattlefieldCard[] = []
    const tokens: BattlefieldCard[] = []

    for (const c of myState.battlefield) {
      const data = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
      if (!data) continue
      const row = toCardRow(c.cardId, data)
      const entry: BattlefieldCard = { instanceId: c.instanceId, card: row, tapped: c.tapped, counters: c.counters, powerMod: c.powerMod ?? 0, toughnessMod: c.toughnessMod ?? 0 }

      // Tokens go to their own zone
      if (data.isToken) {
        tokens.push(entry)
        continue
      }

      const zone = getCardZone(data.typeLine)
      if (zone === 'lands') lands.push(entry)
      else if (zone === 'creatures') creatures.push(entry)
      else other.push(entry)
    }

    return { lands, creatures, other, tokens }
  }, [myState, cardMap])

  // Graveyard cards for zone viewer
  const graveyardCards = useMemo(() => {
    if (!myState) return []
    return myState.graveyard
      .map((c) => {
        const data = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
        if (!data) return null
        return { instanceId: c.instanceId, card: toCardRow(c.cardId, data) }
      })
      .filter((x): x is { instanceId: string; card: CardRow } => x !== null)
  }, [myState, cardMap])

  // Exile cards for zone viewer
  const exileCards = useMemo(() => {
    if (!myState) return []
    return myState.exile
      .map((c) => {
        const data = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
        if (!data) return null
        return { instanceId: c.instanceId, card: toCardRow(c.cardId, data) }
      })
      .filter((x): x is { instanceId: string; card: CardRow } => x !== null)
  }, [myState, cardMap])

  // Library cards (viewable by owner for scry/tutor/search effects).
  // Library is ordered from top of deck (index 0) to bottom.
  const libraryCards = useMemo(() => {
    if (!myState) return []
    return myState.library
      .map((instanceId) => {
        const data = cardMap[instanceId]
        if (!data) return null
        return { instanceId, card: toCardRow(data.cardId, data) }
      })
      .filter((x): x is { instanceId: string; card: CardRow } => x !== null)
  }, [myState, cardMap])

  // Opponent zone cards (goldfish: lets the player manipulate the ghost's
  // library / graveyard / exile via the same viewer they use for their own).
  const opponentGraveyardCards = useMemo(() => {
    if (!opponentState) return []
    return opponentState.graveyard
      .map((c) => {
        const data = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
        if (!data) return null
        return { instanceId: c.instanceId, card: toCardRow(c.cardId, data) }
      })
      .filter((x): x is { instanceId: string; card: CardRow } => x !== null)
  }, [opponentState, cardMap])

  const opponentExileCards = useMemo(() => {
    if (!opponentState) return []
    return opponentState.exile
      .map((c) => {
        const data = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
        if (!data) return null
        return { instanceId: c.instanceId, card: toCardRow(c.cardId, data) }
      })
      .filter((x): x is { instanceId: string; card: CardRow } => x !== null)
  }, [opponentState, cardMap])

  const opponentLibraryCards = useMemo(() => {
    if (!opponentState) return []
    return opponentState.library
      .map((instanceId) => {
        const data = cardMap[instanceId]
        if (!data) return null
        return { instanceId, card: toCardRow(data.cardId, data) }
      })
      .filter((x): x is { instanceId: string; card: CardRow } => x !== null)
  }, [opponentState, cardMap])

  // Check if a card is one of the player's commanders (by cardId)
  const isCommanderCard = useCallback(
    (card: CardRow) => {
      for (const instanceId of Object.keys(cardMap)) {
        const data = cardMap[instanceId]
        if (data.cardId === card.id && data.isCommander) return true
      }
      return false
    },
    [cardMap],
  )

  // Action handlers
  const handleTapToggle = useCallback((instanceId: string) => {
    if (!myState) return
    const card = myState.battlefield.find((c) => c.instanceId === instanceId)
    if (!card) return
    const data = cardMap[instanceId] ?? cardMap[String(card.cardId)]
    const name = data?.name ?? 'card'
    if (card.tapped) {
      sendAction(createUntap(userId, myName, instanceId, name))
    } else {
      sendAction(createTap(userId, myName, instanceId, name))
    }
  }, [myState, cardMap, sendAction, userId])

  const handlePlayCard = useCallback((instanceId: string) => {
    const data = cardMap[instanceId]
    if (!data) return
    sendAction(createPlayCard(userId, myName, instanceId, data.cardId, data.name, 'hand', 'battlefield'))
  }, [cardMap, sendAction, userId])

  const handleSendToGraveyard = useCallback((instanceId: string) => {
    if (!myState) return
    const card = myState.battlefield.find((c) => c.instanceId === instanceId)
    if (!card) return
    const data = cardMap[instanceId] ?? cardMap[String(card.cardId)]
    const cardRow = data ? toCardRow(data.cardId, data) : null
    const isCmd = cardRow ? isCommanderCard(cardRow) : false
    const action = createMoveZone(userId, myName, instanceId, card.cardId, data?.name ?? 'card', 'battlefield', 'graveyard')
    if (isCmd) (action.data as Record<string, unknown>).isCommander = true
    if (isCmd) (action.data as Record<string, unknown>).cardName = data?.name ?? 'Commander'
    sendAction(action)
  }, [myState, cardMap, sendAction, userId, isCommanderCard])

  const handleExile = useCallback((instanceId: string) => {
    if (!myState) return
    const card = myState.battlefield.find((c) => c.instanceId === instanceId)
    if (!card) return
    const data = cardMap[instanceId] ?? cardMap[String(card.cardId)]
    const cardRow = data ? toCardRow(data.cardId, data) : null
    const isCmd = cardRow ? isCommanderCard(cardRow) : false
    const action = createMoveZone(userId, myName, instanceId, card.cardId, data?.name ?? 'card', 'battlefield', 'exile')
    if (isCmd) (action.data as Record<string, unknown>).isCommander = true
    if (isCmd) (action.data as Record<string, unknown>).cardName = data?.name ?? 'Commander'
    sendAction(action)
  }, [myState, cardMap, sendAction, userId, isCommanderCard])

  const handleReturnToHand = useCallback((instanceId: string) => {
    if (!myState) return
    const card = myState.battlefield.find((c) => c.instanceId === instanceId)
    if (!card) return
    const data = cardMap[instanceId] ?? cardMap[String(card.cardId)]
    sendAction(createMoveZone(userId, myName, instanceId, card.cardId, data?.name ?? 'card', 'battlefield', 'hand'))
  }, [myState, cardMap, sendAction, userId])

  const handleReturnToCommandZone = useCallback((instanceId: string) => {
    if (!myState) return
    const card = myState.battlefield.find((c) => c.instanceId === instanceId)
    if (!card) return
    const data = cardMap[instanceId] ?? cardMap[String(card.cardId)]
    sendAction(createMoveZone(userId, myName, instanceId, card.cardId, data?.name ?? 'card', 'battlefield', 'commandZone'))
  }, [myState, cardMap, sendAction, userId, myName])

  const handleDiscardFromHand = useCallback((instanceId: string) => {
    const data = cardMap[instanceId]
    if (!data) return
    sendAction(createDiscard(userId, myName, instanceId, data.cardId, data.name))
  }, [cardMap, sendAction, userId, myName])

  const handleExileFromHand = useCallback((instanceId: string) => {
    const data = cardMap[instanceId]
    if (!data) return
    sendAction(createMoveZone(userId, myName, instanceId, data.cardId, data.name, 'hand', 'exile'))
  }, [cardMap, sendAction, userId, myName])

  const handlePlayFromCommandZone = useCallback((instanceId: string) => {
    if (!myState) return
    const card = myState.commandZone.find((c) => c.instanceId === instanceId)
    if (!card) return
    const data = cardMap[instanceId] ?? cardMap[String(card.cardId)]
    sendAction(createPlayCard(userId, myName, instanceId, card.cardId, data?.name ?? 'card', 'commandZone', 'battlefield'))
  }, [myState, cardMap, sendAction, userId, myName])

  const handleAddCounter = useCallback((instanceId: string, counterName: string) => {
    const data = cardMap[instanceId]
    if (!data) return
    sendAction(createAddCounter(userId, myName, instanceId, data.name, counterName))
  }, [cardMap, sendAction, userId, myName])

  const handleRemoveCounter = useCallback((instanceId: string, counterName: string) => {
    const data = cardMap[instanceId]
    if (!data) return
    sendAction(createRemoveCounter(userId, myName, instanceId, data.name, counterName))
  }, [cardMap, sendAction, userId, myName])

  const handleSetCounter = useCallback((instanceId: string, counterName: string, value: number) => {
    const data = cardMap[instanceId]
    if (!data) return
    sendAction(createSetCounter(userId, myName, instanceId, data.name, counterName, value))
  }, [cardMap, sendAction, userId, myName])

  const handleSetPT = useCallback((instanceId: string, powerMod: number, toughnessMod: number) => {
    const data = cardMap[instanceId]
    if (!data) return
    sendAction(createSetPT(userId, myName, instanceId, data.name, powerMod, toughnessMod))
  }, [cardMap, sendAction, userId, myName])

  // Generic "send to bottom of library" from any zone
  const handleSendToBottom = useCallback((instanceId: string, from: string) => {
    const data = cardMap[instanceId]
    if (!data) return
    sendAction(createMoveZone(userId, myName, instanceId, data.cardId, data.name, from, 'libraryBottom'))
    setPreview(null)
  }, [cardMap, sendAction, userId, myName])

  // Generic "send to top of library" from any zone
  const handleSendToTop = useCallback((instanceId: string, from: string) => {
    const data = cardMap[instanceId]
    if (!data) return
    sendAction(createMoveZone(userId, myName, instanceId, data.cardId, data.name, from, 'libraryTop'))
    setPreview(null)
  }, [cardMap, sendAction, userId, myName])

  // Shuffle into library from any zone
  const handleShuffle = useCallback((instanceId: string, from: string) => {
    const data = cardMap[instanceId]
    if (!data) return
    sendAction(createShuffleIntoLibrary(userId, myName, instanceId, data.cardId, data.name, from))
    setPreview(null)
  }, [cardMap, sendAction, userId, myName])

  // Close the library viewer AND shuffle — standard "I searched my library" closer.
  const handleCloseAndShuffleLibrary = useCallback(() => {
    sendAction(createShuffleLibrary(userId, myName))
    setViewingZone(null)
  }, [sendAction, userId, myName])

  // Copy a battlefield card (create token copy)
  const handleCopy = useCallback((instanceId: string) => {
    const data = cardMap[instanceId]
    if (!data) return
    const newId = `tk-${Date.now()}-copy`
    setCardMap(prev => ({
      ...prev,
      [newId]: { ...prev[instanceId], isToken: true, isCommander: false },
    }))
    sendAction(createCopyCard(userId, myName, instanceId, data.cardId, data.name, newId))
    setPreview(null)
  }, [cardMap, sendAction, userId, myName])

  // Take control of opponent's card
  const handleTakeControl = useCallback((instanceId: string) => {
    if (!opponentId) return
    const data = cardMap[instanceId]
    if (!data) return
    sendAction(createTakeControl(userId, myName, instanceId, opponentId, data.name))
    setPreview(null)
  }, [cardMap, sendAction, userId, myName, opponentId])

  // Discard from hand (hand -> graveyard)
  const handleDiscardCard = useCallback((instanceId: string) => {
    const data = cardMap[instanceId]
    if (!data) return
    sendAction(createDiscard(userId, myName, instanceId, data.cardId, data.name))
    setPreview(null)
  }, [cardMap, sendAction, userId, myName])

  // Play from command zone
  const handleCastCommander = useCallback((instanceId: string) => {
    if (!myState) return
    const card = myState.commandZone.find((c) => c.instanceId === instanceId)
    if (!card) return
    const data = cardMap[instanceId] ?? cardMap[String(card.cardId)]
    sendAction(createPlayCard(userId, myName, instanceId, card.cardId, data?.name ?? 'card', 'commandZone', 'battlefield'))
    setPreview(null)
  }, [myState, cardMap, sendAction, userId, myName])

  // Send to graveyard from non-battlefield zones
  const handleSendToGraveyardFromZone = useCallback((instanceId: string, from: string) => {
    const data = cardMap[instanceId]
    if (!data) return
    sendAction(createMoveZone(userId, myName, instanceId, data.cardId, data.name, from, 'graveyard'))
    setPreview(null)
  }, [cardMap, sendAction, userId, myName])

  // Play (to battlefield) from non-hand zones
  const handlePlayFromZone = useCallback((instanceId: string, from: string) => {
    const data = cardMap[instanceId]
    if (!data) return
    sendAction(createMoveZone(userId, myName, instanceId, data.cardId, data.name, from, 'battlefield'))
    setPreview(null)
  }, [cardMap, sendAction, userId, myName])

  // Return to hand from any zone
  const handleReturnToHandFromZone = useCallback((instanceId: string, from: string) => {
    const data = cardMap[instanceId]
    if (!data) return
    sendAction(createMoveZone(userId, myName, instanceId, data.cardId, data.name, from, 'hand'))
    setPreview(null)
  }, [cardMap, sendAction, userId, myName])

  // Exile from any zone
  const handleExileFromZone = useCallback((instanceId: string, from: string) => {
    const data = cardMap[instanceId]
    if (!data) return
    sendAction(createMoveZone(userId, myName, instanceId, data.cardId, data.name, from, 'exile'))
    setPreview(null)
  }, [cardMap, sendAction, userId, myName])

  const closePreview = useCallback(() => setPreview(null), [])

  // Open the action menu anchored at (x, y). Used by the tap gesture on
  // any card surface owned by the player. Long-press still opens preview.
  const openActionMenu = useCallback(
    (
      zone: ActionMenuZone,
      instanceId: string,
      card: CardRow,
      x: number,
      y: number,
      tapped?: boolean,
    ) => {
      setActionMenu({
        x,
        y,
        zone,
        instanceId,
        cardId: card.id as unknown as number,
        cardName: card.name,
        isCommander: isCommanderCard(card),
        tapped,
      })
    },
    [isCommanderCard],
  )

  const closeActionMenu = useCallback(() => setActionMenu(null), [])

  /**
   * Dispatcher: move a card from `zone` to `dest` using the existing handlers.
   * Source-aware so the engine receives the correct `from` value.
   * Tokens leaving the battlefield evaporate via the existing handler chain.
   */
  const handleActionMenuMove = useCallback(
    (
      zone: ActionMenuZone,
      instanceId: string,
      dest: ActionMenuDest,
    ) => {
      // Map ActionMenuZone -> engine `from` zone string.
      const from =
        zone === 'hand' ? 'hand'
        : zone === 'battlefield' ? 'battlefield'
        : zone === 'graveyard' ? 'graveyard'
        : zone === 'exile' ? 'exile'
        : zone === 'library_top' || zone === 'library_bottom' ? 'library'
        : zone === 'command' ? 'commandZone'
        : null

      if (!from) return
      const data = cardMap[instanceId]
      if (!data) return

      // Helpers below use `from` to drive the existing zone handlers.
      switch (dest) {
        case 'play':
          if (from === 'hand') {
            handlePlayCard(instanceId)
          } else if (from === 'commandZone') {
            handleCastCommander(instanceId)
          } else {
            handlePlayFromZone(instanceId, from)
          }
          break
        case 'hand':
          if (from === 'battlefield') handleReturnToHand(instanceId)
          else handleReturnToHandFromZone(instanceId, from)
          break
        case 'graveyard':
          if (from === 'hand') handleDiscardFromHand(instanceId)
          else if (from === 'battlefield') handleSendToGraveyard(instanceId)
          else handleSendToGraveyardFromZone(instanceId, from)
          break
        case 'exile':
          if (from === 'hand') handleExileFromHand(instanceId)
          else if (from === 'battlefield') handleExile(instanceId)
          else handleExileFromZone(instanceId, from)
          break
        case 'library_top':
          handleSendToTop(instanceId, from)
          break
        case 'library_bottom':
          handleSendToBottom(instanceId, from)
          break
        case 'command':
          if (from === 'battlefield') handleReturnToCommandZone(instanceId)
          else {
            // For non-battlefield zones, send to commandZone via createMoveZone.
            sendAction(createMoveZone(userId, myName, instanceId, data.cardId, data.name, from, 'commandZone'))
          }
          break
      }
      setPreview(null)
    },
    [
      cardMap, sendAction, userId, myName,
      handlePlayCard, handleCastCommander, handlePlayFromZone,
      handleReturnToHand, handleReturnToHandFromZone,
      handleDiscardFromHand, handleSendToGraveyard, handleSendToGraveyardFromZone,
      handleExileFromHand, handleExile, handleExileFromZone,
      handleSendToTop, handleSendToBottom,
      handleReturnToCommandZone,
    ],
  )

  // Combat: declare attackers
  const handleDeclareAttackers = useCallback((attackerIds: string[], attackerNames: string[]) => {
    sendAction(createDeclareAttackers(userId, myName, attackerIds, attackerNames))
  }, [sendAction, userId])

  const handleSkipAttackers = useCallback(() => {
    sendAction(createDeclareAttackers(userId, myName, [], []))
  }, [sendAction, userId])

  // Combat: declare blockers
  const handleDeclareBlockers = useCallback((assignments: { blockerId: string; attackerId: string; blockerName: string; attackerName: string }[]) => {
    sendAction(createDeclareBlockers(userId, myName, assignments))
  }, [sendAction, userId])

  const handleSkipBlockers = useCallback(() => {
    sendAction(createDeclareBlockers(userId, myName, []))
  }, [sendAction, userId])

  // Discard to 7.
  // Must await each action sequentially: concurrent writes to game_states
  // would race (both read, both write, second overwrites first) and drop discards.
  const handleDiscard = useCallback(async (discards: { instanceId: string; cardId: number; cardName: string }[]) => {
    for (const d of discards) {
      await sendAction(createDiscard(userId, myName, d.instanceId, d.cardId, d.cardName))
    }
  }, [sendAction, userId, myName])

  const handleMulligan = useCallback(() => {
    sendAction(createMulligan(userId, myName))
  }, [sendAction, userId, myName])

  const handleKeepMultiplayerHand = useCallback(() => {
    const mulliganCount = gameState?.mulliganStage?.playerDecisions[userId]?.mulliganCount ?? 0
    sendAction(createKeepHand(userId, myName, mulliganCount))
  }, [sendAction, userId, myName, gameState])

  const handleBottomCardsConfirm = useCallback((selectedIds: string[]) => {
    sendAction(createBottomCards(userId, myName, selectedIds, selectedIds.length))
  }, [sendAction, userId, myName])

  // Token creation handler
  const handleCreateToken = useCallback((token: TokenDefinition, quantity: number) => {
    const now = Date.now()
    const tokens: { instanceId: string; cardId: number }[] = []
    const syntheticCardId = -(now % 1000000)

    for (let i = 0; i < quantity; i++) {
      const instanceId = `tk-${now}-${i}`
      tokens.push({ instanceId, cardId: syntheticCardId })

      setCardMap(prev => ({
        ...prev,
        [instanceId]: {
          cardId: syntheticCardId,
          name: token.name,
          imageSmall: token.imageSmall ?? null,
          imageNormal: token.imageNormal ?? null,
          typeLine: token.typeLine,
          manaCost: null,
          power: token.power || null,
          toughness: token.toughness || null,
          oracleText: token.keywords.length > 0 ? token.keywords.join(', ') : null,
          isCommander: false,
          isToken: true,
          keywords: token.keywords.length > 0 ? token.keywords : null,
          hasUpkeepTrigger: false,
          hasEtbTrigger: false,
          hasAttacksTrigger: false,
          hasDiesTrigger: false,
          hasEndStepTrigger: false,
          hasCastTrigger: false,
        },
      }))
    }

    sendAction(createCreateToken(userId, myName, tokens, token.name, quantity))
    setShowTokenCreator(false)
  }, [sendAction, userId, myName])

  // Auto combat damage calculation
  const combatDamageSentRef = useRef(false)

  useEffect(() => {
    if (!gameState || !opponentId) return
    if (gameState.phase !== 'combat_damage') {
      combatDamageSentRef.current = false
      return
    }
    if (gameState.activePlayerId !== userId) return
    if (gameState.priorityPlayerId !== userId) return
    if (combatDamageSentRef.current) return
    if (gameState.combat.damageAssigned) return
    if (gameState.combat.damageApplied) return  // Already calculated, in response window

    combatDamageSentRef.current = true

    const { attackers, blockers } = gameState.combat
    if (attackers.length === 0) {
      // No attackers, just pass
      sendAction(createCombatDamage(userId, 0, [], 'No combat damage'))
      return
    }

    // Build blocker map: attackerId -> blockerId[]
    const blockerMap = new Map<string, string[]>()
    for (const b of blockers) {
      const list = blockerMap.get(b.blockingInstanceId) ?? []
      list.push(b.instanceId)
      blockerMap.set(b.blockingInstanceId, list)
    }

    let damageToPlayer = 0
    const creaturesDamaged: { instanceId: string; playerId: string; damage: number; lethal: boolean }[] = []
    const descParts: string[] = []

    for (const atk of attackers) {
      const atkData = cardMap[atk.instanceId]
      const atkPower = parseInt(atkData?.power ?? '0', 10) || 0
      const atkToughness = parseInt(atkData?.toughness ?? '0', 10) || 0
      const atkName = atkData?.name ?? 'Attacker'

      const blockingCreatures = blockerMap.get(atk.instanceId)

      if (!blockingCreatures || blockingCreatures.length === 0) {
        // Unblocked: damage goes to opponent
        damageToPlayer += atkPower
        descParts.push(`${atkName} deals ${atkPower} to opponent`)
      } else {
        // Blocked: mutual damage
        for (const blockerId of blockingCreatures) {
          const blkData = cardMap[blockerId]
          const blkPower = parseInt(blkData?.power ?? '0', 10) || 0
          const blkToughness = parseInt(blkData?.toughness ?? '0', 10) || 0
          const blkName = blkData?.name ?? 'Blocker'

          // Attacker damages blocker
          const atkLethal = atkPower >= blkToughness
          creaturesDamaged.push({
            instanceId: blockerId,
            playerId: opponentId,  // blocker belongs to the defending player
            damage: atkPower,
            lethal: atkLethal,
          })

          // Blocker damages attacker
          const blkLethal = blkPower >= atkToughness
          creaturesDamaged.push({
            instanceId: atk.instanceId,
            playerId: userId,  // attacker belongs to the active player
            damage: blkPower,
            lethal: blkLethal,
          })

          descParts.push(`${atkName} (${atkPower}/${atkToughness}) vs ${blkName} (${blkPower}/${blkToughness})`)
        }
      }
    }

    const description = descParts.length > 0
      ? `Combat: ${descParts.join('; ')}${damageToPlayer > 0 ? ` | ${damageToPlayer} to opponent` : ''}`
      : 'No combat damage'

    sendAction(createCombatDamage(userId, damageToPlayer, creaturesDamaged, description))
  }, [gameState, userId, opponentId, cardMap, sendAction])

  // Attacker eligibility: creatures, tokens, or permanents with altered P/T
  // (e.g. lands animated into creatures). Matches CombatAttackers' filter.
  const hasEligibleAttackers = useMemo(() => {
    if (!myState) return false
    return myState.battlefield.some((c) => {
      if (c.tapped) return false
      const data = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
      if (!data) return false
      const kws = data.keywords?.map((k) => k.toLowerCase()) ?? []
      if (kws.includes('defender')) return false
      const isCreature = data.typeLine.toLowerCase().includes('creature')
      const hasAlteredPT = (c.powerMod ?? 0) !== 0 || (c.toughnessMod ?? 0) !== 0
      return isCreature || data.isToken || hasAlteredPT
    })
  }, [myState, cardMap])

  // Auto-skip declare_attackers when no eligible attackers exist on the battlefield.
  const autoSkippedAttackersRef = useRef<number | null>(null)
  useEffect(() => {
    if (!gameState || !isActivePlayer || !hasPriority) return
    if (gameState.phase !== 'declare_attackers') {
      autoSkippedAttackersRef.current = null
      return
    }
    if (hasEligibleAttackers) return
    if (autoSkippedAttackersRef.current === gameState.turn) return
    autoSkippedAttackersRef.current = gameState.turn
    handleSkipAttackers()
  }, [gameState, isActivePlayer, hasPriority, hasEligibleAttackers, handleSkipAttackers])

  // Overlay conditions
  const showAttackerUI = gameState?.phase === 'declare_attackers' && isActivePlayer && hasPriority && hasEligibleAttackers
  const showBlockerUI = gameState?.phase === 'declare_blockers' && !isActivePlayer && hasPriority
  const showDiscardUI = gameState?.phase === 'cleanup' && myState && myState.hand.length > 7

  // Loading state
  if (loading || !gameState || !myState || !opponentState) {
    return (
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-bg-dark"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <span className="text-font-muted">Loading game...</span>
      </div>
    )
  }

  // Game over overlay
  if (gameOver) {
    const won = gameOver.winnerId === userId
    return (
      <div
        className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-bg-dark"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <span className={`text-3xl font-bold ${won ? 'text-bg-green' : 'text-bg-red'}`}>
          {won ? 'You Win!' : 'You Lose'}
        </span>
        <Link href="/play" className="rounded-xl bg-bg-accent px-6 py-2 text-sm font-bold text-font-white">
          Back to Lobby
        </Link>
      </div>
    )
  }

  // Mulligan stage
  if (gameState.mulliganStage) {
    const myDecision = gameState.mulliganStage.playerDecisions[userId]
    const opponentDecision = opponentId ? gameState.mulliganStage.playerDecisions[opponentId] : null

    // Bottom cards selection
    if (myDecision.decided && !myDecision.bottomCardsDone && myDecision.needsBottomCards > 0) {
      const needed = myDecision.needsBottomCards
      return (
        <div
          className="fixed inset-0 z-40 flex flex-col bg-bg-dark"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="flex items-center justify-between border-b border-border bg-bg-surface px-4 py-3">
            <span className="text-sm font-semibold text-font-primary">Multiplayer</span>
            <span className="text-xs text-font-muted">Select {needed} card{needed > 1 ? 's' : ''} to put on bottom</span>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
            <h2 className="text-lg font-bold text-font-primary">Put {needed} Card{needed > 1 ? 's' : ''} on Bottom</h2>
            <p className="text-sm text-font-secondary">Selected: {bottomSelectIds.size} / {needed}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {myHandCards.map((hc) => {
                const isSelected = bottomSelectIds.has(hc.instanceId)
                return (
                  <button key={hc.instanceId}
                    onClick={() => {
                      if (!isSelected && bottomSelectIds.size >= needed) return
                      setBottomSelectIds((prev) => {
                        const next = new Set(prev)
                        if (next.has(hc.instanceId)) next.delete(hc.instanceId); else next.add(hc.instanceId)
                        return next
                      })
                    }}
                    className={`relative overflow-hidden rounded-lg border transition-all ${isSelected ? 'border-bg-red ring-2 ring-bg-red/40' : 'border-border-light hover:border-bg-accent'}`}
                    style={{ width: 90, height: 126 }}>
                    {hc.card.image_small ? <img src={hc.card.image_small} alt={hc.card.name} className="h-full w-full object-cover" /> : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-bg-surface p-2">
                        <span className="text-[8px] text-font-secondary">{hc.card.type_line?.split('—')[0].trim()}</span>
                        <span className="text-center text-[10px] font-semibold text-font-primary">{hc.card.name}</span>
                      </div>
                    )}
                    {isSelected && <div className="absolute inset-0 flex items-center justify-center bg-bg-dark/50"><span className="text-xs font-bold text-font-white">BOTTOM</span></div>}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => {
                handleBottomCardsConfirm(Array.from(bottomSelectIds))
                setBottomSelectIds(new Set())
              }}
              disabled={bottomSelectIds.size !== needed}
              className="rounded-xl bg-bg-green px-6 py-2.5 text-sm font-bold text-font-white hover:bg-bg-green/80 disabled:cursor-not-allowed disabled:opacity-40">
              Confirm ({bottomSelectIds.size}/{needed})
            </button>
          </div>
        </div>
      )
    }

    // Mulligan decision (keep or mull)
    if (!myDecision.decided) {
      const mulliganCount = myDecision.mulliganCount
      return (
        <div
          className="fixed inset-0 z-40 flex flex-col bg-bg-dark"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="flex items-center justify-between border-b border-border bg-bg-surface px-4 py-3">
            <span className="text-sm font-semibold text-font-primary">Multiplayer</span>
            <span className="text-xs text-font-muted">{mulliganCount > 0 ? `Mulligan ${mulliganCount}` : 'Opening Hand'}</span>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
            <h2 className="text-lg font-bold text-font-primary">
              {mulliganCount === 0 ? 'Opening Hand' : `Mulligan ${mulliganCount} — Draw 7`}
            </h2>
            <p className="text-sm text-font-secondary">
              {mulliganCount > 0 ? `After keeping, put ${mulliganCount} card${mulliganCount > 1 ? 's' : ''} on bottom.` : 'Keep this hand or mulligan?'}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {myHandCards.map((hc) => (
                <button key={hc.instanceId}
                  onClick={() => setPreview({ card: hc.card })}
                  className="overflow-hidden rounded-lg border border-border-light transition-transform hover:scale-105"
                  style={{ width: 90, height: 126 }}>
                  {hc.card.image_small ? <img src={hc.card.image_small} alt={hc.card.name} className="h-full w-full object-cover" /> : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-bg-surface p-2">
                      <span className="text-[8px] text-font-secondary">{hc.card.type_line?.split('—')[0].trim()}</span>
                      <span className="text-center text-[10px] font-semibold text-font-primary">{hc.card.name}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
            {opponentDecision && (
              <p className="text-xs text-font-muted">
                {opponentDecision.decided
                  ? (opponentDecision.bottomCardsDone ? 'Opponent is ready' : 'Opponent is selecting bottom cards...')
                  : 'Opponent is deciding...'}
              </p>
            )}
            <div className="flex gap-3">
              <button onClick={handleKeepMultiplayerHand} className="rounded-xl bg-bg-green px-6 py-2.5 text-sm font-bold text-font-white hover:bg-bg-green/80">Keep</button>
              {mulliganCount < 7 && (
                <button onClick={handleMulligan} className="rounded-xl bg-bg-accent px-6 py-2.5 text-sm font-bold text-font-white hover:bg-bg-accent-dark">Mulligan</button>
              )}
            </div>
          </div>
          <CardPreviewOverlay preview={preview} onClose={closePreview} readOnly />
        </div>
      )
    }

    // Waiting for opponent to finish (multiplayer only — ghost auto-keeps)
    if (!isGoldfish) {
      return (
        <div
          className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-bg-dark"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <span className="text-sm text-font-muted">Waiting for opponent to finish mulligan...</span>
        </div>
      )
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-bg-dark"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Back button — goldfish only */}
      {isGoldfish && (
        <div className="flex items-center border-b border-border/40 px-2">
          <Link
            href={`/decks/${(props as PlayGameProps & { mode: 'goldfish' }).deckId}`}
            className="flex min-h-11 items-center gap-1 px-2 text-font-secondary active:text-font-primary"
          >
            <ChevronLeft size={20} /><span className="text-sm font-medium">Deck</span>
          </Link>
        </div>
      )}
      {/* Scrollable: opponent + spacer + player battlefield */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {/* Opponent field — full in multiplayer, minimal life counter in goldfish */}
        {!isGoldfish ? (
          <OpponentField
            state={opponentState}
            cardMap={cardMap}
            expanded={opponentExpanded}
            onToggleExpand={() => setOpponentExpanded((v) => !v)}
            onCardPreview={(card, instanceId) => setPreview({ card, zone: 'opponentBattlefield' as PreviewZone, instanceId })}
          />
        ) : opponentState && botId ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2">
            <span className="text-[10px] font-bold text-font-muted uppercase tracking-wider">
              {playerNames[botId] ?? 'Goldfish'}
            </span>

            {/* Opponent life with +/- controls — goldfish mode only, so the
             *  player can track damage dealt to the ghost without editing
             *  state by hand. Uses the same life_change action as own life. */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => sendAction(createLifeChange(userId, myName, botId, playerNames[botId] ?? 'Goldfish', -1))}
                aria-label="Opponent lose 1 life"
                className="flex h-6 w-6 items-center justify-center rounded bg-bg-cell text-font-secondary active:bg-bg-red"
              >
                <Minus size={10} />
              </button>
              <div className="flex items-center gap-0.5">
                <Heart size={11} className="text-bg-red" fill="currentColor" />
                <span className="min-w-[20px] text-center text-sm font-bold text-font-primary">
                  {opponentState.life}
                </span>
              </div>
              <button
                type="button"
                onClick={() => sendAction(createLifeChange(userId, myName, botId, playerNames[botId] ?? 'Goldfish', 1))}
                aria-label="Opponent gain 1 life"
                className="flex h-6 w-6 items-center justify-center rounded bg-bg-cell text-font-secondary active:bg-bg-green"
              >
                <Plus size={10} />
              </button>
            </div>

            {/* Zone counters — tap to inspect. Mirrors the bottom action bar. */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setOpponentViewingZone('graveyard')}
                className="flex items-center gap-1 active:brightness-125"
                aria-label="Opponent graveyard"
              >
                <Archive size={14} className="text-zinc-400" />
                <span className="text-xs font-semibold tabular-nums text-font-primary">
                  {opponentState.graveyard.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setOpponentViewingZone('exile')}
                className="flex items-center gap-1 active:brightness-125"
                aria-label="Opponent exile"
              >
                <Ban size={14} className="text-red-400" />
                <span className="text-xs font-semibold tabular-nums text-font-primary">
                  {opponentState.exile.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setOpponentViewingZone('library')}
                className="flex items-center gap-1 active:brightness-125"
                aria-label="Opponent library"
              >
                <Layers size={14} className="text-blue-400" />
                <span className="text-xs font-semibold tabular-nums text-font-primary">
                  {opponentState.libraryCount}
                </span>
              </button>
            </div>
          </div>
        ) : null}

        {/* Divider */}
        <div className="mx-3 border-t border-border/40" />

        {/* Spacer pushes player battlefield to bottom */}
        <div className="flex-1" />

        {/* Your battlefield — anchored to bottom of scroll area */}
        <div className="px-3 py-1.5">
          {/* Creatures */}
          <BattlefieldZone
            title="CREATURES"
            cards={myBattlefieldByZone.creatures}
            onTapToggle={handleTapToggle}
            phase={gameState?.phase}
            onCardAction={(card, id, tapped, x, y) => openActionMenu('battlefield', id, card, x, y, tapped)}
            onCardPreview={(card, id, tapped) => {
              const bfCard = myState?.battlefield.find((c) => c.instanceId === id)
              setPreview({ card, zone: 'battlefield', instanceId: id, tapped, counters: bfCard?.counters })
            }}
          />

          {/* Other permanents */}
          {myBattlefieldByZone.other.length > 0 && (
            <div className="mt-1.5">
              <BattlefieldZone
                title="OTHER"
                cards={myBattlefieldByZone.other}
                onTapToggle={handleTapToggle}
                phase={gameState?.phase}
                onCardAction={(card, id, tapped, x, y) => openActionMenu('battlefield', id, card, x, y, tapped)}
                onCardPreview={(card, id, tapped) =>
                  setPreview({ card, zone: 'battlefield', instanceId: id, tapped })
                }
              />
            </div>
          )}

          {/* Tokens */}
          {myBattlefieldByZone.tokens.length > 0 && (
            <div className="mt-1.5">
              <BattlefieldZone
                title="TOKENS"
                cards={myBattlefieldByZone.tokens}
                onTapToggle={handleTapToggle}
                phase={gameState?.phase}
                onCardAction={(card, id, tapped, x, y) => openActionMenu('battlefield', id, card, x, y, tapped)}
                onCardPreview={(card, id, tapped) => {
                  const bfCard = myState?.battlefield.find((c) => c.instanceId === id)
                  setPreview({ card, zone: 'battlefield', instanceId: id, tapped, counters: bfCard?.counters })
                }}
              />
            </div>
          )}

          {/* Lands */}
          <div className="mt-1.5">
            <BattlefieldZone
              title="LANDS"
              cards={myBattlefieldByZone.lands}
              onTapToggle={handleTapToggle}
              phase={gameState?.phase}
              onCardAction={(card, id, tapped, x, y) => openActionMenu('battlefield', id, card, x, y, tapped)}
              onCardPreview={(card, id, tapped) =>
                setPreview({ card, zone: 'battlefield', instanceId: id, tapped })
              }
            />
          </div>
        </div>
      </div>

      {/* Game Log — multiplayer only */}
      {!isGoldfish && (
        <GameLog
          entries={log}
          myUserId={userId}
          cardMap={cardMap}
          playerNames={playerNames}
          onSendChat={handleSendChat}
          onCardPreview={(card) => setPreview({ card })}
        />
      )}

      {/* Hand + Commander Zone */}
      <div className="border-t border-border bg-bg-card px-3 py-2">
        <div className="flex gap-2">
          <div className="flex-1 min-w-0">
            <HandArea
              cards={myHandCards}
              onPlayCard={handlePlayCard}
              onCardAction={(card, id, x, y) => openActionMenu('hand', id, card, x, y)}
              onCardPreview={(card, instanceId) =>
                setPreview({ card, zone: 'hand', instanceId })
              }
            />
          </div>
          {myState.commandZone.length > 0 && (
            <div className="flex shrink-0 flex-col gap-1">
              <span className="text-[7px] font-bold tracking-wider text-yellow-500 text-center">CMD</span>
              {myState.commandZone.map((c) => {
                const data = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
                return (
                  <CommandZoneCard
                    key={c.instanceId}
                    cardId={c.cardId}
                    data={data}
                    onOpenPreview={(row) =>
                      setPreview({ card: row, zone: 'commandZone', instanceId: c.instanceId })
                    }
                    onOpenAction={(row, x, y) => openActionMenu('command', c.instanceId, row, x, y)}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Action Bar at bottom */}
      <GameActionBar
        mode={mode}
        phase={gameState.phase}
        turn={gameState.turn}
        life={myState.life}
        libraryCount={myState.libraryCount}
        graveyardCount={myState.graveyard.length}
        exileCount={myState.exile.length}
        hasPriority={hasPriority}
        isActivePlayer={isActivePlayer}
        onPassPriority={() => sendAction(createPassPriority(userId, myName))}
        onLifeChange={(amount) => sendAction(createLifeChange(userId, myName, userId, myName, amount))}
        onDraw={() => sendAction(createDraw(userId, myName))}
        onViewZone={setViewingZone}
        onConcede={isGoldfish
          ? () => {
            const gProps = props as PlayGameProps & { mode: 'goldfish' }
            setGameState(structuredClone(gProps.initialState))
            setGameOver(null)
          }
          : () => sendAction(createConcede(userId, myName))
        }
        onConfirmUntap={() => sendAction(createConfirmUntap(userId, myName))}
        autoPass={myState.autoPass}
        onToggleAutoPass={() => sendAction(createToggleAutoPass(userId, myName, myState.autoPass))}
        onSpecialActions={() => setShowSpecialActions(true)}
      />

      {/* Zone viewers */}
      {viewingZone === 'graveyard' && (
        <CardZoneViewer
          title="Graveyard"
          cards={graveyardCards}
          onClose={() => setViewingZone(null)}
          onCardPreview={(card) => setPreview({ card })}
          onCardAction={(entry, x, y) => openActionMenu('graveyard', entry.instanceId, entry.card, x, y)}
          groupByType
        />
      )}
      {viewingZone === 'exile' && (
        <CardZoneViewer
          title="Exile"
          cards={exileCards}
          onClose={() => setViewingZone(null)}
          onCardPreview={(card) => setPreview({ card })}
          onCardAction={(entry, x, y) => openActionMenu('exile', entry.instanceId, entry.card, x, y)}
          groupByType
        />
      )}
      {viewingZone === 'library' && (
        <CardZoneViewer
          title="Library (top to bottom)"
          cards={libraryCards}
          onClose={() => setViewingZone(null)}
          onCloseAndShuffle={handleCloseAndShuffleLibrary}
          onCardPreview={(card) => setPreview({ card })}
          onCardAction={(entry, x, y) => openActionMenu('library_top', entry.instanceId, entry.card, x, y)}
        />
      )}

      {/* Opponent zone viewers — read-only preview (no instance actions),
       *  since the card preview overlay's ghost-targeted moves aren't wired
       *  up. Goldfish still benefits from seeing what's piled up there. */}
      {opponentViewingZone === 'graveyard' && (
        <CardZoneViewer
          title={`${playerNames[botId ?? ''] ?? 'Opponent'} — Graveyard`}
          cards={opponentGraveyardCards}
          onClose={() => setOpponentViewingZone(null)}
          onCardPreview={(card) => setPreview({ card })}
          groupByType
        />
      )}
      {opponentViewingZone === 'exile' && (
        <CardZoneViewer
          title={`${playerNames[botId ?? ''] ?? 'Opponent'} — Exile`}
          cards={opponentExileCards}
          onClose={() => setOpponentViewingZone(null)}
          onCardPreview={(card) => setPreview({ card })}
          groupByType
        />
      )}
      {opponentViewingZone === 'library' && (
        <CardZoneViewer
          title={`${playerNames[botId ?? ''] ?? 'Opponent'} — Library`}
          cards={opponentLibraryCards}
          onClose={() => setOpponentViewingZone(null)}
          onCardPreview={(card) => setPreview({ card })}
        />
      )}

      {/* Card preview overlay (long-press/right-click) — zone-aware actions */}
      <CardPreviewOverlay
        preview={preview}
        onClose={closePreview}
        readOnly={!preview?.instanceId || !preview?.zone}
        counters={(() => {
          if (!preview?.instanceId || !myState) return preview?.counters
          const bfCard = myState.battlefield.find(c => c.instanceId === preview.instanceId)
          return bfCard?.counters ?? preview?.counters
        })()}

        {...(preview?.zone === 'hand' ? {
          onPlay: handlePlayCard,
          onDiscard: handleDiscardCard,
          onExile: (id: string) => handleExileFromHand(id),
          onSendToBottom: (id: string) => handleSendToBottom(id, 'hand'),
          onSendToTop: (id: string) => handleSendToTop(id, 'hand'),
          onShuffle: (id: string) => handleShuffle(id, 'hand'),
        } : {})}

        {...(preview?.zone === 'battlefield' ? {
          onSacrifice: handleSendToGraveyard,
          onExile: handleExile,
          onReturnToHand: handleReturnToHand,
          onSendToBottom: (id: string) => handleSendToBottom(id, 'battlefield'),
          onSendToTop: (id: string) => handleSendToTop(id, 'battlefield'),
          onShuffle: (id: string) => handleShuffle(id, 'battlefield'),
          onTap: handleTapToggle,
          onAddCounter: handleAddCounter,
          onRemoveCounter: handleRemoveCounter,
          onSetCounter: handleSetCounter,
          onSetPT: handleSetPT,
          ptMod: (() => {
            if (!preview?.instanceId || !myState) return undefined
            const bfCard = myState.battlefield.find((c) => c.instanceId === preview.instanceId)
            return bfCard ? { powerMod: bfCard.powerMod ?? 0, toughnessMod: bfCard.toughnessMod ?? 0 } : undefined
          })(),
          onCopy: handleCopy,
        } : {})}

        {...(preview?.zone === 'commandZone' ? {
          onCastCommander: handleCastCommander,
        } : {})}

        {...(preview?.zone === 'graveyard' ? {
          onPlay: (id: string) => handlePlayFromZone(id, 'graveyard'),
          onReturnToHand: (id: string) => handleReturnToHandFromZone(id, 'graveyard'),
          onExile: (id: string) => handleExileFromZone(id, 'graveyard'),
          onSendToBottom: (id: string) => handleSendToBottom(id, 'graveyard'),
          onSendToTop: (id: string) => handleSendToTop(id, 'graveyard'),
          onShuffle: (id: string) => handleShuffle(id, 'graveyard'),
        } : {})}

        {...(preview?.zone === 'exile' ? {
          onPlay: (id: string) => handlePlayFromZone(id, 'exile'),
          onReturnToHand: (id: string) => handleReturnToHandFromZone(id, 'exile'),
          onSendToGraveyard: (id: string) => handleSendToGraveyardFromZone(id, 'exile'),
          onSendToBottom: (id: string) => handleSendToBottom(id, 'exile'),
          onSendToTop: (id: string) => handleSendToTop(id, 'exile'),
          onShuffle: (id: string) => handleShuffle(id, 'exile'),
        } : {})}

        {...(preview?.zone === 'library' ? {
          onPlay: (id: string) => handlePlayFromZone(id, 'library'),
          onReturnToHand: (id: string) => handleReturnToHandFromZone(id, 'library'),
          onSendToGraveyard: (id: string) => handleSendToGraveyardFromZone(id, 'library'),
          onExile: (id: string) => handleExileFromZone(id, 'library'),
          onSendToBottom: (id: string) => handleSendToBottom(id, 'library'),
          onSendToTop: (id: string) => handleSendToTop(id, 'library'),
        } : {})}

        {...(preview?.zone === 'opponentBattlefield' ? {
          onTakeControl: handleTakeControl,
        } : {})}
      />

      {/* Combat & discard overlays */}
      {showAttackerUI && (
        <CombatAttackers
          battlefield={myState.battlefield}
          cardMap={cardMap}
          onConfirm={handleDeclareAttackers}
          onSkip={handleSkipAttackers}
        />
      )}

      {showBlockerUI && opponentState && gameState && (
        <CombatBlockers
          myBattlefield={myState.battlefield}
          combat={gameState.combat}
          opponentBattlefield={opponentState.battlefield}
          cardMap={cardMap}
          onConfirm={handleDeclareBlockers}
          onSkip={handleSkipBlockers}
        />
      )}

      {showDiscardUI && (
        <DiscardSelector
          hand={myState.hand}
          cardMap={cardMap}
          onConfirm={handleDiscard}
          onCardPreview={(instanceId) => {
            const data = cardMap[instanceId]
            if (!data) return
            // Read-only preview during discard — actions are handled by the selector itself
            setPreview({ card: toCardRow(data.cardId, data), instanceId })
          }}
        />
      )}

      {/* Token creator modal */}
      {showTokenCreator && (
        <TokenCreator
          deckTokens={deckTokens}
          onCreateToken={handleCreateToken}
          onClose={() => setShowTokenCreator(false)}
        />
      )}

      {/* Commander death choice modal */}
      {gameState?.pendingCommanderChoice && gameState.pendingCommanderChoice.playerId === userId && myState && (
        <CommanderChoiceModal
          instanceId={gameState.pendingCommanderChoice.instanceId}
          cardId={gameState.pendingCommanderChoice.cardId}
          cardName={gameState.pendingCommanderChoice.cardName}
          source={gameState.pendingCommanderChoice.source}
          commanderCastCount={myState.commanderCastCount}
          cardMap={cardMap}
          onChoose={(destination) => {
            sendAction(createCommanderChoice(
              userId, myName,
              gameState.pendingCommanderChoice!.cardName,
              destination
            ))
          }}
        />
      )}

      {/* Revealed cards chooser (scry/surveil) */}
      {myState?.revealedCards && (
        <RevealedCardsChooser
          actionType={myState.revealedCards.action}
          cards={myState.revealedCards.instanceIds.map(id => {
            const data = cardMap[id]
            if (!data) return null
            return { instanceId: id, card: toCardRow(data.cardId, data) }
          }).filter((x): x is { instanceId: string; card: CardRow } => x !== null)}
          onConfirm={(decisions, topOrder) => {
            const cardIds: Record<string, number> = {}
            for (const id of myState.revealedCards!.instanceIds) {
              const data = cardMap[id]
              if (data) cardIds[id] = data.cardId
            }
            const parts = Object.entries(decisions).map(([id, dest]) => {
              const data = cardMap[id]
              return `${data?.name ?? '?'} -> ${dest}`
            })
            sendAction({
              type: 'resolve_revealed' as GameActionType,
              playerId: userId,
              data: { decisions, topOrder, cardIds },
              text: `${myName} resolves ${myState.revealedCards!.action}: ${parts.join(', ')}`,
            })
          }}
          onClose={() => {
            const decisions: Record<string, 'top'> = {}
            for (const id of myState.revealedCards!.instanceIds) {
              decisions[id] = 'top'
            }
            sendAction({
              type: 'resolve_revealed' as GameActionType,
              playerId: userId,
              data: { decisions, topOrder: myState.revealedCards!.instanceIds, cardIds: {} },
              text: `${myName} cancels ${myState.revealedCards!.action}`,
            })
          }}
        />
      )}

      {/* Special Actions Menu */}
      {showSpecialActions && (
        <SpecialActionsMenu
          onPeak={(n) => {
            const topN = myState.library.slice(0, n)
            const cards = topN.map(id => {
              const data = cardMap[id]
              if (!data) return null
              return { instanceId: id, card: toCardRow(data.cardId, data) }
            }).filter((x): x is { instanceId: string; card: CardRow } => x !== null)
            setPeakCards(cards)
            sendAction({ type: 'peak' as GameActionType, playerId: userId, data: { count: n }, text: `${myName} peeks at top ${n} card${n > 1 ? 's' : ''} of their library` })
          }}
          onScry={(n) => {
            sendAction({ type: 'reveal_top' as GameActionType, playerId: userId, data: { count: n, actionType: 'scry' }, text: `${myName} scries ${n}` })
          }}
          onSurveil={(n) => {
            sendAction({ type: 'reveal_top' as GameActionType, playerId: userId, data: { count: n, actionType: 'surveil' }, text: `${myName} surveils ${n}` })
          }}
          onMill={(n, target) => {
            const targetId = target === 'self' ? userId : opponentId!
            const targetLib = gameState.players[targetId].library
            const topN = targetLib.slice(0, Math.min(n, targetLib.length))
            const cardIds: Record<string, number> = {}
            for (const id of topN) {
              const data = cardMap[id]
              if (data) cardIds[id] = data.cardId
            }
            sendAction({ type: 'mill' as GameActionType, playerId: userId, data: { count: n, targetPlayerId: targetId, cardIds }, text: `${myName} mills ${n} card${n > 1 ? 's' : ''} from ${target === 'self' ? 'their' : "opponent's"} library` })
          }}
          onDrawX={(n) => {
            sendAction({ type: 'draw_x' as GameActionType, playerId: userId, data: { count: n }, text: `${myName} draws ${n} card${n > 1 ? 's' : ''}` })
          }}
          onCreateToken={() => setShowTokenCreator(true)}
          onClose={() => setShowSpecialActions(false)}
        />
      )}

      {/* Peek cards viewer — tap a card to open the action menu (full set of
       *  destinations), long-press / right-click to inspect. Lets the player
       *  send a peeked card directly to hand, battlefield, GY, exile, top,
       *  bottom from inside the peek modal instead of closing it first. */}
      {peakCards && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-dark/80" onClick={() => setPeakCards(null)}>
          <div className="mx-4 w-full max-w-lg rounded-xl border border-border bg-bg-surface p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-sm font-bold text-font-primary">Top {peakCards.length} Card{peakCards.length > 1 ? 's' : ''}</h3>
            <p className="mb-3 text-[10px] text-font-muted">Tap a card for actions, hold to preview.</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {peakCards.map((pc) => (
                <PeakCardButton
                  key={pc.instanceId}
                  card={pc.card}
                  instanceId={pc.instanceId}
                  onOpenAction={(card, x, y) => openActionMenu('library_top', pc.instanceId, card, x, y)}
                  onOpenPreview={(card) => setPreview({ card })}
                />
              ))}
            </div>
            <button onClick={() => setPeakCards(null)}
              className="mt-4 w-full rounded-lg bg-bg-accent py-2 text-sm font-bold text-font-white">Done</button>
          </div>
        </div>
      )}

      {/* Action menu portal — common to every card surface above. */}
      {actionMenu && (
        <CardActionMenu
          x={actionMenu.x}
          y={actionMenu.y}
          zone={actionMenu.zone}
          isMine
          isCommander={actionMenu.isCommander}
          tapped={actionMenu.tapped}
          cardName={actionMenu.cardName}
          onMoveTo={(dest) => {
            handleActionMenuMove(actionMenu.zone, actionMenu.instanceId, dest)
            setActionMenu(null)
            // If we acted on a peeked card, clear the peek viewer too.
            if (actionMenu.zone === 'library_top' || actionMenu.zone === 'library_bottom') {
              setPeakCards((prev) => {
                if (!prev) return prev
                const next = prev.filter((p) => p.instanceId !== actionMenu.instanceId)
                return next.length === 0 ? null : next
              })
            }
          }}
          onTap={
            actionMenu.zone === 'battlefield'
              ? () => handleTapToggle(actionMenu.instanceId)
              : undefined
          }
          onClose={closeActionMenu}
        />
      )}
    </div>
  )
}
