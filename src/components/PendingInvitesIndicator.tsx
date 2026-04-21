'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Tiny realtime badge on the Play nav item. Subscribes to the
 * lobby_invitations table filtered by the current user as recipient;
 * whenever the pending count changes the dot lights up. Rendered as
 * an absolutely-positioned red dot overlaid on the parent nav icon —
 * the parent is expected to have `position: relative`.
 */
export default function PendingInvitesIndicator() {
  const [userId, setUserId] = useState<string | null>(null)
  const [count, setCount] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUserId(data.user?.id ?? null)
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    const supabase = createClient()

    async function refresh() {
      if (!userId) return
      const { count: pending } = await supabase
        .from('lobby_invitations')
        .select('id', { count: 'exact', head: true })
        .eq('to_user_id', userId)
        .eq('status', 'pending')
      setCount(pending ?? 0)
    }

    refresh()

    // One subscription per user id. The filter on to_user_id keeps the
    // stream tight — the payload itself doesn't need to be parsed; we
    // just refetch the count on any change.
    const channel = supabase
      .channel(`invites-indicator-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lobby_invitations',
          filter: `to_user_id=eq.${userId}`,
        },
        () => {
          refresh()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  if (count <= 0) return null

  return (
    <span
      aria-label={`${count} pending 1v1 invite${count === 1 ? '' : 's'}`}
      className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-bg-red ring-2 ring-bg-dark"
    >
      <span className="sr-only">{count}</span>
    </span>
  )
}
