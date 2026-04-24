import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

function sanitize(v: unknown): string[] {
  return (Array.isArray(v) ? v : [])
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 40)
    .slice(0, 20)
}

/** Body:
 * { deckCardIds: string[], addTags?: string[], removeTags?: string[], setTags?: string[] }
 * If `setTags` is provided (even as []), tags are replaced wholesale.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: deckId } = await params
  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.deckCardIds)
    ? body.deckCardIds.filter((s: unknown) => typeof s === 'string').slice(0, 500)
    : []
  if (ids.length === 0)
    return NextResponse.json({ error: 'deckCardIds required' }, { status: 400 })

  const hasSet = body.setTags !== undefined && Array.isArray(body.setTags)
  const add = sanitize(body.addTags)
  const remove = sanitize(body.removeTags)
  const set = sanitize(body.setTags)

  const supabase = await createClient()

  if (hasSet) {
    const { error } = await supabase
      .from('deck_cards')
      .update({ tags: set })
      .in('id', ids)
      .eq('deck_id', deckId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    if (add.length === 0 && remove.length === 0)
      return NextResponse.json(
        { error: 'nothing to change' },
        { status: 400 },
      )

    const { data: current, error: fetchErr } = await supabase
      .from('deck_cards')
      .select('id, tags')
      .in('id', ids)
      .eq('deck_id', deckId)
    if (fetchErr)
      return NextResponse.json({ error: fetchErr.message }, { status: 500 })

    for (const row of current ?? []) {
      const existing = new Set<string>((row.tags as string[] | null) ?? [])
      for (const t of add) existing.add(t)
      for (const t of remove) existing.delete(t)
      const next = Array.from(existing).slice(0, 20)
      const { error } = await supabase
        .from('deck_cards')
        .update({ tags: next })
        .eq('id', row.id)
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  revalidatePath(`/decks/${deckId}`)
  return NextResponse.json({ ok: true })
}
