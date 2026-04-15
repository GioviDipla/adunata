'use client'

import { useState } from 'react'
import { ArrowUp, ArrowDown } from 'lucide-react'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

type Destination = 'top' | 'bottom' | 'graveyard' | 'hand' | 'exile'

interface RevealedCard {
  instanceId: string
  card: CardRow
}

interface RevealedCardsChooserProps {
  actionType: 'scry' | 'surveil' | 'peak'
  cards: RevealedCard[]
  onConfirm: (decisions: Record<string, Destination>, topOrder: string[]) => void
  onClose: () => void
}

const DEST_BUTTONS: { key: Destination; label: string; color: string }[] = [
  { key: 'top', label: 'Top', color: 'bg-blue-500/80 text-white' },
  { key: 'bottom', label: 'Bottom', color: 'bg-gray-500/80 text-white' },
  { key: 'graveyard', label: 'GY', color: 'bg-red-500/80 text-white' },
  { key: 'hand', label: 'Hand', color: 'bg-green-500/80 text-white' },
  { key: 'exile', label: 'Exile', color: 'bg-purple-500/80 text-white' },
]

export default function RevealedCardsChooser({ actionType, cards, onConfirm, onClose }: RevealedCardsChooserProps) {
  const [decisions, setDecisions] = useState<Record<string, Destination>>({})
  const [topOrder, setTopOrder] = useState<string[]>([])

  const setDestination = (instanceId: string, dest: Destination) => {
    setDecisions(prev => ({ ...prev, [instanceId]: dest }))
    if (dest === 'top') {
      setTopOrder(prev => prev.includes(instanceId) ? prev : [...prev, instanceId])
    } else {
      setTopOrder(prev => prev.filter(id => id !== instanceId))
    }
  }

  const moveTopCard = (instanceId: string, direction: 'up' | 'down') => {
    setTopOrder(prev => {
      const idx = prev.indexOf(instanceId)
      if (idx === -1) return prev
      const newIdx = direction === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      return next
    })
  }

  const allDecided = cards.every(c => decisions[c.instanceId])

  const handleConfirm = () => {
    if (!allDecided) return
    onConfirm(decisions, topOrder)
  }

  const topCards = topOrder.map(id => cards.find(c => c.instanceId === id)).filter(Boolean) as RevealedCard[]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-dark/80">
      <div className="mx-4 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-bg-surface p-4">
        <h2 className="mb-3 text-center text-lg font-bold text-font-primary capitalize">{actionType}</h2>

        {/* Cards with destination buttons */}
        <div className="space-y-3 mb-4">
          {cards.map((c) => (
            <div key={c.instanceId} className="flex items-center gap-3 rounded-lg bg-bg-cell p-2">
              <div className="w-14 shrink-0">
                {c.card.image_small ? (
                  <img src={c.card.image_small} alt={c.card.name} className="w-full rounded" />
                ) : (
                  <div className="flex aspect-[5/7] items-center justify-center rounded bg-bg-dark p-1">
                    <span className="text-[7px] text-font-muted text-center">{c.card.name}</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-font-primary truncate">{c.card.name}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {DEST_BUTTONS.map((d) => (
                    <button key={d.key} onClick={() => setDestination(c.instanceId, d.key)}
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                        decisions[c.instanceId] === d.key ? d.color + ' ring-1 ring-white/50' : 'bg-bg-dark text-font-muted'
                      }`}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Top order (if any cards going to top) */}
        {topCards.length > 1 && (
          <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
            <p className="text-[10px] font-bold text-blue-400 mb-2">TOP ORDER (first = top of library)</p>
            <div className="space-y-1">
              {topCards.map((c, i) => (
                <div key={c.instanceId} className="flex items-center gap-2 text-xs text-font-primary">
                  <span className="w-4 text-center text-font-muted">{i + 1}</span>
                  <span className="flex-1 truncate">{c.card.name}</span>
                  <button onClick={() => moveTopCard(c.instanceId, 'up')} disabled={i === 0}
                    className="p-0.5 text-font-muted disabled:opacity-20"><ArrowUp size={12} /></button>
                  <button onClick={() => moveTopCard(c.instanceId, 'down')} disabled={i === topCards.length - 1}
                    className="p-0.5 text-font-muted disabled:opacity-20"><ArrowDown size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Confirm */}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg bg-bg-cell py-2.5 text-sm font-bold text-font-secondary">Cancel</button>
          <button onClick={handleConfirm} disabled={!allDecided}
            className="flex-1 rounded-lg bg-bg-accent py-2.5 text-sm font-bold text-font-white disabled:opacity-40">
            Confirm ({Object.keys(decisions).length}/{cards.length})
          </button>
        </div>
      </div>
    </div>
  )
}
