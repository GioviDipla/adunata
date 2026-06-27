import { applyAction } from './engine'
import type { GameState, GameAction, CardMap } from './types'
import { botDecideAction } from './smart-bot'

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

export const SMART_BOT: BotConfig = {
  type: 'bot',
  name: 'GoblinAI',
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
  cardMap?: CardMap,
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

    // Bot priority: delegate to bot decision engine
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

      // Smart bot: ask decision engine
      if (config.type === 'bot' && cardMap) {
        const botAction = botDecideAction(s, botId, cardMap)
        if (botAction) {
          s = applyAction(s, botAction)
          iterations++
          continue
        }
        // Fallback: pass
        s = applyAction(s, {
          type: 'pass_priority',
          playerId: botId,
          data: {},
          text: '',
        })
        iterations++
        continue
      }

      // Unknown bot type: pass
      s = applyAction(s, {
        type: 'pass_priority',
        playerId: botId,
        data: {},
        text: '',
      })
      iterations++
      continue
    }

    // During bot's turn, auto-pass for human too (nothing to respond to on ghost's turn)
    if (s.activePlayerId === botId && s.priorityPlayerId !== botId) {
      s = applyAction(s, {
        type: 'pass_priority',
        playerId: s.priorityPlayerId,
        data: {},
        text: '',
      })
      iterations++
      continue
    }

    break
  }

  return s
}
