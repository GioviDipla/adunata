import type { GamePhase } from './types'

export interface PhaseDefinition {
  key: GamePhase
  label: string
  hasPriority: boolean       // whether players get priority in this phase
  isActivePlayerOnly: boolean // only AP can act (e.g. declare attackers)
}

export const GAME_PHASES: PhaseDefinition[] = [
  { key: 'untap',             label: 'Untap',             hasPriority: false, isActivePlayerOnly: true },
  { key: 'upkeep',            label: 'Upkeep',            hasPriority: true,  isActivePlayerOnly: false },
  { key: 'draw',              label: 'Draw',              hasPriority: true,  isActivePlayerOnly: false },
  { key: 'main1',             label: 'Main 1',            hasPriority: true,  isActivePlayerOnly: false },
  { key: 'begin_combat',      label: 'Begin Combat',      hasPriority: true,  isActivePlayerOnly: false },
  { key: 'declare_attackers', label: 'Declare Attackers', hasPriority: true,  isActivePlayerOnly: true },
  { key: 'declare_blockers',  label: 'Declare Blockers',  hasPriority: true,  isActivePlayerOnly: true },
  { key: 'combat_damage',     label: 'Combat Damage',     hasPriority: true,  isActivePlayerOnly: false },
  { key: 'end_combat',        label: 'End Combat',        hasPriority: true,  isActivePlayerOnly: false },
  { key: 'main2',             label: 'Main 2',            hasPriority: true,  isActivePlayerOnly: false },
  { key: 'end_step',          label: 'End Step',          hasPriority: true,  isActivePlayerOnly: false },
  { key: 'cleanup',           label: 'Cleanup',           hasPriority: false, isActivePlayerOnly: true },
]

export function getNextPhase(current: GamePhase): GamePhase | null {
  const idx = GAME_PHASES.findIndex((p) => p.key === current)
  if (idx === -1 || idx >= GAME_PHASES.length - 1) return null
  return GAME_PHASES[idx + 1].key
}

export function getPhase(key: GamePhase): PhaseDefinition {
  return GAME_PHASES.find((p) => p.key === key)!
}

export function getOpponentId(state: { players: Record<string, unknown> }, playerId: string): string {
  return Object.keys(state.players).find((id) => id !== playerId)!
}
