import { applyAction } from './engine'
import type { GameState, GameAction, CardMap } from './types'
import { botDecideActionHeuristic, needsAIDecision } from './smart-bot'

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
 * Call the AI decision API to get the bot's next action.
 * Returns null if the API call fails (caller should fall back to pass).
 */
async function fetchAIDecision(
  state: GameState,
  botId: string,
  cardMap: CardMap,
): Promise<GameAction | null> {
  try {
    const res = await fetch('/api/game/bot-decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, botId, cardMap }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { action?: GameAction; fallback?: boolean }
    if (data.action) {
      return data.action
    }
    return null
  } catch {
    return null
  }
}

/**
 * Apply a player action then auto-respond for the bot until
 * priority returns to a human player or no more bot actions needed.
 * Async — may call AI API for complex decisions.
 */
export async function applyWithBotLoop(
  state: GameState,
  action: GameAction,
  botId: string,
  config: BotConfig,
  cardMap?: CardMap,
): Promise<GameState> {
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

      // Smart bot: try heuristic first, fall back to AI
      if (config.type === 'bot' && cardMap) {
        // 1. Try heuristic action (land, untap, mulligan, damage resolve, pass)
        const heuristicAction = botDecideActionHeuristic(s, botId, cardMap)

        if (heuristicAction) {
          // Heuristic returned an action (including pass_priority for simple states)
          s = applyAction(s, heuristicAction)
          iterations++
          continue
        }

        // 2. Heuristic returned null → need AI decision
        if (needsAIDecision(s, botId, cardMap)) {
          const aiAction = await fetchAIDecision(s, botId, cardMap)
          if (aiAction) {
            s = applyAction(s, aiAction)
            iterations++
            continue
          }
        }

        // 3. Fallback: pass
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

    // During bot's turn, auto-pass for human too
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
