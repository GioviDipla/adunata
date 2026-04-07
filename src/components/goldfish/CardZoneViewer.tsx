'use client'

import { X } from 'lucide-react'
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
}

export default function CardZoneViewer({
  title,
  cards,
  onClose,
  onReturnToHand,
  onReturnToBattlefield,
}: CardZoneViewerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-dark/80 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-bg-surface shadow-2xl">
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

        {/* Card grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {cards.length === 0 ? (
            <p className="py-8 text-center text-sm text-font-muted">
              No cards in this zone.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {cards.map((entry) => (
                <div key={entry.instanceId} className="group relative">
                  <div className="overflow-hidden rounded-lg border border-border">
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
                  </div>
                  {/* Action buttons on hover */}
                  <div className="absolute inset-x-0 bottom-0 hidden gap-1 p-1 group-hover:flex">
                    {onReturnToHand && (
                      <button
                        onClick={() => onReturnToHand(entry.instanceId)}
                        className="flex-1 rounded bg-bg-accent/90 px-1 py-0.5 text-[8px] font-bold text-font-white"
                      >
                        Hand
                      </button>
                    )}
                    {onReturnToBattlefield && (
                      <button
                        onClick={() => onReturnToBattlefield(entry.instanceId)}
                        className="flex-1 rounded bg-bg-green/90 px-1 py-0.5 text-[8px] font-bold text-font-white"
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
