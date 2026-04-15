'use client'

import { Crown, Archive, Ban, Hand } from 'lucide-react'
import type { CardMap } from '@/lib/game/types'

interface CommanderChoiceModalProps {
  instanceId: string
  cardId: number
  cardName: string
  source: 'graveyard' | 'exile'
  commanderCastCount: number
  cardMap: CardMap
  onChoose: (destination: 'commandZone' | 'graveyard' | 'exile' | 'hand') => void
}

export default function CommanderChoiceModal({
  instanceId, cardName, source, commanderCastCount, cardMap, onChoose,
}: CommanderChoiceModalProps) {
  const data = cardMap[instanceId]
  const taxAmount = commanderCastCount * 2

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-dark/80 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-xl border border-border bg-bg-surface p-4">
        <h2 className="mb-1 text-center text-lg font-bold text-font-primary">Commander Zone Choice</h2>
        <p className="mb-4 text-center text-sm text-font-secondary">
          {cardName} would go to {source}. Choose destination:
        </p>
        {data?.imageSmall && (
          <img src={data.imageSmall} alt={cardName} className="mx-auto mb-4 h-40 rounded-lg" />
        )}
        <div className="flex flex-col gap-2">
          <button onClick={() => onChoose('commandZone')}
            className="flex items-center gap-3 rounded-lg bg-yellow-500/20 px-4 py-3 text-sm font-medium text-yellow-400 active:bg-yellow-500/30">
            <Crown size={18} />
            <div>
              <div>Command Zone</div>
              <div className="text-[10px] text-yellow-500/70">Next cast: +{taxAmount + 2} tax ({taxAmount} current)</div>
            </div>
          </button>
          <button onClick={() => onChoose('graveyard')}
            className="flex items-center gap-3 rounded-lg bg-bg-cell px-4 py-3 text-sm font-medium text-font-primary active:bg-bg-hover">
            <Archive size={18} className="text-bg-red" /> Graveyard
          </button>
          <button onClick={() => onChoose('exile')}
            className="flex items-center gap-3 rounded-lg bg-bg-cell px-4 py-3 text-sm font-medium text-font-primary active:bg-bg-hover">
            <Ban size={18} className="text-font-muted" /> Exile
          </button>
          <button onClick={() => onChoose('hand')}
            className="flex items-center gap-3 rounded-lg bg-bg-cell px-4 py-3 text-sm font-medium text-font-primary active:bg-bg-hover">
            <Hand size={18} className="text-font-accent" /> Return to Hand
          </button>
        </div>
      </div>
    </div>
  )
}
