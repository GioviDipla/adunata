import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceLimit, assistantLimiter, getClientId } from '@/lib/rate-limit'
import { buildGoblinAIContext } from '@/lib/goblinai/context-builder'
import { generateGoblinAIText, GoblinAINotConfiguredError } from '@/lib/goblinai/deepseek'
import { RESTATEMENT_SYSTEM_PROMPT, buildRestatementPrompt } from '@/lib/goblinai/prompts'
import type { MentionedCardRef } from '@/lib/goblinai/types'

const RESTATEMENT_REQUEST_SCHEMA = {
  validate: (body: unknown): body is { message: string; mentions: MentionedCardRef[]; conversationId?: string } => {
    if (!body || typeof body !== 'object') return false
    const b = body as Record<string, unknown>
    if (typeof b.message !== 'string' || !Array.isArray(b.mentions)) return false
    for (const m of b.mentions) {
      if (!m || typeof m !== 'object') return false
      const mention = m as Record<string, unknown>
      if (typeof mention.id !== 'string' || typeof mention.name !== 'string') return false
    }
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

  if (!RESTATEMENT_REQUEST_SCHEMA.validate(body)) {
    return NextResponse.json(
      { error: 'Request must include message (string) and mentions (array of {id, name})' },
      { status: 400 },
    )
  }

  const { message, mentions, conversationId } = body

  if (mentions.length === 0) {
    return NextResponse.json(
      { error: 'Use @mention for every card involved. Per domande su carte specifiche usa @mention per ogni carta coinvolta.' },
      { status: 400 },
    )
  }

  const ctx = await buildGoblinAIContext({ message, mentions })

  for (const m of mentions) {
    if (!ctx.cards.some((c) => c.id === m.id)) {
      return NextResponse.json(
        { error: `Mentioned card not found: ${m.name}` },
        { status: 404 },
      )
    }
  }

  const adminClient = createAdminClient()

  let convId = conversationId
  if (!convId) {
    const { data: conv } = await adminClient
      .from('goblinai_conversations')
      .insert({ user_id: user.id })
      .select('id')
      .single()
    if (conv) convId = conv.id
  }

  if (!convId) {
    return NextResponse.json(
      { error: 'Failed to create conversation' },
      { status: 500 },
    )
  }

  if (!ctx.requiresConfirmation) {
    return NextResponse.json({
      conversationId: convId,
      messageId: null,
      requiresConfirmation: false,
      restatement: '',
      assumptions: [],
      missingInfoQuestions: [],
      interactionKeywords: ctx.interactionKeywords,
      mentionedCards: ctx.cards,
      redirectTo: 'simple',
    })
  }

  try {
    const prompt = buildRestatementPrompt({
      message,
      cards: ctx.cards.map((c) => ({
        name: c.name,
        mana_cost: c.mana_cost,
        type_line: c.type_line,
        oracle_text: c.oracle_text,
      })),
    })

    const result = await generateGoblinAIText({
      system: RESTATEMENT_SYSTEM_PROMPT,
      prompt,
    })

    const { data: userMsg } = await adminClient
      .from('goblinai_messages')
      .insert({
        conversation_id: convId,
        user_id: user.id,
        role: 'user',
        content: message,
        mentioned_card_ids: mentions.map((m) => m.id),
        interaction_keywords: ctx.interactionKeywords,
        restatement_status: 'pending_confirmation',
      })
      .select('id')
      .single()

    const { data: restMsg } = await adminClient
      .from('goblinai_messages')
      .insert({
        conversation_id: convId,
        user_id: user.id,
        role: 'assistant',
        content: result.text,
        interaction_keywords: ctx.interactionKeywords,
        restatement_status: 'pending_confirmation',
        model: 'deepseek-v4-flash',
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
      })
      .select('id')
      .single()

    return NextResponse.json({
      conversationId: convId,
      messageId: restMsg?.id ?? null,
      requiresConfirmation: true,
      restatement: result.text,
      assumptions: [],
      missingInfoQuestions: [],
      interactionKeywords: ctx.interactionKeywords,
      mentionedCards: ctx.cards,
    })
  } catch (err) {
    if (err instanceof GoblinAINotConfiguredError) {
      return NextResponse.json(
        { error: 'GoblinAI is not configured' },
        { status: 503 },
      )
    }
    console.error('Restatement generation failed:', err)
    return NextResponse.json(
      { error: 'Failed to generate restatement' },
      { status: 500 },
    )
  }
}
