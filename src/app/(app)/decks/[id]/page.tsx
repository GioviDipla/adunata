import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import { CARD_DECK_COLUMNS, DECK_DETAIL_COLUMNS } from '@/lib/supabase/columns'
import DeckEditor from '@/components/deck/DeckEditor'
import DeckView from '@/components/deck/DeckView'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

interface DeckCardFromDB {
  id: string
  card_id: number
  quantity: number
  board: string
  is_foil: boolean
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

  const [{ data: deck, error: deckError }, { data: deckCards }] = await Promise.all([
    supabase.from('decks').select(DECK_DETAIL_COLUMNS).eq('id', id).single(),
    supabase
      .from('deck_cards')
      .select(`id, card_id, quantity, board, is_foil, created_at, card:cards!card_id(${CARD_DECK_COLUMNS})`)
      .eq('deck_id', id),
  ])

  if (deckError || !deck) notFound()

  const isOwner = deck.user_id === user.id
  const visibility = (deck.visibility as 'private' | 'public') ?? 'private'

  if (!isOwner && visibility !== 'public') notFound()

  const formattedCards = ((deckCards ?? []) as unknown as DeckCardFromDB[])
    .filter((dc) => dc.card != null)
    .map((dc) => ({
      id: dc.id,
      card: dc.card,
      quantity: dc.quantity,
      board: dc.board,
      isFoil: !!dc.is_foil,
    }))

  if (isOwner) {
    return <DeckEditor deck={deck} initialCards={formattedCards} />
  }

  // Visitor path: fetch the owner's profile for the "by @username" pill
  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('username, display_name')
    .eq('id', deck.user_id)
    .single()

  if (!ownerProfile) notFound()

  return (
    <DeckView
      deck={deck}
      cards={formattedCards}
      ownerUsername={ownerProfile.username}
      ownerDisplayName={ownerProfile.display_name}
      viewerId={user.id}
    />
  )
}
