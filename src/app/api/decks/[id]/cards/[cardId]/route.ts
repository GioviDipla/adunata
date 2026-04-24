import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/supabase'

type DeckCardUpdate = Database['public']['Tables']['deck_cards']['Update']

interface Params {
  id: string
  cardId: string
}

function sanitizeTags(v: unknown): string[] {
  return (Array.isArray(v) ? v : [])
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 40)
    .slice(0, 20)
}

/** `cardId` in the URL is treated as `deck_cards.id`, not the card's own id. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<Params> },
) {
  const { id: deckId, cardId: deckCardId } = await params
  const body = await req.json().catch(() => ({}))
  const patch: DeckCardUpdate = {}
  if ('section_id' in body) {
    patch.section_id =
      typeof body.section_id === 'string' && body.section_id.length > 0
        ? body.section_id
        : null
  }
  if ('tags' in body) patch.tags = sanitizeTags(body.tags)
  if (
    'position_in_section' in body &&
    (typeof body.position_in_section === 'number' ||
      body.position_in_section === null)
  )
    patch.position_in_section = body.position_in_section

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('deck_cards')
    .update(patch)
    .eq('id', deckCardId)
    .eq('deck_id', deckId)
    .select(
      'id, deck_id, card_id, quantity, board, is_foil, section_id, tags, position_in_section, created_at',
    )
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath(`/decks/${deckId}`)
  return NextResponse.json({ card: data })
}
