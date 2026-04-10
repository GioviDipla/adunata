import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
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
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // Fetch deck metadata and deck_cards in parallel
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
      .eq('deck_id', id)
      .in('board', ['main', 'commander']),
  ])

  if (deckError || !deck) redirect('/decks')
  if (deck.user_id !== user.id) redirect('/decks')

  // Separate commander from main deck
  const commanders: CardRow[] = []
  const fullDeck: CardRow[] = []
  for (const dc of (deckCards ?? []) as unknown as DeckCardFromDB[]) {
    if (!dc.card) continue
    if (dc.board === 'commander') {
      commanders.push(dc.card)
    } else {
      for (let i = 0; i < dc.quantity; i++) {
        fullDeck.push(dc.card)
      }
    }
  }

  if (fullDeck.length === 0 && commanders.length === 0) {
    redirect(`/decks/${id}`)
  }

  return <GoldfishGame deckName={deck.name} deckId={id} fullDeck={fullDeck} commanders={commanders} />
}
