import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: deckId } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('deck_tokens').select('*').eq('deck_id', deckId).order('created_at')
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: deckId } = await params
  const supabase = await createClient()
  const body = await request.json()
  const { data, error } = await supabase.from('deck_tokens').insert({ ...body, deck_id: deckId }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: deckId } = await params
  const supabase = await createClient()
  const { tokenId } = await request.json()
  await supabase.from('deck_tokens').delete().eq('id', tokenId).eq('deck_id', deckId)
  return NextResponse.json({ ok: true })
}
