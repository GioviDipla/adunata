import type { GameAction } from './types'

export function createPassPriority(playerId: string, playerName: string): GameAction {
  return { type: 'pass_priority', playerId, data: {}, text: `${playerName}: OK` }
}

export function createPlayCard(playerId: string, playerName: string, instanceId: string, cardId: number, cardName: string, from: string, to: string): GameAction {
  return {
    type: 'play_card', playerId,
    data: { instanceId, cardId, from, to, cardName },
    text: `${playerName} plays ${cardName}`,
  }
}

export function createTap(playerId: string, playerName: string, instanceId: string, cardName: string): GameAction {
  return { type: 'tap', playerId, data: { instanceId }, text: `${playerName} taps ${cardName}` }
}

export function createUntap(playerId: string, playerName: string, instanceId: string, cardName: string): GameAction {
  return { type: 'untap', playerId, data: { instanceId }, text: `${playerName} untaps ${cardName}` }
}

export function createConfirmUntap(playerId: string, playerName: string): GameAction {
  return { type: 'confirm_untap', playerId, data: {}, text: `${playerName} finishes untap step` }
}

export function createDeclareAttackers(playerId: string, playerName: string, attackerIds: string[], attackerNames: string[]): GameAction {
  const names = attackerNames.length > 0 ? attackerNames.join(', ') : 'no creatures'
  return {
    type: 'declare_attackers', playerId,
    data: { attackerIds },
    text: `${playerName} declares attackers: ${names}`,
  }
}

export function createDeclareBlockers(playerId: string, playerName: string, blockerAssignments: { blockerId: string; attackerId: string; blockerName: string; attackerName: string }[]): GameAction {
  const desc = blockerAssignments.length > 0
    ? blockerAssignments.map((b) => `${b.blockerName} blocks ${b.attackerName}`).join(', ')
    : 'no blockers'
  return {
    type: 'declare_blockers', playerId,
    data: { blockerAssignments: blockerAssignments.map((b) => ({ blockerId: b.blockerId, attackerId: b.attackerId })) },
    text: `${playerName} declares blockers: ${desc}`,
  }
}

export function createCombatDamage(playerId: string, damageToPlayer: number, creaturesDamaged: { instanceId: string; playerId: string; damage: number; lethal: boolean }[], description: string): GameAction {
  return {
    type: 'combat_damage', playerId,
    data: { damageToPlayer, creaturesDamaged },
    text: description,
  }
}

export function createMoveZone(playerId: string, playerName: string, instanceId: string, cardId: number, cardName: string, from: string, to: string): GameAction {
  return {
    type: 'move_zone', playerId,
    data: { instanceId, cardId, from, to },
    text: `${playerName} moves ${cardName} from ${from} to ${to}`,
  }
}

export function createLifeChange(playerId: string, playerName: string, targetPlayerId: string, targetName: string, amount: number): GameAction {
  const dir = amount > 0 ? 'gains' : 'loses'
  return {
    type: 'life_change', playerId,
    data: { targetPlayerId, amount },
    text: `${targetName} ${dir} ${Math.abs(amount)} life`,
  }
}

export function createDiscard(playerId: string, playerName: string, instanceId: string, cardId: number, cardName: string): GameAction {
  return {
    type: 'discard', playerId,
    data: { instanceId, cardId },
    text: `${playerName} discards ${cardName}`,
  }
}

export function createDraw(playerId: string, playerName: string): GameAction {
  return { type: 'draw', playerId, data: {}, text: `${playerName} draws a card` }
}

export function createConcede(playerId: string, playerName: string): GameAction {
  return { type: 'concede', playerId, data: {}, text: `${playerName} concedes` }
}
