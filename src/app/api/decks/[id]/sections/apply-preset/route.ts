import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { PRESETS, type PresetKey } from '@/lib/deck/sectionPresets'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: deckId } = await params
  const body = await req.json().catch(() => ({}))
  const key: PresetKey = body.preset === 'commander' ? 'commander' : 'commander'
  const preset = PRESETS[key]

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('deck_sections')
    .select('id')
    .eq('deck_id', deckId)
    .limit(1)
  if (existing && existing.length > 0)
    return NextResponse.json(
      { error: 'deck already has sections' },
      { status: 400 },
    )

  const rows = preset.map((p, idx) => ({
    deck_id: deckId,
    name: p.name,
    color: p.color,
    position: idx,
  }))

  const { data, error } = await supabase
    .from('deck_sections')
    .insert(rows)
    .select('id, deck_id, name, position, color, is_collapsed, created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath(`/decks/${deckId}`)
  return NextResponse.json({ sections: data ?? [] })
}
