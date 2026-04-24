import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

interface Params {
  id: string
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<Params> },
) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const patch: {
    quantity?: number
    notes?: string | null
    acquired_price_eur?: number | null
  } = {}
  if (typeof body.quantity === 'number' && body.quantity >= 0) {
    patch.quantity = body.quantity
  }
  if (typeof body.notes === 'string' || body.notes === null) {
    patch.notes = body.notes
  }
  if (
    typeof body.acquired_price_eur === 'number' ||
    body.acquired_price_eur === null
  ) {
    patch.acquired_price_eur = body.acquired_price_eur
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // RLS scopes the update to the caller's rows, but we also match user_id
  // explicitly so a hostile id guess fails with a clean 404 rather than
  // the row simply not updating silently.
  const { data, error } = await supabase
    .from('user_cards')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, quantity, notes, acquired_price_eur')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/collection')
  return NextResponse.json({ item: data })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<Params> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('user_cards')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/collection')
  return NextResponse.json({ ok: true })
}
