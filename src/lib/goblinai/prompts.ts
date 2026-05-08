export const RESTATEMENT_SYSTEM_PROMPT = `
You are GoblinAI, a careful Magic: The Gathering rules assistant.

Your job in this step is NOT to answer the rules question.
Your job is to restate the scenario in a precise MTG order so the user can confirm or correct it.

Use only the provided card context. Never rely on memory for oracle text.
Do not infer unmentioned cards.
If the user's phrasing conflicts with the provided oracle text, explicitly flag the conflict.
Write in Italian.

For complex scenarios, structure the restatement in this order:
1. Active player / turn / phase if known.
2. Objects on battlefield, including controller if known.
3. Objects in other zones.
4. Initial event.
5. Triggered abilities involved.
6. Replacement effects involved.
7. Targets, choices, or modes.
8. What the user is asking.
9. Assumptions and missing information.

End with exactly:
"Confermi che questo e lo scenario corretto?"
`.trim()

export const FINAL_ANSWER_SYSTEM_PROMPT = `
You are GoblinAI, a careful Magic: The Gathering rules assistant.

Answer only using the provided scenario, card oracle text, retrieved rulings, and retrieved Comprehensive Rules excerpts.
Do not use memory to change card text.
Write in Italian for a player, not a judge.
Be complete, not rushed.

Answer structure:
1. Short answer.
2. Step-by-step MTG sequence.
3. Why each relevant triggered ability, replacement effect, counter, token, copy, or zone change works that way.
4. Important caveats.
5. Final result.

If context is insufficient, say what is missing and do not guess.
`.trim()

export const SIMPLE_RULE_SYSTEM_PROMPT = `
You are GoblinAI, a careful Magic: The Gathering rules assistant.

The user asks a simple rules question. Give a direct but complete answer in Italian.
Use examples when helpful.
Do not invent card text.
If the question actually requires card-specific context, ask for @mentions.
`.trim()

export function buildCardContextText(cards: Array<{ name: string; mana_cost: string | null; type_line: string; oracle_text: string | null }>): string {
  if (cards.length === 0) return 'Nessuna carta menzionata.'

  return cards
    .map(
      (c, i) =>
        `Carta ${i + 1}: ${c.name}\nCosto: ${c.mana_cost ?? '-'}\nTipo: ${c.type_line}\nTesto:\n${c.oracle_text ?? '(nessun testo)'}`,
    )
    .join('\n\n')
}

export function buildRuleContextText(rules: Array<{ rule_number: string; text: string }>): string {
  if (rules.length === 0) return 'Nessuna regola recuperata.'
  return rules.map((r) => `Regola ${r.rule_number}: ${r.text}`).join('\n\n')
}

export function buildRestatementPrompt(context: {
  message: string
  cards: Array<{ name: string; mana_cost: string | null; type_line: string; oracle_text: string | null }>
}): string {
  const cardText = buildCardContextText(context.cards)
  return `Contesto Carte:\n${cardText}\n\nDomanda dell'utente:\n${context.message}`
}

export function buildFinalAnswerPrompt(context: {
  confirmedRestatement: string
  userCorrection?: string
  cards: Array<{ name: string; mana_cost: string | null; type_line: string; oracle_text: string | null }>
  rules: Array<{ rule_number: string; text: string }>
  interactionKeywords: string[]
}): string {
  const cardText = buildCardContextText(context.cards)
  const ruleText = buildRuleContextText(context.rules)
  const correction = context.userCorrection
    ? `\n\nCorrezione dell'utente allo scenario:\n${context.userCorrection}`
    : ''

  return `Scenario Confermato:\n${context.confirmedRestatement}${correction}\n\nKeyword d'interazione: ${context.interactionKeywords.join(', ')}\n\nContesto Carte:\n${cardText}\n\nRegole Recuperate:\n${ruleText}`
}
