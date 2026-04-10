import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Layers } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import { initialColor, initialsOf } from '@/lib/utils/user'
import ProfileStats from '@/components/users/ProfileStats'

interface ProfileStatsRow {
  public_deck_count: number
  total_deck_count: number
  favorite_format: string | null
  color_frequencies: Record<string, number>
  latest_commander: { id: string; name: string; image_small: string | null; image_normal: string | null } | null
  most_used_card: { id: string; name: string; image_small: string | null } | null
  unique_cards_count: number
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, created_at')
    .eq('username', username)
    .single()

  if (!profile) notFound()

  const isSelf = profile.id === user.id

  const [{ data: statsRows }, { data: publicDecks }] = await Promise.all([
    supabase.rpc('get_profile_stats', { p_username: username }),
    supabase
      .from('decks')
      .select('id, name, format, updated_at, visibility')
      .eq('user_id', profile.id)
      .eq('visibility', 'public')
      .order('updated_at', { ascending: false }),
  ])

  const stats = ((statsRows ?? []) as ProfileStatsRow[])[0] ?? {
    public_deck_count: 0,
    total_deck_count: 0,
    favorite_format: null,
    color_frequencies: {},
    latest_commander: null,
    most_used_card: null,
    unique_cards_count: 0,
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-font-white"
          style={{ backgroundColor: initialColor(profile.username) }}
        >
          {initialsOf(profile.display_name)}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-font-primary">
            {profile.display_name}
          </h1>
          <p className="text-sm text-font-muted">@{profile.username}</p>
          {profile.bio && (
            <p className="mt-2 text-sm text-font-secondary">{profile.bio}</p>
          )}
          <p className="mt-2 text-xs text-font-muted">
            Joined {new Date(profile.created_at).toLocaleDateString()}
          </p>
        </div>
        {isSelf && (
          <Link
            href="/profile"
            className="self-start rounded-lg border border-border bg-bg-surface px-3 py-1.5 text-xs font-medium text-font-secondary transition-colors hover:bg-bg-hover"
          >
            Edit profile
          </Link>
        )}
      </div>

      {/* Stats */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-font-secondary">
          Statistics
        </h2>
        <ProfileStats
          publicDeckCount={stats.public_deck_count}
          totalDeckCount={stats.total_deck_count}
          favoriteFormat={stats.favorite_format}
          colorFrequencies={stats.color_frequencies}
          latestCommander={stats.latest_commander}
          mostUsedCard={stats.most_used_card}
          uniqueCardsCount={stats.unique_cards_count}
          isSelf={isSelf}
        />
      </section>

      {/* Public decks */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-font-secondary">
          Public decks ({publicDecks?.length ?? 0})
        </h2>
        {!publicDecks || publicDecks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-bg-card p-8 text-center">
            <Layers className="mx-auto h-10 w-10 text-font-muted" />
            <p className="mt-3 text-sm text-font-muted">
              {isSelf ? 'Toggle one of your decks to public to see it here.' : 'No public decks yet.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {publicDecks.map((deck) => (
              <Link
                key={deck.id}
                href={`/decks/${deck.id}`}
                className="rounded-xl border border-border bg-bg-surface p-4 transition-colors hover:border-border-light hover:bg-bg-hover"
              >
                <p className="truncate text-sm font-semibold text-font-primary">
                  {deck.name}
                </p>
                <p className="text-xs text-font-muted">
                  {deck.format} · Updated{' '}
                  {new Date(deck.updated_at).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
