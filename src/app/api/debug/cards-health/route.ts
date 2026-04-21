import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * One-shot diagnostic endpoint. Reports what the `/cards` page would
 * see when it queries the catalog so we can tell whether the empty UI
 * is a data issue (DB is actually empty / corrupted) or a delivery
 * issue (deploy, cache, client). Gated behind CRON_SECRET so only the
 * owner can hit it.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/debug/cards-health
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const [
    total,
    nullReleasedAt,
    nullSetCode,
    newest,
    distinctSets,
  ] = await Promise.all([
    admin.from('cards').select('*', { count: 'exact', head: true }),
    admin.from('cards').select('*', { count: 'exact', head: true }).is('released_at', null),
    admin.from('cards').select('*', { count: 'exact', head: true }).is('set_code', null),
    admin
      .from('cards')
      .select('id, name, set_code, released_at, updated_at, last_price_update')
      .not('released_at', 'is', null)
      .order('released_at', { ascending: false })
      .limit(5),
    admin.rpc('get_distinct_sets'),
  ])

  return NextResponse.json({
    totalRows: total.count,
    rowsWithNullReleasedAt: nullReleasedAt.count,
    rowsWithNullSetCode: nullSetCode.count,
    newest5: newest.data ?? [],
    newestError: newest.error?.message ?? null,
    distinctSetsCount: Array.isArray(distinctSets.data) ? distinctSets.data.length : null,
    distinctSetsSample: Array.isArray(distinctSets.data) ? distinctSets.data.slice(0, 3) : null,
    distinctSetsError: distinctSets.error?.message ?? null,
  })
}
