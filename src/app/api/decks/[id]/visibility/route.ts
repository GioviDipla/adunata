import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
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

  if (visibility !== 'private' && visibility !== 'unlisted' && visibility !== 'public') {
    return NextResponse.json(
      { error: 'visibility must be "private", "unlisted" or "public"' },
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

  revalidatePath(`/decks/${deckId}`)
  revalidatePath('/decks')
  // Public-profile listing depends on visibility — refresh the owner's
  // username page so the deck (dis)appears immediately after the toggle.
  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()
  if (ownerProfile?.username) revalidatePath(`/u/${ownerProfile.username}`)
  return NextResponse.json({ visibility: data.visibility })
}
