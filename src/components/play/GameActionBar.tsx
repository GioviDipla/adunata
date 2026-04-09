'use client'

import { Heart, Minus, Plus, Layers, Archive, Ban, BookOpen, SkipForward, Flag } from 'lucide-react'
import PriorityIndicator from './PriorityIndicator'
import { GAME_PHASES } from '@/lib/game/phases'
import type { GamePhase } from '@/lib/game/types'

interface GameActionBarProps {
  phase: GamePhase
  turn: number
  life: number
  libraryCount: number
  graveyardCount: number
  exileCount: number
  hasPriority: boolean
  isActivePlayer: boolean
  onPassPriority: () => void
  onLifeChange: (amount: number) => void
  onDraw: () => void
  onViewZone: (zone: 'graveyard' | 'exile' | 'library') => void
  onConcede: () => void
  onConfirmUntap?: () => void
}

export default function GameActionBar({
  phase, turn, life, libraryCount, graveyardCount, exileCount,
  hasPriority, isActivePlayer, onPassPriority, onLifeChange, onDraw,
  onViewZone, onConcede, onConfirmUntap,
}: GameActionBarProps) {
  return (
    <div className="border-t border-border bg-bg-surface">
      {/* Phase tracker */}
      <div className="flex items-center gap-0.5 overflow-x-auto px-2 py-1">
        {GAME_PHASES.map((p) => (
          <div key={p.key} className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold tracking-wider ${
            p.key === phase ? 'bg-bg-accent text-font-white' : 'bg-bg-cell text-font-muted'
          }`}>
            {p.label.toUpperCase()}
          </div>
        ))}
      </div>

      {/* Info + priority */}
      <div className="flex items-center justify-between border-t border-border/50 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-font-muted">T{turn}</span>
          <PriorityIndicator hasPriority={hasPriority} />
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={() => onLifeChange(-1)} className="flex h-6 w-6 items-center justify-center rounded bg-bg-cell text-font-secondary active:bg-bg-red">
            <Minus size={10} />
          </button>
          <div className="flex items-center gap-0.5">
            <Heart size={11} className="text-bg-red" />
            <span className="min-w-[20px] text-center text-sm font-bold text-font-primary">{life}</span>
          </div>
          <button onClick={() => onLifeChange(1)} className="flex h-6 w-6 items-center justify-center rounded bg-bg-cell text-font-secondary active:bg-bg-green">
            <Plus size={10} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => onViewZone('graveyard')} className="flex items-center gap-0.5 text-font-secondary">
            <Archive size={10} /><span className="text-[10px]">{graveyardCount}</span>
          </button>
          <button onClick={() => onViewZone('exile')} className="flex items-center gap-0.5 text-font-secondary">
            <Ban size={10} /><span className="text-[10px]">{exileCount}</span>
          </button>
          <button onClick={() => onViewZone('library')} className="flex items-center gap-0.5 text-font-secondary">
            <BookOpen size={10} /><span className="text-[10px]">{libraryCount}</span>
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 border-t border-border/50 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {phase === 'untap' && isActivePlayer ? (
          <button onClick={onConfirmUntap}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-bg-accent py-2.5 text-sm font-bold text-font-white">
            Done Untapping
          </button>
        ) : hasPriority ? (
          <>
            <button onClick={onDraw} disabled={!isActivePlayer}
              className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-bg-cell py-2 text-font-secondary disabled:opacity-30">
              <Layers size={16} /><span className="text-[8px] font-bold">DRAW</span>
            </button>
            <button onClick={onPassPriority}
              className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-bg-green py-2 text-font-white">
              <SkipForward size={16} /><span className="text-[8px] font-bold">OK</span>
            </button>
            <button onClick={onConcede}
              className="flex flex-col items-center gap-0.5 rounded-xl bg-bg-cell px-3 py-2 text-font-muted">
              <Flag size={14} /><span className="text-[8px] font-bold">GG</span>
            </button>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center py-3 text-xs text-font-muted">
            Waiting for opponent...
          </div>
        )}
      </div>
    </div>
  )
}
