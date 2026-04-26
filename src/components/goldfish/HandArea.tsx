'use client'

import { useCallback } from 'react'
import { useLongPress } from '@/lib/hooks/useLongPress'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

export interface HandCardEntry {
  instanceId: string
  card: CardRow
}

interface HandAreaProps {
  cards: HandCardEntry[]
  onPlayCard: (instanceId: string) => void
  onCardPreview?: (card: CardRow, instanceId?: string) => void
  /** Tap (click) opens the action menu near the cursor/finger. When provided,
   *  tap no longer plays — Play moves to the menu. */
  onCardAction?: (card: CardRow, instanceId: string, x: number, y: number) => void
  selectable?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (instanceId: string) => void
}

function HandCardButton({
  hc,
  index,
  onPlayCard,
  onCardPreview,
  onCardAction,
  selectable,
  isSelected,
  onToggleSelect,
}: {
  hc: HandCardEntry
  index: number
  onPlayCard: (id: string) => void
  onCardPreview?: (card: CardRow, instanceId?: string) => void
  onCardAction?: (card: CardRow, instanceId: string, x: number, y: number) => void
  selectable: boolean
  isSelected: boolean
  onToggleSelect?: (id: string) => void
}) {
  const longPress = useLongPress({
    onLongPress: () => onCardPreview?.(hc.card, hc.instanceId),
    delay: 400,
  })

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (longPress.wasLongPress()) return
    if (selectable && onToggleSelect) {
      onToggleSelect(hc.instanceId)
      return
    }
    if (onCardAction) {
      onCardAction(hc.card, hc.instanceId, e.clientX, e.clientY)
    } else {
      onPlayCard(hc.instanceId)
    }
  }, [longPress, selectable, onToggleSelect, onCardAction, onPlayCard, hc.card, hc.instanceId])

  return (
    <button
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault()
        onCardPreview?.(hc.card, hc.instanceId)
      }}
      {...longPress}
      className={`relative shrink-0 overflow-hidden rounded-lg border transition-all hover:-translate-y-1 select-none ${
        isSelected
          ? 'border-bg-red ring-2 ring-bg-red/40'
          : 'border-border-light hover:border-bg-accent'
      }`}
      style={{
        width: 72,
        height: 100,
        marginLeft: index > 0 ? -8 : 0,
        zIndex: index,
        touchAction: 'manipulation',
      }}
      title={`${hc.card.name} — tap for ${selectable ? 'select' : 'actions'}, hold to preview`}
    >
      {hc.card.image_small ? (
        <img
          src={hc.card.image_small}
          alt={hc.card.name}
          className="h-full w-full object-cover pointer-events-none"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-bg-surface p-1">
          <span className="text-[7px] font-medium text-font-secondary">
            {hc.card.type_line.split('—')[0].trim()}
          </span>
          <span className="text-center text-[8px] font-semibold leading-tight text-font-primary">
            {hc.card.name}
          </span>
          {hc.card.mana_cost && (
            <span className="text-[7px] font-bold text-font-accent">
              {hc.card.mana_cost}
            </span>
          )}
        </div>
      )}
      {isSelected && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-dark/50">
          <span className="text-xs font-bold text-font-white">BOTTOM</span>
        </div>
      )}
    </button>
  )
}

export default function HandArea({
  cards,
  onPlayCard,
  onCardPreview,
  onCardAction,
  selectable = false,
  selectedIds,
  onToggleSelect,
}: HandAreaProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] font-semibold tracking-wider text-font-muted">
        YOUR HAND ({cards.length})
      </span>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {cards.map((hc, index) => (
          <HandCardButton
            key={hc.instanceId}
            hc={hc}
            index={index}
            onPlayCard={onPlayCard}
            onCardPreview={onCardPreview}
            onCardAction={onCardAction}
            selectable={selectable}
            isSelected={selectable && (selectedIds?.has(hc.instanceId) ?? false)}
            onToggleSelect={onToggleSelect}
          />
        ))}
        {cards.length === 0 && (
          <div className="flex h-[100px] w-full items-center justify-center rounded-lg border border-dashed border-border bg-bg-card">
            <span className="text-xs text-font-muted">No cards in hand</span>
          </div>
        )}
      </div>
    </div>
  )
}
