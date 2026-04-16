import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import PlayGame from '@/components/play/PlayGame'

export default async function GamePage({ params }: { params: Promise<{ lobbyId: string }> }) {
  const { lobbyId } = await params
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // Fetch lobby + player membership in parallel
  const [{ data: lobby }, { data: player }] = await Promise.all([
    supabase.from('game_lobbies').select('*').eq('id', lobbyId).single(),
    supabase
      .from('game_players')
      .select('id')
      .eq('lobby_id', lobbyId)
      .eq('user_id', user.id)
      .single(),
  ])

  if (!lobby || lobby.status !== 'playing') redirect('/play')
  if (!player) redirect('/play')

  return <PlayGame mode="multiplayer" lobbyId={lobbyId} userId={user.id} />
}
