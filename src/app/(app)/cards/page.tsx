import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import { CARD_GRID_COLUMNS, DECK_PICKER_COLUMNS } from '@/lib/supabase/columns'
import CardsPageTabs from '@/components/cards/CardsPageTabs'
import type { CollectionItem } from '@/components/collection/CollectionView'
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
    // Fastest possible initial paint: no released_at filter, no
    // composite sort. The pkey index on `id` (uuid) is sub-100ms and the
    // user lands on the page; they pick a sort/filter to refine. The
    // previous keyset query took 200-6000ms cold and timed out on warm
    // caches when paired with the slow sets RPC.
    admin
      .from('cards')
      .select(CARD_GRID_COLUMNS)
      .order('id', { ascending: false })
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

  const [publicData, { data: userDecks }, { data: likedRows }, collectionRes] = await Promise.all([
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
    user
      ? supabase
          .from('user_cards')
          .select(
            `id, quantity, foil, language, condition, acquired_price_eur,
             card:cards!card_id(id, scryfall_id, name, name_it, mana_cost, type_line, image_small, image_normal, cmc, rarity, set_code, color_identity, prices_eur, prices_usd, released_at)`,
            { count: 'exact' },
          )
          .eq('user_id', user.id)
          .order('acquired_at', { ascending: false })
          .range(0, 49)
      : Promise.resolve({ data: null, count: 0 }),
  ])

  const likedIds = (likedRows || []).map((r) => r.card_id)

  const collection = user
    ? {
        initialItems: ((collectionRes.data ?? []) as unknown as CollectionItem[]).filter(
          (r) => r.card != null,
        ),
        total: collectionRes.count ?? 0,
      }
    : undefined

  return (
    <div className="min-h-screen bg-bg-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-font-primary mb-6">Card Database</h1>
        <CardsPageTabs
          initialCards={publicData.initialCards}
          sets={publicData.sets}
          userDecks={userDecks || []}
          initialLikedIds={likedIds}
          authed={!!user}
          collection={collection}
        />
      </div>
    </div>
  )
}
