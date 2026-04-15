'use client'

import { useState } from 'react'
import { X, Eye, Shuffle, BookOpen, Skull, Layers, Sparkles } from 'lucide-react'

interface SpecialActionsMenuProps {
  onPeak: (n: number) => void
  onScry: (n: number) => void
  onSurveil: (n: number) => void
  onMill: (n: number, target: 'self' | 'opponent') => void
  onDrawX: (n: number) => void
  onCreateToken: () => void
  onClose: () => void
}

const ACTIONS = [
  { key: 'peak', label: 'Peak', icon: Eye, color: 'text-font-accent' },
  { key: 'scry', label: 'Scry', icon: Shuffle, color: 'text-blue-400' },
  { key: 'surveil', label: 'Surveil', icon: BookOpen, color: 'text-purple-400' },
  { key: 'mill_self', label: 'Mill Self', icon: Skull, color: 'text-bg-red' },
  { key: 'mill_opp', label: 'Mill Opp', icon: Skull, color: 'text-orange-400' },
  { key: 'draw_x', label: 'Draw X', icon: Layers, color: 'text-bg-green' },
] as const

export default function SpecialActionsMenu({
  onPeak, onScry, onSurveil, onMill, onDrawX, onCreateToken, onClose,
}: SpecialActionsMenuProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [n, setN] = useState(1)

  const handleConfirm = () => {
    if (!selected || n < 1) return
    switch (selected) {
      case 'peak': onPeak(n); break
      case 'scry': onScry(n); break
      case 'surveil': onSurveil(n); break
      case 'mill_self': onMill(n, 'self'); break
      case 'mill_opp': onMill(n, 'opponent'); break
      case 'draw_x': onDrawX(n); break
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg-dark/60" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-xl border border-border bg-bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-font-primary">Special Actions</h3>
          <button onClick={onClose} className="text-font-muted hover:text-font-primary"><X size={16} /></button>
        </div>

        {/* Create Token button */}
        <button onClick={() => { onCreateToken(); onClose() }}
          className="flex w-full items-center gap-2 rounded-lg bg-bg-cell px-3 py-2.5 mb-3 text-sm font-medium text-font-primary hover:bg-bg-hover">
          <Sparkles size={16} className="text-yellow-400" /> Create Token
        </button>

        {/* Action grid */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {ACTIONS.map((a) => {
            const Icon = a.icon
            return (
              <button key={a.key} onClick={() => setSelected(a.key)}
                className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-[10px] font-medium transition-colors ${
                  selected === a.key ? 'bg-bg-accent/20 ring-1 ring-bg-accent' : 'bg-bg-cell hover:bg-bg-hover'
                } ${a.color}`}>
                <Icon size={16} />
                {a.label}
              </button>
            )
          })}
        </div>

        {/* Number selector + Go */}
        {selected && (
          <div className="flex items-center gap-3">
            <label className="text-xs text-font-secondary">N:</label>
            <div className="flex items-center gap-0">
              <button onClick={() => setN(Math.max(1, n - 1))}
                className="flex h-9 w-9 items-center justify-center rounded-l-lg bg-bg-cell text-lg font-bold text-font-primary active:bg-bg-hover">
                −
              </button>
              <div className="flex h-9 w-10 items-center justify-center bg-bg-dark text-sm font-bold text-font-primary">
                {n}
              </div>
              <button onClick={() => setN(Math.min(10, n + 1))}
                className="flex h-9 w-9 items-center justify-center rounded-r-lg bg-bg-cell text-lg font-bold text-font-primary active:bg-bg-hover">
                +
              </button>
            </div>
            <button onClick={handleConfirm}
              className="flex-1 rounded-lg bg-bg-accent py-2.5 text-sm font-bold text-font-white active:bg-bg-accent-dark">
              Go
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
