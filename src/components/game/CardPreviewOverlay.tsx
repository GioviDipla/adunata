'use client'

import { useState } from 'react'
import {
  Play,
  Trash2,
  Flame,
  Ban,
  ArrowLeft,
  Archive,
  ArrowDown,
  ArrowUp,
  Shuffle,
  RotateCcw,
  Hash,
  Copy,
  ArrowRightLeft,
  Crown,
} from 'lucide-react'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

export type PreviewZone = 'hand' | 'battlefield' | 'commandZone' | 'library' | 'graveyard' | 'exile' | 'opponentBattlefield'

export interface PreviewState {
  card: CardRow
  zone?: PreviewZone
  instanceId?: string
  tapped?: boolean
  counters?: { name: string; value: number }[]
}

interface CardPreviewOverlayProps {
  preview: PreviewState | null
  onClose: () => void
  readOnly?: boolean

  // Universal actions — shown based on which are provided
  onPlay?: (instanceId: string) => void
  onDiscard?: (instanceId: string) => void
  onSacrifice?: (instanceId: string) => void
  onExile?: (instanceId: string) => void
  onReturnToHand?: (instanceId: string) => void
  onSendToGraveyard?: (instanceId: string) => void
  onSendToBottom?: (instanceId: string) => void
  onSendToTop?: (instanceId: string) => void
  onShuffle?: (instanceId: string) => void
  onTap?: (instanceId: string) => void
  onAddCounter?: (instanceId: string, name: string) => void
  onRemoveCounter?: (instanceId: string, name: string) => void
  onCopy?: (instanceId: string) => void
  onTakeControl?: (instanceId: string) => void
  onCastCommander?: (instanceId: string) => void

  // Counter display
  counters?: { name: string; value: number }[]
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  color = 'bg-bg-cell text-font-primary',
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium active:opacity-80 ${color}`}
    >
      <Icon size={14} /> {label}
    </button>
  )
}

const QUICK_COUNTERS = ['+1/+1', '-1/-1', 'Loyalty', 'Charge']

function CounterSection({
  counters,
  onAdd,
  onRemove,
}: {
  counters: { name: string; value: number }[]
  onAdd: (name: string) => void
  onRemove: (name: string) => void
}) {
  const [customName, setCustomName] = useState('')

  return (
    <div className="w-full rounded-xl bg-bg-surface p-2">
      <p className="text-[10px] font-bold text-font-muted mb-1">COUNTERS</p>
      {counters.map((c) => (
        <div key={c.name} className="flex items-center justify-between py-0.5">
          <span className="text-xs text-font-primary">
            {c.name}: {c.value}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => onRemove(c.name)}
              className="px-1.5 py-0.5 rounded bg-bg-cell text-xs text-font-secondary active:bg-bg-hover"
            >
              -
            </button>
            <button
              onClick={() => onAdd(c.name)}
              className="px-1.5 py-0.5 rounded bg-bg-cell text-xs text-font-secondary active:bg-bg-hover"
            >
              +
            </button>
          </div>
        </div>
      ))}
      {/* Quick-add buttons for common counter types */}
      <div className="flex flex-wrap gap-1 mt-1.5">
        {QUICK_COUNTERS.filter(qc => !counters.some(c => c.name === qc)).map((qc) => (
          <button
            key={qc}
            onClick={() => onAdd(qc)}
            className="rounded bg-bg-cell px-2 py-1 text-[10px] font-medium text-font-secondary active:bg-bg-hover"
          >
            + {qc}
          </button>
        ))}
      </div>
      {/* Custom counter name input */}
      <div className="flex gap-1 mt-1.5">
        <input
          type="text"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && customName.trim()) {
              onAdd(customName.trim())
              setCustomName('')
            }
          }}
          placeholder="Custom counter..."
          className="flex-1 rounded bg-bg-cell px-2 py-1 text-[10px] text-font-primary placeholder:text-font-muted outline-none"
        />
        <button
          onClick={() => {
            if (customName.trim()) {
              onAdd(customName.trim())
              setCustomName('')
            }
          }}
          className="rounded bg-bg-accent px-2 py-1 text-[10px] font-bold text-font-white"
        >
          Add
        </button>
      </div>
    </div>
  )
}

/**
 * Universal card preview overlay — action hub for ALL card interactions.
 * The caller decides which actions to provide; this component renders them all in a grid.
 */
export default function CardPreviewOverlay({
  preview,
  onClose,
  readOnly,
  onPlay,
  onDiscard,
  onSacrifice,
  onExile,
  onReturnToHand,
  onSendToGraveyard,
  onSendToBottom,
  onSendToTop,
  onShuffle,
  onTap,
  onAddCounter,
  onRemoveCounter,
  onCopy,
  onTakeControl,
  onCastCommander,
  counters,
}: CardPreviewOverlayProps) {
  if (!preview) return null

  const id = preview.instanceId

  const act = (fn: () => void) => {
    fn()
    onClose()
  }

  // Build the action list from provided callbacks
  const actions: { icon: React.ElementType; label: string; onClick: () => void; color?: string }[] = []

  if (!readOnly && id) {
    if (onPlay) actions.push({ icon: Play, label: 'Play', onClick: () => act(() => onPlay(id)) })
    if (onCastCommander) actions.push({ icon: Crown, label: 'Cast', onClick: () => act(() => onCastCommander(id)), color: 'bg-bg-cell text-font-accent' })
    if (onTap) actions.push({ icon: RotateCcw, label: preview.tapped ? 'Untap' : 'Tap', onClick: () => act(() => onTap(id)) })
    if (onDiscard) actions.push({ icon: Trash2, label: 'Discard', onClick: () => act(() => onDiscard(id)) })
    if (onSacrifice) actions.push({ icon: Flame, label: 'Sacrifice', onClick: () => act(() => onSacrifice(id)), color: 'bg-bg-cell text-bg-red' })
    if (onExile) actions.push({ icon: Ban, label: 'Exile', onClick: () => act(() => onExile(id)) })
    if (onReturnToHand) actions.push({ icon: ArrowLeft, label: 'Hand', onClick: () => act(() => onReturnToHand(id)) })
    if (onSendToGraveyard) actions.push({ icon: Archive, label: 'Grave', onClick: () => act(() => onSendToGraveyard(id)) })
    if (onSendToBottom) actions.push({ icon: ArrowDown, label: 'Bottom', onClick: () => act(() => onSendToBottom(id)) })
    if (onSendToTop) actions.push({ icon: ArrowUp, label: 'Top', onClick: () => act(() => onSendToTop(id)) })
    if (onShuffle) actions.push({ icon: Shuffle, label: 'Shuffle', onClick: () => act(() => onShuffle(id)) })
    if (onCopy) actions.push({ icon: Copy, label: 'Copy', onClick: () => act(() => onCopy(id)) })
    if (onTakeControl) actions.push({ icon: ArrowRightLeft, label: 'Take Control', onClick: () => act(() => onTakeControl(id)) })
  }

  const displayCounters = counters ?? preview.counters
  const showCounters = !readOnly && id && onAddCounter

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-dark/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] max-w-sm flex-col items-center gap-3 overflow-y-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Card image */}
        {preview.card.image_normal ? (
          <img
            src={preview.card.image_normal}
            alt={preview.card.name}
            className="max-h-[40vh] rounded-xl"
          />
        ) : preview.card.image_small ? (
          <img
            src={preview.card.image_small}
            alt={preview.card.name}
            className="max-h-[40vh] rounded-xl"
          />
        ) : (
          <div className="flex h-48 w-40 flex-col items-center justify-center gap-2 rounded-xl bg-bg-surface p-4">
            <span className="text-xs text-font-secondary">{preview.card.type_line}</span>
            <span className="text-center text-base font-bold text-font-primary">
              {preview.card.name}
            </span>
            {preview.card.oracle_text && (
              <p className="text-center text-xs text-font-secondary">
                {preview.card.oracle_text}
              </p>
            )}
          </div>
        )}

        {/* Card name */}
        <h3 className="text-sm font-bold text-font-primary">{preview.card.name}</h3>

        {/* Actions grid */}
        {actions.length > 0 && (
          <div className="grid w-full grid-cols-3 gap-1.5 rounded-xl bg-bg-surface p-2">
            {actions.map((a) => (
              <ActionBtn
                key={a.label}
                icon={a.icon}
                label={a.label}
                onClick={a.onClick}
                color={a.color}
              />
            ))}
          </div>
        )}

        {/* Counter section */}
        {showCounters && (
          <CounterSection
            counters={displayCounters ?? []}
            onAdd={(name) => onAddCounter!(id!, name)}
            onRemove={(name) => onRemoveCounter?.(id!, name)}
          />
        )}
      </div>
    </div>
  )
}
