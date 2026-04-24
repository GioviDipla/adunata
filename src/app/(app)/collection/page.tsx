import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CollectionView, {
  type CollectionItem,
} from '@/components/collection/CollectionView'

// Server Component — auth-protected; streams first 50 rows to the client
// component which handles virtualized rendering + pagination.
export default async function CollectionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, count } = await supabase
    .from('user_cards')
    .select(
      `id, quantity, foil, language, condition, acquired_price_eur,
       card:cards!card_id(id, name, name_it, mana_cost, type_line, image_small, image_normal, cmc, rarity, set_code, color_identity, prices_eur, prices_usd)`,
      { count: 'exact' },
    )
    .eq('user_id', user.id)
    .order('acquired_at', { ascending: false })
    .range(0, 49)

  const initial = ((data ?? []) as unknown as CollectionItem[]).filter(
    (r) => r.card != null,
  )
  return <CollectionView initialItems={initial} total={count ?? 0} />
}
