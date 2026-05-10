import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  let body: { messageId?: string; correction?: string; originalAnswer?: string; context?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.messageId || !body.correction) {
    return NextResponse.json({ error: 'messageId and correction are required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('goblinai_feedback')
    .insert({
      message_id: body.messageId,
      user_id: user.id,
      correction: body.correction,
      original_answer: body.originalAnswer ?? '',
      conversation_context: body.context ?? null,
    })

  if (error) {
    console.error('Feedback save failed:', error)
    return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
