import type { GameState, GameAction, BattlefieldCardState } from './types'
import { getNextPhase, getOpponentId } from './phases'

export function applyAction(state: GameState, action: GameAction): GameState {
  const s = structuredClone(state)
  s.lastActionSeq++

  switch (action.type) {
    case 'pass_priority':
      return handlePassPriority(s, action)
    case 'play_card':
      return handlePlayCard(s, action)
    case 'tap':
      return handleTap(s, action)
    case 'untap':
      return handleUntap(s, action)
    case 'confirm_untap':
      return handleConfirmUntap(s, action)
    case 'move_zone':
      return handleMoveZone(s, action)
    case 'life_change':
      return handleLifeChange(s, action)
    case 'declare_attackers':
      return handleDeclareAttackers(s, action)
    case 'declare_blockers':
      return handleDeclareBlockers(s, action)
    case 'combat_damage':
      return handleCombatDamage(s, action)
    case 'draw':
      return handleDraw(s, action)
    case 'discard':
      return handleDiscard(s, action)
    case 'phase_change':
      return handlePhaseChange(s, action)
    case 'concede':
      return s // handled at API level
    default:
      return s
  }
}

function handlePassPriority(s: GameState, action: GameAction): GameState {
  const opponentId = getOpponentId(s, action.playerId)

  // If the person passing is NOT the one with priority, ignore
  if (s.priorityPlayerId !== action.playerId) return s

  if (s.priorityPlayerId === s.activePlayerId) {
    // AP passes → give priority to NAP
    s.priorityPlayerId = opponentId
    s.apPassedFirst = true
    return s
  }

  // NAP is passing
  if (s.apPassedFirst) {
    // Both passed in sequence (AP then NAP) → advance phase
    s.apPassedFirst = false
    return advancePhase(s)
  }

  // NAP passes after responding to an action → return priority to AP
  // (AP played a card, NAP got priority, NAP says OK → back to AP)
  s.priorityPlayerId = s.activePlayerId
  return s
}

function advancePhase(s: GameState): GameState {
  const currentPhase = s.phase
  const nextPhaseKey = getNextPhase(currentPhase)

  // Handle combat sub-phase advancement
  if (currentPhase === 'declare_attackers' && s.combat.phase === 'declare_attackers') {
    s.phase = 'declare_blockers'
    s.combat.phase = 'declare_blockers'
    s.priorityPlayerId = getOpponentId(s, s.activePlayerId) // NAP declares blockers
    return s
  }
  if (currentPhase === 'declare_blockers' && s.combat.phase === 'declare_blockers') {
    s.phase = 'combat_damage'
    s.combat.phase = 'damage'
    s.priorityPlayerId = s.activePlayerId
    return s
  }

  if (!nextPhaseKey) {
    // End of turn — swap active player
    const opponentId = getOpponentId(s, s.activePlayerId)
    s.turn++
    s.phase = 'untap'
    s.activePlayerId = opponentId
    s.priorityPlayerId = opponentId
    s.combat = { phase: null, attackers: [], blockers: [], damageAssigned: false }

    // Highlight tapped permanents blue for untap step
    const ap = s.players[opponentId]
    ap.battlefield = ap.battlefield.map((c) => ({
      ...c,
      highlighted: c.tapped ? 'blue' as const : null,
    }))
    return s
  }

  s.phase = nextPhaseKey

  // Phase-specific setup
  if (nextPhaseKey === 'draw') {
    // Auto-draw (skip turn 1 for first player)
    const skipDraw = s.turn === 1 && s.activePlayerId === s.firstPlayerId
    if (!skipDraw) {
      const ap = s.players[s.activePlayerId]
      if (ap.library.length > 0) {
        const drawnId = ap.library.shift()!
        ap.hand.push(drawnId)
        ap.libraryCount = ap.library.length
        ap.handCount = ap.hand.length
      }
    }
  }

  if (nextPhaseKey === 'begin_combat') {
    s.combat = { phase: null, attackers: [], blockers: [], damageAssigned: false }
  }

  if (nextPhaseKey === 'declare_attackers') {
    s.combat.phase = 'declare_attackers'
  }

  if (nextPhaseKey === 'end_combat') {
    // Move lethal-damage creatures to graveyard
    for (const pid of Object.keys(s.players)) {
      const player = s.players[pid]
      const dead: BattlefieldCardState[] = []
      const alive: BattlefieldCardState[] = []
      for (const c of player.battlefield) {
        if (c.highlighted === 'red') dead.push(c)
        else alive.push(c)
      }
      player.battlefield = alive.map((c) => ({
        ...c,
        attacking: false,
        blocking: null,
        damageMarked: 0,
        highlighted: null,
      }))
      for (const c of dead) {
        player.graveyard.push({ instanceId: c.instanceId, cardId: c.cardId })
      }
    }
    s.combat = { phase: null, attackers: [], blockers: [], damageAssigned: false }
  }

  if (nextPhaseKey === 'cleanup') {
    // Cleanup is auto — just set priority to AP for discard
    s.priorityPlayerId = s.activePlayerId
    return s
  }

  // Default: AP gets priority
  s.priorityPlayerId = s.activePlayerId
  return s
}

function handlePlayCard(s: GameState, action: GameAction): GameState {
  const { instanceId, from, to } = action.data as { instanceId: string; from: string; to: string }
  const player = s.players[action.playerId]

  if (from === 'hand' && to === 'battlefield') {
    player.hand = player.hand.filter((id) => id !== instanceId)
    player.handCount = player.hand.length
    const cardId = (action.data as { cardId: number }).cardId
    player.battlefield.push({
      instanceId, cardId, tapped: false, attacking: false, blocking: null, damageMarked: 0, highlighted: null,
    })
  } else if (from === 'hand' && to === 'graveyard') {
    player.hand = player.hand.filter((id) => id !== instanceId)
    player.handCount = player.hand.length
    const cardId = (action.data as { cardId: number }).cardId
    player.graveyard.push({ instanceId, cardId })
  } else if (from === 'commandZone' && to === 'battlefield') {
    player.commandZone = player.commandZone.filter((c) => c.instanceId !== instanceId)
    const cardId = (action.data as { cardId: number }).cardId
    player.battlefield.push({
      instanceId, cardId, tapped: false, attacking: false, blocking: null, damageMarked: 0, highlighted: null,
    })
  }

  // After playing a card, opponent gets priority (reset pass chain)
  s.priorityPlayerId = getOpponentId(s, action.playerId)
  s.apPassedFirst = false
  return s
}

function handleTap(s: GameState, action: GameAction): GameState {
  const { instanceId } = action.data as { instanceId: string }
  const player = s.players[action.playerId]
  const card = player.battlefield.find((c) => c.instanceId === instanceId)
  if (card) card.tapped = true
  return s
}

function handleUntap(s: GameState, action: GameAction): GameState {
  const { instanceId } = action.data as { instanceId: string }
  const player = s.players[action.playerId]
  const card = player.battlefield.find((c) => c.instanceId === instanceId)
  if (card) { card.tapped = false; card.highlighted = null }
  return s
}

function handleConfirmUntap(s: GameState, _action: GameAction): GameState {
  // Clear all blue highlights, advance from untap
  const ap = s.players[s.activePlayerId]
  ap.battlefield = ap.battlefield.map((c) => ({ ...c, highlighted: null }))
  return advancePhase(s)
}

function handleMoveZone(s: GameState, action: GameAction): GameState {
  const { instanceId, from, to, cardId } = action.data as {
    instanceId: string; from: string; to: string; cardId: number
  }
  const player = s.players[action.playerId]

  // Remove from source
  if (from === 'battlefield') {
    player.battlefield = player.battlefield.filter((c) => c.instanceId !== instanceId)
  } else if (from === 'hand') {
    player.hand = player.hand.filter((id) => id !== instanceId)
    player.handCount = player.hand.length
  } else if (from === 'graveyard') {
    player.graveyard = player.graveyard.filter((c) => c.instanceId !== instanceId)
  } else if (from === 'exile') {
    player.exile = player.exile.filter((c) => c.instanceId !== instanceId)
  } else if (from === 'library') {
    player.library = player.library.filter((id) => id !== instanceId)
    player.libraryCount = player.library.length
  }

  // Add to target
  if (to === 'battlefield') {
    player.battlefield.push({ instanceId, cardId, tapped: false, attacking: false, blocking: null, damageMarked: 0, highlighted: null })
  } else if (to === 'hand') {
    player.hand.push(instanceId)
    player.handCount = player.hand.length
  } else if (to === 'graveyard') {
    player.graveyard.push({ instanceId, cardId })
  } else if (to === 'exile') {
    player.exile.push({ instanceId, cardId })
  } else if (to === 'commandZone') {
    player.commandZone.push({ instanceId, cardId })
  }

  return s
}

function handleLifeChange(s: GameState, action: GameAction): GameState {
  const { targetPlayerId, amount } = action.data as { targetPlayerId: string; amount: number }
  s.players[targetPlayerId].life += amount
  return s
}

function handleDeclareAttackers(s: GameState, action: GameAction): GameState {
  const { attackerIds } = action.data as { attackerIds: string[] }
  const player = s.players[action.playerId]
  const opponentId = getOpponentId(s, action.playerId)

  s.combat.attackers = attackerIds.map((id) => ({ instanceId: id, targetPlayerId: opponentId }))

  // Mark attackers on battlefield + auto-tap
  for (const card of player.battlefield) {
    if (attackerIds.includes(card.instanceId)) {
      card.attacking = true
      card.tapped = true
    }
  }

  // Auto-advance: if no attackers were declared, skip combat entirely to main2.
  // The CombatAttackers overlay is shown while phase === 'declare_attackers',
  // so we MUST advance the phase here or the overlay stays stuck on screen.
  if (attackerIds.length === 0) {
    s.combat = { phase: null, attackers: [], blockers: [], damageAssigned: false }
    s.phase = 'main2'
    s.priorityPlayerId = s.activePlayerId
    s.apPassedFirst = false
    return s
  }

  // Attackers declared → advance to declare_blockers, NAP gets priority
  s.phase = 'declare_blockers'
  s.combat.phase = 'declare_blockers'
  s.priorityPlayerId = opponentId
  s.apPassedFirst = false
  return s
}

function handleDeclareBlockers(s: GameState, action: GameAction): GameState {
  const { blockerAssignments } = action.data as { blockerAssignments: { blockerId: string; attackerId: string }[] }
  const player = s.players[action.playerId]

  s.combat.blockers = blockerAssignments.map((b) => ({
    instanceId: b.blockerId,
    blockingInstanceId: b.attackerId,
  }))

  for (const card of player.battlefield) {
    const assignment = blockerAssignments.find((b) => b.blockerId === card.instanceId)
    if (assignment) {
      card.blocking = assignment.attackerId
    }
  }

  // Auto-advance to combat_damage; AP's client will auto-calculate damage
  // via the useEffect in PlayGame as soon as it sees phase === 'combat_damage'.
  s.phase = 'combat_damage'
  s.combat.phase = 'damage'
  s.priorityPlayerId = s.activePlayerId
  s.apPassedFirst = false
  return s
}

function handleCombatDamage(s: GameState, _action: GameAction): GameState {
  const napId = getOpponentId(s, s.activePlayerId)
  const nap = s.players[napId]

  // Combat damage is calculated client-side and sent via action.data
  // because the engine doesn't have the card stats.
  const { damageToPlayer, creaturesDamaged } = _action.data as {
    damageToPlayer: number
    creaturesDamaged: { instanceId: string; playerId: string; damage: number; lethal: boolean }[]
  }

  if (damageToPlayer) {
    nap.life -= damageToPlayer
  }

  for (const cd of creaturesDamaged ?? []) {
    const player = s.players[cd.playerId]
    const card = player.battlefield.find((c) => c.instanceId === cd.instanceId)
    if (card) {
      card.damageMarked += cd.damage
      if (cd.lethal) card.highlighted = 'red'
    }
  }

  // Auto-advance: move dead creatures to graveyard, clear combat state,
  // and jump to main2. Otherwise AP would be stuck in combat_damage with
  // priority but no way to move forward.
  for (const pid of Object.keys(s.players)) {
    const player = s.players[pid]
    const dead: BattlefieldCardState[] = []
    const alive: BattlefieldCardState[] = []
    for (const c of player.battlefield) {
      if (c.highlighted === 'red') dead.push(c)
      else alive.push(c)
    }
    player.battlefield = alive.map((c) => ({
      ...c,
      attacking: false,
      blocking: null,
      damageMarked: 0,
      highlighted: null,
    }))
    for (const c of dead) {
      player.graveyard.push({ instanceId: c.instanceId, cardId: c.cardId })
    }
  }

  s.combat = { phase: null, attackers: [], blockers: [], damageAssigned: true }
  s.phase = 'main2'
  s.priorityPlayerId = s.activePlayerId
  s.apPassedFirst = false
  return s
}

function handleDraw(s: GameState, action: GameAction): GameState {
  const player = s.players[action.playerId]
  if (player.library.length > 0) {
    const drawnId = player.library.shift()!
    player.hand.push(drawnId)
    player.libraryCount = player.library.length
    player.handCount = player.hand.length
  }
  return s
}

function handleDiscard(s: GameState, action: GameAction): GameState {
  const { instanceId, cardId } = action.data as { instanceId: string; cardId: number }
  const player = s.players[action.playerId]
  player.hand = player.hand.filter((id) => id !== instanceId)
  player.handCount = player.hand.length
  player.graveyard.push({ instanceId, cardId })
  return s
}

function handlePhaseChange(s: GameState, _action: GameAction): GameState {
  return advancePhase(s)
}
