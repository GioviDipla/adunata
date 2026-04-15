'use client'

import { useState, useRef, useCallback } from 'react'
import { Crown } from 'lucide-react'
import CardContextMenu from './CardContextMenu'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

interface DeckCardEntry {
  id: string
  card: CardRow
  quantity: number
  board: string
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

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
      {cards.map((entry) => {
        const commander = isCommander?.(entry.card.id) ?? false
        return (
          <div
            key={`${entry.card.id}-${entry.board}`}
            className={`group relative rounded-lg overflow-hidden transition-all ${
              commander
                ? 'ring-2 ring-bg-yellow shadow-lg shadow-bg-yellow/20'
                : 'ring-1 ring-border hover:ring-border-light'
            }`}
            onContextMenu={(e) => {
              if (onMoveToBoard) {
                e.preventDefault()
                setContextMenu({ x: e.clientX, y: e.clientY, cardId: entry.card.id, board: entry.board })
              }
            }}
            onPointerDown={(e) => {
              if (onMoveToBoard && e.pointerType === 'touch') {
                longPress.start(() => {
                  const rect = (e.target as HTMLElement).getBoundingClientRect()
                  setContextMenu({ x: rect.left + rect.width / 2, y: rect.top, cardId: entry.card.id, board: entry.board })
                })
              }
            }}
            onPointerUp={() => longPress.cancel()}
            onPointerLeave={() => longPress.cancel()}
            onPointerCancel={() => longPress.cancel()}
            style={{ touchAction: onMoveToBoard ? 'none' : undefined }}
          >
            {/* Card image */}
            {entry.card.image_normal ? (
              <img
                src={entry.card.image_normal}
                alt={entry.card.name}
                className="w-full h-auto cursor-pointer select-none"
                loading="lazy"
                draggable={false}
                onClick={() => {
                  if (!longPress.wasLongPress()) onCardClick?.(entry.card)
                }}
              />
            ) : (
              <div
                className="flex aspect-[488/680] items-center justify-center bg-bg-cell p-2 cursor-pointer select-none"
                onClick={() => {
                  if (!longPress.wasLongPress()) onCardClick?.(entry.card)
                }}
              >
                <span className="text-center text-xs text-font-muted">
                  {entry.card.name}
                </span>
              </div>
            )}

            {/* Quantity badge */}
            <div className="absolute top-1.5 left-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-bg-dark/80 px-1.5 text-xs font-bold text-font-primary backdrop-blur-sm">
              {entry.quantity}x
            </div>

            {/* Commander crown badge */}
            {commander && (
              <div className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-bg-yellow/90 text-bg-dark backdrop-blur-sm">
                <Crown className="h-3.5 w-3.5" />
              </div>
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
      {contextMenu && onMoveToBoard && (
        <CardContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          currentBoard={contextMenu.board}
          onMoveToBoard={(toBoard) => onMoveToBoard(contextMenu.cardId, contextMenu.board, toBoard)}
          onRemove={onRemove ? () => onRemove(contextMenu.cardId, contextMenu.board) : undefined}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
