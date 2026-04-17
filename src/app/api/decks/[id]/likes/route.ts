import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: deckId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { count, error } = await supabase
    .from('deck_likes')
    .select('deck_id', { count: 'exact', head: true })
    .eq('deck_id', deckId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let likedByMe = false
  if (user) {
    const { data: mine } = await supabase
      .from('deck_likes')
      .select('deck_id')
      .eq('deck_id', deckId)
      .eq('user_id', user.id)
      .maybeSingle()
    likedByMe = !!mine
  }

  return NextResponse.json({ count: count ?? 0, liked_by_me: likedByMe })
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: deckId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: existing } = await supabase
    .from('deck_likes')
    .select('deck_id')
    .eq('deck_id', deckId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('deck_likes')
      .delete()
      .eq('deck_id', deckId)
      .eq('user_id', user.id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else {
    const { error } = await supabase
      .from('deck_likes')
      .insert({ deck_id: deckId, user_id: user.id })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  const { count } = await supabase
    .from('deck_likes')
    .select('deck_id', { count: 'exact', head: true })
    .eq('deck_id', deckId)

  return NextResponse.json({ count: count ?? 0, liked_by_me: !existing })
}
