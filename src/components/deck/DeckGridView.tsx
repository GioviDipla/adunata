'use client'

import { useState, useRef, useCallback } from 'react'
import { Crown, RotateCcw } from 'lucide-react'
import CardContextMenu from './CardContextMenu'
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
  /** Override the responsive grid with a fixed column count (2-6). When omitted,
   *  the grid uses the default Tailwind breakpoints. */
  cols?: number
}

function useGridLongPress(delay = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggered = useRef(false)
  const callbackRef = useRef<(() => void) | null>(null)

  const start = useCallback((cb: () => void) => {
    triggered.current = false
    callbackRef.current = cb
    timerRef.current = setTimeout(() => {
      triggered.current = true
      cb()
    }, delay)
  }, [delay])

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  return { start, cancel, wasLongPress: () => triggered.current }
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
  cols,
}: DeckGridViewProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cardId: number; board: string } | null>(null)
  const longPress = useGridLongPress(500)
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

  // Editing mode = onMoveToBoard wired. In editing mode tap opens the
  // context menu and long-press / right-click opens the card detail
  // modal. View mode (no onMoveToBoard) keeps tap = open detail.
  const editingMode = !!onMoveToBoard

  return (
    <div className={gridClass} style={gridStyle}>
      {cards.map((entry) => {
        const commander = isCommander?.(entry.card.id) ?? false
        const openContext = (x: number, y: number) =>
          setContextMenu({ x, y, cardId: entry.card.id, board: entry.board })
        return (
          <div
            key={`${entry.card.id}-${entry.board}`}
            className={`group relative rounded-lg overflow-hidden transition-all ${
              commander
                ? 'ring-2 ring-bg-yellow shadow-lg shadow-bg-yellow/20'
                : 'ring-1 ring-border hover:ring-border-light'
            }`}
            onContextMenu={(e) => {
              if (!editingMode) return
              e.preventDefault()
              // Right-click in editing mode opens card detail (was: context).
              onCardClick?.(entry.card)
            }}
            onPointerDown={(e) => {
              if (editingMode && e.pointerType === 'touch') {
                longPress.start(() => {
                  // Long-press opens card detail in editing mode.
                  onCardClick?.(entry.card)
                })
              }
            }}
            onPointerUp={() => longPress.cancel()}
            onPointerLeave={() => longPress.cancel()}
            onPointerCancel={() => longPress.cancel()}
            style={{ touchAction: 'manipulation' }}
          >
            {/* Card image */}
            {entry.card.image_normal ? (
              <img
                src={entry.card.image_normal}
                alt={entry.card.name}
                className="w-full h-auto cursor-pointer select-none"
                loading="lazy"
                draggable={false}
                onClick={(e) => {
                  if (longPress.wasLongPress()) return
                  if (editingMode) {
                    openContext(e.clientX, e.clientY)
                  } else {
                    onCardClick?.(entry.card)
                  }
                }}
              />
            ) : (
              <div
                className="flex aspect-[488/680] items-center justify-center bg-bg-cell p-2 cursor-pointer select-none"
                onClick={(e) => {
                  if (longPress.wasLongPress()) return
                  if (editingMode) {
                    openContext(e.clientX, e.clientY)
                  } else {
                    onCardClick?.(entry.card)
                  }
                }}
              >
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

            {/* Hover overlay with actions */}
            {!readOnly && (
              <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-bg-dark/90 via-bg-dark/60 to-transparent p-2 pt-8 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="mb-1 truncate text-xs font-medium text-font-primary">
                  {entry.card.name}
                </span>
                <div className="flex items-center gap-1">
                  {onQuantityChange && (
                    <button
                      onClick={() =>
                        onQuantityChange(entry.card.id, entry.quantity - 1, entry.board)
                      }
                      className="flex h-6 flex-1 items-center justify-center rounded bg-bg-cell/80 text-xs font-medium text-font-primary hover:bg-bg-hover"
                    >
                      -
                    </button>
                  )}
                  {onQuantityChange && (
                    <button
                      onClick={() =>
                        onQuantityChange(entry.card.id, entry.quantity + 1, entry.board)
                      }
                      className="flex h-6 flex-1 items-center justify-center rounded bg-bg-cell/80 text-xs font-medium text-font-primary hover:bg-bg-hover"
                    >
                      +
                    </button>
                  )}
                  {onRemove && (
                    <button
                      onClick={() => onRemove(entry.card.id, entry.board)}
                      className="flex h-6 flex-1 items-center justify-center rounded bg-bg-red/30 text-xs font-medium text-bg-red hover:bg-bg-red/50"
                    >
                      Del
                    </button>
                  )}
                  {onToggleCommander && (
                    <button
                      onClick={() => onToggleCommander(entry.card.id, entry.board)}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${
                        commander
                          ? 'bg-bg-yellow/30 text-bg-yellow'
                          : 'bg-bg-cell/80 text-font-muted hover:text-bg-yellow'
                      }`}
                      title={commander ? 'Remove Commander' : 'Set as Commander'}
                    >
                      <Crown className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
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
