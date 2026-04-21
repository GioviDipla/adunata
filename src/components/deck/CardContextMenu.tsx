'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Trash2, Crown, Minus, Plus } from 'lucide-react'

interface CardContextMenuProps {
  x: number
  y: number
  currentBoard: string
  /** Quantity controls — shown when `onQuantityChange` is supplied. */
  quantity?: number
  onQuantityChange?: (next: number) => void
  /** Commander toggle — shown when `onToggleCommander` is supplied. */
  isCommander?: boolean
  onToggleCommander?: () => void
  onMoveToBoard: (board: string) => void
  onRemove?: () => void
  onClose: () => void
}

const BOARDS = [
  { key: 'main', label: 'Main Deck' },
  { key: 'sideboard', label: 'Sideboard' },
  { key: 'maybeboard', label: 'Maybeboard' },
]

export default function CardContextMenu({
  x,
  y,
  currentBoard,
  quantity,
  onQuantityChange,
  isCommander,
  onToggleCommander,
  onMoveToBoard,
  onRemove,
  onClose,
}: CardContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Body scroll lock + Escape. Matches the pattern used by the card browser's
  // context menu so a stray touch-scroll on mobile can't drag the page behind
  // and visually detach the floating panel from the user's finger.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    document.addEventListener('keydown', onKey)

    const { body } = document
    const prevOverflow = body.style.overflow
    const prevPaddingRight = body.style.paddingRight
    const scrollbarGap = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (scrollbarGap > 0) body.style.paddingRight = `${scrollbarGap}px`

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('keydown', onKey)
      body.style.overflow = prevOverflow
      body.style.paddingRight = prevPaddingRight
    }
  }, [onClose])

  // Panel dimensions vary with which optional rows are present.
  const hasQuantity = onQuantityChange != null && quantity != null
  const hasCommander = onToggleCommander != null
  const menuWidth = 200
  let menuHeight = 60 // move-to header + gap
  if (hasQuantity) menuHeight += 52
  if (hasCommander) menuHeight += 44
  menuHeight += BOARDS.filter((b) => b.key !== currentBoard).length * 36
  if (onRemove) menuHeight += 40

  const pad = 8
  const viewW = typeof window !== 'undefined' ? window.innerWidth : 0
  const viewH = typeof window !== 'undefined' ? window.innerHeight : 0
  const left = Math.min(Math.max(pad, x), Math.max(pad, viewW - menuWidth - pad))
  const top = Math.min(Math.max(pad, y), Math.max(pad, viewH - menuHeight - pad))

  const otherBoards = BOARDS.filter((b) => b.key !== currentBoard)

  if (typeof document === 'undefined') return null

  // Portal into document.body so no ancestor (backdrop-filter, transform, ...)
  // can become the containing block for `position: fixed` and re-anchor the
  // panel to itself. See CardContextMenu under components/cards for the full
  // write-up of that bug.
  return createPortal(
    <div
      ref={ref}
      className="fixed z-[100] w-[200px] rounded-xl border border-border bg-bg-surface py-1.5 shadow-2xl"
      style={{ left, top }}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      {hasQuantity && (
        <>
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-font-muted">
            Copies
          </div>
          <div className="flex items-center justify-between gap-2 px-3 py-1.5">
            <button
              type="button"
              onClick={() => onQuantityChange!(Math.max(0, quantity! - 1))}
              aria-label="Decrease copies"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-cell text-font-secondary transition-colors hover:bg-bg-hover hover:text-font-primary active:bg-bg-hover"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[2rem] text-center text-base font-semibold tabular-nums text-font-primary">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => onQuantityChange!(quantity! + 1)}
              aria-label="Increase copies"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-cell text-font-secondary transition-colors hover:bg-bg-hover hover:text-font-primary active:bg-bg-hover"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mx-2 my-1 border-t border-border" />
        </>
      )}

      {hasCommander && (
        <>
          <button
            type="button"
            onClick={() => { onToggleCommander!(); onClose() }}
            className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-bg-hover ${
              isCommander ? 'text-bg-yellow' : 'text-font-primary'
            }`}
          >
            <Crown className={`h-3.5 w-3.5 ${isCommander ? 'text-bg-yellow' : 'text-font-muted'}`} />
            {isCommander ? 'Remove Commander' : 'Set as Commander'}
          </button>
          <div className="mx-2 my-1 border-t border-border" />
        </>
      )}

      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-font-muted">
        Move to
      </div>
      {otherBoards.map((board) => (
        <button
          key={board.key}
          type="button"
          onClick={() => { onMoveToBoard(board.key); onClose() }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-font-primary transition-colors hover:bg-bg-hover"
        >
          <ArrowRight className="h-3.5 w-3.5 text-font-muted" />
          {board.label}
        </button>
      ))}

      {onRemove && (
        <>
          <div className="mx-2 my-1 border-t border-border" />
          <button
            type="button"
            onClick={() => { onRemove(); onClose() }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-bg-red transition-colors hover:bg-bg-red/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}
