'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  createPassPriority, createPlayCard, createTap, createUntap,
  createConfirmUntap, createMoveZone, createLifeChange,
  createDraw, createConcede,
} from '@/lib/game/actions'
import { getOpponentId } from '@/lib/game/phases'
import type { GameState, CardMap, LogEntry } from '@/lib/game/types'
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

type CardRow = Database['public']['Tables']['cards']['Row']

/** Build a minimal CardRow-compatible object from CardMap data */
function toCardRow(cardId: number, data: CardMap[string]): CardRow {
  return {
    id: cardId,
    scryfall_id: '',
    name: data.name,
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
    legalities: null,
    power: data.power ?? null,
    toughness: data.toughness ?? null,
    keywords: null,
    produced_mana: null,
    layout: null,
    card_faces: null,
    search_vector: null,
    created_at: '',
    updated_at: '',
  }
}

export default function PlayGame({ lobbyId, userId }: { lobbyId: string; userId: string }) {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [cardMap, setCardMap] = useState<CardMap>({})
  const [log, setLog] = useState<LogEntry[]>([])
  const [viewingZone, setViewingZone] = useState<'graveyard' | 'exile' | 'library' | null>(null)
  const [loading, setLoading] = useState(true)
  const [gameOver, setGameOver] = useState<{ winnerId: string } | null>(null)

  // Fetch initial state
  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/game/${lobbyId}`)
      if (res.ok) {
        const data = await res.json()
        setGameState(data.gameState)
        setCardMap(data.cardMap)
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
  }, [lobbyId])

  // Realtime subscription
  useEffect(() => {
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
  }, [lobbyId])

  // Send action helper
  const sendAction = useCallback(async (action: ReturnType<typeof createPassPriority>) => {
    await fetch(`/api/game/${lobbyId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    })
  }, [lobbyId])

  // Derived state
  const myState = gameState?.players[userId]
  const opponentId = gameState ? getOpponentId(gameState, userId) : null
  const opponentState = opponentId ? gameState?.players[opponentId] : null
  const hasPriority = gameState?.priorityPlayerId === userId
  const isActivePlayer = gameState?.activePlayerId === userId

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
    if (!myState) return { lands: [] as BattlefieldCard[], creatures: [] as BattlefieldCard[], other: [] as BattlefieldCard[] }
    const lands: BattlefieldCard[] = []
    const creatures: BattlefieldCard[] = []
    const other: BattlefieldCard[] = []

    for (const c of myState.battlefield) {
      const data = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
      if (!data) continue
      const row = toCardRow(c.cardId, data)
      const entry: BattlefieldCard = { instanceId: c.instanceId, card: row, tapped: c.tapped }
      const zone = getCardZone(data.typeLine)
      if (zone === 'lands') lands.push(entry)
      else if (zone === 'creatures') creatures.push(entry)
      else other.push(entry)
    }

    return { lands, creatures, other }
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

  // Action handlers
  const handleTapToggle = useCallback((instanceId: string) => {
    if (!myState) return
    const card = myState.battlefield.find((c) => c.instanceId === instanceId)
    if (!card) return
    const data = cardMap[instanceId] ?? cardMap[String(card.cardId)]
    const name = data?.name ?? 'card'
    if (card.tapped) {
      sendAction(createUntap(userId, 'You', instanceId, name))
    } else {
      sendAction(createTap(userId, 'You', instanceId, name))
    }
  }, [myState, cardMap, sendAction, userId])

  const handlePlayCard = useCallback((instanceId: string) => {
    const data = cardMap[instanceId]
    if (!data) return
    sendAction(createPlayCard(userId, 'You', instanceId, data.cardId, data.name, 'hand', 'battlefield'))
  }, [cardMap, sendAction, userId])

  const handleSendToGraveyard = useCallback((instanceId: string) => {
    if (!myState) return
    const card = myState.battlefield.find((c) => c.instanceId === instanceId)
    if (!card) return
    const data = cardMap[instanceId] ?? cardMap[String(card.cardId)]
    sendAction(createMoveZone(userId, 'You', instanceId, card.cardId, data?.name ?? 'card', 'battlefield', 'graveyard'))
  }, [myState, cardMap, sendAction, userId])

  const handleExile = useCallback((instanceId: string) => {
    if (!myState) return
    const card = myState.battlefield.find((c) => c.instanceId === instanceId)
    if (!card) return
    const data = cardMap[instanceId] ?? cardMap[String(card.cardId)]
    sendAction(createMoveZone(userId, 'You', instanceId, card.cardId, data?.name ?? 'card', 'battlefield', 'exile'))
  }, [myState, cardMap, sendAction, userId])

  const handleReturnToHand = useCallback((instanceId: string) => {
    if (!myState) return
    const card = myState.battlefield.find((c) => c.instanceId === instanceId)
    if (!card) return
    const data = cardMap[instanceId] ?? cardMap[String(card.cardId)]
    sendAction(createMoveZone(userId, 'You', instanceId, card.cardId, data?.name ?? 'card', 'battlefield', 'hand'))
  }, [myState, cardMap, sendAction, userId])

  // Loading state
  if (loading || !gameState || !myState || !opponentState) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-dark">
        <span className="text-font-muted">Loading game...</span>
      </div>
    )
  }

  // Game over overlay
  if (gameOver) {
    const won = gameOver.winnerId === userId
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-dark">
        <span className={`text-3xl font-bold ${won ? 'text-bg-green' : 'text-bg-red'}`}>
          {won ? 'You Win!' : 'You Lose'}
        </span>
        <a href="/play" className="rounded-xl bg-bg-accent px-6 py-2 text-sm font-bold text-font-white">
          Back to Lobby
        </a>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg-dark">
      {/* Opponent field */}
      <OpponentField state={opponentState} cardMap={cardMap} />

      {/* Your battlefield */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {/* Command zone */}
        {myState.commandZone.length > 0 && (
          <div className="mb-2">
            <span className="text-[9px] font-semibold tracking-wider text-font-muted">COMMAND ZONE</span>
            <div className="mt-1 flex gap-1.5">
              {myState.commandZone.map((c) => {
                const data = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
                return (
                  <button
                    key={c.instanceId}
                    onClick={() => {
                      if (!data) return
                      sendAction(createPlayCard(userId, 'You', c.instanceId, c.cardId, data.name, 'commandZone', 'battlefield'))
                    }}
                    className="overflow-hidden rounded-lg border border-yellow-500/50 bg-bg-card"
                    style={{ width: 68, height: 95 }}
                    title={`${data?.name ?? '?'} -- tap to cast`}
                  >
                    {data?.imageSmall ? (
                      <img src={data.imageSmall} alt={data.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center p-1">
                        <span className="text-center text-[8px] font-semibold text-font-primary">{data?.name ?? '?'}</span>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Creatures */}
        <BattlefieldZone
          title="CREATURES"
          cards={myBattlefieldByZone.creatures}
          onTapToggle={handleTapToggle}
          onSendToGraveyard={handleSendToGraveyard}
          onExile={handleExile}
          onReturnToHand={handleReturnToHand}
        />

        {/* Other permanents */}
        {myBattlefieldByZone.other.length > 0 && (
          <div className="mt-2">
            <BattlefieldZone
              title="OTHER"
              cards={myBattlefieldByZone.other}
              onTapToggle={handleTapToggle}
              onSendToGraveyard={handleSendToGraveyard}
              onExile={handleExile}
              onReturnToHand={handleReturnToHand}
            />
          </div>
        )}

        {/* Lands */}
        <div className="mt-2">
          <BattlefieldZone
            title="LANDS"
            cards={myBattlefieldByZone.lands}
            onTapToggle={handleTapToggle}
            onSendToGraveyard={handleSendToGraveyard}
            onExile={handleExile}
            onReturnToHand={handleReturnToHand}
          />
        </div>
      </div>

      {/* Hand */}
      <div className="border-t border-border bg-bg-card px-3 py-2">
        <HandArea
          cards={myHandCards}
          onPlayCard={handlePlayCard}
        />
      </div>

      {/* Game Log */}
      <GameLog entries={log} myUserId={userId} />

      {/* Action Bar */}
      <GameActionBar
        phase={gameState.phase}
        turn={gameState.turn}
        life={myState.life}
        libraryCount={myState.libraryCount}
        graveyardCount={myState.graveyard.length}
        exileCount={myState.exile.length}
        hasPriority={hasPriority}
        isActivePlayer={isActivePlayer}
        onPassPriority={() => sendAction(createPassPriority(userId, 'You'))}
        onLifeChange={(amount) => sendAction(createLifeChange(userId, 'You', userId, 'You', amount))}
        onDraw={() => sendAction(createDraw(userId, 'You'))}
        onViewZone={setViewingZone}
        onConcede={() => sendAction(createConcede(userId, 'You'))}
        onConfirmUntap={() => sendAction(createConfirmUntap(userId, 'You'))}
      />

      {/* Zone viewers */}
      {viewingZone === 'graveyard' && (
        <CardZoneViewer
          title="Graveyard"
          cards={graveyardCards}
          onClose={() => setViewingZone(null)}
          onReturnToHand={(instanceId) => {
            const c = myState.graveyard.find((g) => g.instanceId === instanceId)
            if (!c) return
            const data = cardMap[instanceId] ?? cardMap[String(c.cardId)]
            sendAction(createMoveZone(userId, 'You', instanceId, c.cardId, data?.name ?? 'card', 'graveyard', 'hand'))
            setViewingZone(null)
          }}
          onReturnToBattlefield={(instanceId) => {
            const c = myState.graveyard.find((g) => g.instanceId === instanceId)
            if (!c) return
            const data = cardMap[instanceId] ?? cardMap[String(c.cardId)]
            sendAction(createMoveZone(userId, 'You', instanceId, c.cardId, data?.name ?? 'card', 'graveyard', 'battlefield'))
            setViewingZone(null)
          }}
          groupByType
        />
      )}
      {viewingZone === 'exile' && (
        <CardZoneViewer
          title="Exile"
          cards={exileCards}
          onClose={() => setViewingZone(null)}
          onReturnToBattlefield={(instanceId) => {
            const c = myState.exile.find((e) => e.instanceId === instanceId)
            if (!c) return
            const data = cardMap[instanceId] ?? cardMap[String(c.cardId)]
            sendAction(createMoveZone(userId, 'You', instanceId, c.cardId, data?.name ?? 'card', 'exile', 'battlefield'))
            setViewingZone(null)
          }}
          groupByType
        />
      )}
    </div>
  )
}
