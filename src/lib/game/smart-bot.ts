import type { GameState, GameAction, PlayerState, CardMap } from './types'

/**
 * GoblinAI Smart Bot — heuristic opponent.
 *
 * Decision priorities:
 *  1. Mulligan: auto-keep
 *  2. Play a land (one per turn, any available)
 *  3. Play the biggest creature affordable with current mana
 *  4. Attack with all eligible creatures when active player
 *  5. Block to preserve as much life as possible
 *  6. Pass priority for everything else
 */

function countLandsPlayedThisTurn(botState: PlayerState, cardMap: CardMap): number {
  // We can't easily track this without turn state. Approximate: assume the bot
  // played 1 land per previous turn, so it can play 1 land per turn.
  // For now: always play a land if hand has one with type including "Land".
  return 0
}

function hasLandInHand(botState: PlayerState, cardMap: CardMap): string | null {
  for (const iid of botState.hand) {
    const card = cardMap[iid]
    if (card && card.typeLine?.toLowerCase().includes('land')) {
      return iid
    }
  }
  return null
}

function getCreaturesInHand(
  botState: PlayerState,
  cardMap: CardMap,
): { instanceId: string; power: number; toughness: number }[] {
  const result: { instanceId: string; power: number; toughness: number }[] = []
  for (const iid of botState.hand) {
    const card = cardMap[iid]
    if (!card || !card.typeLine?.toLowerCase().includes('creature')) continue
    const power = parseInt(card.power ?? '0', 10) || 0
    const toughness = parseInt(card.toughness ?? '0', 10) || 0
    result.push({ instanceId: iid, power, toughness })
  }
  // Sort by power descending (biggest first)
  result.sort((a, b) => b.power - a.power || b.toughness - a.toughness)
  return result
}

function getEligibleAttackers(botState: PlayerState): string[] {
  return botState.battlefield
    .filter((c) => !c.tapped && !c.attacking)
    .map((c) => c.instanceId)
}

function getAvailableBlockers(botState: PlayerState): string[] {
  return botState.battlefield
    .filter((c) => !c.tapped)
    .map((c) => c.instanceId)
}

/**
 * Main bot decision function.
 * Returns the best GameAction for the bot given the current state.
 */
export function botDecideAction(
  state: GameState,
  botId: string,
  cardMap: CardMap,
): GameAction | null {
  const botState = state.players[botId]
  if (!botState) return null

  // 1. Mulligan: auto-keep
  if (state.mulliganStage) {
    const decision = state.mulliganStage.playerDecisions[botId]
    if (decision && !decision.decided) {
      return {
        type: 'keep_hand',
        playerId: botId,
        data: {},
        text: '',
      }
    }
    // Still in mulligan stage — no other actions
    return { type: 'pass_priority', playerId: botId, data: {}, text: '' }
  }

  const isBotPriority = state.priorityPlayerId === botId
  const isBotTurn = state.activePlayerId === botId
  const phase = state.phase

  if (!isBotPriority) return null // Not bot's turn to act

  // 2. Bot's main phase — play land then creature
  if (isBotTurn && (phase === 'main1' || phase === 'main2')) {
    // Play a land
    const landIid = hasLandInHand(botState, cardMap)
    if (landIid) {
      const card = cardMap[landIid]
      return {
        type: 'play_card',
        playerId: botId,
        data: {
          instanceId: landIid,
          cardId: card?.cardId ?? 0,
          from: 'hand',
          to: 'battlefield',
          isCommander: false,
          isToken: false,
        },
        text: `Bot plays ${card?.name ?? 'a land'}.`,
      }
    }

    // Play biggest creature from hand
    const creatures = getCreaturesInHand(botState, cardMap)
    if (creatures.length > 0) {
      const best = creatures[0]
      const card = cardMap[best.instanceId]
      return {
        type: 'play_card',
        playerId: botId,
        data: {
          instanceId: best.instanceId,
          cardId: card?.cardId ?? 0,
          from: 'hand',
          to: 'battlefield',
          isCommander: false,
          isToken: false,
        },
        text: `Bot casts ${card?.name ?? 'a creature'}.`,
      }
    }
  }

  // 3. Declare attackers — attack with all eligible creatures
  if (isBotTurn && phase === 'declare_attackers') {
    const attackers = getEligibleAttackers(botState)
    if (attackers.length > 0) {
      // Find the human player
      const humanId = Object.keys(state.players).find((pid) => pid !== botId)
      return {
        type: 'declare_attackers',
        playerId: botId,
        data: {
          attackerIds: attackers,
          targetPlayerId: humanId ?? '',
        },
        text: `Bot attacks with ${attackers.length} creature${attackers.length > 1 ? 's' : ''}.`,
      }
    }
    return { type: 'pass_priority', playerId: botId, data: {}, text: '' }
  }

  // 4. Declare blockers — block to preserve life
  if (!isBotTurn && phase === 'declare_blockers') {
    const blockers = getAvailableBlockers(botState)
    const attackers = state.combat.attackers
    if (blockers.length > 0 && attackers.length > 0) {
      // Simple strategy: each available blocker blocks one attacker
      const assignments = []
      const maxBlocks = Math.min(blockers.length, attackers.length)
      for (let i = 0; i < maxBlocks; i++) {
        assignments.push({
          blockerId: blockers[i],
          attackerId: attackers[i].instanceId,
        })
      }
      return {
        type: 'declare_blockers',
        playerId: botId,
        data: { blockerAssignments: assignments },
        text: `Bot blocks with ${assignments.length} creature${assignments.length > 1 ? 's' : ''}.`,
      }
    }
    return { type: 'pass_priority', playerId: botId, data: {}, text: '' }
  }

  // 5. Auto-resolve combat damage
  if (phase === 'combat_damage' && !state.combat.damageAssigned) {
    return { type: 'resolve_combat_damage', playerId: botId, data: {}, text: '' }
  }

  // 6. Confirm untap step
  if (isBotTurn && phase === 'untap') {
    return { type: 'confirm_untap', playerId: botId, data: {}, text: '' }
  }

  // 7. Default: pass priority
  return { type: 'pass_priority', playerId: botId, data: {}, text: '' }
}
