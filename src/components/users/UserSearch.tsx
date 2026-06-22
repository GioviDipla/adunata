'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Search, Loader2 } from 'lucide-react'
import UserCard from './UserCard'

// Must match /api/users PAGE_SIZE and the /users page initial fetch (10).
// hasMore relies on this: a full page means another page may exist.
const PAGE_SIZE = 10

interface SearchResult {
  id: string
  username: string
  display_name: string
  bio: string | null
  public_deck_count: number
}

interface InitialUser {
  id: string
  username: string
  display_name: string
  public_deck_count: number
}

interface UserSearchProps {
  initialUsers: InitialUser[]
}

export default function UserSearch({ initialUsers }: UserSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)

  // Pagination over the "Latest joiners" browse feed. Only active when not
  // searching (results === null). Mirrors CardBrowser's loadMore pattern:
  // hasMore flips false once a page returns fewer than PAGE_SIZE rows.
  const [extraUsers, setExtraUsers] = useState<InitialUser[]>([])
  const [hasMore, setHasMore] = useState(initialUsers.length === PAGE_SIZE)
  const [loadingMore, setLoadingMore] = useState(false)
  const loadMoreAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const trimmed = query.trim()
    // Require at least 2 characters before hitting the DB — protects against
    // full-table trigram scans on single-character queries and keeps the
    // "Latest joiners" empty state visible while the user is still typing.
    if (trimmed.length < 2) {
      queueMicrotask(() => {
        setResults(null)
        setLoading(false)
      })
      return
    }

    queueMicrotask(() => setLoading(true))
    const controller = new AbortController()
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        )
        if (controller.signal.aborted) return
        if (res.ok) {
          const data = await res.json()
          setResults(data.users ?? [])
        } else {
          setResults([])
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setResults([])
        }
      }
      if (!controller.signal.aborted) setLoading(false)
    }, 300)

    return () => {
      clearTimeout(handle)
      controller.abort()
    }
  }, [query])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    loadMoreAbortRef.current?.abort()
    const controller = new AbortController()
    loadMoreAbortRef.current = controller
    setLoadingMore(true)
    try {
      const offset = initialUsers.length + extraUsers.length
      const res = await fetch(`/api/users?offset=${offset}`, {
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (res.ok) {
        const data = await res.json()
        const users: InitialUser[] = data.users ?? []
        setExtraUsers((prev) => [...prev, ...users])
        setHasMore(users.length === PAGE_SIZE)
      } else {
        setHasMore(false)
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setHasMore(false)
    }
    if (!loadMoreAbortRef.current?.signal.aborted) setLoadingMore(false)
  }, [loadingMore, hasMore, initialUsers.length, extraUsers.length])

  const showEmptyState = results === null
  const usersToRender = useMemo(() => {
    if (showEmptyState) {
      return [...initialUsers, ...extraUsers].map((u) => ({
        id: u.id,
        username: u.username,
        display_name: u.display_name,
        bio: null as string | null,
        public_deck_count: u.public_deck_count,
      }))
    }
    return results ?? []
  }, [showEmptyState, initialUsers, extraUsers, results])

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-font-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players by username or name..."
          className="w-full rounded-lg border border-border bg-bg-card px-10 py-2.5 text-sm text-font-primary placeholder:text-font-muted focus:border-bg-accent focus:outline-none focus:ring-2 focus:ring-bg-accent/20"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-font-muted" />
        )}
      </div>

      {showEmptyState && (
        <h2 className="text-sm font-semibold text-font-secondary">Latest joiners</h2>
      )}

      {usersToRender.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-bg-card p-8 text-center">
          <p className="text-sm text-font-muted">
            {showEmptyState ? 'No one is here yet.' : `No players match "${query}"`}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {usersToRender.map((u) => (
              <UserCard
                key={u.id}
                username={u.username}
                displayName={u.display_name}
                bio={u.bio}
                publicDeckCount={u.public_deck_count}
              />
            ))}
          </div>
          {showEmptyState && hasMore && usersToRender.length > 0 && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-bg-card py-2.5 text-sm font-medium text-font-primary transition-colors hover:border-border-light hover:bg-bg-hover disabled:opacity-60"
            >
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
              {loadingMore ? 'Caricamento...' : 'Carica altri'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
