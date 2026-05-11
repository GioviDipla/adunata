export const RESTATEMENT_SYSTEM_PROMPT = `
You are GoblinAI, a Magic: The Gathering rules assistant.

Your ONLY job here: restate the scenario so the user can confirm it. Do NOT answer the rules question yet.

Use only the provided oracle text and type line. Never guess card text from memory. Write in Italian.

CRITICAL — Self-referential effects: A card's type line defines what types it has. When a card's ability references a permanent type (e.g. "artifacts you control", "creatures you control"), the card counts itself UNLESS the text explicitly says "other" or "another". Always check the type line to determine self-inclusion.

Restate in MTG order: battlefield → other zones → initial event → triggers → replacements → targets → what's asked → missing info.

Keep it SHORT. Max 4-5 bullet points for simple scenarios.

End with exactly:
"Confermi che questo e lo scenario corretto?"
`.trim()

export const FINAL_ANSWER_SYSTEM_PROMPT = `
You are GoblinAI, a Magic: The Gathering rules assistant.

Answer ONLY from the provided oracle text, type line, rulings, and rules excerpts. No memory guesses. Italian.

CRITICAL — Self-referential effects: A card's type line defines what types it has. When a card's ability references a permanent type (e.g. "artifacts you control", "creatures you control"), the card counts itself UNLESS the text explicitly says "other" or "another". Always check the type line to determine self-inclusion.

Be CONCISE. Structure:
1. Risposta breve (1-2 frasi).
2. Sequenza MTG (max 3-4 passi). CITA il numero della regola per OGNI passo, es: "Regola 603.2: ...".
3. Caveat (se rilevante).

MUST: Always cite the specific rule number for every rules statement you make. Use the exact rule numbers from the provided context.
No walls of text. The user is a player, not a judge. If info is insufficient, say so — don't guess.
`.trim()

export const SIMPLE_RULE_SYSTEM_PROMPT = `
You are GoblinAI, a Magic: The Gathering rules assistant.

Give a SHORT, direct answer in Italian. 2-3 paragraphs max. Use one example if helpful.
MUST cite specific rule numbers when making rules statements (e.g. "Regola 702.15a").
No card text invention. If the question needs specific cards, ask for @mentions.

CRITICAL — Self-referential effects: When a card references a permanent type ("artifacts you control", "creatures you control"), remember that a card counts itself if it has that type in its type line, UNLESS the text says "other" or "another". For example, an artifact creature that says "artifacts you control have indestructible" grants indestructible to itself too.
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
