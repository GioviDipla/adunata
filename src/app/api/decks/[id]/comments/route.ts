import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractMentions } from '@/lib/mentions'

const MAX_BODY = 2000

type AuthorRef = { id: string; username: string; display_name: string }

async function hydrateAuthors(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userIds: string[],
): Promise<Map<string, AuthorRef>> {
  const out = new Map<string, AuthorRef>()
  if (userIds.length === 0) return out
  const { data } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .in('id', userIds)
  for (const p of data ?? []) out.set(p.id, p as AuthorRef)
  return out
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: deckId } = await params
  const supabase = await createClient()

  const { data: rows, error } = await supabase
    .from('deck_comments')
    .select('id, deck_id, user_id, body, created_at, updated_at')
    .eq('deck_id', deckId)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id)))
  const authors = await hydrateAuthors(supabase, userIds)

  const comments = (rows ?? []).map((r) => ({
    ...r,
    author: authors.get(r.user_id) ?? null,
  }))

  return NextResponse.json({ comments })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: deckId } = await params
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
    .insert({ deck_id: deckId, user_id: user.id, body: raw })
    .select('id, deck_id, user_id, body, created_at, updated_at')
    .single()

  if (error || !row) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
  }

  const authors = await hydrateAuthors(supabase, [row.user_id])
  return NextResponse.json({ comment: { ...row, author: authors.get(row.user_id) ?? null } })
}
