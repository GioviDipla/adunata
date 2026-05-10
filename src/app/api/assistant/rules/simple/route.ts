import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceLimit, assistantLimiter, getClientId } from '@/lib/rate-limit'
import { generateGoblinAIText, GoblinAINotConfiguredError } from '@/lib/goblinai/deepseek'
import { SIMPLE_RULE_SYSTEM_PROMPT } from '@/lib/goblinai/prompts'

const CARD_SPECIFIC_PATTERNS = /se\s+(ho|controllo|hai|possiedo|possiedi)\b|@\w/i

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const limited = await enforceLimit(assistantLimiter, getClientId(request, user.id))
  if (limited) return limited

  let body: { message?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  if (CARD_SPECIFIC_PATTERNS.test(body.message)) {
    return NextResponse.json(
      { error: 'Per domande su carte specifiche usa @mention per ogni carta coinvolta.' },
      { status: 400 },
    )
  }

  const adminClient = createAdminClient()

  const { data: conv } = await adminClient
    .from('goblinai_conversations')
    .insert({ user_id: user.id })
    .select('id')
    .single()

  const convId = conv?.id

  try {
    const result = await generateGoblinAIText({
      system: SIMPLE_RULE_SYSTEM_PROMPT,
      prompt: body.message,
    })

    if (convId) {
      await adminClient.from('goblinai_messages').insert([
        {
          conversation_id: convId,
          user_id: user.id,
          role: 'user',
          content: body.message,
        },
        {
          conversation_id: convId,
          user_id: user.id,
          role: 'assistant',
          content: result.text,
          model: 'deepseek-v4-flash',
          prompt_tokens: result.promptTokens,
          completion_tokens: result.completionTokens,
        },
      ])
    }

    return NextResponse.json({
      answer: result.text,
      conversationId: convId,
    })
  } catch (err) {
    if (err instanceof GoblinAINotConfiguredError) {
      return NextResponse.json(
        { error: 'GoblinAI is not configured' },
        { status: 503 },
      )
    }
    console.error('Simple rule generation failed:', err)
    return NextResponse.json(
      { error: 'Failed to generate answer' },
      { status: 500 },
    )
  }
}
