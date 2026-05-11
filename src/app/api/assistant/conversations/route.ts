import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const { data: conversations } = await supabase
    .from('goblinai_conversations')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ conversations: conversations ?? [] })
}
