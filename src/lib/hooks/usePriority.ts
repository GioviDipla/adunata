import type { GameState } from '@/lib/game/types'

export interface PriorityInfo {
  hasPriority: boolean
  isMyTurn: boolean
  activePlayerId: string | null
  priorityPlayerId: string | null
}

export function usePriority(state: GameState | null, userId: string): PriorityInfo {
  if (!state) {
    return { hasPriority: false, isMyTurn: false, activePlayerId: null, priorityPlayerId: null }
  }
  return {
    hasPriority: state.priorityPlayerId === userId,
    isMyTurn: state.activePlayerId === userId,
    activePlayerId: state.activePlayerId,
    priorityPlayerId: state.priorityPlayerId,
  }
}
