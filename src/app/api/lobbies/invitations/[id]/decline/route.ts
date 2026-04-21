import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Recipient declines a pending invitation. The sender's lobby stays
 * alive so they can invite someone else or cancel it themselves — we
 * don't delete it here. Intentional: a host may want to keep the
 * lobby open and invite a different player.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: invitation } = await supabase
    .from('lobby_invitations')
    .select('id, to_user_id, from_user_id, status')
    .eq('id', id)
    .single()
  if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  if (invitation.status !== 'pending') {
    return NextResponse.json({ error: `Invitation is ${invitation.status}` }, { status: 409 })
  }

  // Recipient flips to declined; sender flips to cancelled. Anyone
  // else → 403.
  let nextStatus: 'declined' | 'cancelled'
  if (invitation.to_user_id === user.id) nextStatus = 'declined'
  else if (invitation.from_user_id === user.id) nextStatus = 'cancelled'
  else return NextResponse.json({ error: 'Not your invitation' }, { status: 403 })

  const { error } = await supabase
    .from('lobby_invitations')
    .update({ status: nextStatus, responded_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, status: nextStatus })
}
