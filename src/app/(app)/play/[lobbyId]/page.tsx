import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import WaitingRoom from '@/components/play/WaitingRoom'

export default async function LobbyPage({ params }: { params: Promise<{ lobbyId: string }> }) {
  const { lobbyId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: lobby } = await supabase.from('game_lobbies').select('*').eq('id', lobbyId).single()
  if (!lobby) redirect('/play')
  if (lobby.status === 'playing') redirect(`/play/${lobbyId}/game`)

  const { data: players } = await supabase
    .from('game_players')
    .select('user_id, deck_id, ready, seat_position')
    .eq('lobby_id', lobbyId)
    .order('seat_position')

  const isHost = lobby.host_user_id === user.id
  const isInLobby = players?.some((p) => p.user_id === user.id) ?? false
  if (!isInLobby) redirect('/play')

  return <WaitingRoom lobby={lobby} players={players ?? []} userId={user.id} isHost={isHost} />
}
