import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Toggle a like on a card for the current user.
 * Returns `{ liked: boolean }` reflecting the post-toggle state.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: cardId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: existing } = await supabase
    .from('card_likes')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('card_id', cardId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('card_likes')
      .delete()
      .eq('user_id', user.id)
      .eq('card_id', cardId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ liked: false })
  }

  const { error } = await supabase
    .from('card_likes')
    .insert({ user_id: user.id, card_id: cardId })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ liked: true })
}
