import { createAdminClient } from '@/lib/supabase/admin'
import { CARD_GOBLINAI_COLUMNS } from '@/lib/supabase/columns'
import { deriveInteractionKeywords } from './interaction-keywords'
import { getRuleFamiliesForKeywords } from './rule-router'
import type {
  InteractionKeyword,
  MentionedCardRef,
  GoblinAICardContext,
  GoblinAIRuleContext,
  GoblinAIRulingContext,
} from './types'

export function extractMentionIds(mentions: MentionedCardRef[]): number[] {
  return mentions.map((m) => m.id)
}

const ZONE_TIMING_TERMS = [
  /battlefield/i, /campo/i, /cimitero/i, /graveyard/i,
  /stack/i, /pila/i, /attacco/i, /combat/i, /upkeep/i,
  /end step/i, /etb/i, /enters/i, /trigger/i, /innescata/i,
  /esilio/i, /exile/i, /mano/i, /hand/i, /biblioteca/i,
  /library/i, /turno/i, /fase/i, /step/i, /stack/i,
]

export function requiresConfirmation(input: {
  mentionsLen: number
  interactionKeywords: InteractionKeyword[]
  message: string
}): boolean {
  if (input.mentionsLen >= 2) return true

  const complexKeys: InteractionKeyword[] = [
    'triggered_ability', 'replacement_effect', 'copy_effect',
    'token_creation', 'counter_placement', 'zone_change',
    'layer_effect', 'state_based_action',
  ]
  const hasComplexKey = input.interactionKeywords.some((k) => complexKeys.includes(k))
  if (hasComplexKey) return true

  for (const term of ZONE_TIMING_TERMS) {
    if (term.test(input.message)) return true
  }

  return false
}

export async function buildGoblinAIContext(input: {
  message: string
  mentions: MentionedCardRef[]
}): Promise<{
  cards: GoblinAICardContext[]
  interactionKeywords: InteractionKeyword[]
  rules: GoblinAIRuleContext[]
  rulings: GoblinAIRulingContext[]
  requiresConfirmation: boolean
  rulesAvailable: boolean
}> {
  const supabase = createAdminClient()

  const cards: GoblinAICardContext[] = []
  if (input.mentions.length > 0) {
    const ids = input.mentions.map((m) => m.id)
    const { data } = await supabase
      .from('cards')
      .select(CARD_GOBLINAI_COLUMNS)
      .in('id', ids)

    if (data) {
      const byId = new Map(data.map((c) => [c.id, c] as const))
      for (const m of input.mentions) {
        const card = byId.get(m.id)
        if (card) cards.push(card)
      }
    }
  }

  const interactionKeywords: InteractionKeyword[] = []
  for (const card of cards) {
    for (const kw of deriveInteractionKeywords(card)) {
      if (!interactionKeywords.includes(kw)) interactionKeywords.push(kw)
    }
  }
  interactionKeywords.sort()

  const ruleFamilies = getRuleFamiliesForKeywords(interactionKeywords)

  let rules: GoblinAIRuleContext[] = []
  let rulesAvailable = false
  if (ruleFamilies.length > 0) {
    const { data: ruleData } = await supabase
      .from('mtg_rules')
      .select('rule_number, section_title, text, keywords')
      .or(
        ruleFamilies
          .map((f) => `rule_number.eq.${f},rule_number.like.${f}.*`)
          .join(','),
      )
      .limit(40)

    if (ruleData && ruleData.length > 0) {
      rules = ruleData.map((r: Record<string, unknown>) => ({
        rule_number: r.rule_number as string,
        section_title: r.section_title as string | null,
        text: r.text as string,
        keywords: r.keywords as string[],
      }))
      rulesAvailable = true
    }
  }

  let rulings: GoblinAIRulingContext[] = []
  if (cards.length > 0) {
    const cardIds = cards.map((c) => c.id)
    const { data: rulingData } = await supabase
      .from('card_rulings')
      .select('id, card_id, ruling_date, text, keywords')
      .in('card_id', cardIds)
      .limit(20)

    if (rulingData) {
      rulings = rulingData.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        card_id: r.card_id as number,
        ruling_date: r.ruling_date as string | null,
        text: r.text as string,
        keywords: r.keywords as string[],
      }))
    }
  }

  const needsConfirmation = requiresConfirmation({
    mentionsLen: input.mentions.length,
    interactionKeywords,
    message: input.message,
  })

  return {
    cards,
    interactionKeywords,
    rules,
    rulings,
    requiresConfirmation: needsConfirmation,
    rulesAvailable,
  }
}
