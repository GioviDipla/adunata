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

interface RadioOption {
  value: Destination
  label: string
  activeColor: string
}

const SCRY_OPTIONS: RadioOption[] = [
  { value: 'top', label: 'Top', activeColor: 'bg-blue-500 text-white' },
  { value: 'bottom', label: 'Bottom', activeColor: 'bg-gray-600 text-white' },
]

const SURVEIL_OPTIONS: RadioOption[] = [
  { value: 'top', label: 'Top', activeColor: 'bg-blue-500 text-white' },
  { value: 'graveyard', label: 'Graveyard', activeColor: 'bg-red-500 text-white' },
]

// Peak keeps all 5 destinations as simple buttons (fallback)
const PEAK_OPTIONS: RadioOption[] = [
  { value: 'top', label: 'Top', activeColor: 'bg-blue-500 text-white' },
  { value: 'bottom', label: 'Bottom', activeColor: 'bg-gray-600 text-white' },
  { value: 'graveyard', label: 'GY', activeColor: 'bg-red-500 text-white' },
  { value: 'hand', label: 'Hand', activeColor: 'bg-green-500 text-white' },
  { value: 'exile', label: 'Exile', activeColor: 'bg-purple-500 text-white' },
]

function getOptions(actionType: string): RadioOption[] {
  switch (actionType) {
    case 'scry': return SCRY_OPTIONS
    case 'surveil': return SURVEIL_OPTIONS
    default: return PEAK_OPTIONS
  }
}

function getTitle(actionType: string, count: number): string {
  switch (actionType) {
    case 'scry': return `Scry ${count}`
    case 'surveil': return `Surveil ${count}`
    default: return `Peek ${count}`
  }
}

export default function RevealedCardsChooser({ actionType, cards, onConfirm, onClose }: RevealedCardsChooserProps) {
  const [decisions, setDecisions] = useState<Record<string, Destination>>({})
  const [topOrder, setTopOrder] = useState<string[]>([])

  const options = getOptions(actionType)

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
  const decidedCount = Object.keys(decisions).length

  const handleConfirm = () => {
    if (!allDecided) return
    onConfirm(decisions, topOrder)
  }

  const handleCancel = () => {
    // Put all cards back on top in original order
    const allTop: Record<string, Destination> = {}
    const order: string[] = []
    cards.forEach(c => {
      allTop[c.instanceId] = 'top'
      order.push(c.instanceId)
    })
    onConfirm(allTop, order)
  }

  const topCards = topOrder.map(id => cards.find(c => c.instanceId === id)).filter(Boolean) as RevealedCard[]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-dark/80">
      <div className="mx-4 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-bg-surface p-5 shadow-2xl">
        {/* Header */}
        <h2 className="mb-4 text-center text-lg font-bold text-font-primary">
          {getTitle(actionType, cards.length)}
        </h2>

        {/* Card rows */}
        <div className="space-y-2 mb-4">
          {cards.map((c) => {
            const decision = decisions[c.instanceId]
            return (
              <div key={c.instanceId} className="flex items-center gap-3 rounded-xl bg-bg-cell p-2.5">
                {/* Card image */}
                <div className="w-14 shrink-0">
                  {c.card.image_small ? (
                    <img src={c.card.image_small} alt={c.card.name} className="w-full rounded-md" />
                  ) : (
                    <div className="flex aspect-[5/7] items-center justify-center rounded-md bg-bg-dark p-1">
                      <span className="text-[7px] text-font-muted text-center leading-tight">{c.card.name}</span>
                    </div>
                  )}
                </div>

                {/* Card name + radio toggle */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-font-primary truncate mb-1.5">{c.card.name}</p>
                  {/* Segmented control */}
                  <div className="flex rounded-lg bg-bg-dark p-0.5">
                    {options.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setDestination(c.instanceId, opt.value)}
                        className={`flex-1 rounded-md px-3 py-1.5 text-[10px] font-bold transition-all duration-150 ${
                          decision === opt.value
                            ? opt.activeColor + ' shadow-sm'
                            : 'text-font-muted hover:text-font-secondary'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Top order reorder section */}
        {topCards.length > 1 && (
          <div className="mb-4 rounded-xl border border-blue-500/30 bg-blue-950/30 p-3">
            <p className="text-[10px] font-bold text-blue-400 mb-2 uppercase tracking-wider">
              Top of library order
            </p>
            <p className="text-[9px] text-blue-400/60 mb-2">First card = top of library (drawn first)</p>
            <div className="space-y-1">
              {topCards.map((c, i) => (
                <div key={c.instanceId} className="flex items-center gap-2 rounded-lg bg-blue-500/10 px-2 py-1.5">
                  <span className="w-5 text-center text-[11px] font-bold text-blue-400">{i + 1}</span>
                  <span className="flex-1 truncate text-xs text-font-primary">{c.card.name}</span>
                  <button
                    onClick={() => moveTopCard(c.instanceId, 'up')}
                    disabled={i === 0}
                    className="rounded p-1 text-blue-400 transition-colors hover:bg-blue-500/20 disabled:opacity-20 disabled:hover:bg-transparent"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    onClick={() => moveTopCard(c.instanceId, 'down')}
                    disabled={i === topCards.length - 1}
                    className="rounded p-1 text-blue-400 transition-colors hover:bg-blue-500/20 disabled:opacity-20 disabled:hover:bg-transparent"
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            className="flex-1 rounded-xl bg-bg-cell py-2.5 text-sm font-bold text-font-secondary transition-colors hover:bg-bg-dark"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!allDecided}
            className="flex-1 rounded-xl bg-bg-accent py-2.5 text-sm font-bold text-font-white transition-opacity disabled:opacity-40"
          >
            Confirm {decidedCount}/{cards.length}
          </button>
        </div>
      </div>
    </div>
  )
}
