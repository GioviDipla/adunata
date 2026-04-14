'use client'

import { useEffect, useRef } from 'react'
import { ArrowRight, Trash2 } from 'lucide-react'

interface CardContextMenuProps {
  x: number
  y: number
  currentBoard: string
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
  x, y, currentBoard, onMoveToBoard, onRemove, onClose,
}: CardContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [onClose])

  const menuWidth = 180
  const menuHeight = 160
  const left = Math.min(x, window.innerWidth - menuWidth - 8)
  const top = Math.min(y, window.innerHeight - menuHeight - 8)

  const otherBoards = BOARDS.filter((b) => b.key !== currentBoard)

  return (
    <div
      ref={ref}
      className="fixed z-[100] w-44 rounded-xl border border-border bg-bg-surface py-1 shadow-2xl"
      style={{ left, top }}
    >
      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-font-muted">
        Move to
      </div>
      {otherBoards.map((board) => (
        <button
          key={board.key}
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
            onClick={() => { onRemove(); onClose() }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-bg-red transition-colors hover:bg-bg-red/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        </>
      )}
    </div>
  )
}
