import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Heart, Swords } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import CreateLobby from '@/components/play/CreateLobby'
import JoinLobby from '@/components/play/JoinLobby'
import ActiveLobbiesList from '@/components/play/ActiveLobbiesList'
import GameHistoryList from '@/components/play/GameHistoryList'
import InvitationsPanel from '@/components/play/invitations/InvitationsPanel'

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

export default async function PlayPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // Decks, game_players, and incoming invitations fire in parallel —
  // all independent. The active-lobbies query depends on myPlayers, so
  // it still waits below.
  const [{ data: decks }, { data: myPlayers }, { data: pendingInvites }] = await Promise.all([
    supabase
      .from('decks')
      .select('id, name, format')
      .eq('user_id', user.id)
      .order('name', { ascending: true }),
    supabase
      .from('game_players')
      .select('lobby_id')
      .eq('user_id', user.id),
    supabase
      .from('lobby_invitations')
      .select(`
        id, lobby_id, from_user_id, to_user_id, status, created_at,
        sender:profiles!from_user_id(username, display_name)
      `)
      .eq('to_user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  ])

  const lobbyIds = myPlayers?.map((p) => p.lobby_id) ?? []

  const activeLobbies = lobbyIds.length > 0
    ? (await supabase
        .from('game_lobbies')
        .select('id, name, lobby_code, status, format, host_user_id, created_at')
        .in('id', lobbyIds)
        .in('status', ['waiting', 'playing'])
        .order('created_at', { ascending: false })
      ).data ?? []
    : []

  // Fetch finished lobbies with format included
  const finishedLobbies = lobbyIds.length > 0
    ? (await supabase
        .from('game_lobbies')
        .select('id, name, lobby_code, format, winner_id, updated_at')
        .in('id', lobbyIds)
        .eq('status', 'finished')
        .order('updated_at', { ascending: false })
        .limit(50)
      ).data ?? []
    : []

  // Enrich finished lobbies with opponent name and user's deck name
  const finishedLobbyIds = finishedLobbies.map((g) => g.id)
  let gamesWithDetails: Array<
    (typeof finishedLobbies)[0] & { opponentName: string; myDeckName: string }
  > = []

  if (finishedLobbyIds.length > 0) {
    const { data: allGamePlayers } = await supabase
      .from('game_players')
      .select('lobby_id, user_id, deck_id')
      .in('lobby_id', finishedLobbyIds)

    const opponentUserIds = new Set<string>()
    const userDeckIds = new Map<string, string>() // lobby_id -> deck_id
    for (const gp of allGamePlayers ?? []) {
      if (gp.user_id !== user.id) {
        opponentUserIds.add(gp.user_id)
      } else {
        userDeckIds.set(gp.lobby_id, gp.deck_id)
      }
    }

    // Batch fetch opponent profiles
    const opponentIdsArr = [...opponentUserIds]
    const { data: opponentProfiles } = opponentIdsArr.length > 0
      ? await supabase
          .from('profiles')
          .select('id, display_name, username')
          .in('id', opponentIdsArr)
      : { data: [] }

    // Batch fetch user's deck names
    const deckIdsArr = [...new Set([...userDeckIds.values()])]
    const { data: userDecks } = deckIdsArr.length > 0
      ? await supabase
          .from('decks')
          .select('id, name')
          .in('id', deckIdsArr)
      : { data: [] }

    const profileMap = new Map(opponentProfiles?.map((p) => [p.id, p]) ?? [])
    const deckNameMap = new Map(userDecks?.map((d) => [d.id, d.name]) ?? [])

    gamesWithDetails = finishedLobbies.map((game) => {
      const opponentPlayer = allGamePlayers?.find(
        (gp) => gp.lobby_id === game.id && gp.user_id !== user.id,
      )
      const opponentProfile = opponentPlayer
        ? profileMap.get(opponentPlayer.user_id)
        : null
      const myPlayer = allGamePlayers?.find(
        (gp) => gp.lobby_id === game.id && gp.user_id === user.id,
      )
      const myDeckName = myPlayer?.deck_id
        ? deckNameMap.get(myPlayer.deck_id)
        : null

      return {
        ...game,
        opponentName:
          opponentProfile?.display_name || opponentProfile?.username || 'Unknown',
        myDeckName: myDeckName ?? 'Unknown Deck',
      }
    })
  }

  const hasActiveLobbies = activeLobbies.length > 0
  const hasFinishedGames = gamesWithDetails.length > 0

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-font-primary">Play</h1>

      {/* Quick Play — Create or join a lobby */}
      <section id="quick-play" className="mb-6">
        <h2 className="mb-3 text-lg font-semibold text-font-primary">
          Quick Play
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <CreateLobby decks={decks ?? []} />
          <JoinLobby decks={decks ?? []} />
        </div>
      </section>

      {/* Active games */}
      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-font-secondary">
          Active Games
        </h2>
        {hasActiveLobbies ? (
          <ActiveLobbiesList lobbies={activeLobbies} />
        ) : (
          <div className="rounded-xl border border-border bg-bg-card p-6 text-center">
            <Swords className="mx-auto h-8 w-8 text-font-muted" />
            <p className="mt-2 text-sm text-font-secondary">
              No active games. Create a lobby or join one with a code.
            </p>
          </div>
        )}
      </section>

      {/* 1v1 invitations — challenge a community member + incoming list */}
      <div className="mb-6">
        <InvitationsPanel
          decks={decks ?? []}
          initialInvitations={
            (pendingInvites ?? []) as unknown as Parameters<
              typeof InvitationsPanel
            >[0]['initialInvitations']
          }
          userId={user.id}
        />
      </div>

      {/* Game History */}
      <section className="mb-6">
        {hasFinishedGames ? (
          <GameHistoryList games={gamesWithDetails} userId={user.id} />
        ) : (
          <div className="rounded-xl border border-border bg-bg-card p-6 text-center">
            <Swords className="mx-auto h-8 w-8 text-font-muted" />
            <p className="mt-2 text-sm text-font-secondary">
              No finished games yet. Your completed matches will appear here.
            </p>
          </div>
        )}
      </section>

      {/* Tools — utilities for in-person play */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-font-primary">Tools</h2>
        <Link
          href="/play/life-counter"
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-surface p-4 transition-colors hover:bg-bg-hover"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-red/20">
              <Heart className="h-5 w-5 text-bg-red" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-font-primary">
                  Life Counter
                </span>
                <span className="rounded-full bg-bg-yellow/20 px-2 py-0.5 text-[10px] font-bold text-bg-yellow">
                  BETA
                </span>
              </div>
              <p className="text-xs text-font-muted">
                Track life totals during in-person games
              </p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-font-muted" />
        </Link>
      </section>
    </div>
  )
}
