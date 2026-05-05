'use client'

import { useCallback, useMemo, useState } from 'react'
import { Trash2, Check } from 'lucide-react'
import { useLongPress } from '@/lib/hooks/useLongPress'
import type { CardMap } from '@/lib/game/types'

interface DiscardSelectorProps {
  hand: string[]   // instanceIds
  cardMap: CardMap
  onConfirm: (discards: { instanceId: string; cardId: number; cardName: string }[]) => void
  onCardPreview?: (instanceId: string) => void
}

function DiscardCardButton({
  instanceId,
  data,
  isSelected,
  onToggle,
  onPreview,
}: {
  instanceId: string
  data: CardMap[string]
  isSelected: boolean
  onToggle: (id: string) => void
  onPreview?: (id: string) => void
}) {
  const longPress = useLongPress({
    onLongPress: () => onPreview?.(instanceId),
    delay: 400,
  })

  const handleClick = useCallback(() => {
    if (longPress.wasLongPress()) return
    onToggle(instanceId)
  }, [longPress, onToggle, instanceId])

  return (
    <button
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault()
        onPreview?.(instanceId)
      }}
      {...longPress.handlers}
      className={`flex flex-col items-center overflow-hidden rounded-lg border-2 transition-colors select-none ${
        isSelected
          ? 'border-bg-red bg-bg-red/10'
          : 'border-border bg-bg-card'
      }`}
      title={`${data.name} — tap to select, hold to preview`}
    >
      <div className="relative w-full aspect-[5/7] overflow-hidden">
        {data.imageSmall ? (
          <img
            src={data.imageSmall}
            alt={data.name}
            className="h-full w-full object-cover pointer-events-none"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-bg-cell">
            <span className="text-xs text-font-muted">{data.name}</span>
          </div>
        )}
        {isSelected && (
          <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-bg-red">
            <Trash2 size={10} className="text-font-white" />
          </div>
        )}
      </div>
      <div className="w-full px-1 py-1">
        <span className="block truncate text-[9px] font-semibold text-font-primary">{data.name}</span>
      </div>
    </button>
  )
}

export default function DiscardSelector({ hand, cardMap, onConfirm, onCardPreview }: DiscardSelectorProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const discardCount = hand.length - 7

  const handCards = useMemo(() => {
    return hand
      .map((instanceId) => {
        const data = cardMap[instanceId]
        if (!data) return null
        return { instanceId, data }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }, [hand, cardMap])

  const toggleCard = (instanceId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(instanceId)) {
        next.delete(instanceId)
      } else {
        // Only allow selecting up to discardCount
        if (next.size >= discardCount) return prev
        next.add(instanceId)
      }
      return next
    })
  }

  const handleConfirm = () => {
    const discards = Array.from(selected).map((instanceId) => {
      const data = cardMap[instanceId]
      return {
        instanceId,
        cardId: data?.cardId ?? 0,
        cardName: data?.name ?? 'Unknown',
      }
    })
    onConfirm(discards)
  }

  const remaining = discardCount - selected.size

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col bg-bg-dark/95"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Trash2 size={18} className="text-bg-red" />
        <span className="text-sm font-bold text-font-primary">Discard to 7</span>
        <span className="ml-auto text-xs font-bold text-bg-red">
          {remaining > 0 ? `Discard ${remaining} more` : 'Ready'}
        </span>
      </div>

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {handCards.map(({ instanceId, data }) => (
            <DiscardCardButton
              key={instanceId}
              instanceId={instanceId}
              data={data}
              isSelected={selected.has(instanceId)}
              onToggle={toggleCard}
              onPreview={onCardPreview}
            />
          ))}
        </div>
      </div>

      {/* Action button */}
      <div className="border-t border-border px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          onClick={handleConfirm}
          disabled={remaining > 0}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-bg-red py-2.5 text-sm font-bold text-font-white disabled:opacity-40"
        >
          <Check size={14} />
          Confirm Discard ({selected.size})
        </button>
      </div>
    </div>
  )
}
