'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useLongPress } from '@/lib/hooks/useLongPress'
import { createClient } from '@/lib/supabase/client'
import {
  createPassPriority, createPlayCard, createTap, createUntap,
  createConfirmUntap, createMoveZone, createLifeChange,
  createDraw, createConcede,
  createDeclareAttackers, createDeclareBlockers, createCombatDamage, createDiscard,
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
import CardPreviewOverlay, { type PreviewState } from '@/components/game/CardPreviewOverlay'
import CombatAttackers from './CombatAttackers'
import CombatBlockers from './CombatBlockers'
import DiscardSelector from './DiscardSelector'

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

/** Command zone card button — long-press or tap opens preview, where the user can Cast. */
function CommandZoneCard({
  cardId,
  data,
  onOpenPreview,
}: {
  cardId: number
  data: CardMap[string] | undefined
  onOpenPreview: (card: CardRow) => void
}) {
  const longPress = useLongPress({
    onLongPress: () => {
      if (data) onOpenPreview(toCardRow(cardId, data))
    },
    delay: 400,
  })

  const handleClick = () => {
    if (longPress.wasLongPress()) return
    if (data) onOpenPreview(toCardRow(cardId, data))
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
      style={{ width: 68, height: 95 }}
      title={`${data?.name ?? '?'} — tap to preview & cast`}
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

export default function PlayGame({ lobbyId, userId }: { lobbyId: string; userId: string }) {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [cardMap, setCardMap] = useState<CardMap>({})
  const [log, setLog] = useState<LogEntry[]>([])
  const [viewingZone, setViewingZone] = useState<'graveyard' | 'exile' | 'library' | null>(null)
  const [loading, setLoading] = useState(true)
  const [gameOver, setGameOver] = useState<{ winnerId: string } | null>(null)
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<PreviewState | null>(null)

  // Fetch initial state
  useEffect(() => {
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
  const myName = playerNames[userId] ?? 'Player'

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
    sendAction(createMoveZone(userId, myName, instanceId, card.cardId, data?.name ?? 'card', 'battlefield', 'graveyard'))
  }, [myState, cardMap, sendAction, userId])

  const handleExile = useCallback((instanceId: string) => {
    if (!myState) return
    const card = myState.battlefield.find((c) => c.instanceId === instanceId)
    if (!card) return
    const data = cardMap[instanceId] ?? cardMap[String(card.cardId)]
    sendAction(createMoveZone(userId, myName, instanceId, card.cardId, data?.name ?? 'card', 'battlefield', 'exile'))
  }, [myState, cardMap, sendAction, userId])

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

  const closePreview = useCallback(() => setPreview(null), [])

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

  // Overlay conditions
  const showAttackerUI = gameState?.phase === 'declare_attackers' && isActivePlayer && hasPriority
  const showBlockerUI = gameState?.phase === 'declare_blockers' && !isActivePlayer && hasPriority
  const showDiscardUI = gameState?.phase === 'cleanup' && myState && myState.hand.length > 7

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
        <Link href="/play" className="rounded-xl bg-bg-accent px-6 py-2 text-sm font-bold text-font-white">
          Back to Lobby
        </Link>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-bg-dark">
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
                  <CommandZoneCard
                    key={c.instanceId}
                    cardId={c.cardId}
                    data={data}
                    onOpenPreview={(row) =>
                      setPreview({ card: row, zone: 'commandZone', instanceId: c.instanceId })
                    }
                  />
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
          onCardPreview={(card, id, tapped) =>
            setPreview({ card, zone: 'battlefield', instanceId: id, tapped })
          }
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
              onCardPreview={(card, id, tapped) =>
                setPreview({ card, zone: 'battlefield', instanceId: id, tapped })
              }
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
            onCardPreview={(card, id, tapped) =>
              setPreview({ card, zone: 'battlefield', instanceId: id, tapped })
            }
          />
        </div>
      </div>

      {/* Hand */}
      <div className="border-t border-border bg-bg-card px-3 py-2">
        <HandArea
          cards={myHandCards}
          onPlayCard={handlePlayCard}
          onCardPreview={(card, instanceId) =>
            setPreview({ card, zone: 'hand', instanceId })
          }
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
        onPassPriority={() => sendAction(createPassPriority(userId, myName))}
        onLifeChange={(amount) => sendAction(createLifeChange(userId, myName, userId, myName, amount))}
        onDraw={() => sendAction(createDraw(userId, myName))}
        onViewZone={setViewingZone}
        onConcede={() => sendAction(createConcede(userId, myName))}
        onConfirmUntap={() => sendAction(createConfirmUntap(userId, myName))}
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
            sendAction(createMoveZone(userId, myName, instanceId, c.cardId, data?.name ?? 'card', 'graveyard', 'hand'))
            setViewingZone(null)
          }}
          onReturnToBattlefield={(instanceId) => {
            const c = myState.graveyard.find((g) => g.instanceId === instanceId)
            if (!c) return
            const data = cardMap[instanceId] ?? cardMap[String(c.cardId)]
            sendAction(createMoveZone(userId, myName, instanceId, c.cardId, data?.name ?? 'card', 'graveyard', 'battlefield'))
            setViewingZone(null)
          }}
          onCardPreview={(card) => setPreview({ card })}
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
            sendAction(createMoveZone(userId, myName, instanceId, c.cardId, data?.name ?? 'card', 'exile', 'battlefield'))
            setViewingZone(null)
          }}
          onCardPreview={(card) => setPreview({ card })}
          groupByType
        />
      )}
      {viewingZone === 'library' && (
        <CardZoneViewer
          title="Library (top to bottom)"
          cards={libraryCards}
          onClose={() => setViewingZone(null)}
          onReturnToHand={(instanceId) => {
            const idx = myState.library.findIndex((id) => id === instanceId)
            if (idx === -1) return
            const data = cardMap[instanceId]
            if (!data) return
            sendAction(createMoveZone(userId, myName, instanceId, data.cardId, data.name, 'library', 'hand'))
            setViewingZone(null)
          }}
          onCardPreview={(card) => setPreview({ card })}
        />
      )}

      {/* Card preview overlay (long-press/right-click) */}
      <CardPreviewOverlay
        preview={preview}
        onClose={closePreview}
        isCommanderCard={isCommanderCard}
        onTapToggle={handleTapToggle}
        onReturnToHand={handleReturnToHand}
        onReturnToCommandZone={handleReturnToCommandZone}
        onSendToGraveyard={handleSendToGraveyard}
        onExile={handleExile}
        onPlayCard={handlePlayCard}
        onDiscardFromHand={handleDiscardFromHand}
        onExileFromHand={handleExileFromHand}
        onPlayFromCommandZone={handlePlayFromCommandZone}
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
        />
      )}
    </div>
  )
}
