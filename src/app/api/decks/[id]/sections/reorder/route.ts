import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

interface Item {
  id: string
  position: number
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: deckId } = await params
  const body = await req.json().catch(() => ({}))
  const raw = Array.isArray(body.items) ? body.items : null
  if (!raw) return NextResponse.json({ error: 'items required' }, { status: 400 })

  const items: Item[] = raw
    .filter(
      (it: unknown): it is Item =>
        typeof it === 'object' &&
        it !== null &&
        typeof (it as Item).id === 'string' &&
        typeof (it as Item).position === 'number',
    )
    .slice(0, 200)

  if (items.length === 0)
    return NextResponse.json({ error: 'no valid items' }, { status: 400 })

  const supabase = await createClient()
  const results = await Promise.all(
    items.map((it) =>
      supabase
        .from('deck_sections')
        .update({ position: it.position })
        .eq('id', it.id)
        .eq('deck_id', deckId),
    ),
  )
  const firstError = results.find((r) => r.error)
  if (firstError?.error)
    return NextResponse.json({ error: firstError.error.message }, { status: 500 })

  revalidatePath(`/decks/${deckId}`)
  return NextResponse.json({ ok: true })
}
