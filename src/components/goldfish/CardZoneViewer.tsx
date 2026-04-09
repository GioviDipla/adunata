'use client'

import { useState, useMemo } from 'react'
import { X, Hand, Play, Eye } from 'lucide-react'
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
  onCardPreview?: (card: CardRow) => void
  groupByType?: boolean
}

const TYPE_FILTERS = ['All', 'Creatures', 'Instants', 'Sorceries', 'Enchantments', 'Artifacts', 'Planeswalkers', 'Lands', 'Other'] as const

export default function CardZoneViewer({
  title,
  cards,
  onClose,
  onReturnToHand,
  onReturnToBattlefield,
  onCardPreview,
  groupByType = false,
}: CardZoneViewerProps) {
  const [filter, setFilter] = useState<string>('All')

  const grouped = useMemo(() => {
    const groups: Record<string, CardEntry[]> = {}
    for (const entry of cards) {
      const cat = getCardTypeCategory(entry.card.type_line)
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(entry)
    }
    return groups
  }, [cards])

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
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
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

        {/* Type filters */}
        {cards.length > 0 && (
          <div className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2">
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

        {/* Card list */}
        <div className="flex-1 overflow-y-auto p-3">
          {filteredCards.length === 0 ? (
            <p className="py-8 text-center text-sm text-font-muted">
              No cards in this zone.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {filteredCards.map((entry) => (
                <div key={entry.instanceId} className="group relative">
                  <button
                    onClick={() => onCardPreview?.(entry.card)}
                    className="w-full overflow-hidden rounded-lg border border-border"
                  >
                    {entry.card.image_small ? (
                      <img
                        src={entry.card.image_small}
                        alt={entry.card.name}
                        className="h-auto w-full"
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
                  {/* Action buttons */}
                  <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-gradient-to-t from-bg-dark/90 to-transparent p-1 pt-4 opacity-0 transition-opacity group-hover:opacity-100">
                    {onReturnToHand && (
                      <button
                        onClick={() => onReturnToHand(entry.instanceId)}
                        className="flex-1 rounded bg-bg-accent/90 px-1 py-1 text-[9px] font-bold text-font-white"
                      >
                        Hand
                      </button>
                    )}
                    {onReturnToBattlefield && (
                      <button
                        onClick={() => onReturnToBattlefield(entry.instanceId)}
                        className="flex-1 rounded bg-bg-green/90 px-1 py-1 text-[9px] font-bold text-font-white"
                      >
                        Play
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
