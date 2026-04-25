/**
 * Heuristic card → section name classifier.
 * Operates on local card fields (no external API) and the Commander preset
 * vocabulary (Commander / Ramp / Card Draw / Removal / Tutors / Wincons /
 * Protection / Utility / Lands).
 *
 * Returns null when no rule matches — the caller leaves the card uncategorized.
 */

export type CategoryName =
  | 'Commander'
  | 'Lands'
  | 'Ramp'
  | 'Tutors'
  | 'Card Draw'
  | 'Removal'
  | 'Protection'
  | 'Utility'

export interface CategorizableCard {
  type_line: string | null
  oracle_text: string | null
  produced_mana: string[] | null
  keywords: string[] | null
}

const RAMP_TEXT = /add\s+(\{[^}]+\}|one mana|two mana|three mana|that much mana)/i
const TUTOR_TEXT = /search your library for (?!a basic land|up to (one|two|three|\d+) basic land)/i
const BASIC_LAND_TUTOR_TEXT = /search your library for (a basic land|up to (one|two|three|\d+) basic land)/i

// Card draw — direct draw, scry/surveil/explore, loot, reveal-and-add.
const DRAW_TEXT =
  /(draw\s+(a|two|three|four|five|six|seven|\d+|that many|x)\s+cards?|scry\s+\d+|surveil\s+\d+|investigate|create.*clue token|connive|explore|put.*card.*into your hand|loot\s+\d+)/i

// Removal — destroy/exile target, damage to creature/permanent, bounce
// (return to hand), -X/-X, fight, sacrifice target, tap target.
const REMOVAL_TEXT =
  /(destroy|exile)\s+(target|all|each|up to|that)|deals?\s+\d+\s+damage\s+to\s+(target|any|each)|return\s+target.*to (its|their) owner.{0,30}hand|\bfight(s)?\b|sacrifice(s)?\s+target|gets?\s+-\d+\/-\d+/i

// Counter / disruption.
const COUNTER_TEXT = /counter target|counter that spell/i

// Protection — keyword shields + prevent/redirect.
const PROTECTION_TEXT =
  /(prevent (all|the next)|protection from|hexproof|indestructible|shroud|ward)/i

// Wipe — board sweep specific so we keep them in Removal bucket.
const WIPE_TEXT =
  /(destroy all|exile all|each creature gets? -\d+\/-\d+|deals?\s+\d+\s+damage to each (creature|player|opponent)|all creatures get? -\d+\/-\d+)/i

export function categorize(
  card: CategorizableCard,
  board: string,
): CategoryName | null {
  if (board === 'commander') return 'Commander'

  const tl = (card.type_line ?? '').toLowerCase()
  if (tl.includes('land')) return 'Lands'

  const ot = card.oracle_text ?? ''
  const producedMana = card.produced_mana ?? []
  const keywords = (card.keywords ?? []).map((k) => k.toLowerCase())

  // Ramp: any non-land that produces mana, plus mana-doubling spells / land-fetch sorceries.
  const isManaProducer =
    producedMana.length > 0 ||
    BASIC_LAND_TUTOR_TEXT.test(ot) ||
    /add\s+\{/i.test(ot) ||
    RAMP_TEXT.test(ot)
  if (isManaProducer && !tl.includes('creature')) {
    // Pure mana rocks / mana sorceries / signets / talismans.
    return 'Ramp'
  }
  if (isManaProducer && tl.includes('creature') && producedMana.length > 0) {
    // Mana dorks (Llanowar Elves, etc.).
    return 'Ramp'
  }

  // Tutors (excluding basic-land tutors, which are Ramp).
  if (TUTOR_TEXT.test(ot)) return 'Tutors'

  // Removal — wipes / destroy / exile / damage / bounce / fight / -X/-X.
  if (WIPE_TEXT.test(ot) || REMOVAL_TEXT.test(ot)) return 'Removal'

  // Counter spells — interaction class.
  if (COUNTER_TEXT.test(ot)) return 'Removal'

  // Protection — prevent / keyword shields.
  if (PROTECTION_TEXT.test(ot)) return 'Protection'
  if (
    keywords.includes('hexproof') ||
    keywords.includes('indestructible') ||
    keywords.includes('shroud') ||
    keywords.includes('ward')
  ) {
    return 'Protection'
  }

  // Card draw — wide net (draw, scry/surveil, loot, etc.).
  if (DRAW_TEXT.test(ot)) return 'Card Draw'

  // Fallback for anything that didn't match.
  return 'Utility'
}
