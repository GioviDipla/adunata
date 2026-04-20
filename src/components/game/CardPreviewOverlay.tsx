'use client'

import { useEffect, useState } from 'react'
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
  onSetCounter?: (instanceId: string, name: string, value: number) => void
  onSetPT?: (instanceId: string, powerMod: number, toughnessMod: number) => void
  onCopy?: (instanceId: string) => void
  onTakeControl?: (instanceId: string) => void
  onCastCommander?: (instanceId: string) => void

  // Counter display
  counters?: { name: string; value: number }[]
  ptMod?: { powerMod: number; toughnessMod: number }
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

const COUNTER_TYPES = ['+1/+1', '-1/-1', 'Flying', 'Trample', 'Shield', 'Indestructible', 'Lifelink', 'Double Strike', 'Loyalty', 'Saga']

function CounterRow({ name, value, onSet, onAdd, onRemove }: {
  name: string; value: number
  onSet: (v: number) => void
  onAdd: () => void
  onRemove: () => void
}) {
  const [draft, setDraft] = useState(String(value))
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(String(value))
  }, [value, editing])

  const commit = () => {
    setEditing(false)
    const parsed = parseInt(draft, 10)
    const next = Number.isFinite(parsed) ? parsed : 0
    if (next !== value) onSet(next)
    setDraft(String(next))
  }

  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[11px] text-font-primary truncate mr-2">{name}</span>
      <div className="flex items-center gap-1">
        <button onClick={onRemove} className="flex h-6 w-6 items-center justify-center rounded bg-bg-cell text-xs text-font-secondary active:bg-bg-hover">-</button>
        <input
          type="text"
          inputMode="numeric"
          pattern="-?[0-9]*"
          value={draft}
          onFocus={(e) => { setEditing(true); e.currentTarget.select() }}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d-]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            else if (e.key === 'Escape') { setDraft(String(value)); setEditing(false); e.currentTarget.blur() }
          }}
          className="h-6 w-10 rounded bg-bg-cell text-center text-xs text-font-primary outline-none"
        />
        <button onClick={onAdd} className="flex h-6 w-6 items-center justify-center rounded bg-bg-cell text-xs text-font-secondary active:bg-bg-hover">+</button>
      </div>
    </div>
  )
}

function CounterSection({
  counters,
  onAdd,
  onRemove,
  onSet,
}: {
  counters: { name: string; value: number }[]
  onAdd: (name: string) => void
  onRemove: (name: string) => void
  onSet: (name: string, value: number) => void
}) {
  const [customName, setCustomName] = useState('')

  // Build full list: all predefined types (with value from counters or 0) + any custom counters
  const allRows: { name: string; value: number }[] = COUNTER_TYPES.map(t => {
    const existing = counters.find(c => c.name === t)
    return { name: t, value: existing?.value ?? 0 }
  })
  // Add any custom counters not in the predefined list
  for (const c of counters) {
    if (!COUNTER_TYPES.includes(c.name)) {
      allRows.push(c)
    }
  }

  return (
    <div className="w-full rounded-xl bg-bg-surface p-2">
      <p className="text-[10px] font-bold text-font-muted mb-1">COUNTERS</p>
      {allRows.map((c) => (
        <CounterRow
          key={c.name}
          name={c.name}
          value={c.value}
          onSet={(v) => onSet(c.name, v)}
          onAdd={() => onAdd(c.name)}
          onRemove={() => onRemove(c.name)}
        />
      ))}
      {/* Custom counter input */}
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
          placeholder="Custom..."
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

function PTSection({ power, toughness, powerMod, toughnessMod, onSetPT }: {
  power: string | null
  toughness: string | null
  powerMod: number
  toughnessMod: number
  onSetPT: (powerMod: number, toughnessMod: number) => void
}) {
  const basePower = parseInt(power ?? '0') || 0
  const baseToughness = parseInt(toughness ?? '0') || 0
  const effectivePower = basePower + powerMod
  const effectiveToughness = baseToughness + toughnessMod

  return (
    <div className="w-full rounded-xl bg-bg-surface p-2">
      <p className="text-[10px] font-bold text-font-muted mb-1">POWER / TOUGHNESS</p>
      <div className="flex items-center justify-center gap-3">
        {/* Power */}
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[8px] text-font-muted">POWER</span>
          <div className="flex items-center gap-1">
            <button onClick={() => onSetPT(powerMod - 1, toughnessMod)} className="flex h-6 w-6 items-center justify-center rounded bg-bg-cell text-xs text-font-secondary active:bg-bg-hover">-</button>
            <span className={`min-w-[28px] text-center text-sm font-bold ${powerMod !== 0 ? 'text-yellow-400' : 'text-font-primary'}`}>
              {effectivePower}
            </span>
            <button onClick={() => onSetPT(powerMod + 1, toughnessMod)} className="flex h-6 w-6 items-center justify-center rounded bg-bg-cell text-xs text-font-secondary active:bg-bg-hover">+</button>
          </div>
          {powerMod !== 0 && <span className="text-[8px] text-font-muted">base {basePower} {powerMod >= 0 ? '+' : ''}{powerMod}</span>}
        </div>

        <span className="text-lg font-bold text-font-muted">/</span>

        {/* Toughness */}
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[8px] text-font-muted">TOUGHNESS</span>
          <div className="flex items-center gap-1">
            <button onClick={() => onSetPT(powerMod, toughnessMod - 1)} className="flex h-6 w-6 items-center justify-center rounded bg-bg-cell text-xs text-font-secondary active:bg-bg-hover">-</button>
            <span className={`min-w-[28px] text-center text-sm font-bold ${toughnessMod !== 0 ? 'text-yellow-400' : 'text-font-primary'}`}>
              {effectiveToughness}
            </span>
            <button onClick={() => onSetPT(powerMod, toughnessMod + 1)} className="flex h-6 w-6 items-center justify-center rounded bg-bg-cell text-xs text-font-secondary active:bg-bg-hover">+</button>
          </div>
          {toughnessMod !== 0 && <span className="text-[8px] text-font-muted">base {baseToughness} {toughnessMod >= 0 ? '+' : ''}{toughnessMod}</span>}
        </div>

        {/* Reset button */}
        {(powerMod !== 0 || toughnessMod !== 0) && (
          <button onClick={() => onSetPT(0, 0)} className="flex h-6 items-center justify-center rounded bg-bg-cell px-2 text-[9px] text-font-secondary active:bg-bg-hover">
            <RotateCcw size={10} />
          </button>
        )}
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
  onSetCounter,
  onSetPT,
  onCopy,
  onTakeControl,
  onCastCommander,
  counters,
  ptMod,
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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-bg-dark/80 backdrop-blur-sm"
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
            onSet={(name, value) => onSetCounter?.(id!, name, value) ?? onAddCounter!(id!, name)}
          />
        )}

        {/* P/T modifier section — only for creatures (cards with power/toughness) */}
        {!readOnly && id && onSetPT && ptMod && preview.card.power != null && (
          <PTSection
            power={preview.card.power}
            toughness={preview.card.toughness}
            powerMod={ptMod.powerMod}
            toughnessMod={ptMod.toughnessMod}
            onSetPT={(p, t) => onSetPT!(id!, p, t)}
          />
        )}
      </div>
    </div>
  )
}
