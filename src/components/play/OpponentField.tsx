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
    keywords: null,
    produced_mana: null,
    layout: null,
    card_faces: null,
    search_vector: null,
    created_at: '',
    updated_at: '',
  }
}

interface OpponentFieldProps {
  state: PlayerState
  cardMap: CardMap
  expanded: boolean
  onToggleExpand: () => void
  onCardPreview?: (card: CardRow) => void
}

function OpponentCard({
  card,
  cardMap,
  expanded,
  onCardPreview,
}: {
  card: BattlefieldCardState
  cardMap: CardMap
  expanded: boolean
  onCardPreview?: (card: CardRow) => void
}) {
  const data = cardMap[card.instanceId] ?? cardMap[String(card.cardId)]
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggeredRef = useRef(false)

  const triggerPreview = useCallback(() => {
    if (!onCardPreview || !data) return
    const row = toCardRow(card.cardId, data)
    onCardPreview(row)
  }, [onCardPreview, data, card.cardId])

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
    // If long-press already triggered, don't fire click
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

  const size = expanded ? { width: 68, height: 95 } : { width: 48, height: 67 }

  return (
    <button
      type="button"
      className={`overflow-hidden rounded border transition-transform ${
        card.tapped ? 'rotate-90 border-font-muted' : 'border-border'
      } ${card.attacking ? 'ring-1 ring-bg-red' : ''} ${card.highlighted === 'red' ? 'ring-2 ring-bg-red' : ''}`}
      style={size}
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
    </button>
  )
}

export default function OpponentField({
  state,
  cardMap,
  expanded,
  onToggleExpand,
  onCardPreview,
}: OpponentFieldProps) {
  const creatures = state.battlefield.filter((c) => {
    const d = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
    return d?.typeLine?.toLowerCase().includes('creature')
  })
  const lands = state.battlefield.filter((c) => {
    const d = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
    return d?.typeLine?.toLowerCase().includes('land')
  })
  const other = state.battlefield.filter((c) => {
    const d = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
    return d && !d.typeLine?.toLowerCase().includes('creature') && !d.typeLine?.toLowerCase().includes('land')
  })

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

      {/* Battlefield */}
      <div className="flex flex-wrap gap-1">
        {[...creatures, ...other, ...lands].map((c) => (
          <OpponentCard
            key={c.instanceId}
            card={c}
            cardMap={cardMap}
            expanded={expanded}
            onCardPreview={onCardPreview}
          />
        ))}
        {state.battlefield.length === 0 && (
          <span className="py-2 text-[9px] text-font-muted">No permanents</span>
        )}
      </div>
    </div>
  )
}
