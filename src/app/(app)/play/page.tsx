import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Heart } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import CreateLobby from '@/components/play/CreateLobby'
import JoinLobby from '@/components/play/JoinLobby'
import ActiveLobbiesList from '@/components/play/ActiveLobbiesList'
import GameHistoryList from '@/components/play/GameHistoryList'

export default async function PlayPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // Decks and game_players can be fetched in parallel — independent queries.
  // The final active-lobbies query depends on myPlayers, so it waits.
  const [{ data: decks }, { data: myPlayers }] = await Promise.all([
    supabase
      .from('decks')
      .select('id, name, format')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false }),
    supabase
      .from('game_players')
      .select('lobby_id')
      .eq('user_id', user.id),
  ])

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

  const finishedLobbies = lobbyIds.length > 0
    ? (await supabase
        .from('game_lobbies')
        .select('id, name, lobby_code, winner_id, updated_at')
        .in('id', lobbyIds)
        .eq('status', 'finished')
        .order('updated_at', { ascending: false })
        .limit(50)
      ).data ?? []
    : []

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-font-primary">Play</h1>

      {/* Life counter for in-person games */}
      <Link
        href="/play/life-counter"
        className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-surface p-4 transition-colors hover:bg-bg-hover"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-red/20">
            <Heart className="h-5 w-5 text-bg-red" />
          </div>
          <div>
            <div className="text-sm font-medium text-font-primary">Life Counter</div>
            <div className="text-xs text-font-muted">
              Conta i punti vita durante le partite dal vivo
            </div>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-font-muted" />
      </Link>

      {/* Active games */}
      <ActiveLobbiesList lobbies={activeLobbies} />

      <div className="grid gap-4 sm:grid-cols-2">
        <CreateLobby decks={decks ?? []} />
        <JoinLobby decks={decks ?? []} />
      </div>

      {/* Game history */}
      <GameHistoryList games={finishedLobbies} userId={user.id} />
    </div>
  )
}
