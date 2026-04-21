import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import { CARD_GRID_COLUMNS, DECK_PICKER_COLUMNS } from '@/lib/supabase/columns'
import CardBrowser from '@/components/cards/CardBrowser'
import type { Database } from '@/types/supabase'

type Card = Database['public']['Tables']['cards']['Row']
type SetInfo = { set_code: string; set_name: string; latest_release: string }

export const metadata = {
  title: 'Card Database - Adunata!!!',
  description: 'Browse and search Magic: The Gathering cards',
}

// Refetch the shared "Newest 40" + sets bundle on every request. A previous
// unstable_cache wrapper poisoned itself on transient Supabase errors — the
// fallback `data || []` was written into the cache and then served to every
// visitor until the 1h TTL expired. The queries are cheap enough (limit 40
// + a 34k-row GROUP BY through a stable index) to run inline.
async function getPublicCardsData(): Promise<{ initialCards: Card[]; sets: SetInfo[] }> {
  const admin = createAdminClient()
  const [cardsRes, setsRes] = await Promise.all([
    admin
      .from('cards')
      .select(CARD_GRID_COLUMNS)
      .not('released_at', 'is', null)
      .order('released_at', { ascending: false })
      .limit(40),
    admin.rpc('get_distinct_sets'),
  ])
  if (cardsRes.error) console.error('cards/page newest-40 failed:', cardsRes.error.message)
  if (setsRes.error) console.error('cards/page get_distinct_sets failed:', setsRes.error.message)
  return {
    initialCards: (cardsRes.data || []) as unknown as Card[],
    sets: (setsRes.data as SetInfo[]) || [],
  }
}

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
