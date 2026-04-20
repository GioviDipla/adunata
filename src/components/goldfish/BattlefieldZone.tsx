'use client'

import { useCallback } from 'react'
import { useLongPress } from '@/lib/hooks/useLongPress'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

export interface BattlefieldCard {
  instanceId: string
  card: CardRow
  tapped: boolean
  counters?: { name: string; value: number }[]
  powerMod?: number
  toughnessMod?: number
}

interface BattlefieldZoneProps {
  title: string
  cards: BattlefieldCard[]
  onTapToggle: (instanceId: string) => void
  onCardPreview?: (card: CardRow, instanceId: string, tapped: boolean) => void
}

function BattlefieldCardButton({
  bc,
  onTapToggle,
  onCardPreview,
}: {
  bc: BattlefieldCard
  onTapToggle: (id: string) => void
  onCardPreview?: (card: CardRow, instanceId: string, tapped: boolean) => void
}) {
  const longPress = useLongPress({
    onLongPress: () => onCardPreview?.(bc.card, bc.instanceId, bc.tapped),
    delay: 400,
  })

  const handleClick = useCallback(() => {
    if (longPress.wasLongPress()) return
    onTapToggle(bc.instanceId)
  }, [longPress, onTapToggle, bc.instanceId])

  return (
    <button
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault()
        onCardPreview?.(bc.card, bc.instanceId, bc.tapped)
      }}
      {...longPress}
      className={`relative overflow-hidden rounded-lg border transition-transform select-none ${
        bc.tapped
          ? 'rotate-90 border-font-muted'
          : 'border-border hover:border-bg-accent'
      }`}
      style={{ width: 68, height: 95, touchAction: 'manipulation' }}
      title={`${bc.card.name}${bc.tapped ? ' (tapped)' : ''} — hold or right-click for actions`}
    >
      {bc.card.image_small ? (
        <img
          src={bc.card.image_small}
          alt={bc.card.name}
          className="h-full w-full object-cover pointer-events-none"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-bg-cell p-1">
          <span className="text-[7px] font-medium text-font-secondary">
            {bc.card.type_line.split('—')[0].trim()}
          </span>
          <span className="text-center text-[8px] font-semibold leading-tight text-font-primary">
            {bc.card.name}
          </span>
          {bc.card.power && bc.card.toughness && (
            <span className="text-[9px] font-bold text-font-primary">
              {bc.card.power}/{bc.card.toughness}
            </span>
          )}
        </div>
      )}
      {/* P/T badge — bottom-right, always visible for creatures with mods */}
      {bc.card.power != null && bc.card.toughness != null && (bc.powerMod || bc.toughnessMod) ? (
        <div className="absolute bottom-0.5 right-0.5 pointer-events-none">
          <span className="rounded bg-yellow-600/90 px-1 text-[8px] font-bold text-white leading-tight whitespace-nowrap">
            {(parseInt(bc.card.power) || 0) + (bc.powerMod ?? 0)}/{(parseInt(bc.card.toughness) || 0) + (bc.toughnessMod ?? 0)}
          </span>
        </div>
      ) : null}
      {/* Counter badges — bottom-left */}
      {bc.counters && bc.counters.length > 0 && (
        <div className="absolute bottom-0.5 left-0.5 flex flex-col gap-0.5 pointer-events-none">
          {bc.counters.map((c) => (
            <span key={c.name} className="rounded bg-bg-accent/90 px-1 text-[7px] font-bold text-font-white leading-tight whitespace-nowrap">
              {c.name}: {c.value}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

export default function BattlefieldZone({
  title,
  cards,
  onTapToggle,
  onCardPreview,
}: BattlefieldZoneProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] font-semibold tracking-wider text-font-muted">
        {title} ({cards.length})
      </span>
      <div className="flex flex-wrap gap-1.5">
        {cards.map((bc) => (
          <BattlefieldCardButton
            key={bc.instanceId}
            bc={bc}
            onTapToggle={onTapToggle}
            onCardPreview={onCardPreview}
          />
        ))}

        {/* Empty slot */}
        {cards.length === 0 && (
          <div
            className="flex items-center justify-center rounded-lg border border-dashed border-border bg-bg-card"
            style={{ width: 68, height: 95 }}
          >
            <span className="text-[9px] text-font-muted">Empty</span>
          </div>
        )}
      </div>
    </div>
  )
}
