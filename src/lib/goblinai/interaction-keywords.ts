import type { InteractionKeyword } from './types'

interface CardFace {
  oracle_text?: string | null
}

const PATTERNS: Array<{ regex: RegExp; keyword: InteractionKeyword }> = [
  { regex: /(?:when|whenever)\s+\S+\s+enters\b|enters\s+(?:the\s+)?battlefield\b|return.*to the battlefield/i, keyword: 'etb_trigger' },
  { regex: /attacks\b/i, keyword: 'attack_trigger' },
  { regex: /\bdies\b/i, keyword: 'dies_trigger' },
  { regex: /whenever you cast|when you cast/i, keyword: 'cast_trigger' },
  { regex: /if .+ would .+ instead|instead/i, keyword: 'replacement_effect' },
  { regex: /create .* token|token copy/i, keyword: 'token_creation' },
  { regex: /\bcopy\b/i, keyword: 'copy_effect' },
  { regex: /\bcounter\b|\bcounters\b|lore counter/i, keyword: 'counter_placement' },
  { regex: /\bsaga\b|lore counter/i, keyword: 'saga_lore_counter' },
  { regex: /\bexile\b|\bgraveyard\b|\bbattlefield\b|\breturn to\b/i, keyword: 'zone_change' },
  { regex: /\btarget/i, keyword: 'targeting' },
  { regex: /whenever\b|when\b|at the beginning|at end of combat/i, keyword: 'triggered_ability' },
  { regex: /\bdouble strike\b/i, keyword: 'double_strike' },
  { regex: /\bfirst strike\b/i, keyword: 'first_strike' },
  { regex: /\blifelink\b/i, keyword: 'keyword_lifelink' },
  { regex: /\bstate.based\b/i, keyword: 'state_based_action' },
  { regex: /\bstatic\s+ability\b|\bstatic\b/i, keyword: 'static_ability' },
  { regex: /\blayers?\b/i, keyword: 'layer_effect' },
]

const KEYWORD_ARRAY_MAP: Array<{ needle: RegExp; keyword: InteractionKeyword }> = [
  { needle: /Double strike/i, keyword: 'double_strike' },
  { needle: /First strike/i, keyword: 'first_strike' },
  { needle: /Lifelink/i, keyword: 'keyword_lifelink' },
]

function scanText(text: string): InteractionKeyword[] {
  const found = new Set<InteractionKeyword>()
  for (const { regex, keyword } of PATTERNS) {
    if (regex.test(text)) found.add(keyword)
  }
  return Array.from(found).sort()
}

function scanKeywords(keywords: string[]): InteractionKeyword[] {
  const found = new Set<InteractionKeyword>()
  for (const kw of keywords) {
    for (const { needle, keyword } of KEYWORD_ARRAY_MAP) {
      if (needle.test(kw)) found.add(keyword)
    }
  }
  return Array.from(found).sort()
}

export function deriveInteractionKeywords(card: {
  oracle_text: string | null
  keywords: string[] | null
  type_line: string
  card_faces: unknown
}): InteractionKeyword[] {
  const set = new Set<InteractionKeyword>()
  const texts: string[] = []

  if (card.oracle_text) texts.push(card.oracle_text)

  if (Array.isArray(card.card_faces)) {
    for (const face of card.card_faces as CardFace[]) {
      if (face.oracle_text) texts.push(face.oracle_text)
    }
  }

  for (const t of texts) {
    for (const kw of scanText(t)) set.add(kw)
  }

  if (card.keywords && card.keywords.length > 0) {
    for (const kw of scanKeywords(card.keywords)) set.add(kw)
  }

  return Array.from(set).sort()
}
