import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceLimit, assistantLimiter, getClientId } from '@/lib/rate-limit'
import { buildGoblinAIContext } from '@/lib/goblinai/context-builder'
import { generateGoblinAIText, GoblinAINotConfiguredError } from '@/lib/goblinai/deepseek'
import { FINAL_ANSWER_SYSTEM_PROMPT, buildFinalAnswerPrompt } from '@/lib/goblinai/prompts'
import type { MentionedCardRef } from '@/lib/goblinai/types'

const ANSWER_REQUEST_SCHEMA = {
  validate: (body: unknown): body is {
    conversationId: string
    restatementMessageId: string
    confirmedRestatement: string
    userCorrection?: string
  } => {
    if (!body || typeof body !== 'object') return false
    const b = body as Record<string, unknown>
    if (typeof b.conversationId !== 'string') return false
    if (typeof b.restatementMessageId !== 'string') return false
    if (typeof b.confirmedRestatement !== 'string') return false
    if (b.userCorrection !== undefined && typeof b.userCorrection !== 'string') return false
    return true
  },
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const limited = await enforceLimit(assistantLimiter, getClientId(request, user.id))
  if (limited) return limited

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!ANSWER_REQUEST_SCHEMA.validate(body)) {
    return NextResponse.json(
      { error: 'Request must include conversationId, restatementMessageId, and confirmedRestatement' },
      { status: 400 },
    )
  }

  const { conversationId, restatementMessageId, confirmedRestatement, userCorrection } = body
  const adminClient = createAdminClient()

  const { data: conv } = await adminClient
    .from('goblinai_conversations')
    .select('user_id')
    .eq('id', conversationId)
    .single()

  if (!conv || conv.user_id !== user.id) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const { data: restMsg } = await adminClient
    .from('goblinai_messages')
    .select('id, conversation_id')
    .eq('id', restatementMessageId)
    .eq('conversation_id', conversationId)
    .single()

  if (!restMsg) {
    return NextResponse.json({ error: 'Restatement message not found' }, { status: 404 })
  }

  const { data: userMsg } = await adminClient
    .from('goblinai_messages')
    .select('content, mentioned_card_ids')
    .eq('conversation_id', conversationId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!userMsg) {
    return NextResponse.json({ error: 'Original user message not found' }, { status: 404 })
  }

  const mentions: MentionedCardRef[] = (userMsg.mentioned_card_ids || []).map((id: string) => ({
    id,
    name: '',
  }))

  const ctx = await buildGoblinAIContext({
    message: userMsg.content,
    mentions,
  })

  const familyNumbers = ctx.rules.map((r) => r.rule_number)

  await adminClient
    .from('goblinai_messages')
    .update({ restatement_status: 'confirmed' })
    .eq('id', restatementMessageId)

  try {
    const prompt = buildFinalAnswerPrompt({
      confirmedRestatement,
      userCorrection,
      cards: ctx.cards.map((c) => ({
        name: c.name,
        mana_cost: c.mana_cost,
        type_line: c.type_line,
        oracle_text: c.oracle_text,
      })),
      rules: ctx.rules.map((r) => ({
        rule_number: r.rule_number,
        text: r.text,
      })),
      interactionKeywords: ctx.interactionKeywords,
    })

    const result = await generateGoblinAIText({
      system: FINAL_ANSWER_SYSTEM_PROMPT,
      prompt,
    })

    const { data: answerMsg } = await adminClient
      .from('goblinai_messages')
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: 'assistant',
        content: result.text,
        interaction_keywords: ctx.interactionKeywords,
        retrieved_rule_numbers: familyNumbers,
        retrieved_ruling_ids: ctx.rulings.map((r) => r.id),
        restatement_status: 'confirmed',
        model: 'deepseek-v4-flash',
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
      })
      .select('id')
      .single()
    await adminClient
      .from('goblinai_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId)

    return NextResponse.json({
      answer: result.text,
      interactionKeywords: ctx.interactionKeywords,
      mentionedCards: ctx.cards,
      usedRuleNumbers: familyNumbers,
      messageId: answerMsg?.id ?? null,
    })
  } catch (err) {
    if (err instanceof GoblinAINotConfiguredError) {
      return NextResponse.json(
        { error: 'GoblinAI is not configured' },
        { status: 503 },
      )
    }
    console.error('Answer generation failed:', err)
    return NextResponse.json(
      { error: 'Failed to generate answer' },
      { status: 500 },
    )
  }
}
