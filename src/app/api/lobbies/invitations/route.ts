import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * List the current user's pending invitations.
 *
 * Used as the fallback / initial-load path; Realtime keeps the UI
 * fresh after mount so this only needs to run once per page visit.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Profile join resolves sender name + username in one trip. RLS on
  // profiles is public-read, so the select composes cleanly.
  const { data, error } = await supabase
    .from('lobby_invitations')
    .select(`
      id, lobby_id, from_user_id, to_user_id, status, created_at,
      sender:profiles!from_user_id(username, display_name)
    `)
    .eq('to_user_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ invitations: data ?? [] })
}

