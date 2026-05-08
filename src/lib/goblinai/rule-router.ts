import type { InteractionKeyword } from './types'

export const RULE_FAMILY_BY_KEYWORD: Record<InteractionKeyword, string[]> = {
  activated_ability: ['602'],
  attack_trigger: ['603'],
  cast_trigger: ['601', '603'],
  continuous_effect: ['611', '613'],
  copy_effect: ['707'],
  counter_placement: ['122'],
  dies_trigger: ['700', '603'],
  double_strike: ['702'],
  etb_trigger: ['603'],
  first_strike: ['702'],
  keyword_lifelink: ['120', '702'],
  layer_effect: ['613'],
  replacement_effect: ['614', '616'],
  saga_lore_counter: ['714', '122'],
  state_based_action: ['704'],
  static_ability: ['604'],
  targeting: ['115'],
  token_creation: ['111'],
  triggered_ability: ['603'],
  zone_change: ['400'],
}

export function getRuleFamiliesForKeywords(keywords: InteractionKeyword[]): string[] {
  const families = new Set<string>()
  for (const kw of keywords) {
    const rules = RULE_FAMILY_BY_KEYWORD[kw]
    if (rules) {
      for (const r of rules) families.add(r)
    }
  }
  return Array.from(families).sort((a, b) => {
    const na = Number(a)
    const nb = Number(b)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return a.localeCompare(b)
  })
}
