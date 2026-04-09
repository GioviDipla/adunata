import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PlayGame from '@/components/play/PlayGame'

export default async function GamePage({ params }: { params: Promise<{ lobbyId: string }> }) {
  const { lobbyId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: lobby } = await supabase.from('game_lobbies').select('*').eq('id', lobbyId).single()
  if (!lobby || lobby.status !== 'playing') redirect('/play')

  const { data: player } = await supabase.from('game_players').select('id').eq('lobby_id', lobbyId).eq('user_id', user.id).single()
  if (!player) redirect('/play')

  return <PlayGame lobbyId={lobbyId} userId={user.id} />
}
