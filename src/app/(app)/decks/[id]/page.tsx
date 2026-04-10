import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import DeckEditor from '@/components/deck/DeckEditor'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

interface DeckCardFromDB {
  id: string
  card_id: number
  quantity: number
  board: string
  created_at: string
  card: CardRow
}

export default async function DeckDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // Fetch deck metadata and deck_cards in parallel — neither depends on the other.
  // We still check ownership after the deck query returns.
  const [{ data: deck, error: deckError }, { data: deckCards }] = await Promise.all([
    supabase.from('decks').select('*').eq('id', id).single(),
    supabase
      .from('deck_cards')
      .select(`
        id,
        card_id,
        quantity,
        board,
        created_at,
        card:cards!card_id(*)
      `)
      .eq('deck_id', id),
  ])

  if (deckError || !deck) redirect('/decks')
  if (deck.user_id !== user.id) redirect('/decks')

  const formattedCards = ((deckCards ?? []) as unknown as DeckCardFromDB[])
    .filter((dc) => dc.card != null)
    .map((dc) => ({
      id: dc.id,
      card: dc.card,
      quantity: dc.quantity,
      board: dc.board,
    }))

  return <DeckEditor deck={deck} initialCards={formattedCards} />
}
