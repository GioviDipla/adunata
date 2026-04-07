import { createClient } from '@/lib/supabase/server'
import CardBrowser from '@/components/cards/CardBrowser'

export const metadata = {
  title: 'Card Database - The Gathering',
  description: 'Browse and search Magic: The Gathering cards',
}

export default async function CardsPage() {
  const supabase = await createClient()

  const { data: initialCards } = await supabase
    .from('cards')
    .select('*')
    .order('name', { ascending: true })
    .limit(40)

  return (
    <div className="min-h-screen bg-bg-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-font-primary mb-6">Card Database</h1>
        <CardBrowser initialCards={initialCards || []} />
      </div>
    </div>
  )
}
