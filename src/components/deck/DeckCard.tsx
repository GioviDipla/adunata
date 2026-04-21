'use client'

import { useState, useRef } from 'react'
import { Crown, Minus, Plus, X } from 'lucide-react'
import CardContextMenu from './CardContextMenu'
import { useLongPress } from '@/lib/hooks/useLongPress'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

interface DeckCardProps {
  card: CardRow
  quantity: number
  board: string
  isCommander?: boolean
  onQuantityChange?: (cardId: number, quantity: number, board: string) => void
  onRemove?: (cardId: number, board: string) => void
  onToggleCommander?: (cardId: number, board: string) => void
  onCardClick?: (card: CardRow) => void
  onMoveToBoard?: (cardId: number, fromBoard: string, toBoard: string) => void
}

function ManaCostDisplay({ manaCost }: { manaCost: string | null }) {
  if (!manaCost) return null

  const symbols = manaCost.match(/\{[^}]+\}/g) || []
  return (
    <span className="flex items-center gap-0.5">
      {symbols.map((symbol, i) => {
        const s = symbol.replace(/[{}]/g, '')
        let bgClass = 'bg-bg-cell'
        let textClass = 'text-font-primary'

        switch (s) {
          case 'W':
            bgClass = 'bg-mana-white'
            textClass = 'text-bg-dark'
            break
          case 'U':
            bgClass = 'bg-mana-blue'
            textClass = 'text-font-primary'
            break
          case 'B':
            bgClass = 'bg-mana-black'
            textClass = 'text-font-primary'
            break
          case 'R':
            bgClass = 'bg-mana-red'
            textClass = 'text-font-primary'
            break
          case 'G':
            bgClass = 'bg-mana-green'
            textClass = 'text-font-primary'
            break
        }

        return (
          <span
            key={i}
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${bgClass} ${textClass}`}
          >
            {s}
          </span>
        )
      })}
    </span>
  )
}

export { ManaCostDisplay }

export default function DeckCard({
  card,
  quantity,
  board,
  isCommander = false,
  onQuantityChange,
  onRemove,
  onToggleCommander,
  onCardClick,
  onMoveToBoard,
}: DeckCardProps) {
  const [showPreview, setShowPreview] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const lastPointerPos = useRef({ x: 0, y: 0 })

  const longPress = useLongPress({
    onLongPress: () => {
      setContextMenu({ x: lastPointerPos.current.x, y: lastPointerPos.current.y })
    },
    delay: 500,
  })

  return (
    <div
      className={`group relative flex items-center gap-1.5 sm:gap-2 rounded-lg border px-2 py-1.5 sm:px-3 sm:py-2 transition-colors hover:bg-bg-hover ${
        isCommander
          ? 'border-bg-yellow/50 bg-bg-yellow/5'
          : 'border-border bg-bg-card'
      }`}
      onContextMenu={(e) => {
        if (onMoveToBoard) {
          e.preventDefault()
          setContextMenu({ x: e.clientX, y: e.clientY })
        }
      }}
      onPointerDown={(e) => {
        lastPointerPos.current = { x: e.clientX, y: e.clientY }
        if (onMoveToBoard) longPress.onPointerDown()
      }}
      onPointerUp={onMoveToBoard ? longPress.onPointerUp : undefined}
      onPointerLeave={() => {
        if (onMoveToBoard) longPress.onPointerLeave()
      }}
      onPointerCancel={onMoveToBoard ? longPress.onPointerCancel : undefined}
      onMouseEnter={() => setShowPreview(true)}
      onMouseLeave={() => setShowPreview(false)}
      style={{ touchAction: 'manipulation' }}
    >
      {/* Quantity controls */}
      <div className="flex items-center gap-0.5 sm:gap-1">
        {onQuantityChange && (
          <button
            onClick={() => onQuantityChange(card.id, quantity - 1, board)}
            className="flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded bg-bg-cell text-font-secondary transition-colors hover:bg-bg-hover hover:text-font-primary"
            aria-label="Decrease quantity"
          >
            <Minus className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
          </button>
        )}
        <span className="w-4 sm:w-6 text-center text-xs sm:text-sm font-medium text-font-primary">
          {quantity}
        </span>
        {onQuantityChange && (
          <button
            onClick={() => onQuantityChange(card.id, quantity + 1, board)}
            className="flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded bg-bg-cell text-font-secondary transition-colors hover:bg-bg-hover hover:text-font-primary"
            aria-label="Increase quantity"
          >
            <Plus className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
          </button>
        )}
      </div>

      {/* Card info */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <button
          onClick={() => { if (longPress.wasLongPress()) return; onCardClick?.(card) }}
          className="truncate text-xs sm:text-sm font-medium text-font-primary hover:text-font-accent transition-colors text-left"
        >
          {card.name}
        </button>
        <div className="hidden sm:flex">
          <ManaCostDisplay manaCost={card.mana_cost} />
        </div>
      </div>

      {/* Compact mana cost on mobile */}
      <span className="shrink-0 text-[10px] text-font-muted sm:hidden">
        {card.mana_cost?.replace(/[{}]/g, '') || ''}
      </span>

      {/* Type line */}
      <span className="hidden text-xs text-font-muted lg:inline">
        {card.type_line?.split('—')[0]?.trim()}
      </span>

      {/* Price — EUR (Cardmarket) primary, USD fallback */}
      {card.prices_eur != null ? (
        <span className="hidden text-xs text-font-secondary sm:inline">
          €{(Number(card.prices_eur) * quantity).toFixed(2)}
        </span>
      ) : card.prices_usd != null ? (
        <span className="hidden text-xs text-font-secondary sm:inline">
          ${(Number(card.prices_usd) * quantity).toFixed(2)}
        </span>
      ) : null}

      {/* Commander toggle button */}
      {onToggleCommander && (
        <button
          onClick={() => onToggleCommander(card.id, board)}
          className={`flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded transition-all shrink-0 ${
            isCommander
              ? 'text-bg-yellow hover:bg-bg-yellow/20'
              : 'text-font-muted opacity-0 hover:bg-bg-yellow/20 hover:text-bg-yellow group-hover:opacity-100'
          }`}
          aria-label={isCommander ? 'Remove Commander' : 'Set as Commander'}
          title={isCommander ? 'Remove Commander' : 'Set as Commander'}
        >
          <Crown className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
        </button>
      )}

      {/* Remove button */}
      {onRemove && (
        <button
          onClick={() => onRemove(card.id, board)}
          className="flex h-5 w-5 sm:h-6 sm:w-6 shrink-0 items-center justify-center rounded text-font-muted opacity-0 transition-all hover:bg-bg-red/20 hover:text-bg-red group-hover:opacity-100"
          aria-label="Remove card"
        >
          <X className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
        </button>
      )}

      {/* Card image preview on hover */}
      {showPreview && card.image_normal && (
        <div className="pointer-events-none fixed z-50 hidden md:block"
          style={{ left: 'var(--preview-x, 16px)', top: 'var(--preview-y, 16px)' }}
          ref={(el) => {
            if (!el) return
            const parent = el.parentElement
            if (!parent) return
            const rect = parent.getBoundingClientRect()
            const x = Math.min(rect.right + 8, window.innerWidth - 240)
            const y = Math.max(8, Math.min(rect.top, window.innerHeight - 340))
            el.style.left = `${x}px`
            el.style.top = `${y}px`
          }}
        >
          <img
            src={card.image_normal}
            alt={card.name}
            className="h-auto w-56 rounded-lg shadow-2xl"
          />
        </div>
      )}

      {/* Context menu for moving between boards + inline quantity / commander */}
      {contextMenu && onMoveToBoard && (
        <CardContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          currentBoard={board}
          quantity={quantity}
          onQuantityChange={
            onQuantityChange ? (next) => onQuantityChange(card.id, next, board) : undefined
          }
          isCommander={isCommander}
          onToggleCommander={
            onToggleCommander ? () => onToggleCommander(card.id, board) : undefined
          }
          onMoveToBoard={(toBoard) => onMoveToBoard(card.id, board, toBoard)}
          onRemove={onRemove ? () => onRemove(card.id, board) : undefined}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
