import { applyAction } from './engine'
import type { GameState, GameAction } from './types'

export type BotType = 'ghost' | 'bot'

export interface BotConfig {
  type: BotType
  name: string
  life: number
}

export const GHOST_BOT: BotConfig = {
  type: 'ghost',
  name: 'Goldfish',
  life: 20,
}

/**
 * Apply a player action then auto-respond for the bot until
 * priority returns to a human player or no more bot actions needed.
 */
export function applyWithBotLoop(
  state: GameState,
  action: GameAction,
  botId: string,
  config: BotConfig,
): GameState {
  let s = applyAction(state, action)

  let iterations = 0
  while (iterations < 100) {
    // Bot mulligan: auto-keep immediately
    if (s.mulliganStage) {
      const botDecision = s.mulliganStage.playerDecisions[botId]
      if (botDecision && !botDecision.decided) {
        s = applyAction(s, {
          type: 'keep_hand',
          playerId: botId,
          data: {},
          text: '',
        })
        iterations++
        continue
      }
    }

    // Bot priority: auto-pass
    if (s.priorityPlayerId === botId) {
      if (config.type === 'ghost') {
        s = applyAction(s, {
          type: 'pass_priority',
          playerId: botId,
          data: {},
          text: '',
        })
        iterations++
        continue
      }
      // Future bot types: decision logic goes here
    }

    break
  }

  return s
}
