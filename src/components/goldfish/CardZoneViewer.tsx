'use client'

import { useState, useMemo, useCallback } from 'react'
import { Shuffle, X } from 'lucide-react'
import { useLongPress } from '@/lib/hooks/useLongPress'
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
  /**
   * When provided, renders a primary "Close and shuffle" button next to the X.
   * Used for the library viewer so a player ending a tutor/search effect can
   * shuffle in the same click that dismisses the modal.
   */
  onCloseAndShuffle?: () => void
  onCardPreview?: (card: CardRow) => void
  /** Tap (click) opens the action menu. Long-press shows the preview. */
  onCardAction?: (entry: CardEntry, x: number, y: number) => void
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
  onCardAction?: (entry: CardEntry, x: number, y: number) => void
}) {
  // Tap → action menu, long-press → preview. Mirrors deck/cards browser.
  const longPress = useLongPress({
    onLongPress: () => onCardPreview?.(entry.card),
    delay: 400,
  })

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (longPress.wasLongPress()) return
    if (onCardAction) {
      onCardAction(entry, e.clientX, e.clientY)
    } else {
      onCardPreview?.(entry.card)
    }
  }, [longPress, entry, onCardAction, onCardPreview])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    onCardPreview?.(entry.card)
  }, [entry.card, onCardPreview])

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        {...longPress.handlers}
        className="w-full overflow-hidden rounded-lg border border-border select-none"
        style={{ touchAction: 'manipulation' }}
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
  onCloseAndShuffle,
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
        <div className="relative z-10 flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-bold text-font-primary">
            {title} ({cards.length})
          </h2>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-md text-font-muted hover:bg-bg-hover hover:text-font-primary"
              aria-label="Close"
              title="Close without shuffling"
            >
              <X size={18} />
            </button>
            {onCloseAndShuffle && (
              <button
                onClick={onCloseAndShuffle}
                className="flex h-9 items-center gap-1.5 rounded-md bg-bg-accent px-3 text-xs font-semibold text-font-white hover:brightness-110 active:brightness-95"
              >
                <Shuffle size={14} />
                Close and shuffle
              </button>
            )}
          </div>
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
