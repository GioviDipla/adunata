import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractMentions } from '@/lib/mentions'

const MAX_BODY = 2000

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: commentId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = (await request.json().catch(() => null)) as { body?: unknown } | null
  const raw = typeof payload?.body === 'string' ? payload.body.trim() : ''
  if (!raw || raw.length > MAX_BODY) {
    return NextResponse.json({ error: `Body must be 1-${MAX_BODY} characters` }, { status: 400 })
  }

  const mentions = extractMentions(raw)
  if (mentions.length > 0) {
    const ids = mentions.map((m) => m.cardId)
    const { data: found } = await supabase
      .from('cards')
      .select('id')
      .in('id', ids as unknown as number[])
    const foundIds = new Set((found ?? []).map((c) => c.id as unknown as string))
    if (foundIds.size !== ids.length) {
      return NextResponse.json({ error: 'Invalid card mention' }, { status: 400 })
    }
  }

  const { data: row, error } = await supabase
    .from('deck_comments')
    .update({ body: raw })
    .eq('id', commentId)
    .eq('user_id', user.id)
    .select('id, deck_id, user_id, body, created_at, updated_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!row) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .eq('id', row.user_id)
    .maybeSingle()

  return NextResponse.json({ comment: { ...row, author: profile ?? null } })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: commentId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('deck_comments')
    .delete()
    .eq('id', commentId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
