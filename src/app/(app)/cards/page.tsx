import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import { CARD_GRID_COLUMNS, DECK_PICKER_COLUMNS } from '@/lib/supabase/columns'
import CardBrowser from '@/components/cards/CardBrowser'
import type { Database } from '@/types/supabase'

type Card = Database['public']['Tables']['cards']['Row']

export const metadata = {
  title: 'Card Database - Adunata!!!',
  description: 'Browse and search Magic: The Gathering cards',
}

/**
 * Shared across users — "Newest 40" + the distinct sets list both change
 * on a cadence of hours, so we pin them behind Next's data cache with a
 * tag and let ISR-style revalidation serve the warm copy.
 *
 * Must use the admin client here: the SSR client reads auth cookies and
 * Next.js forbids cookies() inside unstable_cache. Everything fetched
 * here is public catalog data, so bypassing RLS via service role is
 * semantically equivalent and safe.
 */
const getPublicCardsData = unstable_cache(
  async () => {
    const admin = createAdminClient()
    const [{ data: initialCards }, { data: sets }] = await Promise.all([
      admin
        .from('cards')
        .select(CARD_GRID_COLUMNS)
        .not('released_at', 'is', null)
        .order('released_at', { ascending: false })
        .limit(40),
      admin.rpc('get_distinct_sets'),
    ])
    return {
      initialCards: (initialCards || []) as unknown as Card[],
      sets: (sets as { set_code: string; set_name: string; latest_release: string }[]) || [],
    }
  },
  ['cards-page-public'],
  { revalidate: 3600, tags: ['cards', 'sets'] }
)

export default async function CardsPage() {
  const supabase = await createClient()
  const user = await getAuthenticatedUser()

  const [publicData, { data: userDecks }, { data: likedRows }] = await Promise.all([
    getPublicCardsData(),
    user
      ? supabase
          .from('decks')
          .select(DECK_PICKER_COLUMNS)
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
      : Promise.resolve({ data: [] as { id: string; name: string; format: string }[] }),
    user
      ? supabase
          .from('card_likes')
          .select('card_id')
          .eq('user_id', user.id)
      : Promise.resolve({ data: [] as { card_id: string }[] }),
  ])

  const likedIds = (likedRows || []).map((r) => r.card_id)

  return (
    <div className="min-h-screen bg-bg-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-font-primary mb-6">Card Database</h1>
        <CardBrowser
          initialCards={publicData.initialCards}
          sets={publicData.sets}
          userDecks={userDecks || []}
          initialLikedIds={likedIds}
        />
      </div>
    </div>
  )
}
