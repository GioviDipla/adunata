'use client'

import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

export interface HandCardEntry {
  instanceId: string
  card: CardRow
}

interface HandAreaProps {
  cards: HandCardEntry[]
  onPlayCard: (instanceId: string) => void
  onCardPreview?: (card: CardRow) => void
  selectable?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (instanceId: string) => void
}

export default function HandArea({
  cards,
  onPlayCard,
  onCardPreview,
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
        {cards.map((hc, index) => {
          const isSelected = selectable && selectedIds?.has(hc.instanceId)
          return (
            <button
              key={hc.instanceId}
              onClick={() => {
                if (selectable && onToggleSelect) {
                  onToggleSelect(hc.instanceId)
                } else {
                  onPlayCard(hc.instanceId)
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                onCardPreview?.(hc.card)
              }}
              className={`relative shrink-0 overflow-hidden rounded-lg border transition-all hover:-translate-y-1 ${
                isSelected
                  ? 'border-bg-red ring-2 ring-bg-red/40'
                  : 'border-border-light hover:border-bg-accent'
              }`}
              style={{
                width: 72,
                height: 100,
                marginLeft: index > 0 ? -8 : 0,
                zIndex: index,
              }}
              title={`${hc.card.name} — click to ${selectable ? 'select to bottom' : 'play'}, right-click to preview`}
            >
              {hc.card.image_small ? (
                <img
                  src={hc.card.image_small}
                  alt={hc.card.name}
                  className="h-full w-full object-cover"
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
        })}
        {cards.length === 0 && (
          <div className="flex h-[100px] w-full items-center justify-center rounded-lg border border-dashed border-border bg-bg-card">
            <span className="text-xs text-font-muted">No cards in hand</span>
          </div>
        )}
      </div>
    </div>
  )
}
