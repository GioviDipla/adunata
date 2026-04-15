'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import { X } from 'lucide-react'
import { getCardTypeCategory } from '@/lib/utils/card'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

interface CardEntry {
  instanceId: string
  card: CardRow
}

interface CardZoneViewerProps {
  title: string
  cards: CardEntry[]
  onClose: () => void
  onReturnToHand?: (instanceId: string) => void
  onReturnToBattlefield?: (instanceId: string) => void
  onSendToGraveyard?: (instanceId: string) => void
  onSendToExile?: (instanceId: string) => void
  onSendToBottom?: (instanceId: string) => void
  onSendToTop?: (instanceId: string) => void
  onCardPreview?: (card: CardRow) => void
  groupByType?: boolean
}

const TYPE_FILTERS = ['All', 'Creatures', 'Instants', 'Sorceries', 'Enchantments', 'Artifacts', 'Planeswalkers', 'Lands', 'Other'] as const

function ZoneCard({
  entry,
  onReturnToHand,
  onReturnToBattlefield,
  onSendToGraveyard,
  onSendToExile,
  onSendToBottom,
  onSendToTop,
  onCardPreview,
}: {
  entry: CardEntry
  onReturnToHand?: (id: string) => void
  onReturnToBattlefield?: (id: string) => void
  onSendToGraveyard?: (id: string) => void
  onSendToExile?: (id: string) => void
  onSendToBottom?: (id: string) => void
  onSendToTop?: (id: string) => void
  onCardPreview?: (card: CardRow) => void
}) {
  const [showActions, setShowActions] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggered = useRef(false)

  const openActions = useCallback(() => {
    setShowActions(true)
  }, [])

  const handlePointerDown = useCallback(() => {
    triggered.current = false
    timerRef.current = setTimeout(() => {
      triggered.current = true
      openActions()
    }, 500)
  }, [openActions])

  const handlePointerUp = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }, [])

  const handleClick = useCallback(() => {
    if (triggered.current) { triggered.current = false; return }
    onCardPreview?.(entry.card)
  }, [entry.card, onCardPreview])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    openActions()
  }, [openActions])

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="w-full overflow-hidden rounded-lg border border-border select-none"
        style={{ touchAction: 'none' }}
      >
        {entry.card.image_small ? (
          <img
            src={entry.card.image_small}
            alt={entry.card.name}
            className="h-auto w-full pointer-events-none"
            draggable={false}
          />
        ) : (
          <div className="flex aspect-[5/7] w-full flex-col items-center justify-center gap-1 bg-bg-cell p-2">
            <span className="text-[8px] text-font-secondary">
              {entry.card.type_line.split('—')[0].trim()}
            </span>
            <span className="text-center text-[10px] font-semibold text-font-primary">
              {entry.card.name}
            </span>
          </div>
        )}
      </button>

      {/* Action overlay — right-click (web) / longpress (mobile) */}
      {showActions && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-bg-dark/70"
          onClick={() => setShowActions(false)}
        >
          <div
            className="mx-4 w-full max-w-xs rounded-xl border border-border bg-bg-surface p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 text-center text-xs font-bold text-font-primary truncate">{entry.card.name}</p>
            <div className="grid grid-cols-3 gap-1.5">
              {onReturnToHand && (
                <button
                  onClick={() => { onReturnToHand(entry.instanceId); setShowActions(false) }}
                  className="rounded-lg bg-bg-accent py-2 text-[10px] font-bold text-font-white active:bg-bg-accent-dark"
                >
                  Hand
                </button>
              )}
              {onReturnToBattlefield && (
                <button
                  onClick={() => { onReturnToBattlefield(entry.instanceId); setShowActions(false) }}
                  className="rounded-lg bg-bg-green py-2 text-[10px] font-bold text-font-white active:bg-bg-green/80"
                >
                  Play
                </button>
              )}
              {onSendToGraveyard && (
                <button
                  onClick={() => { onSendToGraveyard(entry.instanceId); setShowActions(false) }}
                  className="rounded-lg bg-bg-red py-2 text-[10px] font-bold text-font-white active:bg-bg-red/80"
                >
                  Grave
                </button>
              )}
              {onSendToExile && (
                <button
                  onClick={() => { onSendToExile(entry.instanceId); setShowActions(false) }}
                  className="rounded-lg bg-gray-600 py-2 text-[10px] font-bold text-font-white active:bg-gray-500"
                >
                  Exile
                </button>
              )}
              {onSendToBottom && (
                <button
                  onClick={() => { onSendToBottom(entry.instanceId); setShowActions(false) }}
                  className="rounded-lg bg-bg-cell py-2 text-[10px] font-bold text-font-primary active:bg-bg-hover"
                >
                  Bottom
                </button>
              )}
              {onSendToTop && (
                <button
                  onClick={() => { onSendToTop(entry.instanceId); setShowActions(false) }}
                  className="rounded-lg bg-blue-600 py-2 text-[10px] font-bold text-font-white active:bg-blue-500"
                >
                  Top
                </button>
              )}
            </div>
            <button
              onClick={() => setShowActions(false)}
              className="mt-2 w-full rounded-lg bg-bg-cell py-1.5 text-[10px] font-medium text-font-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CardZoneViewer({
  title,
  cards,
  onClose,
  onReturnToHand,
  onReturnToBattlefield,
  onSendToGraveyard,
  onSendToExile,
  onSendToBottom,
  onSendToTop,
  onCardPreview,
  groupByType = false,
}: CardZoneViewerProps) {
  const [filter, setFilter] = useState<string>('All')

  const filteredCards = useMemo(() => {
    if (filter === 'All') return cards
    return cards.filter((e) => getCardTypeCategory(e.card.type_line) === filter)
  }, [cards, filter])

  const activeFilters = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const entry of cards) {
      const cat = getCardTypeCategory(entry.card.type_line)
      counts[cat] = (counts[cat] || 0) + 1
    }
    return counts
  }, [cards])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-bg-dark/80 p-0 sm:p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl sm:rounded-xl border border-border bg-bg-surface shadow-2xl">
        {/* Header */}
        <div className="relative z-10 flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-bold text-font-primary">
            {title} ({cards.length})
          </h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-font-muted hover:bg-bg-hover hover:text-font-primary"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable area: sticky filters + card list */}
        <div className="isolate flex-1 overflow-y-auto">
          {/* Type filters — sticky within scroll container */}
          {cards.length > 0 && (
            <div className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-border bg-bg-surface px-3 py-2 shadow-sm">
              {TYPE_FILTERS.map((f) => {
                const count = f === 'All' ? cards.length : (activeFilters[f] || 0)
                if (f !== 'All' && count === 0) return null
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                      filter === f
                        ? 'bg-bg-accent text-font-white'
                        : 'bg-bg-cell text-font-secondary hover:text-font-primary'
                    }`}
                  >
                    {f === 'All' ? 'All' : f} ({count})
                  </button>
                )
              })}
            </div>
          )}

          {/* Card grid */}
          <div className="p-3">
            {filteredCards.length === 0 ? (
              <p className="py-8 text-center text-sm text-font-muted">
                No cards in this zone.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {filteredCards.map((entry) => (
                  <ZoneCard
                    key={entry.instanceId}
                    entry={entry}
                    onReturnToHand={onReturnToHand}
                    onReturnToBattlefield={onReturnToBattlefield}
                    onSendToGraveyard={onSendToGraveyard}
                    onSendToExile={onSendToExile}
                    onSendToBottom={onSendToBottom}
                    onSendToTop={onSendToTop}
                    onCardPreview={onCardPreview}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
