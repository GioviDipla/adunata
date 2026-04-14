export interface BattlefieldCardState {
  instanceId: string
  cardId: number
  tapped: boolean
  attacking: boolean
  blocking: string | null  // instanceId of the attacker being blocked
  damageMarked: number
  highlighted: 'blue' | 'red' | null  // blue=untap step, red=lethal damage
}

export interface PlayerState {
  life: number
  library: string[]        // instanceIds — hidden from opponent
  libraryCount: number
  hand: string[]           // instanceIds — hidden from opponent
  handCount: number
  battlefield: BattlefieldCardState[]
  graveyard: { instanceId: string; cardId: number }[]
  exile: { instanceId: string; cardId: number }[]
  commandZone: { instanceId: string; cardId: number }[]
}

export type GamePhase =
  | 'untap' | 'upkeep' | 'draw'
  | 'main1'
  | 'begin_combat' | 'declare_attackers' | 'declare_blockers' | 'combat_damage' | 'end_combat'
  | 'main2'
  | 'end_step' | 'cleanup'

export interface CombatState {
  phase: 'declare_attackers' | 'declare_blockers' | 'damage' | null
  attackers: { instanceId: string; targetPlayerId: string }[]
  blockers: { instanceId: string; blockingInstanceId: string }[]
  damageAssigned: boolean
}

export interface GameState {
  turn: number
  phase: GamePhase
  activePlayerId: string
  priorityPlayerId: string
  firstPlayerId: string
  combat: CombatState
  players: Record<string, PlayerState>
  lastActionSeq: number
  apPassedFirst?: boolean
  /** Mulligan stage: present during pre-game, absent once both players have kept */
  mulliganStage?: {
    playerDecisions: Record<string, {
      mulliganCount: number
      decided: boolean
      needsBottomCards: number
      bottomCardsDone: boolean
    }>
  }
}

export type GameActionType =
  | 'play_card'
  | 'pass_priority'
  | 'declare_attackers'
  | 'declare_blockers'
  | 'combat_damage'
  | 'draw'
  | 'discard'
  | 'tap'
  | 'untap'
  | 'move_zone'
  | 'life_change'
  | 'game_start'
  | 'phase_change'
  | 'confirm_untap'
  | 'concede'
  | 'mulligan'
  | 'keep_hand'
  | 'bottom_cards'

export interface GameAction {
  type: GameActionType
  playerId: string
  data: Record<string, unknown>
  text: string
}

export interface LogEntry {
  id: string
  seq: number
  playerId: string | null
  action: string
  data: Record<string, unknown> | null
  text: string
  createdAt: string
}

// Card map: instanceId → card data (built at game start, kept client-side)
export type CardMap = Record<string, { cardId: number; name: string; imageSmall: string | null; imageNormal: string | null; typeLine: string; manaCost: string | null; power: string | null; toughness: string | null; oracleText: string | null; isCommander: boolean }>
