import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: deckId } = await params
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('deck_sections')
    .select('id, deck_id, name, position, color, is_collapsed, created_at')
    .eq('deck_id', deckId)
    .order('position', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sections: data ?? [] })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: deckId } = await params
  const body = await req.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const color =
    typeof body.color === 'string' && body.color.length <= 16 ? body.color : null
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (name.length > 60)
    return NextResponse.json({ error: 'name too long' }, { status: 400 })

  const supabase = await createClient()

  const { data: last } = await supabase
    .from('deck_sections')
    .select('position')
    .eq('deck_id', deckId)
    .order('position', { ascending: false })
    .limit(1)
  const nextPos = (last?.[0]?.position ?? -1) + 1

  const { data, error } = await supabase
    .from('deck_sections')
    .insert({ deck_id: deckId, name, color, position: nextPos })
    .select('id, deck_id, name, position, color, is_collapsed, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath(`/decks/${deckId}`)
  return NextResponse.json({ section: data })
}
