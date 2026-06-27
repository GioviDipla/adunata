import type { GameState, CardMap } from '@/lib/game/types'

type CardEntry = {
  name: string
  manaCost: string | null
  typeLine: string
  power: string | null
  toughness: string | null
  oracleText: string | null
  isCommander: boolean
  keywords: string[] | null
  hasUpkeepTrigger: boolean
  hasEtbTrigger: boolean
  hasAttacksTrigger: boolean
  hasDiesTrigger: boolean
  hasEndStepTrigger: boolean
  hasCastTrigger: boolean
}

/**
 * Serialize the current game state into a structured text prompt
 * that an AI model can understand and make strategic decisions from.
 *
 * The bot sees ALL public information:
 * - Its own hand and battlefield (full card text, keywords, triggers)
 * - Opponent's battlefield (full card text — public info in MTG)
 * - Both graveyards (card names — public info)
 * - Both libraries (counts only — hidden info)
 * - Life totals, turn, phase, combat state
 *
 * Hidden from bot (correctly):
 * - Opponent's hand contents (only shows count)
 * - Library order
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

  // ── Game phase ──
  lines.push(`=== GAME STATE ===`)
  lines.push(`Turn: ${state.turn}`)
  lines.push(`Phase: ${state.phase}`)
  lines.push(`Active player: ${state.activePlayerId === botId ? 'YOU' : 'OPPONENT'}`)
  lines.push(`Priority: ${state.priorityPlayerId === botId ? 'YOU (your turn to act!)' : 'OPPONENT (waiting...)'}`)
  lines.push('')

  // ── Life totals ──
  lines.push(`=== LIFE ===`)
  lines.push(`You: ${bot?.life ?? '?'} | Opponent: ${opponent?.life ?? '?'}`)
  if ((bot?.life ?? 20) < 10) lines.push(`WARNING: Your life is low! Consider blocking/racing carefully.`)
  if ((opponent?.life ?? 20) < 10) lines.push(`OPPORTUNITY: Opponent is low on life. Aggression may win the game.`)
  lines.push('')

  // ── Bot's hand ──
  lines.push(`=== YOUR HAND (${bot?.hand.length ?? 0} cards) ===`)
  if (bot?.hand.length) {
    for (const iid of bot.hand) {
      const card = cardMap[iid]
      if (!card) continue
      lines.push(`  ${formatCardFull(card, iid)}`)
    }
  } else {
    lines.push('  (empty)')
  }
  lines.push('')

  // ── Bot's battlefield ──
  lines.push(`=== YOUR BATTLEFIELD (${bot?.battlefield.length ?? 0} permanents) ===`)
  if (bot?.battlefield.length) {
    for (const c of bot.battlefield) {
      const card = cardMap[c.instanceId]
      if (!card) continue
      const status = [
        c.tapped ? 'TAPPED' : 'untapped',
        c.attacking ? 'ATTACKING' : '',
        c.blocking ? `BLOCKING_${c.blocking}` : '',
        c.damageMarked > 0 ? `DMG:${c.damageMarked}` : '',
        c.counters.length > 0 ? c.counters.map((ct) => `${ct.name}:${ct.value}`).join(',') : '',
      ].filter(Boolean).join(' ')
      lines.push(`  ${formatCardFull(card, c.instanceId)} [${status || 'idle'}]`)
    }
  } else {
    lines.push('  (empty)')
  }
  lines.push('')

  // ── Opponent's battlefield (FULL card text — public info) ──
  lines.push(`=== OPPONENT BATTLEFIELD (${opponent?.battlefield.length ?? 0} permanents) ===`)
  if (opponent?.battlefield.length) {
    for (const c of opponent.battlefield) {
      const card = cardMap[c.instanceId]
      if (!card) continue
      const status = [
        c.tapped ? 'TAPPED' : 'untapped',
        c.attacking ? 'ATTACKING_YOU' : '',
        c.blocking ? `BLOCKING_${c.blocking}` : '',
        c.damageMarked > 0 ? `DMG:${c.damageMarked}` : '',
        c.counters.length > 0 ? c.counters.map((ct) => `${ct.name}:${ct.value}`).join(',') : '',
      ].filter(Boolean).join(' ')
      lines.push(`  ${formatCardFull(card, c.instanceId)} [${status || 'idle'}]`)
    }
  } else {
    lines.push('  (empty)')
  }
  lines.push('')

  // ── Opponent's hand (COUNT only — hidden info) ──
  lines.push(`=== OPPONENT HAND ===`)
  lines.push(`Opponent has ${opponent?.handCount ?? opponent?.hand.length ?? 0} cards in hand.`)
  lines.push('')

  // ── Graveyards (card names — public info) ──
  lines.push(`=== GRAVEYARDS ===`)
  if (bot?.graveyard.length) {
    const names = bot.graveyard.map((g) => cardMap[g.instanceId]?.name ?? '?').join(', ')
    lines.push(`Your graveyard (${bot.graveyard.length}): ${names}`)
  } else {
    lines.push(`Your graveyard: empty`)
  }
  if (opponent?.graveyard.length) {
    const names = opponent.graveyard.map((g) => cardMap[g.instanceId]?.name ?? '?').join(', ')
    lines.push(`Opponent graveyard (${opponent.graveyard.length}): ${names}`)
  } else {
    lines.push(`Opponent graveyard: empty`)
  }
  lines.push('')

  // ── Exile (if any) ──
  const botExileCount = bot?.exile.length ?? 0
  const oppExileCount = opponent?.exile.length ?? 0
  if (botExileCount > 0 || oppExileCount > 0) {
    lines.push(`=== EXILE ===`)
    if (botExileCount > 0) {
      const names = bot!.exile.map((e) => cardMap[e.instanceId]?.name ?? '?').join(', ')
      lines.push(`Your exile (${botExileCount}): ${names}`)
    }
    if (oppExileCount > 0) {
      const names = opponent!.exile.map((e) => cardMap[e.instanceId]?.name ?? '?').join(', ')
      lines.push(`Opponent exile (${oppExileCount}): ${names}`)
    }
    lines.push('')
  }

  // ── Libraries (counts only) ──
  lines.push(`=== LIBRARIES ===`)
  lines.push(`Your library: ${bot?.libraryCount ?? bot?.library.length ?? 0} cards remaining`)
  lines.push(`Opponent library: ${opponent?.libraryCount ?? opponent?.library.length ?? 0} cards remaining`)
  lines.push('')

  // ── Combat ──
  if (state.combat.phase) {
    lines.push(`=== COMBAT (${state.combat.phase}) ===`)
    if (state.combat.attackers.length > 0) {
      for (const a of state.combat.attackers) {
        const card = cardMap[a.instanceId]
        const attPwr = card?.power ? parseInt(card.power) || 0 : 0
        const targetYou = a.targetPlayerId === botId
        lines.push(`  Attacker: ${card?.name ?? '?'} [${attPwr} power] ${targetYou ? '→ ATTACKING YOU' : '→ attacking opponent'}`)
      }
    }
    if (state.combat.blockers.length > 0) {
      for (const b of state.combat.blockers) {
        const blockerCard = cardMap[b.instanceId]
        const attackerCard = cardMap[b.blockingInstanceId]
        lines.push(`  Blocker: ${blockerCard?.name ?? '?'} blocking ${attackerCard?.name ?? '?'}`)
      }
    }
    lines.push('')
  }

  // ── Decision prompt ──
  lines.push(`=== YOUR DECISION ===`)
  if (state.phase === 'main1' || state.phase === 'main2') {
    lines.push(`You are in your main phase. You may cast ONE creature from your hand.`)
    lines.push(`Evaluate ALL cards in your hand. Consider: mana cost, power/toughness, keywords (Flying, Deathtouch, Haste, etc.), ETB effects, and how each card interacts with the opponent's board.`)
    if (opponent?.battlefield.length) {
      lines.push(`Threat assessment: opponent has ${opponent.battlefield.length} permanents. Look at their card texts — do they have flyers you need to block? Are they threatening lethal damage?`)
    }
    lines.push(`Response: {"action":"play_card","instanceId":"<id>","reasoning":"..."} or {"action":"pass_priority"}`)
  } else if (state.phase === 'declare_attackers' && state.activePlayerId === botId) {
    lines.push(`You are declaring attackers. Your untapped creatures can attack.`)
    if (opponent?.battlefield.length) {
      const untappedOppBlocker = opponent.battlefield.filter((c) => !c.tapped).length
      lines.push(`Opponent has ${untappedOppBlocker} untapped creature(s) that can block. Evaluate combat math carefully:`)
    }
    lines.push(`Consider: can you deal lethal damage? Will opponent be forced into unfavorable blocks? Do you need to hold back creatures to block on opponent's next turn?`)
    lines.push(`Response: {"action":"declare_attackers","attackerIds":["id1"],"reasoning":"..."} or {"action":"pass_priority"} for no attacks`)
  } else if (state.phase === 'declare_blockers' && state.activePlayerId !== botId) {
    lines.push(`You are defending. Choose which of your untapped creatures block which attackers.`)
    lines.push(`Priority: 1) Prevent lethal damage to yourself, 2) Trade unfavorably only if you would die otherwise, 3) Preserve your best creatures.`)
    lines.push(`Response: {"action":"declare_blockers","blockerAssignments":[{"blockerId":"id1","attackerId":"id2"}],"reasoning":"..."} or {"action":"pass_priority"} for no blocks`)
  } else {
    lines.push(`Pass priority unless you have a specific play to make.`)
  }

  return lines.join('\n')
}

/**
 * Full card format with oracle text, keywords, and trigger flags.
 */
function formatCardFull(card: CardEntry, instanceId: string): string {
  const parts: string[] = []
  // ID and name
  parts.push(`[${instanceId}] ${card.name}${card.isCommander ? ' ★COMMANDER' : ''}`)
  if (card.manaCost) parts.push(`Cost:${card.manaCost}`)
  parts.push(`${card.typeLine}`)
  if (card.power != null && card.toughness != null) {
    parts.push(`${card.power}/${card.toughness}`)
  }
  // Keywords
  if (card.keywords && card.keywords.length > 0) {
    parts.push(`Keywords:${card.keywords.join(',')}`)
  }
  // Trigger flags
  const triggers: string[] = []
  if (card.hasEtbTrigger) triggers.push('ETB')
  if (card.hasDiesTrigger) triggers.push('DIES')
  if (card.hasAttacksTrigger) triggers.push('ATTACKS')
  if (card.hasUpkeepTrigger) triggers.push('UPKEEP')
  if (card.hasEndStepTrigger) triggers.push('END_STEP')
  if (card.hasCastTrigger) triggers.push('CAST')
  if (triggers.length > 0) parts.push(`Triggers:${triggers.join(',')}`)
  // Oracle text (full, up to 500 chars — most MTG cards fit)
  if (card.oracleText) {
    const text = card.oracleText.length > 500 ? card.oracleText.slice(0, 500) + '…' : card.oracleText
    parts.push(`"${text}"`)
  }
  return parts.join(' | ')
}
