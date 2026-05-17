'use client'

import { useRef, useCallback } from 'react'
import { Heart, Layers, Archive, Ban, Crown, Maximize2, Minimize2 } from 'lucide-react'
import type { PlayerState, CardMap, BattlefieldCardState } from '@/lib/game/types'
import type { Database } from '@/types/supabase'

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
    price_sort: null,
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

interface OpponentFieldProps {
  state: PlayerState
  cardMap: CardMap
  expanded: boolean
  onToggleExpand: () => void
  onCardPreview?: (card: CardRow, instanceId: string) => void
}

function OpponentCard({
  card,
  cardMap,
  size,
  onCardPreview,
}: {
  card: BattlefieldCardState
  cardMap: CardMap
  size: { width: number; height: number }
  onCardPreview?: (card: CardRow, instanceId: string) => void
}) {
  const data = cardMap[card.instanceId] ?? cardMap[String(card.cardId)]
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggeredRef = useRef(false)

  const triggerPreview = useCallback(() => {
    if (!onCardPreview || !data) return
    const row = toCardRow(card.cardId, data)
    onCardPreview(row, card.instanceId)
  }, [onCardPreview, data, card.cardId, card.instanceId])

  const handlePointerDown = useCallback(() => {
    triggeredRef.current = false
    timerRef.current = setTimeout(() => {
      triggeredRef.current = true
      triggerPreview()
    }, 400)
  }, [triggerPreview])

  const handlePointerUp = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const handlePointerCancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const handleClick = useCallback(() => {
    if (triggeredRef.current) return
    triggerPreview()
  }, [triggerPreview])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      triggerPreview()
    },
    [triggerPreview],
  )

  const hasCounters = card.counters.length > 0
  const isCreature = data?.typeLine?.toLowerCase().includes('creature')

  return (
    <button
      type="button"
      className={`relative overflow-hidden rounded border transition-transform ${
        card.tapped ? 'rotate-90 border-font-muted' : 'border-border'
      } ${card.attacking ? 'ring-1 ring-bg-red' : ''} ${card.highlighted === 'red' ? 'ring-2 ring-bg-red' : ''}`}
      style={{ ...size, touchAction: 'manipulation' }}
      title={data?.name ?? 'Unknown'}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {data?.imageSmall ? (
        <img
          src={data.imageSmall}
          alt={data.name}
          className="pointer-events-none h-full w-full select-none object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-bg-cell p-0.5">
          <span className="text-center text-[6px] text-font-muted">{data?.name ?? '?'}</span>
        </div>
      )}

      {/* Counter badges */}
      {hasCounters && (
        <div className="absolute left-0 top-0 flex flex-col gap-px p-px">
          {card.counters.map((counter) => (
            <span
              key={counter.name}
              className="rounded-sm bg-blue-600 px-0.5 text-[6px] font-bold leading-tight text-white"
              title={`${counter.name}: ${counter.value}`}
            >
              {counter.value}
            </span>
          ))}
        </div>
      )}

      {/* Damage badge on creatures */}
      {isCreature && card.damageMarked > 0 && (
        <span className="absolute bottom-0 right-0 rounded-tl-sm bg-red-600 px-0.5 text-[6px] font-bold leading-tight text-white">
          {card.damageMarked}
        </span>
      )}
    </button>
  )
}

function OpponentZone({
  title,
  cards,
  cardMap,
  expanded,
  onCardPreview,
}: {
  title: string
  cards: BattlefieldCardState[]
  cardMap: CardMap
  expanded: boolean
  onCardPreview?: (card: CardRow, instanceId: string) => void
}) {
  if (cards.length === 0) return null
  const size = expanded ? { width: 68, height: 95 } : { width: 48, height: 67 }

  return (
    <div className="mb-1">
      <span className="text-[8px] font-bold tracking-wider text-font-muted">
        {title} ({cards.length})
      </span>
      <div className="mt-0.5 flex flex-wrap gap-1">
        {cards.map((c) => (
          <OpponentCard
            key={c.instanceId}
            card={c}
            cardMap={cardMap}
            size={size}
            onCardPreview={onCardPreview}
          />
        ))}
      </div>
    </div>
  )
}

export default function OpponentField({
  state,
  cardMap,
  expanded,
  onToggleExpand,
  onCardPreview,
}: OpponentFieldProps) {
  // Split battlefield into zones
  const creatures: BattlefieldCardState[] = []
  const lands: BattlefieldCardState[] = []
  const tokens: BattlefieldCardState[] = []
  const other: BattlefieldCardState[] = []

  for (const c of state.battlefield) {
    const d = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
    if (!d) {
      other.push(c)
      continue
    }
    if (d.isToken) {
      tokens.push(c)
    } else {
      const t = d.typeLine?.toLowerCase() ?? ''
      if (t.includes('creature')) {
        creatures.push(c)
      } else if (t.includes('land')) {
        lands.push(c)
      } else {
        other.push(c)
      }
    }
  }

  return (
    <div className="border-b border-border bg-bg-surface/50 px-3 py-2">
      {/* Stats row */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-wider text-font-muted">OPPONENT</span>
          <button
            type="button"
            onClick={onToggleExpand}
            className="rounded p-0.5 text-font-muted hover:text-font-primary active:bg-bg-cell"
            title={expanded ? 'Collapse cards' : 'Expand cards'}
          >
            {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Heart size={10} className="text-bg-red" />
            <span className="text-xs font-bold text-font-primary">{state.life}</span>
          </div>
          <div className="flex items-center gap-1 text-font-muted">
            <Layers size={10} />
            <span className="text-[10px]">{state.libraryCount}</span>
          </div>
          <div className="flex items-center gap-1 text-font-muted">
            <span className="text-[10px]">Hand: {state.handCount}</span>
          </div>
          <div className="flex items-center gap-1 text-font-muted">
            <Archive size={10} />
            <span className="text-[10px]">{state.graveyard.length}</span>
          </div>
          <div className="flex items-center gap-1 text-font-muted">
            <Ban size={10} />
            <span className="text-[10px]">{state.exile.length}</span>
          </div>
        </div>
      </div>

      {/* Command zone */}
      {state.commandZone.length > 0 && (
        <div className="mb-1 flex items-center gap-1">
          <Crown size={9} className="text-yellow-500" />
          {state.commandZone.map((c) => {
            const d = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
            return (
              <span key={c.instanceId} className="text-[9px] text-yellow-500">
                {d?.name ?? '?'}
              </span>
            )
          })}
        </div>
      )}

      {/* Battlefield zones */}
      {state.battlefield.length > 0 ? (
        <div className={expanded ? 'space-y-1' : ''}>
          <OpponentZone title="CREATURES" cards={creatures} cardMap={cardMap} expanded={expanded} onCardPreview={onCardPreview} />
          <OpponentZone title="OTHER" cards={other} cardMap={cardMap} expanded={expanded} onCardPreview={onCardPreview} />
          <OpponentZone title="LANDS" cards={lands} cardMap={cardMap} expanded={expanded} onCardPreview={onCardPreview} />
          <OpponentZone title="TOKENS" cards={tokens} cardMap={cardMap} expanded={expanded} onCardPreview={onCardPreview} />
        </div>
      ) : (
        <span className="py-2 text-[9px] text-font-muted">No permanents</span>
      )}
    </div>
  )
}
