import type { GameState, CardMap } from '@/lib/game/types'

/**
 * Serialize the current game state into a structured text prompt
 * that an AI model can understand and make decisions from.
 */
export function buildBotPrompt(
  state: GameState,
  botId: string,
  cardMap: CardMap,
): string {
  const bot = state.players[botId]
  const opponentId = Object.keys(state.players).find((pid) => pid !== botId) ?? 'opponent'
  const opponent = state.players[opponentId]

  const lines: string[] = []

  // Game phase
  lines.push(`=== GAME STATE ===`)
  lines.push(`Turn: ${state.turn}`)
  lines.push(`Phase: ${state.phase}`)
  lines.push(`Active player: ${state.activePlayerId === botId ? 'YOU' : 'Opponent'}`)
  lines.push(`Priority: ${state.priorityPlayerId === botId ? 'YOU' : 'Opponent'}`)
  lines.push('')

  // Life totals
  lines.push(`=== LIFE ===`)
  lines.push(`You: ${bot?.life ?? '?'} life`)
  lines.push(`Opponent: ${opponent?.life ?? '?'} life`)
  lines.push('')

  // Bot's hand
  lines.push(`=== YOUR HAND (${bot?.hand.length ?? 0} cards) ===`)
  if (bot?.hand.length) {
    for (const iid of bot.hand) {
      const card = cardMap[iid]
      if (!card) continue
      lines.push(formatCard(card, iid))
    }
  } else {
    lines.push('(empty)')
  }
  lines.push('')

  // Bot's battlefield
  lines.push(`=== YOUR BATTLEFIELD (${bot?.battlefield.length ?? 0} permanents) ===`)
  if (bot?.battlefield.length) {
    for (const c of bot.battlefield) {
      const card = cardMap[c.instanceId]
      if (!card) continue
      const status = [c.tapped ? 'TAPPED' : '', c.attacking ? 'ATTACKING' : '', c.blocking ? `BLOCKING ${c.blocking}` : '']
        .filter(Boolean)
        .join(', ')
      lines.push(`${formatCard(card, c.instanceId)} [${status || 'ready'}]`)
    }
  } else {
    lines.push('(empty)')
  }
  lines.push('')

  // Opponent's battlefield (visible info only)
  lines.push(`=== OPPONENT BATTLEFIELD (${opponent?.battlefield.length ?? 0} permanents) ===`)
  if (opponent?.battlefield.length) {
    for (const c of opponent.battlefield) {
      const card = cardMap[c.instanceId]
      if (!card) continue
      const status = [c.tapped ? 'TAPPED' : '', c.attacking ? 'ATTACKING' : '', c.blocking ? `BLOCKING` : '']
        .filter(Boolean)
        .join(', ')
      lines.push(`${formatCard(card, c.instanceId)} [${status || 'ready'}]`)
    }
  } else {
    lines.push('(empty)')
  }
  lines.push('')

  // Graveyards
  lines.push(`=== GRAVEYARDS ===`)
  lines.push(`Your graveyard: ${bot?.graveyard.length ?? 0} cards`)
  lines.push(`Opponent graveyard: ${opponent?.graveyard.length ?? 0} cards`)
  lines.push('')

  // Libraries
  lines.push(`=== LIBRARIES ===`)
  lines.push(`Your library: ${bot?.libraryCount ?? bot?.library.length ?? 0} cards`)
  lines.push(`Opponent library: ${opponent?.libraryCount ?? opponent?.library.length ?? 0} cards`)

  // Combat info (only if in combat)
  if (state.combat.phase) {
    lines.push('')
    lines.push(`=== COMBAT ===`)
    lines.push(`Combat phase: ${state.combat.phase}`)
    lines.push(`Attackers declared: ${state.combat.attackers.length}`)
    for (const a of state.combat.attackers) {
      const card = cardMap[a.instanceId]
      lines.push(`  Attacker: ${card?.name ?? 'Unknown'} (${a.instanceId}) → targeting ${a.targetPlayerId === opponentId ? 'YOU' : 'Opponent'}`)
    }
    if (state.combat.blockers.length > 0) {
      lines.push(`Blockers declared:`)
      for (const b of state.combat.blockers) {
        const card = cardMap[b.instanceId]
        lines.push(`  ${card?.name ?? 'Unknown'} blocking ${b.blockingInstanceId}`)
      }
    }
  }

  // Available actions hint
  lines.push('')
  lines.push(`=== DECISION REQUIRED ===`)
  if (state.phase === 'main1' || state.phase === 'main2') {
    lines.push(`You are in your main phase. You can play a creature from your hand.`)
    lines.push(`Respond with action "play_card" and the instanceId of the card to play, or "pass_priority" to move on.`)
  } else if (state.phase === 'declare_attackers' && state.activePlayerId === botId) {
    lines.push(`You are in declare attackers step. Choose which creatures to attack with.`)
    lines.push(`Respond with action "declare_attackers" and the instanceIds in attackerIds, or empty array to not attack.`)
  } else if (state.phase === 'declare_blockers' && state.activePlayerId !== botId) {
    lines.push(`You are defending. Choose blockers. Each of your untapped creatures can block one attacker.`)
    lines.push(`Respond with action "declare_blockers" and blockerAssignments array, or empty array to not block.`)
  } else {
    lines.push(`Pass priority unless you have a specific play.`)
  }

  return lines.join('\n')
}

function formatCard(
  card: { name: string; manaCost: string | null; typeLine: string; power: string | null; toughness: string | null; oracleText: string | null; isCommander: boolean },
  instanceId: string,
): string {
  const parts: string[] = []
  parts.push(`[${instanceId}] ${card.name}${card.isCommander ? ' ★COMMANDER' : ''}`)
  if (card.manaCost) parts.push(`Cost: ${card.manaCost}`)
  parts.push(`Type: ${card.typeLine}`)
  if (card.power != null && card.toughness != null) {
    parts.push(`P/T: ${card.power}/${card.toughness}`)
  }
  if (card.oracleText) {
    // Truncate oracle text to keep prompts manageable
    const text = card.oracleText.length > 200 ? card.oracleText.slice(0, 200) + '...' : card.oracleText
    parts.push(`Text: "${text}"`)
  }
  return parts.join(' | ')
}
