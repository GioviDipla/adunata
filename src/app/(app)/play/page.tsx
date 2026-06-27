import { redirect } from 'next/navigation'
import Link from 'next/link'
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
      .order('updated_at', { ascending: false }),
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 bg-[#0D0D0D] min-h-screen">
      {/* HEADER BAR */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b-2 border-[#3A3A3A]">
        <h1 className="font-mono text-2xl font-bold tracking-widest uppercase text-[#E8E8E8]">[ OPERATIONS ]</h1>
        <span className="font-mono text-xs text-[#787878] tracking-wider">REV 2.7 // UNIT/D-01</span>
      </div>

      {/* {'>'} {'>'} {'>'} ACTIVE SORTIES */}
      <section className="mb-8">
        <h2 className="font-mono text-sm font-bold tracking-widest uppercase text-[#787878] mb-4">{'>'} {'>'} {'>'} ACTIVE SORTIES</h2>
        {hasActiveLobbies ? (
          <ActiveLobbiesList lobbies={activeLobbies} />
        ) : (
          <div className="border-2 border-dashed border-[#2A2A2A] bg-[#0D0D0D] p-8 text-center">
            <p className="font-mono text-sm text-[#787878] tracking-wider">NO ACTIVE SORTIES DETECTED</p>
            <p className="mt-2 font-mono text-xs text-[#555]">{'>'} {'>'} {'>'} INITIATE NEW OPERATION BELOW</p>
          </div>
        )}
      </section>

      <hr className="border-t-2 border-[#3A3A3A] my-8" />

      {/* {'>'} {'>'} {'>'} INITIATE OPERATION */}
      <section className="mb-8">
        <h2 className="font-mono text-sm font-bold tracking-widest uppercase text-[#787878] mb-4">{'>'} {'>'} {'>'} INITIATE OPERATION</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <CreateLobby decks={decks ?? []} />
          <JoinLobby decks={decks ?? []} />
        </div>
      </section>

      <hr className="border-t-2 border-[#3A3A3A] my-8" />

      {/* {'>'} {'>'} {'>'} INCOMING CHALLENGES */}
      <section className="mb-8">
        <h2 className="font-mono text-sm font-bold tracking-widest uppercase text-[#787878] mb-4">{'>'} {'>'} {'>'} INCOMING CHALLENGES</h2>
        <InvitationsPanel
          decks={decks ?? []}
          initialInvitations={
            (pendingInvites ?? []) as unknown as Parameters<
              typeof InvitationsPanel
            >[0]['initialInvitations']
          }
          userId={user.id}
        />
      </section>

      <hr className="border-t-2 border-[#3A3A3A] my-8" />

      {/* {'>'} {'>'} {'>'} MISSION LOG */}
      <section className="mb-8">
        <h2 className="font-mono text-sm font-bold tracking-widest uppercase text-[#787878] mb-4">{'>'} {'>'} {'>'} MISSION LOG</h2>
        <GameHistoryList games={gamesWithDetails} userId={user.id} />
      </section>

      <hr className="border-t-2 border-[#3A3A3A] my-8" />

      {/* {'>'} {'>'} {'>'} TOOLS */}
      <section className="mb-8">
        <h2 className="font-mono text-sm font-bold tracking-widest uppercase text-[#787878] mb-4">{'>'} {'>'} {'>'} TOOLS</h2>
        <Link
          href="/play/life-counter"
          className="flex items-center justify-between gap-3 border-2 border-[#2A2A2A] bg-[#141414] p-4 transition-colors hover:border-[#787878]"
        >
          <div className="flex items-center gap-3">
            <span className="font-mono text-lg text-[#FF2A2A]">[+]</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-[#E8E8E8] tracking-widest uppercase">LIFE COUNTER</span>
                <span className="font-mono text-[10px] text-[#4AF626] tracking-wider">// ACTIVE</span>
              </div>
              <p className="font-mono text-xs text-[#787878] mt-1">
                TRACK LIFE TOTALS DURING IN-PERSON GAMES
              </p>
            </div>
          </div>
          <span className="font-mono text-xs text-[#787878]">{'>'}</span>
        </Link>
      </section>
    </div>
  )
}
