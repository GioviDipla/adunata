'use client'

import { useState, useMemo } from 'react'
import { Shield, SkipForward, Check } from 'lucide-react'
import type { BattlefieldCardState, CardMap, CombatState } from '@/lib/game/types'

interface BlockerAssignment {
  blockerId: string
  attackerId: string
  blockerName: string
  attackerName: string
}

// Predefined border colors to visually match blocker-attacker pairs
const PAIR_COLORS = [
  'border-blue-500 bg-blue-500/10',
  'border-green-500 bg-green-500/10',
  'border-yellow-500 bg-yellow-500/10',
  'border-purple-500 bg-purple-500/10',
  'border-pink-500 bg-pink-500/10',
  'border-cyan-500 bg-cyan-500/10',
]

interface CombatBlockersProps {
  myBattlefield: BattlefieldCardState[]
  combat: CombatState
  opponentBattlefield: BattlefieldCardState[]
  cardMap: CardMap
  onConfirm: (assignments: BlockerAssignment[]) => void
  onSkip: () => void
}

export default function CombatBlockers({
  myBattlefield, combat, opponentBattlefield, cardMap, onConfirm, onSkip,
}: CombatBlockersProps) {
  const [assignments, setAssignments] = useState<BlockerAssignment[]>([])
  const [selectedBlocker, setSelectedBlocker] = useState<string | null>(null)

  // Attacking creatures from the opponent's battlefield
  const attackers = useMemo(() => {
    const attackerIds = new Set(combat.attackers.map((a) => a.instanceId))
    return opponentBattlefield.filter((c) => attackerIds.has(c.instanceId))
  }, [combat.attackers, opponentBattlefield])

  // My untapped creatures that can block
  const eligibleBlockers = useMemo(() => {
    return myBattlefield.filter((c) => {
      if (c.tapped) return false
      const data = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
      if (!data) return false
      return data.typeLine.toLowerCase().includes('creature')
    })
  }, [myBattlefield, cardMap])

  // Map from blocker instanceId to its assignment index (for color coding)
  const blockerToColorIndex = useMemo(() => {
    const map = new Map<string, number>()
    assignments.forEach((a, i) => map.set(a.blockerId, i % PAIR_COLORS.length))
    return map
  }, [assignments])

  // Map from attacker instanceId to its assignment index
  const attackerToColorIndex = useMemo(() => {
    const map = new Map<string, number>()
    assignments.forEach((a, i) => map.set(a.attackerId, i % PAIR_COLORS.length))
    return map
  }, [assignments])

  // Set of blocker instanceIds already assigned
  const assignedBlockerIds = useMemo(() => new Set(assignments.map((a) => a.blockerId)), [assignments])

  const handleBlockerTap = (instanceId: string) => {
    // If already assigned, remove the assignment
    if (assignedBlockerIds.has(instanceId)) {
      setAssignments((prev) => prev.filter((a) => a.blockerId !== instanceId))
      setSelectedBlocker(null)
      return
    }
    setSelectedBlocker(instanceId)
  }

  const handleAttackerTap = (attackerInstanceId: string) => {
    if (!selectedBlocker) return
    const blockerData = cardMap[selectedBlocker]
    const attackerData = cardMap[attackerInstanceId]

    setAssignments((prev) => [
      ...prev.filter((a) => a.blockerId !== selectedBlocker),
      {
        blockerId: selectedBlocker,
        attackerId: attackerInstanceId,
        blockerName: blockerData?.name ?? 'Unknown',
        attackerName: attackerData?.name ?? 'Unknown',
      },
    ])
    setSelectedBlocker(null)
  }

  const handleConfirm = () => {
    onConfirm(assignments)
  }

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-bg-dark/95">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Shield size={18} className="text-blue-400" />
        <span className="text-sm font-bold text-font-primary">Declare Blockers</span>
        <span className="ml-auto text-xs text-font-muted">
          {assignments.length} assigned
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {/* Attackers (opponent) */}
        <div className="mb-3">
          <span className="mb-1.5 block text-[9px] font-bold tracking-wider text-bg-red">
            ATTACKING CREATURES
            {selectedBlocker && ' — tap one to assign block'}
          </span>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {attackers.map((c) => {
              const data = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
              if (!data) return null
              const colorIdx = attackerToColorIndex.get(c.instanceId)
              const hasColor = colorIdx !== undefined
              return (
                <button
                  key={c.instanceId}
                  onClick={() => handleAttackerTap(c.instanceId)}
                  className={`flex flex-col items-center overflow-hidden rounded-lg border-2 transition-colors ${
                    hasColor
                      ? PAIR_COLORS[colorIdx]
                      : selectedBlocker
                        ? 'border-bg-red/50 bg-bg-card hover:border-bg-red'
                        : 'border-bg-red/30 bg-bg-card'
                  }`}
                >
                  <div className="relative w-full" style={{ height: 90 }}>
                    {data.imageSmall ? (
                      <img src={data.imageSmall} alt={data.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-bg-cell">
                        <span className="text-xs text-font-muted">{data.name}</span>
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
        </div>

        {/* Blockers (mine) */}
        <div>
          <span className="mb-1.5 block text-[9px] font-bold tracking-wider text-blue-400">
            YOUR CREATURES — tap to select blocker
          </span>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {eligibleBlockers.map((c) => {
              const data = cardMap[c.instanceId] ?? cardMap[String(c.cardId)]
              if (!data) return null
              const isSelected = selectedBlocker === c.instanceId
              const colorIdx = blockerToColorIndex.get(c.instanceId)
              const hasColor = colorIdx !== undefined
              return (
                <button
                  key={c.instanceId}
                  onClick={() => handleBlockerTap(c.instanceId)}
                  className={`flex flex-col items-center overflow-hidden rounded-lg border-2 transition-colors ${
                    isSelected
                      ? 'border-font-white bg-font-white/10'
                      : hasColor
                        ? PAIR_COLORS[colorIdx]
                        : 'border-border bg-bg-card'
                  }`}
                >
                  <div className="relative w-full" style={{ height: 90 }}>
                    {data.imageSmall ? (
                      <img src={data.imageSmall} alt={data.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-bg-cell">
                        <span className="text-xs text-font-muted">{data.name}</span>
                      </div>
                    )}
                    {hasColor && (
                      <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500">
                        <Shield size={10} className="text-font-white" />
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
            {eligibleBlockers.length === 0 && (
              <span className="col-span-3 py-4 text-center text-xs text-font-muted">
                No creatures available to block
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 border-t border-border px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          onClick={onSkip}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-bg-cell py-2.5 text-sm font-bold text-font-secondary"
        >
          <SkipForward size={14} />
          No Blocks
        </button>
        <button
          onClick={handleConfirm}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-font-white"
        >
          <Check size={14} />
          Confirm Blockers ({assignments.length})
        </button>
      </div>
    </div>
  )
}
