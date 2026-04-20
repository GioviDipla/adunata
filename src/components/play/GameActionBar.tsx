'use client'

import { Heart, Minus, Plus, Layers, Archive, Ban, SkipForward, Flag, Sparkles } from 'lucide-react'
import PriorityIndicator from './PriorityIndicator'
import { GAME_PHASES } from '@/lib/game/phases'
import type { GamePhase } from '@/lib/game/types'

interface GameActionBarProps {
  mode?: 'multiplayer' | 'goldfish'
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
  autoPass?: boolean
  onToggleAutoPass?: () => void
  onSpecialActions?: () => void
}

export default function GameActionBar({
  mode = 'multiplayer',
  phase, turn, life, libraryCount, graveyardCount, exileCount,
  hasPriority, isActivePlayer, onPassPriority, onLifeChange, onDraw,
  onViewZone, onConcede, onConfirmUntap, autoPass, onToggleAutoPass, onSpecialActions,
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
          {mode !== 'goldfish' && <PriorityIndicator hasPriority={hasPriority} />}
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

        <div className="flex items-center gap-3">
          <button onClick={() => onViewZone('graveyard')} className="flex items-center gap-1 active:brightness-125" aria-label="Graveyard">
            <Archive size={16} className="text-zinc-400" />
            <span className="text-sm font-semibold tabular-nums text-font-primary">{graveyardCount}</span>
          </button>
          <button onClick={() => onViewZone('exile')} className="flex items-center gap-1 active:brightness-125" aria-label="Exile">
            <Ban size={16} className="text-red-400" />
            <span className="text-sm font-semibold tabular-nums text-font-primary">{exileCount}</span>
          </button>
          <button onClick={() => onViewZone('library')} className="flex items-center gap-1 active:brightness-125" aria-label="Library">
            <Layers size={16} className="text-blue-400" />
            <span className="text-sm font-semibold tabular-nums text-font-primary">{libraryCount}</span>
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
              className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-blue-600 py-2 text-font-white disabled:opacity-30 active:brightness-95">
              <Layers size={16} /><span className="text-[8px] font-bold">DRAW</span>
            </button>
            <button onClick={onPassPriority}
              className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-bg-green py-2 text-font-white">
              <SkipForward size={16} /><span className="text-[8px] font-bold">{mode === 'goldfish' ? 'NEXT' : 'OK'}</span>
            </button>
            {mode !== 'goldfish' && autoPass !== undefined && onToggleAutoPass && (
              <button onClick={onToggleAutoPass}
                className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 ${
                  autoPass ? 'bg-bg-green text-font-white' : 'bg-bg-cell text-font-secondary'
                }`}>
                <SkipForward size={14} />
                <span className="text-[7px] font-bold">{autoPass ? 'AUTO' : 'F6'}</span>
              </button>
            )}
            {onSpecialActions && (
              <button onClick={onSpecialActions}
                className="flex flex-col items-center gap-0.5 rounded-xl bg-yellow-500 px-3 py-2 text-black active:brightness-95">
                <Sparkles size={16} /><span className="text-[7px] font-bold">SPECIAL</span>
              </button>
            )}
            <button onClick={onConcede}
              className="flex flex-col items-center gap-0.5 rounded-xl bg-bg-red px-3 py-2 text-font-white active:brightness-95">
              <Flag size={14} /><span className="text-[8px] font-bold">{mode === 'goldfish' ? 'RESTART' : 'GG'}</span>
            </button>
          </>
        ) : autoPass ? (
          <div className="flex flex-1 items-center justify-center gap-3 py-2">
            <span className="text-xs text-bg-green font-bold">AUTO-PASSING...</span>
            {onToggleAutoPass && (
              <button onClick={onToggleAutoPass}
                className="rounded-lg bg-bg-red/80 px-3 py-1.5 text-[9px] font-bold text-font-white active:bg-bg-red">
                STOP
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center py-3 text-xs text-font-muted">
            Waiting for opponent...
          </div>
        )}
      </div>
    </div>
  )
}
