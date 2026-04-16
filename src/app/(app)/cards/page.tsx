import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import CardBrowser from '@/components/cards/CardBrowser'

export const metadata = {
  title: 'Card Database - Adunata!!!',
  description: 'Browse and search Magic: The Gathering cards',
}

export default async function CardsPage() {
  const supabase = await createClient()
  const user = await getAuthenticatedUser()

  const [{ data: initialCards }, { data: sets }, { data: userDecks }] = await Promise.all([
    supabase
      .from('cards')
      .select('*')
      .not('released_at', 'is', null)
      .order('released_at', { ascending: false })
      .limit(40),
    supabase
      .rpc('get_distinct_sets'),
    user
      ? supabase
          .from('decks')
          .select('id, name, format')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
      : Promise.resolve({ data: [] as { id: string; name: string; format: string }[] }),
  ])

  return (
    <div className="min-h-screen bg-bg-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-font-primary mb-6">Card Database</h1>
        <CardBrowser
          initialCards={initialCards || []}
          sets={(sets as { set_code: string; set_name: string; latest_release: string }[]) || []}
          userDecks={userDecks || []}
        />
      </div>
    </div>
  )
}
