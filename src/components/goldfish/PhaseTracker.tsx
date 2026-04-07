'use client'

const PHASES = [
  { key: 'untap', label: 'Untap' },
  { key: 'upkeep', label: 'Upkeep' },
  { key: 'draw', label: 'Draw' },
  { key: 'main1', label: 'Main 1' },
  { key: 'combat', label: 'Combat' },
  { key: 'main2', label: 'Main 2' },
  { key: 'end', label: 'End' },
] as const

export type Phase = (typeof PHASES)[number]['key']

interface PhaseTrackerProps {
  currentPhase: Phase
  onPhaseClick: (phase: Phase) => void
}

export default function PhaseTracker({ currentPhase, onPhaseClick }: PhaseTrackerProps) {
  return (
    <div className="flex items-center gap-1">
      {PHASES.map((phase) => {
        const isActive = phase.key === currentPhase
        return (
          <button
            key={phase.key}
            onClick={() => onPhaseClick(phase.key)}
            className={`flex-1 rounded-md px-1 py-1.5 text-center text-[9px] font-bold tracking-wider transition-colors sm:text-[10px] ${
              isActive
                ? 'bg-bg-accent text-font-white'
                : 'bg-bg-cell text-font-muted hover:bg-bg-hover hover:text-font-secondary'
            }`}
          >
            {phase.label.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}

export { PHASES }
