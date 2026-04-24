'use client'

import { useState } from 'react'
import { Crown } from 'lucide-react'
import CardContextMenu from './CardContextMenu'
import { getCardTypeCategory, TYPE_ORDER } from '@/lib/utils/card'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

interface DeckCardEntry {
  id: string
  card: CardRow
  quantity: number
  board: string
  section_id?: string | null
}

interface SectionOption {
  id: string
  name: string
  color: string | null
}

interface DeckTextViewProps {
  cards: DeckCardEntry[]
  /** Pre-grouped and sorted cards. If provided, `cards` is ignored and these groups are rendered as-is. */
  groups?: [string, DeckCardEntry[]][]
  isCommander?: (cardId: number) => boolean
  onToggleCommander?: (cardId: number, board: string) => void
  onCardClick?: (card: CardRow) => void
  onMoveToBoard?: (cardId: number, fromBoard: string, toBoard: string) => void
  onQuantityChange?: (cardId: number, quantity: number, board: string) => void
  onRemove?: (cardId: number, board: string) => void
  sections?: SectionOption[]
  onSectionChange?: (deckCardId: string, sectionId: string | null) => void
}

export default function DeckTextView({
  cards,
  groups: groupsProp,
  isCommander,
  onToggleCommander,
  onCardClick,
  onMoveToBoard,
  onQuantityChange,
  onRemove,
  sections,
  onSectionChange,
}: DeckTextViewProps) {
  const [hoverCard, setHoverCard] = useState<{ card: CardRow; x: number; y: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cardId: number; board: string } | null>(null)

  if (cards.length === 0 && (!groupsProp || groupsProp.length === 0)) {
    return (
      <div className="rounded-xl border border-border-light border-dashed bg-bg-surface p-8 text-center">
        <p className="text-font-muted">No cards in this section.</p>
      </div>
    )
  }

  let sorted: [string, DeckCardEntry[]][]
  if (groupsProp) {
    sorted = groupsProp
  } else {
    // Fallback: group by type, sort by name within (used by commander section)
    const groups: Record<string, DeckCardEntry[]> = {}
    cards.forEach((entry) => {
      if (!entry.card) return
      const cat = getCardTypeCategory(entry.card.type_line)
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(entry)
    })
    sorted = []
    TYPE_ORDER.forEach((type) => {
      if (groups[type]) {
        sorted.push([type, groups[type].sort((a, b) => a.card.name.localeCompare(b.card.name))])
      }
    })
  }

  return (
    <div className="rounded-xl border border-border bg-bg-surface p-4">
      <div className="flex flex-col gap-3">
        {sorted.map(([type, entries]) => {
          const totalCount = entries.reduce((s, e) => s + e.quantity, 0)
          return (
            <div key={type}>
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-font-muted">
                {type} ({totalCount})
              </h4>
              <div className="flex flex-col">
                {entries.map((entry) => {
                  const commander = isCommander?.(entry.card.id) ?? false
                  return (
                    <div
                      key={`${entry.card.id}-${entry.board}`}
                      className={`group flex items-center gap-2 rounded px-2 py-0.5 text-sm transition-colors hover:bg-bg-hover ${
                        commander ? 'bg-bg-yellow/10' : ''
                      }`}
                      onContextMenu={(e) => {
                        if (onMoveToBoard) {
                          e.preventDefault()
                          setContextMenu({ x: e.clientX, y: e.clientY, cardId: entry.card.id, board: entry.board })
                        }
                      }}
                    >
                      <span className="w-6 text-right font-mono text-xs text-font-muted">
                        {entry.quantity}x
                      </span>
                      <button
                        onClick={() => onCardClick?.(entry.card)}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect()
                          setHoverCard({ card: entry.card, x: rect.left, y: rect.top })
                        }}
                        onMouseLeave={() => setHoverCard(null)}
                        className={`flex-1 text-left hover:text-font-accent transition-colors ${
                          commander
                            ? 'font-semibold text-bg-yellow'
                            : 'text-font-primary'
                        }`}
                      >
                        {entry.card.name}
                      </button>
                      {commander && (
                        <Crown className="h-3 w-3 text-bg-yellow" />
                      )}
                      {onToggleCommander && (
                        <button
                          onClick={() =>
                            onToggleCommander(entry.card.id, entry.board)
                          }
                          className={`h-5 w-5 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 ${
                            commander
                              ? 'flex text-bg-yellow'
                              : 'hidden group-hover:flex text-font-muted hover:text-bg-yellow'
                          }`}
                          title={
                            commander
                              ? 'Remove Commander'
                              : 'Set as Commander'
                          }
                        >
                          <Crown className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      {hoverCard && hoverCard.card.image_normal && (
        <div
          className="pointer-events-none fixed z-50 hidden md:block"
          style={{
            left: Math.min(hoverCard.x + 200, window.innerWidth - 240),
            top: Math.max(8, Math.min(hoverCard.y - 160, window.innerHeight - 340)),
          }}
        >
          <img
            src={hoverCard.card.image_normal}
            alt={hoverCard.card.name}
            className="h-auto w-56 rounded-lg shadow-2xl"
          />
        </div>
      )}
      {contextMenu && onMoveToBoard && (() => {
        const entry = cards.find(
          (e) => e.card.id === contextMenu.cardId && e.board === contextMenu.board,
        )
        return (
          <CardContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            currentBoard={contextMenu.board}
            quantity={entry?.quantity}
            onQuantityChange={
              onQuantityChange
                ? (next) => onQuantityChange(contextMenu.cardId, next, contextMenu.board)
                : undefined
            }
            isCommander={isCommander?.(contextMenu.cardId) ?? false}
            onToggleCommander={
              onToggleCommander
                ? () => onToggleCommander(contextMenu.cardId, contextMenu.board)
                : undefined
            }
            onMoveToBoard={(toBoard) => onMoveToBoard(contextMenu.cardId, contextMenu.board, toBoard)}
            onRemove={onRemove ? () => onRemove(contextMenu.cardId, contextMenu.board) : undefined}
            sections={sections && entry?.id ? sections : undefined}
            currentSectionId={entry?.section_id ?? null}
            onMoveToSection={
              sections && entry?.id && onSectionChange
                ? (sid) => onSectionChange(entry.id, sid)
                : undefined
            }
            onClose={() => setContextMenu(null)}
          />
        )
      })()}
    </div>
  )
}
