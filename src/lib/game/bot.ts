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

  if (config.type !== 'ghost') {
    console.log('[GoblinAI Bot] loop start. phase:', s.phase, 'turn:', s.turn,
      'activePlayer:', s.activePlayerId === botId ? 'bot' : 'human',
      'priority:', s.priorityPlayerId === botId ? 'bot' : 'human',
      'hand:', s.players[botId]?.hand?.length ?? 0, 'cards')
  }

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
        const heuristicAction = botDecideActionHeuristic(s, botId, cardMap, false)

        if (heuristicAction) {
          // Heuristic returned an action (including pass_priority for simple states)
          s = applyAction(s, heuristicAction)
          iterations++
          continue
        }

        // 2. Heuristic returned null → need AI decision
        if (needsAIDecision(s, botId, cardMap)) {
          console.log('[GoblinAI Bot] calling AI for decision... phase:', s.phase)
          const aiAction = await fetchAIDecision(s, botId, cardMap)
          if (aiAction) {
            console.log('[GoblinAI Bot] AI action:', aiAction.type, aiAction.text)
            s = applyAction(s, aiAction)
            iterations++
            continue
          }
          console.log('[GoblinAI Bot] AI returned no action, falling back to pass')
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

    // Auto-pass for human during bot's turn (bot is playing solo)
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

    // Auto-pass for human during their own end_step/cleanup
    // so the turn transitions to the bot without extra clicks
    if (
      s.activePlayerId !== botId &&
      s.priorityPlayerId !== botId &&
      (s.phase === 'end_step' || s.phase === 'cleanup')
    ) {
      s = applyAction(s, {
        type: 'pass_priority',
        playerId: s.priorityPlayerId,
        data: {},
        text: '',
      })
      iterations++
      continue
    }

    // Auto-pass for bot when human is active but bot has priority
    // (e.g. during human's main phase when bot needs to respond)
    if (s.activePlayerId !== botId && s.priorityPlayerId === botId) {
      s = applyAction(s, {
        type: 'pass_priority',
        playerId: botId,
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
