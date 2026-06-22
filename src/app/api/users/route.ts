import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Paginated "Latest joiners" feed for the Community page's "carica altri"
// button. Mirrors the page-size used by /users (10) so the client's
// hasMore check (users.length === PAGE_SIZE) stays correct.
const PAGE_SIZE = 10
const MAX_OFFSET = 1000

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rawOffset = parseInt(
    request.nextUrl.searchParams.get('offset') ?? '0',
    10,
  )
  const offset = Number.isFinite(rawOffset)
    ? Math.max(0, Math.min(rawOffset, MAX_OFFSET))
    : 0

  const { data, error } = await supabase.rpc('get_latest_users', {
    p_limit: PAGE_SIZE,
    p_offset: offset,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ users: data ?? [] })
}
