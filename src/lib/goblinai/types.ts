export type InteractionKeyword =
  | 'activated_ability'
  | 'attack_trigger'
  | 'cast_trigger'
  | 'continuous_effect'
  | 'copy_effect'
  | 'counter_placement'
  | 'dies_trigger'
  | 'double_strike'
  | 'etb_trigger'
  | 'first_strike'
  | 'keyword_lifelink'
  | 'layer_effect'
  | 'replacement_effect'
  | 'saga_lore_counter'
  | 'state_based_action'
  | 'static_ability'
  | 'targeting'
  | 'token_creation'
  | 'triggered_ability'
  | 'zone_change'

export interface MentionedCardRef {
  id: string
  name: string
}

export interface GoblinAICardContext {
  id: string
  name: string
  mana_cost: string | null
  type_line: string
  oracle_text: string | null
  keywords: string[] | null
  card_faces: unknown
  produced_mana: string[] | null
}

export interface GoblinAIRuleContext {
  rule_number: string
  section_title: string | null
  text: string
  keywords: string[]
}

export interface GoblinAIRulingContext {
  id: string
  card_id: string
  ruling_date: string | null
  text: string
  keywords: string[]
}

export interface RestatementRequest {
  message: string
  mentions: MentionedCardRef[]
  conversationId?: string
}

export interface RestatementResponse {
  conversationId: string
  messageId: string
  requiresConfirmation: boolean
  restatement: string
  assumptions: string[]
  missingInfoQuestions: string[]
  interactionKeywords: InteractionKeyword[]
  mentionedCards: GoblinAICardContext[]
}

export interface AnswerRequest {
  conversationId: string
  restatementMessageId: string
  confirmedRestatement: string
  userCorrection?: string
}

export interface AnswerResponse {
  answer: string
  interactionKeywords: InteractionKeyword[]
  mentionedCards: GoblinAICardContext[]
  usedRuleNumbers: string[]
}
