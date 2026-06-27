import type { GameState, GameAction, PlayerState, CardMap } from './types'

/**
 * GoblinAI Smart Bot — hybrid opponent.
 *
 * Heuristics (fast, no API call):
 *  1. Mulligan: auto-keep
 *  2. Untap: auto-confirm
 *  3. Land drop: play a land from hand
 *  4. Combat damage: auto-resolve
 *  5. Fallback: pass priority
 *
 * AI decisions (calls DeepSeek API):
 *  A. Which creature to cast (main phase)
 *  B. Which creatures to attack with
 *  C. How to block incoming attackers
 */

// Actions that should use AI when available
const AI_ACTIONS = new Set(['play_card', 'declare_attackers', 'declare_blockers'])

/**
 * Returns true if the current game state requires an AI decision
 * (complex choice: which creature to cast, attack, or block).
 * Returns false for simple heuristic actions (land, untap, mulligan, pass).
 */
export function needsAIDecision(state: GameState, botId: string, cardMap: CardMap): boolean {
  const botState = state.players[botId]
  if (!botState) return false
  if (state.priorityPlayerId !== botId) return false
  if (state.mulliganStage) return false // heuristic handles mulligan

  const phase = state.phase
  const isBotTurn = state.activePlayerId === botId

  // Main phase: AI decides which creature to cast
  if (isBotTurn && (phase === 'main1' || phase === 'main2')) {
    // Only ask AI if there are creatures in hand (lands handled by heuristic)
    const hasCreatures = botState.hand.some((iid) => {
      const card = cardMap[iid]
      return card && card.typeLine?.toLowerCase().includes('creature')
    })
    return hasCreatures
  }

  // Declare attackers: AI decides which creatures attack
  if (isBotTurn && phase === 'declare_attackers') {
    const eligible = botState.battlefield.filter((c) => !c.tapped && !c.attacking)
    return eligible.length > 0
  }

  // Declare blockers: AI decides blocking assignments
  if (!isBotTurn && phase === 'declare_blockers') {
    const available = botState.battlefield.filter((c) => !c.tapped)
    return available.length > 0 && state.combat.attackers.length > 0
  }

  return false
}

/**
 * Heuristic-only decisions (fast, no API call).
 * Returns null if AI should decide instead.
 */
export function botDecideActionHeuristic(
  state: GameState,
  botId: string,
  cardMap: CardMap,
): GameAction | null {
  const botState = state.players[botId]
  if (!botState) return null

  const isBotPriority = state.priorityPlayerId === botId
  const isBotTurn = state.activePlayerId === botId
  const phase = state.phase

  if (!isBotPriority) return null

  // Mulligan: auto-keep
  if (state.mulliganStage) {
    const decision = state.mulliganStage.playerDecisions[botId]
    if (decision && !decision.decided) {
      return { type: 'keep_hand', playerId: botId, data: {}, text: '' }
    }
    return { type: 'pass_priority', playerId: botId, data: {}, text: '' }
  }

  // Untap: auto-confirm
  if (isBotTurn && phase === 'untap') {
    return { type: 'confirm_untap', playerId: botId, data: {}, text: '' }
  }

  // Combat damage: auto-resolve
  if (phase === 'combat_damage' && !state.combat.damageAssigned) {
    return { type: 'resolve_combat_damage', playerId: botId, data: {}, text: '' }
  }

  // Main phase: play a land (heuristic handles land, AI handles creatures)
  if (isBotTurn && (phase === 'main1' || phase === 'main2')) {
    for (const iid of botState.hand) {
      const card = cardMap[iid]
      if (card && card.typeLine?.toLowerCase().includes('land')) {
        return {
          type: 'play_card',
          playerId: botId,
          data: { instanceId: iid, cardId: card.cardId, from: 'hand', to: 'battlefield', isCommander: false, isToken: false },
          text: `Bot plays ${card.name}.`,
        }
      }
    }
    // If no land, check if AI is needed for creatures
    const hasCreatures = botState.hand.some((iid) => {
      const card = cardMap[iid]
      return card && card.typeLine?.toLowerCase().includes('creature')
    })
    if (hasCreatures) return null // Let AI decide
  }

  // Declare attackers/blockers: let AI decide (return null)
  if (isBotTurn && phase === 'declare_attackers') return null
  if (!isBotTurn && phase === 'declare_blockers') return null

  // Default: pass priority
  return { type: 'pass_priority', playerId: botId, data: {}, text: '' }
}

/**
 * Kept for backward compat — same as botDecideActionHeuristic.
 * The async AI path is handled by applyWithBotLoop calling the API route.
 */
export function botDecideAction(
  state: GameState,
  botId: string,
  cardMap: CardMap,
): GameAction | null {
  return botDecideActionHeuristic(state, botId, cardMap)
}
