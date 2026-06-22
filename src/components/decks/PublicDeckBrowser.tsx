'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Loader2, Swords, Heart } from 'lucide-react'
import DeckFilters, { EMPTY_FILTERS, type FilterState } from './DeckFilters'

const PAGE_SIZE = 10

export interface PublicDeck {
  id: string
  name: string
  description: string | null
  format: string | null
  card_count: number
  updated_at: string
  created_at: string
  user_id: string
  creator_username: string | null
  creator_display_name: string | null
  commander_card_id: string | null
  commander_name: string | null
  cover_card_id: string | null
  cover_image_art_crop: string | null
  cover_image_normal: string | null
  like_count: number
  price_eur: number
}

interface PublicDeckBrowserProps {
  initialDecks: PublicDeck[]
}

function buildQuery(f: FilterState, offset: number): string {
  const p = new URLSearchParams()
  if (f.name) p.set('name', f.name)
  if (f.creator) p.set('creator_id', f.creator.id)
  if (f.commander) p.set('commander', f.commander.name)
  if (f.colors.length) p.set('colors', f.colors.join(','))
  if (f.colorIdentity.length) p.set('ci', f.colorIdentity.join(','))
  if (f.cards.length) p.set('cards', f.cards.map((c) => c.id).join(','))
  p.set('cardMode', f.cardMode)
  if (f.format) p.set('format', f.format)
  if (f.sort) p.set('sort', f.sort)
  p.set('offset', String(offset))
  return p.toString()
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

export default function PublicDeckBrowser({ initialDecks }: PublicDeckBrowserProps) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [decks, setDecks] = useState<PublicDeck[]>(initialDecks)
  const [hasMore, setHasMore] = useState(initialDecks.length === PAGE_SIZE)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const searchAbortRef = useRef<AbortController | null>(null)
  const loadMoreAbortRef = useRef<AbortController | null>(null)

  // Debounced filter search: reset to page 0, replace list.
  useEffect(() => {
    const handle = setTimeout(async () => {
      searchAbortRef.current?.abort()
      const controller = new AbortController()
      searchAbortRef.current = controller
      setLoading(true)
      try {
        const res = await fetch(
          `/api/decks/public/search?${buildQuery(filters, 0)}`,
          { signal: controller.signal },
        )
        if (controller.signal.aborted) return
        if (res.ok) {
          const data = await res.json()
          const rows: PublicDeck[] = data.decks ?? []
          setDecks(rows)
          setHasMore(rows.length === PAGE_SIZE)
        } else {
          setDecks([])
          setHasMore(false)
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setDecks([])
          setHasMore(false)
        }
      }
      if (!searchAbortRef.current?.signal.aborted) setLoading(false)
    }, 350)
    return () => clearTimeout(handle)
  }, [filters])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    loadMoreAbortRef.current?.abort()
    const controller = new AbortController()
    loadMoreAbortRef.current = controller
    setLoadingMore(true)
    try {
      const offset = decks.length
      const res = await fetch(
        `/api/decks/public/search?${buildQuery(filters, offset)}`,
        { signal: controller.signal },
      )
      if (controller.signal.aborted) return
      if (res.ok) {
        const data = await res.json()
        const rows: PublicDeck[] = data.decks ?? []
        setDecks((prev) => [...prev, ...rows])
        setHasMore(rows.length === PAGE_SIZE)
      } else {
        setHasMore(false)
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setHasMore(false)
    }
    if (!loadMoreAbortRef.current?.signal.aborted) setLoadingMore(false)
  }, [loadingMore, hasMore, decks.length, filters])

  return (
    <div className="flex flex-col gap-6">
      <DeckFilters filters={filters} onChange={setFilters} />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-font-muted" />
        </div>
      ) : decks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-bg-card p-8 text-center">
          <p className="text-sm text-font-muted">
            No public decks match these filters.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {decks.map((d) => {
              const ownerName =
                d.creator_display_name || d.creator_username || 'Unknown'
              const cover = d.cover_image_art_crop ?? d.cover_image_normal
              return (
                <Link
                  key={d.id}
                  href={`/decks/${d.id}`}
                  className="group flex flex-col overflow-hidden rounded-xl border border-border bg-bg-card transition-colors hover:border-border-light hover:bg-bg-hover"
                >
                  <div className="relative aspect-[5/3] w-full overflow-hidden bg-bg-cell">
                    {cover ? (
                      <Image
                        src={cover}
                        alt={d.name}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1280px) 33vw, 20vw"
                        className="object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Swords className="h-8 w-8 text-font-muted" />
                      </div>
                    )}
                    {d.format && (
                      <span className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                        {d.format}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 p-3.5">
                    <p className="truncate text-sm font-medium text-font-primary">
                      {d.name}
                    </p>
                    <div className="flex items-center justify-between text-xs text-font-muted">
                      <span className="truncate">{ownerName}</span>
                      <span>
                        {d.card_count != null ? `${d.card_count} cards` : ''}
                      </span>
                    </div>
                    {d.commander_name && (
                      <p className="truncate text-[11px] text-font-muted">
                        Cmdr: {d.commander_name}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-[11px] text-font-muted">
                      <span className="flex items-center gap-1">
                        <Heart className="h-3 w-3" />
                        {d.like_count}
                      </span>
                      {d.price_eur > 0 && (
                        <span>€{d.price_eur.toFixed(2)}</span>
                      )}
                    </div>
                    <p
                      className="text-[11px] text-font-muted"
                      suppressHydrationWarning
                    >
                      Updated {timeAgo(d.updated_at)}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
          {hasMore && (
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
