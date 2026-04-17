'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Heart, MessageSquare, Pencil, Trash2 } from 'lucide-react'
import CommentComposer from './CommentComposer'
import CommentBody from './CommentBody'
import { createClient } from '@/lib/supabase/client'
import { initialColor, initialsOf } from '@/lib/utils/user'

type AuthorRef = {
  id: string
  username: string
  display_name: string
}

type CommentRow = {
  id: string
  deck_id: string
  user_id: string
  body: string
  created_at: string
  updated_at: string
  author: AuthorRef | null
}

interface DeckEngagementProps {
  deckId: string
  viewerId: string | null
  deckOwnerId: string
}

export default function DeckEngagement({ deckId, viewerId, deckOwnerId }: DeckEngagementProps) {
  const [comments, setComments] = useState<CommentRow[]>([])
  const [likeCount, setLikeCount] = useState(0)
  const [likedByMe, setLikedByMe] = useState(false)
  const [loading, setLoading] = useState(true)
  const [likeBusy, setLikeBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const authorCacheRef = useRef<Map<string, AuthorRef>>(new Map())

  // Initial load.
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    async function load() {
      try {
        const [commentsRes, likesRes] = await Promise.all([
          fetch(`/api/decks/${deckId}/comments`, { signal: controller.signal }),
          fetch(`/api/decks/${deckId}/likes`, { signal: controller.signal }),
        ])
        if (!commentsRes.ok || !likesRes.ok) throw new Error('load failed')
        const cData = await commentsRes.json()
        const lData = await likesRes.json()
        if (cancelled) return
        const incoming: CommentRow[] = cData.comments ?? []
        for (const c of incoming) {
          if (c.author) authorCacheRef.current.set(c.user_id, c.author)
        }
        setComments(incoming)
        setLikeCount(lData.count ?? 0)
        setLikedByMe(!!lData.liked_by_me)
      } catch {
        if (!cancelled) setError('Impossibile caricare commenti.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [deckId])

  const refetchComment = useCallback(async (commentId: string) => {
    const res = await fetch(`/api/decks/${deckId}/comments`)
    if (!res.ok) return
    const data = await res.json()
    const next: CommentRow[] = data.comments ?? []
    for (const c of next) {
      if (c.author) authorCacheRef.current.set(c.user_id, c.author)
    }
    setComments(next)
    void commentId
  }, [deckId])

  // Realtime subscriptions.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`deck-engagement-${deckId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'deck_comments', filter: `deck_id=eq.${deckId}` },
        (payload) => {
          const row = payload.new as Omit<CommentRow, 'author'>
          setComments((prev) => {
            if (prev.some((c) => c.id === row.id)) return prev
            const author = authorCacheRef.current.get(row.user_id) ?? null
            const next = [...prev, { ...row, author }]
            next.sort((a, b) => a.created_at.localeCompare(b.created_at))
            return next
          })
          if (!authorCacheRef.current.has(row.user_id)) {
            void refetchComment(row.id)
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'deck_comments', filter: `deck_id=eq.${deckId}` },
        (payload) => {
          const row = payload.new as Omit<CommentRow, 'author'>
          setComments((prev) =>
            prev.map((c) => (c.id === row.id ? { ...c, body: row.body, updated_at: row.updated_at } : c)),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'deck_comments', filter: `deck_id=eq.${deckId}` },
        (payload) => {
          const row = payload.old as { id: string }
          setComments((prev) => prev.filter((c) => c.id !== row.id))
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'deck_likes', filter: `deck_id=eq.${deckId}` },
        () => setLikeCount((n) => n + 1),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'deck_likes', filter: `deck_id=eq.${deckId}` },
        () => setLikeCount((n) => Math.max(0, n - 1)),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [deckId, refetchComment])

  async function toggleLike() {
    if (!viewerId || likeBusy) return
    setLikeBusy(true)
    const prev = { likeCount, likedByMe }
    setLikedByMe(!likedByMe)
    setLikeCount((c) => c + (likedByMe ? -1 : 1))
    try {
      const res = await fetch(`/api/decks/${deckId}/likes`, { method: 'POST' })
      if (!res.ok) throw new Error('toggle failed')
      const data = await res.json()
      setLikeCount(data.count ?? 0)
      setLikedByMe(!!data.liked_by_me)
    } catch {
      setLikedByMe(prev.likedByMe)
      setLikeCount(prev.likeCount)
    } finally {
      setLikeBusy(false)
    }
  }

  async function submitNewComment(body: string) {
    const res = await fetch(`/api/decks/${deckId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? 'Impossibile inviare il commento.')
    }
    const data = await res.json()
    const c: CommentRow = data.comment
    if (c.author) authorCacheRef.current.set(c.user_id, c.author)
    setComments((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]))
  }

  async function saveEdit(commentId: string, body: string) {
    const res = await fetch(`/api/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? 'Impossibile salvare il commento.')
    }
    const data = await res.json()
    const c: CommentRow = data.comment
    if (c.author) authorCacheRef.current.set(c.user_id, c.author)
    setComments((prev) => prev.map((x) => (x.id === c.id ? c : x)))
    setEditingId(null)
  }

  async function deleteComment(commentId: string) {
    const prev = comments
    setComments((list) => list.filter((x) => x.id !== commentId))
    const res = await fetch(`/api/comments/${commentId}`, { method: 'DELETE' })
    if (!res.ok) {
      setComments(prev)
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-border bg-bg-surface">
      <header className="flex items-center gap-4 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={toggleLike}
          disabled={!viewerId || likeBusy}
          aria-pressed={likedByMe}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            likedByMe
              ? 'bg-red-500/15 text-red-500 hover:bg-red-500/25'
              : 'bg-bg-cell text-font-secondary hover:bg-bg-hover'
          } disabled:cursor-not-allowed disabled:opacity-60`}
          title={viewerId ? (likedByMe ? 'Rimuovi like' : 'Metti like') : 'Accedi per mettere like'}
        >
          <Heart size={14} className={likedByMe ? 'fill-current' : ''} />
          <span>{likeCount}</span>
        </button>
        <div className="inline-flex items-center gap-1.5 text-xs text-font-secondary">
          <MessageSquare size={14} />
          <span>{comments.length}</span>
        </div>
      </header>

      <div className="divide-y divide-border">
        {loading ? (
          <p className="px-4 py-4 text-sm text-font-muted">Caricamento…</p>
        ) : comments.length === 0 ? (
          <p className="px-4 py-4 text-sm text-font-muted">Nessun commento. Scrivi il primo!</p>
        ) : (
          comments.map((c) => {
            const author = c.author
            const canEdit = !!viewerId && viewerId === c.user_id
            const canDelete = !!viewerId && (viewerId === c.user_id || viewerId === deckOwnerId)
            const display = author?.display_name ?? 'Utente'
            const username = author?.username ?? 'user'
            const edited = c.updated_at !== c.created_at
            return (
              <article key={c.id} className="flex gap-3 px-4 py-3">
                <Link
                  href={`/u/${username}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-font-white"
                  style={{ backgroundColor: initialColor(username) }}
                  aria-label={display}
                >
                  {initialsOf(display)}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                    <Link href={`/u/${username}`} className="font-semibold text-font-primary hover:text-font-accent">
                      {display}
                    </Link>
                    <span className="text-font-muted">@{username}</span>
                    <span className="text-font-muted">·</span>
                    <time className="text-font-muted" dateTime={c.created_at}>
                      {formatTime(c.created_at)}
                    </time>
                    {edited && <span className="text-font-muted">(modificato)</span>}
                  </div>
                  {editingId === c.id ? (
                    <div className="mt-2">
                      <CommentComposer
                        initialBody={c.body}
                        submitLabel="Salva"
                        autoFocus
                        onSubmit={(b) => saveEdit(c.id, b)}
                        onCancel={() => setEditingId(null)}
                      />
                    </div>
                  ) : (
                    <div className="mt-1">
                      <CommentBody body={c.body} />
                    </div>
                  )}
                  {editingId !== c.id && (canEdit || canDelete) && (
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-font-muted">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setEditingId(c.id)}
                          className="inline-flex items-center gap-1 hover:text-font-primary"
                        >
                          <Pencil size={11} /> Modifica
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => void deleteComment(c.id)}
                          className="inline-flex items-center gap-1 hover:text-red-500"
                        >
                          <Trash2 size={11} /> Elimina
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            )
          })
        )}
      </div>

      {error && <p className="px-4 py-2 text-xs text-red-500">{error}</p>}

      <div className="border-t border-border p-3 sm:p-4">
        {viewerId ? (
          <CommentComposer onSubmit={submitNewComment} />
        ) : (
          <p className="text-sm text-font-muted">
            <Link href="/login" className="text-font-accent hover:underline">
              Accedi
            </Link>{' '}
            per commentare.
          </p>
        )}
      </div>
    </section>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diff = Math.round((now - d.getTime()) / 1000)
  if (diff < 60) return 'ora'
  if (diff < 3600) return `${Math.floor(diff / 60)}m fa`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h fa`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}g fa`
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}
