// src/app/api/notifications/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const unreadOnly = url.searchParams.get('unread_only') === 'true'
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 50)

  let query = supabase
    .from('notifications')
    .select('id, type, deck_id, actor_id, comment_id, read, created_at', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (unreadOnly) {
    query = query.eq('read', false)
  }

  const { data: rows, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Hydrate actors
  const actorIds = Array.from(new Set((rows ?? []).map(r => r.actor_id)))
  const actors = new Map<string, { id: string; username: string; display_name: string }>()
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name')
      .in('id', actorIds)
    for (const p of profiles ?? []) {
      actors.set(p.id, p)
    }
  }

  const notifications = (rows ?? []).map(r => ({
    id: r.id,
    type: r.type,
    deck_id: r.deck_id,
    actor: actors.get(r.actor_id) ?? null,
    comment_id: r.comment_id,
    read: r.read,
    created_at: r.created_at,
  }))

  const total = count ?? 0
  const hasMore = offset + limit < total

  return NextResponse.json({ notifications, has_more: hasMore })
}

export async function PATCH(_request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
