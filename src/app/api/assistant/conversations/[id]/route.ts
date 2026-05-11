import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const { data: conv } = await supabase
    .from('goblinai_conversations')
    .select('id')
    .eq('id', id)
    .single()

  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabase.from('goblinai_conversations').delete().eq('id', id)

  return new NextResponse(null, { status: 204 })
}
