'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Play,
  Hand,
  Archive,
  Ban,
  ArrowUp,
  ArrowDown,
  Crown,
  RotateCcw,
  Copy,
} from 'lucide-react'

export type ActionMenuZone =
  | 'hand'
  | 'battlefield'
  | 'graveyard'
  | 'exile'
  | 'library_top'
  | 'library_bottom'
  | 'command'
  | 'opponentBattlefield'

export type ActionMenuDest =
  | 'play'
  | 'hand'
  | 'graveyard'
  | 'exile'
  | 'library_top'
  | 'library_bottom'
  | 'command'

interface CardActionMenuProps {
  x: number
  y: number
  zone: ActionMenuZone
  isMine: boolean
  isCommander?: boolean
  /** Battlefield only: shown so the user can flip the tap state. */
  tapped?: boolean
  cardName?: string
  onMoveTo: (dest: ActionMenuDest) => void
  onTap?: () => void
  /** Battlefield only: spawn a token copy of this permanent. */
  onCopy?: () => void
  onClose: () => void
}

interface MenuOption {
  key: string
  icon: React.ElementType
  label: string
  onClick: () => void
  /** Tailwind classes for emphasis (commander = yellow, etc.) */
  color?: string
}

/**
 * Per-zone destination map. Mirrors the spec:
 *   hand        → play | graveyard | exile | library top | library bottom
 *   battlefield → hand | graveyard | exile | library top | library bottom (+ tap toggle)
 *   graveyard   → hand | play | exile | library top | library bottom | command
 *   exile       → hand | play | graveyard | command
 *   library_*   → hand | play | library top | library bottom | graveyard | exile
 *   command     → play
 */
function destinationsFor(zone: ActionMenuZone): ActionMenuDest[] {
  switch (zone) {
    case 'hand':
      return ['play', 'graveyard', 'exile', 'library_top', 'library_bottom']
    case 'battlefield':
      return ['hand', 'graveyard', 'exile', 'library_top', 'library_bottom']
    case 'graveyard':
      return ['hand', 'play', 'exile', 'library_top', 'library_bottom', 'command']
    case 'exile':
      return ['hand', 'play', 'graveyard', 'command']
    case 'library_top':
    case 'library_bottom':
      return ['hand', 'play', 'library_top', 'library_bottom', 'graveyard', 'exile']
    case 'command':
      return ['play']
    case 'opponentBattlefield':
      return []
  }
}

const DEST_META: Record<ActionMenuDest, { icon: React.ElementType; label: string; color?: string }> = {
  play:           { icon: Play,    label: 'Play',         color: 'text-font-accent' },
  hand:           { icon: Hand,    label: 'Hand' },
  graveyard:      { icon: Archive, label: 'Graveyard',    color: 'text-zinc-300' },
  exile:          { icon: Ban,     label: 'Exile',        color: 'text-red-400' },
  library_top:    { icon: ArrowUp, label: 'Top of Library' },
  library_bottom: { icon: ArrowDown, label: 'Bottom of Library' },
  command:        { icon: Crown,   label: 'Command Zone', color: 'text-yellow-400' },
}

export default function CardActionMenu({
  x,
  y,
  zone,
  isMine,
  isCommander,
  tapped,
  cardName,
  onMoveTo,
  onTap,
  onCopy,
  onClose,
}: CardActionMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!isMine || zone === 'opponentBattlefield') return null

  const dests = destinationsFor(zone).filter((d) => {
    // Hide the destination that equals the source zone (e.g. don't show "→ Hand" while in hand)
    if (zone === 'hand' && d === 'hand') return false
    if (zone === 'battlefield' && d === 'play') return false
    if (zone === 'graveyard' && d === 'graveyard') return false
    if (zone === 'exile' && d === 'exile') return false
    if (zone === 'command' && d === 'command') return false
    // Command zone destination only valid for commanders
    if (d === 'command' && !isCommander) return false
    return true
  })

  const options: MenuOption[] = []

  if (zone === 'battlefield' && onTap) {
    options.push({
      key: 'tap',
      icon: RotateCcw,
      label: tapped ? 'Untap' : 'Tap',
      onClick: () => { onTap(); onClose() },
      color: 'text-blue-300',
    })
  }

  if (zone === 'battlefield' && onCopy) {
    options.push({
      key: 'copy',
      icon: Copy,
      label: 'Copy',
      onClick: () => { onCopy(); onClose() },
      color: 'text-purple-300',
    })
  }

  for (const d of dests) {
    const meta = DEST_META[d]
    options.push({
      key: d,
      icon: meta.icon,
      label: meta.label,
      onClick: () => { onMoveTo(d); onClose() },
      color: meta.color,
    })
  }

  if (options.length === 0) return null

  // Sizing — keep panel in-viewport.
  const menuWidth = 220
  const rowH = 36
  const headerH = cardName ? 28 : 0
  const menuHeight = headerH + 8 + options.length * rowH
  const pad = 8
  const viewW = typeof window !== 'undefined' ? window.innerWidth : 0
  const viewH = typeof window !== 'undefined' ? window.innerHeight : 0
  const left = Math.min(Math.max(pad, x), Math.max(pad, viewW - menuWidth - pad))
  const top = Math.min(Math.max(pad, y), Math.max(pad, viewH - menuHeight - pad))

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[100] w-[220px] rounded-xl border border-border bg-bg-surface py-1.5 shadow-2xl"
      style={{ left, top }}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      {cardName && (
        <div className="truncate px-3 pb-1.5 pt-0.5 text-[10px] font-bold uppercase tracking-wider text-font-muted">
          {cardName}
        </div>
      )}
      {options.map((opt) => {
        const Icon = opt.icon
        return (
          <button
            key={opt.key}
            type="button"
            onClick={opt.onClick}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-font-primary transition-colors hover:bg-bg-hover active:bg-bg-hover"
          >
            <Icon className={`h-3.5 w-3.5 ${opt.color ?? 'text-font-muted'}`} />
            <span className={opt.color ?? ''}>{opt.label}</span>
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
