import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GoldfishGame from '@/components/goldfish/GoldfishGame'
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

export default async function GoldfishPage({
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

  // Fetch deck cards with card data (mainboard only for goldfish)
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
    .eq('board', 'main')

  // Expand quantity: 4x Lightning Bolt = 4 entries in the array
  const fullDeck: CardRow[] = []
  for (const dc of (deckCards ?? []) as unknown as DeckCardFromDB[]) {
    for (let i = 0; i < dc.quantity; i++) {
      fullDeck.push(dc.card)
    }
  }

  if (fullDeck.length === 0) {
    redirect(`/decks/${id}`)
  }

  return <GoldfishGame deckName={deck.name} deckId={id} fullDeck={fullDeck} />
}
