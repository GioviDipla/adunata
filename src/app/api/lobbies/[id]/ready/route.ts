import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lobbyId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: player } = await supabase
    .from('game_players')
    .select('id, ready')
    .eq('lobby_id', lobbyId)
    .eq('user_id', user.id)
    .single()

  if (!player) return NextResponse.json({ error: 'Not in this lobby' }, { status: 404 })

  const { error } = await supabase
    .from('game_players')
    .update({ ready: !player.ready })
    .eq('id', player.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ready: !player.ready })
}
