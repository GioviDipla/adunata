import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CreateLobby from '@/components/play/CreateLobby'
import JoinLobby from '@/components/play/JoinLobby'

export default async function PlayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get user's decks for deck selection
  const { data: decks } = await supabase
    .from('decks')
    .select('id, name, format')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  // Get active lobbies the user is in (two queries — types lack FK relationship)
  const { data: myPlayers } = await supabase
    .from('game_players')
    .select('lobby_id')
    .eq('user_id', user.id)

  const lobbyIds = myPlayers?.map((p) => p.lobby_id) ?? []

  const activeLobbies = lobbyIds.length > 0
    ? (await supabase
        .from('game_lobbies')
        .select('id, lobby_code, status, format, created_at')
        .in('id', lobbyIds)
        .in('status', ['waiting', 'playing'])
        .order('created_at', { ascending: false })
      ).data ?? []
    : []

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-font-primary">Play</h1>

      {/* Active games */}
      {activeLobbies.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-font-secondary">Active Games</h2>
          <div className="flex flex-col gap-2">
            {activeLobbies.map((lobby) => (
              <a
                key={lobby.id}
                href={lobby.status === 'playing' ? `/play/${lobby.id}/game` : `/play/${lobby.id}`}
                className="flex items-center justify-between rounded-xl border border-border bg-bg-card px-4 py-3 transition-colors hover:bg-bg-hover"
              >
                <div>
                  <span className="text-sm font-medium text-font-primary">Code: {lobby.lobby_code}</span>
                  <span className="ml-2 text-xs text-font-muted">{lobby.format}</span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  lobby.status === 'playing' ? 'bg-bg-green/20 text-bg-green' : 'bg-bg-yellow/20 text-bg-yellow'
                }`}>
                  {lobby.status === 'playing' ? 'In Game' : 'Waiting'}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <CreateLobby decks={decks ?? []} />
        <JoinLobby decks={decks ?? []} />
      </div>
    </div>
  )
}
