'use client'

import { useState, useMemo } from 'react'
import { Swords, SkipForward, Check } from 'lucide-react'
import type { BattlefieldCardState, CardMap } from '@/lib/game/types'

interface CombatAttackersProps {
  battlefield: BattlefieldCardState[]
  cardMap: CardMap
  onConfirm: (attackerIds: string[], attackerNames: string[]) => void
  onSkip: () => void
}

export default function CombatAttackers({ battlefield, cardMap, onConfirm, onSkip }: CombatAttackersProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Only untapped creatures / tokens / cards with altered P/T (e.g. lands
  // animated into creatures via effects) can attack. Defender is excluded.
  const eligibleCreatures = useMemo(() => {
    return battlefield.filter((c) => {
      if (c.tapped) return false
      const data = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
      if (!data) return false
      const kws = data.keywords?.map((k) => k.toLowerCase()) ?? []
      if (kws.includes('defender')) return false
      const isCreature = data.typeLine.toLowerCase().includes('creature')
      const hasAlteredPT = (c.powerMod ?? 0) !== 0 || (c.toughnessMod ?? 0) !== 0
      return isCreature || data.isToken || hasAlteredPT
    })
  }, [battlefield, cardMap])

  const toggleAttacker = (instanceId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(instanceId)) {
        next.delete(instanceId)
      } else {
        next.add(instanceId)
      }
      return next
    })
  }

  const handleConfirm = () => {
    const ids = Array.from(selected)
    const names = ids.map((id) => {
      const data = cardMap[id]
      return data?.name ?? 'Unknown'
    })
    onConfirm(ids, names)
  }

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col bg-bg-dark/95"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Swords size={18} className="text-bg-red" />
        <span className="text-sm font-bold text-font-primary">Declare Attackers</span>
        <span className="ml-auto text-xs text-font-muted">
          {selected.size} selected
        </span>
      </div>

      {/* Creature grid */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {eligibleCreatures.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-sm text-font-muted">No creatures available to attack</span>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
            {eligibleCreatures.map((c) => {
              const data = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
              if (!data) return null
              const isSelected = selected.has(c.instanceId)
              return (
                <button
                  key={c.instanceId}
                  onClick={() => toggleAttacker(c.instanceId)}
                  className={`flex flex-col items-center overflow-hidden rounded-lg border-2 transition-colors ${
                    isSelected
                      ? 'border-bg-red bg-bg-red/10'
                      : 'border-border bg-bg-card'
                  }`}
                >
                  <div className="relative w-full aspect-[5/7] overflow-hidden">
                    {data.imageSmall ? (
                      <img src={data.imageSmall} alt={data.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-bg-cell">
                        <span className="text-xs text-font-muted">{data.name}</span>
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-bg-red">
                        <Swords size={10} className="text-font-white" />
                      </div>
                    )}
                  </div>
                  <div className="w-full px-1 py-1">
                    <span className="block truncate text-[9px] font-semibold text-font-primary">{data.name}</span>
                    {data.power != null && data.toughness != null && (
                      <span className="text-[8px] text-font-muted">{data.power}/{data.toughness}</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 border-t border-border px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          onClick={onSkip}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-bg-cell py-2.5 text-sm font-bold text-font-secondary"
        >
          <SkipForward size={14} />
          Skip
        </button>
        <button
          onClick={handleConfirm}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-bg-red py-2.5 text-sm font-bold text-font-white"
        >
          <Check size={14} />
          Confirm Attackers ({selected.size})
        </button>
      </div>
    </div>
  )
}
