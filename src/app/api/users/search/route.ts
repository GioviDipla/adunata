import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enforceLimit, getClientId, searchLimiter } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const query = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10) || 20,
    50,
  )

  // Enforce a minimum length both client-side (UserSearch debounce) and here
  // so a bypassed client can't force trigram scans on single-character queries.
  if (query.length < 2) {
    return NextResponse.json({ users: [] })
  }

  const limited = await enforceLimit(searchLimiter, getClientId(request, user.id))
  if (limited) return limited

  const { data, error } = await supabase.rpc('search_users', {
    p_query: query,
    p_limit: limit,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ users: data ?? [] })
}
