import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: deckId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as { visibility?: string }
  const visibility = body.visibility

  if (visibility !== 'private' && visibility !== 'public') {
    return NextResponse.json(
      { error: 'visibility must be "private" or "public"' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('decks')
    .update({ visibility })
    .eq('id', deckId)
    .eq('user_id', user.id)
    .select('id, visibility')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
  }

  return NextResponse.json({ visibility: data.visibility })
}
