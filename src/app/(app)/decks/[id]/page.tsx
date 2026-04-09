import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch deck
  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .select('*')
    .eq('id', id)
    .single()

  if (deckError || !deck) {
    redirect('/decks')
  }

  // Check ownership
  if (deck.user_id !== user.id) {
    redirect('/decks')
  }

  // Fetch deck cards with card data
  const { data: deckCards } = await supabase
    .from('deck_cards')
    .select(`
      id,
      card_id,
      quantity,
      board,
      created_at,
      card:cards!card_id(*)
    `)
    .eq('deck_id', id)

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
