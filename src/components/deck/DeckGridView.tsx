'use client'

import { useState } from 'react'
import { Crown, RotateCcw, Sparkles } from 'lucide-react'
import CardContextMenu from './CardContextMenu'
import UpscaledBadge from '@/components/cards/UpscaledBadge'
import { useCardGestures } from '@/lib/hooks/useCardGestures'
import { usePreferences } from '@/lib/contexts/PreferencesContext'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

interface DeckCardEntry {
  id: string
  card: CardRow
  quantity: number
  board: string
  section_id?: string | null
  isFoil?: boolean
}

interface SectionOption {
  id: string
  name: string
  color: string | null
}

interface DeckGridViewProps {
  cards: DeckCardEntry[]
  onQuantityChange?: (cardId: number, quantity: number, board: string) => void
  onRemove?: (cardId: number, board: string) => void
  isCommander?: (cardId: number) => boolean
  onToggleCommander?: (cardId: number, board: string) => void
  onCardClick?: (card: CardRow) => void
  readOnly?: boolean
  onMoveToBoard?: (cardId: number, fromBoard: string, toBoard: string) => void
  sections?: SectionOption[]
  onSectionChange?: (deckCardId: string, sectionId: string | null) => void
  onToggleFoil?: (cardId: number, board: string) => void
  /** Override the responsive grid with a fixed column count (2-6). When omitted,
   *  the grid uses the default Tailwind breakpoints. */
  cols?: number
}

export default function DeckGridView({
  cards,
  onQuantityChange,
  onRemove,
  isCommander,
  onToggleCommander,
  onCardClick,
  readOnly = false,
  onMoveToBoard,
  sections,
  onSectionChange,
  onToggleFoil,
  cols,
}: DeckGridViewProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cardId: number; board: string } | null>(null)
  // Floating zoom preview shown on mouse hover (desktop only — gated by
  // `hidden md:block` on the preview node, so it never appears on touch).
  const [hoverCard, setHoverCard] = useState<{ card: CardRow; rect: DOMRect } | null>(null)
  // Centralised gesture handling + user control inversion (desktop click /
  // mobile long-press), shared with the other deck-area surfaces.
  const { getHandlers } = useCardGestures()
  // Hover-zoom preview can be turned off in preferences (desktop only).
  const { prefs } = usePreferences()
  const hoverZoomEnabled = prefs.gridHoverZoom

  if (cards.length === 0) {
    return (
      <div className="rounded-xl border border-border-light border-dashed bg-bg-surface p-8 text-center">
        <p className="text-font-muted">No cards in this section.</p>
      </div>
    )
  }

  // When `cols` is provided, replace the responsive Tailwind classes with
  // an inline `gridTemplateColumns`. Otherwise keep the current responsive
  // default (2 / 3 / 4 / 5).
  const gridClass = cols
    ? 'grid gap-3'
    : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3'
  const gridStyle = cols
    ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }
    : undefined

  // Editing mode = onMoveToBoard wired. In editing mode the quick action opens
  // the context menu and the preview gesture opens the card detail modal. View
  // mode (no onMoveToBoard) keeps both gestures on open-detail.
  const editingMode = !!onMoveToBoard

  return (
    <div className={gridClass} style={gridStyle}>
      {cards.map((entry) => {
        const commander = isCommander?.(entry.card.id) ?? false
        const openContext = (x: number, y: number) =>
          setContextMenu({ x, y, cardId: entry.card.id, board: entry.board })
        const gestures = getHandlers({
          onPrimary: editingMode
            ? (c) => openContext(c.x, c.y)
            : () => onCardClick?.(entry.card),
          onSecondary: () => onCardClick?.(entry.card),
        })
        return (
          <div
            key={`${entry.card.id}-${entry.board}`}
            {...gestures}
            className={`group relative cursor-pointer rounded-lg overflow-hidden transition-all ${
              commander
                ? 'ring-2 ring-bg-yellow shadow-lg shadow-bg-yellow/20'
                : 'ring-1 ring-border hover:ring-border-light'
            }`}
          >
            {/* Card image */}
            {entry.card.image_normal ? (
              <div className="relative">
                <img
                  src={entry.card.image_normal}
                  alt={entry.card.name}
                  className="w-full h-auto select-none"
                  loading="lazy"
                  draggable={false}
                  onMouseEnter={
                    hoverZoomEnabled
                      ? (e) =>
                          setHoverCard({ card: entry.card, rect: e.currentTarget.getBoundingClientRect() })
                      : undefined
                  }
                  onMouseLeave={hoverZoomEnabled ? () => setHoverCard(null) : undefined}
                />
                {entry.isFoil && (
                  <div className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-bg-yellow/90 text-bg-dark backdrop-blur-sm">
                    <Sparkles className="h-3 w-3" />
                  </div>
                )}
                {entry.card.has_upscaled_2x && (
                  <UpscaledBadge className={`absolute right-1.5 ${entry.board === 'removed' && onMoveToBoard ? 'bottom-8' : 'bottom-1.5'}`} />
                )}
              </div>
            ) : (
              <div className="flex aspect-[488/680] items-center justify-center bg-bg-cell p-2 select-none">
                <span className="text-center text-xs text-font-muted">
                  {entry.card.name}
                </span>
              </div>
            )}

            {/* Quantity badge — pinned to bottom-left so it stays clear of the
                card's name in the top-left of the frame. */}
            <div className="absolute bottom-1.5 left-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-bg-dark/80 px-1.5 text-xs font-bold text-font-primary backdrop-blur-sm">
              {entry.quantity}x
            </div>

            {/* Commander crown badge */}
            {commander && (
              <div className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-bg-yellow/90 text-bg-dark backdrop-blur-sm">
                <Crown className="h-3.5 w-3.5" />
              </div>
            )}

            {/* Restore pill — pinned bottom-right on the Removed board so
                the action is reachable without opening the context menu. */}
            {entry.board === 'removed' && onMoveToBoard && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onMoveToBoard(entry.card.id, 'removed', 'main')
                }}
                className="absolute bottom-1.5 right-1.5 flex h-6 items-center gap-1 rounded-full bg-bg-green/90 px-2 text-[10px] font-semibold text-bg-dark backdrop-blur-sm hover:bg-bg-green"
                aria-label="Restore card to main deck"
                title="Restore to main deck"
              >
                <RotateCcw className="h-3 w-3" />
                Restore
              </button>
            )}

            {/* Hover overlay with actions — desktop only. On mobile all
                editing happens through the tap context menu. */}
            {!readOnly && (
              <div className="hidden sm:flex absolute inset-x-0 bottom-0 flex-col gap-1 bg-gradient-to-t from-bg-dark/90 via-bg-dark/60 to-transparent p-2 pt-8 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="mb-1 truncate text-xs font-medium text-font-primary">
                  {entry.card.name}
                </span>
                <div className="flex items-center gap-1">
                  {onQuantityChange && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onQuantityChange(entry.card.id, entry.quantity - 1, entry.board)
                      }}
                      className="flex h-6 flex-1 items-center justify-center rounded bg-bg-cell/80 text-xs font-medium text-font-primary hover:bg-bg-hover"
                    >
                      -
                    </button>
                  )}
                  {onQuantityChange && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onQuantityChange(entry.card.id, entry.quantity + 1, entry.board)
                      }}
                      className="flex h-6 flex-1 items-center justify-center rounded bg-bg-cell/80 text-xs font-medium text-font-primary hover:bg-bg-hover"
                    >
                      +
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
      {/* Floating zoom preview on hover — desktop only (`hidden md:block`).
          Positioned to the right of the hovered card, clamped to the
          viewport so it never spills off-screen. */}
      {hoverZoomEnabled && hoverCard && hoverCard.card.image_normal && (
        <div
          className="pointer-events-none fixed z-50 hidden md:block"
          style={{
            left: Math.min(hoverCard.rect.right + 8, window.innerWidth - 240),
            top: Math.max(8, Math.min(hoverCard.rect.top, window.innerHeight - 340)),
          }}
        >
          <img
            src={hoverCard.card.image_normal}
            alt={hoverCard.card.name}
            className="h-auto w-56 rounded-lg shadow-2xl"
          />
          {hoverCard.card.has_upscaled_2x && (
            <UpscaledBadge className="absolute bottom-1.5 right-1.5" />
          )}
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
            isFoil={entry?.isFoil}
            onToggleFoil={
              onToggleFoil
                ? () => onToggleFoil(contextMenu.cardId, contextMenu.board)
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
