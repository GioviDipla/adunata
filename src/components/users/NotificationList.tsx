'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, Heart, AtSign, CheckCheck } from 'lucide-react'
import { initialColor, initialsOf } from '@/lib/utils/user'

type Actor = { id: string; username: string; display_name: string }

type NotificationRow = {
  id: string
  type: 'deck_comment' | 'deck_like' | 'mention'
  deck_id: string | null
  actor: Actor | null
  comment_id: string | null
  read: boolean
  created_at: string
}

const LIMIT = 20

export default function NotificationList() {
  const router = useRouter()
  const [notifs, setNotifs] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)

  const fetchPage = useCallback(async (off: number, append: boolean): Promise<boolean> => {
    setError(null)
    const res = await fetch(`/api/notifications?offset=${off}&limit=${LIMIT}`)
    if (!res.ok) {
      setError('Errore nel caricamento delle notifiche')
      return false
    }
    const data = await res.json()
    const list: NotificationRow[] = data.notifications ?? []
    if (append) {
      setNotifs(prev => [...prev, ...list])
    } else {
      setNotifs(list)
    }
    setHasMore(data.has_more ?? false)
    return true
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchPage(0, false).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [fetchPage])

  async function loadMore() {
    if (loadingMore) return
    setLoadingMore(true)
    setError(null)
    const next = offset + LIMIT
    const ok = await fetchPage(next, true)
    if (ok) setOffset(next)
    setLoadingMore(false)
  }

  async function markAllRead() {
    const res = await fetch('/api/notifications', { method: 'PATCH' })
    if (!res.ok) return
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
  }

  async function handleClick(n: NotificationRow) {
    if (!n.read) {
      await fetch(`/api/notifications/${n.id}`, { method: 'PATCH' })
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
    }
    if (n.deck_id) {
      router.push(`/decks/${n.deck_id}`)
    }
  }

  function getIcon(type: string) {
    switch (type) {
      case 'deck_comment': return <MessageSquare size={14} />
      case 'deck_like': return <Heart size={14} />
      case 'mention': return <AtSign size={14} />
      default: return null
    }
  }

  function getMessage(n: NotificationRow): React.ReactNode {
    const name = n.actor?.display_name ?? 'Qualcuno'
    switch (n.type) {
      case 'deck_comment':
        return <>{name} ha commentato il tuo deck</>
      case 'deck_like':
        return <>{name} ha messo like al tuo deck</>
      case 'mention':
        return <>{name} ti ha menzionato in un commento</>
    }
  }

  function formatDate(iso: string): string {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffDays === 0) return 'Oggi'
    if (diffDays === 1) return 'Ieri'
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  if (loading) {
    return <p className="py-8 text-center text-sm text-font-muted">Caricamento...</p>
  }

  if (notifs.length === 0) {
    return (
      <>
        {error && (
          <p className="mb-4 rounded-md bg-red-500/10 px-4 py-2 text-center text-sm text-red-400">
            {error}
          </p>
        )}
        <p className="py-8 text-center text-sm text-font-muted">Nessuna notifica</p>
      </>
    )
  }

  // Group by date
  const groups = new Map<string, NotificationRow[]>()
  for (const n of notifs) {
    const key = formatDate(n.created_at)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(n)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-font-muted">{notifs.length} notifiche</span>
        <button
          type="button"
          onClick={markAllRead}
          className="inline-flex items-center gap-1 text-xs text-font-accent hover:underline"
        >
          <CheckCheck size={14} />
          Segna tutte come lette
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-500/10 px-4 py-2 text-center text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="divide-y divide-border">
        {Array.from(groups.entries()).map(([date, items]) => (
          <div key={date}>
            <h3 className="sticky top-0 z-10 bg-bg-dark px-3 py-2 text-xs font-semibold text-font-muted uppercase tracking-wider">
              {date}
            </h3>
            {items.map(n => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleClick(n)}
                className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-bg-elevated ${
                  !n.read ? 'bg-bg-accent/5' : ''
                }`}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-font-white"
                  style={{ backgroundColor: n.actor ? initialColor(n.actor.username) : '#555' }}
                >
                  {n.actor ? initialsOf(n.actor.display_name) : '?'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-font-muted">{getIcon(n.type)}</span>
                    <span className={`text-sm ${!n.read ? 'font-semibold text-font-primary' : 'text-font-secondary'}`}>
                      {getMessage(n)}
                    </span>
                    {!n.read && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-font-muted">
                    {formatTime(n.created_at)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-full px-4 py-2 text-sm font-medium text-font-accent hover:bg-bg-elevated disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingMore ? 'Caricamento...' : 'Carica altre'}
          </button>
        </div>
      )}
    </div>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diff = Math.round((now - d.getTime()) / 1000)
  if (diff < 60) return 'ora'
  if (diff < 3600) return `${Math.floor(diff / 60)}m fa`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h fa`
  return ''
}
