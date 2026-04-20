import type { Database } from '@/types/supabase'
import type { CardMap } from './types'

type CardRow = Database['public']['Tables']['cards']['Row']

type BaseCardFields = Partial<Pick<CardRow,
  | 'name'
  | 'image_small'
  | 'image_normal'
  | 'type_line'
  | 'mana_cost'
  | 'power'
  | 'toughness'
  | 'oracle_text'
  | 'keywords'
  | 'has_upkeep_trigger'
  | 'has_etb_trigger'
  | 'has_attacks_trigger'
  | 'has_dies_trigger'
  | 'has_end_step_trigger'
  | 'has_cast_trigger'
>>

/** Build a CardMap entry from a raw `cards` row. Keep this the single source
 *  of truth so new fields propagate to every callsite (play, goldfish, history). */
export function toCardMapEntry(
  cardId: number,
  row: BaseCardFields & { name: string; type_line: string },
  flags: { isCommander: boolean; isToken: boolean },
): CardMap[string] {
  return {
    cardId,
    name: row.name,
    imageSmall: row.image_small ?? null,
    imageNormal: row.image_normal ?? null,
    typeLine: row.type_line,
    manaCost: row.mana_cost ?? null,
    power: row.power ?? null,
    toughness: row.toughness ?? null,
    oracleText: row.oracle_text ?? null,
    isCommander: flags.isCommander,
    isToken: flags.isToken,
    keywords: row.keywords ?? null,
    hasUpkeepTrigger: row.has_upkeep_trigger ?? false,
    hasEtbTrigger: row.has_etb_trigger ?? false,
    hasAttacksTrigger: row.has_attacks_trigger ?? false,
    hasDiesTrigger: row.has_dies_trigger ?? false,
    hasEndStepTrigger: row.has_end_step_trigger ?? false,
    hasCastTrigger: row.has_cast_trigger ?? false,
  }
}
