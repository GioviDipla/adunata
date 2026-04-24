import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/supabase'

type SectionUpdate = Database['public']['Tables']['deck_sections']['Update']

interface Params {
  id: string
  sectionId: string
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<Params> },
) {
  const { id: deckId, sectionId } = await params
  const body = await req.json().catch(() => ({}))
  const patch: SectionUpdate = {}
  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name || name.length > 60)
      return NextResponse.json({ error: 'invalid name' }, { status: 400 })
    patch.name = name
  }
  if (typeof body.color === 'string' || body.color === null) {
    patch.color =
      typeof body.color === 'string' && body.color.length <= 16
        ? body.color
        : null
  }
  if (typeof body.is_collapsed === 'boolean') patch.is_collapsed = body.is_collapsed
  if (typeof body.position === 'number') patch.position = body.position
  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('deck_sections')
    .update(patch)
    .eq('id', sectionId)
    .eq('deck_id', deckId)
    .select('id, deck_id, name, position, color, is_collapsed, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath(`/decks/${deckId}`)
  return NextResponse.json({ section: data })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<Params> },
) {
  const { id: deckId, sectionId } = await params
  const supabase = await createClient()
  const { error } = await supabase
    .from('deck_sections')
    .delete()
    .eq('id', sectionId)
    .eq('deck_id', deckId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath(`/decks/${deckId}`)
  return NextResponse.json({ ok: true })
}
