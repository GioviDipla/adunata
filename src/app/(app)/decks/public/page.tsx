import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import PublicDeckBrowser, {
  type PublicDeck,
} from '@/components/decks/PublicDeckBrowser'

export const metadata = {
  title: 'Public Decks - Adunata!!!',
  description: 'Browse public Magic: The Gathering decks',
}

export default async function PublicDecksPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('search_public_decks', {
    p_name: '',
    p_creator: '',
    p_commander: '',
    p_colors: '',
    p_color_identity: '',
    p_cards: '',
    p_card_mode: 'and',
    p_format: '',
    p_limit: 10,
    p_offset: 0,
  })

  if (error) console.error('public decks initial fetch failed:', error.message)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold text-font-primary">Public Decks</h1>
      <PublicDeckBrowser initialDecks={(data ?? []) as unknown as PublicDeck[]} />
    </div>
  )
}
