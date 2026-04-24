import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { categorize } from '@/lib/deck/categorize'

interface DeckCardWithCard {
  id: string
  board: string
  section_id: string | null
  card: {
    type_line: string | null
    oracle_text: string | null
    produced_mana: string[] | null
    keywords: string[] | null
  } | null
}

interface SectionRow {
  id: string
  name: string
}

/**
 * POST body: { overwrite?: boolean }
 * - overwrite=false (default): only re-assigns deck_cards with section_id=null.
 * - overwrite=true: re-categorizes every deck_card (even already-assigned).
 *
 * Cards are matched against the deck's existing sections by name
 * (case-insensitive). Sections that the deck doesn't have are skipped — the
 * card stays in its current section (or null). Use the Commander preset
 * before auto-assign to populate a full vocabulary.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: deckId } = await params
  const body = await req.json().catch(() => ({}))
  const overwrite = body.overwrite === true

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: deck } = await supabase
    .from('decks')
    .select('id')
    .eq('id', deckId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!deck) return NextResponse.json({ error: 'deck not found' }, { status: 404 })

  const [sectionsRes, cardsRes] = await Promise.all([
    supabase
      .from('deck_sections')
      .select('id, name')
      .eq('deck_id', deckId),
    supabase
      .from('deck_cards')
      .select(
        `id, board, section_id,
         card:cards!card_id(type_line, oracle_text, produced_mana, keywords)`,
      )
      .eq('deck_id', deckId),
  ])

  if (sectionsRes.error)
    return NextResponse.json({ error: sectionsRes.error.message }, { status: 500 })
  if (cardsRes.error)
    return NextResponse.json({ error: cardsRes.error.message }, { status: 500 })

  const sections = (sectionsRes.data ?? []) as SectionRow[]
  if (sections.length === 0)
    return NextResponse.json(
      { error: 'no sections — apply preset or add sections first' },
      { status: 400 },
    )

  const sectionByName = new Map<string, string>()
  for (const s of sections) sectionByName.set(s.name.toLowerCase(), s.id)

  const cards = (cardsRes.data ?? []) as unknown as DeckCardWithCard[]
  const filtered = cards.filter((c) => c.card != null)

  let assigned = 0
  let skipped = 0
  const updates: Array<{ id: string; section_id: string }> = []
  for (const dc of filtered) {
    if (!overwrite && dc.section_id != null) {
      skipped++
      continue
    }
    if (!dc.card) {
      skipped++
      continue
    }
    const category = categorize(dc.card, dc.board)
    const targetSectionId = category
      ? sectionByName.get(category.toLowerCase())
      : undefined
    if (!targetSectionId) {
      skipped++
      continue
    }
    if (dc.section_id === targetSectionId) {
      skipped++
      continue
    }
    const { error } = await supabase
      .from('deck_cards')
      .update({ section_id: targetSectionId })
      .eq('id', dc.id)
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    assigned++
    updates.push({ id: dc.id, section_id: targetSectionId })
  }

  revalidatePath(`/decks/${deckId}`)
  return NextResponse.json({
    assigned,
    skipped,
    total: filtered.length,
    updates,
  })
}
