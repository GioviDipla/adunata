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
  onCardPreview?: (card: CardRow) => void
  onCardAction?: (entry: CardEntry) => void
  groupByType?: boolean
}

const TYPE_FILTERS = ['All', 'Creatures', 'Instants', 'Sorceries', 'Enchantments', 'Artifacts', 'Planeswalkers', 'Lands', 'Other'] as const

function ZoneCard({
  entry,
  onCardPreview,
  onCardAction,
}: {
  entry: CardEntry
  onCardPreview?: (card: CardRow) => void
  onCardAction?: (entry: CardEntry) => void
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggered = useRef(false)

  const handlePointerDown = useCallback(() => {
    triggered.current = false
    timerRef.current = setTimeout(() => {
      triggered.current = true
      onCardAction?.(entry)
    }, 500)
  }, [entry, onCardAction])

  const handlePointerUp = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }, [])

  const handleClick = useCallback(() => {
    if (triggered.current) { triggered.current = false; return }
    onCardPreview?.(entry.card)
  }, [entry.card, onCardPreview])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    onCardAction?.(entry)
  }, [entry, onCardAction])

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
    </div>
  )
}

export default function CardZoneViewer({
  title,
  cards,
  onClose,
  onCardPreview,
  onCardAction,
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
                    onCardPreview={onCardPreview}
                    onCardAction={onCardAction}
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
