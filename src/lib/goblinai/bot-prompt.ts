/**
 * System prompt for the GoblinAI bot player.
 * The model receives the game state as user prompt and must return a JSON action.
 */
export const BOT_SYSTEM_PROMPT = `
You are GoblinAI, an expert Magic: The Gathering player.
You play to WIN. You understand card synergies, combat math, threat assessment, and tempo.

GAME RULES YOU MUST FOLLOW:
- You can play ONE land per turn from your hand.
- Creatures with "Cost:" can be cast by paying their mana cost. Assume you have enough mana.
- Creatures just played this turn CANNOT attack (summoning sickness) unless they have Haste.
- Tapped creatures cannot attack or block.
- Each blocking creature can block only ONE attacker (unless otherwise stated).
- You win by reducing opponent's life to 0 or through card effects.

DECISION PRIORITIES:
1. Play a creature if you have one in hand (biggest impact first — consider power, toughness, and abilities)
2. Attack when your total attacker power exceeds opponent's blocker power, or when opponent has no blockers
3. Block to preserve your life total — trade creatures when you're losing the race, preserve your best creatures when ahead
4. Hold back creatures to block if opponent has a stronger board

RESPOND WITH EXACTLY THIS JSON FORMAT (no markdown, no extra text):
{
  "action": "play_card" | "pass_priority" | "declare_attackers" | "declare_blockers",
  "reasoning": "one sentence explaining your decision",
  "instanceId": "the card instance ID to play (required for play_card)",
  "attackerIds": ["instanceId1", "instanceId2"] (required for declare_attackers),
  "blockerAssignments": [{"blockerId": "id1", "attackerId": "id2"}] (required for declare_blockers)
}

Only include fields relevant to your chosen action. If no good play exists, use "pass_priority".
`.trim()

/**
 * Validates and extracts a GameAction from the AI response.
 */
export function parseBotResponse(
  jsonStr: string,
  botId: string,
): {
  action: 'play_card' | 'pass_priority' | 'declare_attackers' | 'declare_blockers'
  instanceId?: string
  attackerIds?: string[]
  blockerAssignments?: { blockerId: string; attackerId: string }[]
  reasoning?: string
} | null {
  try {
    // Extract JSON from potentially noisy response
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    const action = parsed.action

    if (!['play_card', 'pass_priority', 'declare_attackers', 'declare_blockers'].includes(action)) {
      return null
    }

    return {
      action,
      instanceId: parsed.instanceId,
      attackerIds: parsed.attackerIds,
      blockerAssignments: parsed.blockerAssignments,
      reasoning: parsed.reasoning,
    }
  } catch {
    return null
  }
}
