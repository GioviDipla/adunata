import { NextResponse } from 'next/server'
import { generateGoblinAIText, GoblinAINotConfiguredError } from '@/lib/goblinai/deepseek'
import { BOT_SYSTEM_PROMPT, parseBotResponse } from '@/lib/goblinai/bot-prompt'
import { buildBotPrompt } from '@/lib/goblinai/bot-context'
import type { GameState, CardMap } from '@/lib/game/types'

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      state: GameState
      botId: string
      cardMap: CardMap
    }

    const { state, botId, cardMap } = body

    if (!state || !botId || !cardMap) {
      return NextResponse.json({ error: 'Missing state, botId, or cardMap' }, { status: 400 })
    }

    const botPlayer = state.players[botId]
    if (!botPlayer) {
      return NextResponse.json({ error: 'Bot not found in game state' }, { status: 400 })
    }

    // Build the game context prompt
    const gamePrompt = buildBotPrompt(state, botId, cardMap)

    // Call DeepSeek
    const { text } = await generateGoblinAIText({
      system: BOT_SYSTEM_PROMPT,
      prompt: gamePrompt,
      temperature: 0.4, // Slightly higher temp for variety in gameplay
    })

    // Parse the AI response
    const parsed = parseBotResponse(text, botId)

    if (!parsed) {
      console.warn('[GoblinAI Bot] Failed to parse response:', text.slice(0, 200))
      return NextResponse.json({ action: { type: 'pass_priority', playerId: botId, data: {}, text: '' } })
    }

    // Build the GameAction based on parsed response
    let action: { type: string; playerId: string; data: Record<string, unknown>; text: string }

    switch (parsed.action) {
      case 'play_card': {
        const instanceId = parsed.instanceId
        if (!instanceId) {
          return NextResponse.json({ action: { type: 'pass_priority', playerId: botId, data: {}, text: '' } })
        }
        const card = cardMap[instanceId]
        action = {
          type: 'play_card',
          playerId: botId,
          data: {
            instanceId,
            cardId: card?.cardId ?? 0,
            from: 'hand',
            to: 'battlefield',
            isCommander: card?.isCommander ?? false,
            isToken: false,
          },
          text: `GoblinAI plays ${card?.name ?? 'a card'}. (${parsed.reasoning ?? 'AI decision'})`,
        }
        break
      }

      case 'declare_attackers': {
        const attackerIds = (parsed.attackerIds ?? [])
          .filter((id) => botPlayer.battlefield.some((c) => c.instanceId === id && !c.tapped))
        const opponentId = Object.keys(state.players).find((pid) => pid !== botId) ?? ''
        action = {
          type: 'declare_attackers',
          playerId: botId,
          data: { attackerIds, targetPlayerId: opponentId },
          text: `GoblinAI attacks with ${attackerIds.length} creature${attackerIds.length !== 1 ? 's' : ''}.`,
        }
        break
      }

      case 'declare_blockers': {
        const validBlockers = new Set(
          botPlayer.battlefield.filter((c) => !c.tapped).map((c) => c.instanceId),
        )
        const assignments = (parsed.blockerAssignments ?? [])
          .filter((b) => validBlockers.has(b.blockerId))
        action = {
          type: 'declare_blockers',
          playerId: botId,
          data: { blockerAssignments: assignments },
          text: `GoblinAI blocks with ${assignments.length} creature${assignments.length !== 1 ? 's' : ''}.`,
        }
        break
      }

      default:
        action = { type: 'pass_priority', playerId: botId, data: {}, text: '' }
    }

    return NextResponse.json({ action, reasoning: parsed.reasoning })
  } catch (err) {
    if (err instanceof GoblinAINotConfiguredError) {
      return NextResponse.json({
        action: { type: 'pass_priority', playerId: '', data: {}, text: '' },
        fallback: true,
      })
    }
    console.error('[GoblinAI Bot] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
