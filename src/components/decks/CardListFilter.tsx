'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X, Loader2 } from 'lucide-react'

interface PickedCard {
  id: string
  name: string
}

interface CardListFilterProps {
  cards: PickedCard[]
  mode: 'and' | 'or'
  onChange: (cards: PickedCard[], mode: 'and' | 'or') => void
}

export default function CardListFilter({ cards, mode, onChange }: CardListFilterProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      // Defer to avoid a synchronous setState in the effect body (cascading
      // renders). Mirrors the UserSearch short-query branch.
      queueMicrotask(() => {
        setResults([])
        setLoading(false)
      })
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    queueMicrotask(() => setLoading(true))
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cards/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        if (res.ok) {
          const data = await res.json()
          const rows: { id: string; name: string }[] = data.cards ?? []
          setResults(rows.slice(0, 8))
        } else {
          setResults([])
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setResults([])
      }
      if (!controller.signal.aborted) setLoading(false)
    }, 300)
    return () => {
      clearTimeout(handle)
      controller.abort()
    }
  }, [query])

  const addCard = (c: { id: string; name: string }) => {
    if (cards.some((x) => x.id === c.id)) return
    onChange([...cards, { id: c.id, name: c.name }], mode)
    setQuery('')
    setResults([])
  }

  const removeCard = (id: string) => {
    onChange(
      cards.filter((x) => x.id !== id),
      mode,
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-font-secondary">Contains</span>
        <div className="flex rounded-lg border border-border bg-bg-card p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onChange(cards, 'and')}
            className={`rounded-md px-2 py-1 ${mode === 'and' ? 'bg-bg-accent text-font-white' : 'text-font-secondary'}`}
          >
            ALL (and)
          </button>
          <button
            type="button"
            onClick={() => onChange(cards, 'or')}
            className={`rounded-md px-2 py-1 ${mode === 'or' ? 'bg-bg-accent text-font-white' : 'text-font-secondary'}`}
          >
            ANY (or)
          </button>
        </div>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-font-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add a card to the filter..."
          className="w-full rounded-lg border border-border bg-bg-card px-10 py-2 text-sm text-font-primary placeholder:text-font-muted focus:border-bg-accent focus:outline-none focus:ring-2 focus:ring-bg-accent/20"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-font-muted" />
        )}
        {results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-bg-card shadow-lg">
            {results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => addCard(c)}
                className="block w-full px-3 py-2 text-left text-sm text-font-primary hover:bg-bg-hover"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {cards.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {cards.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 rounded-md bg-bg-accent/15 px-2 py-1 text-xs text-font-primary"
            >
              {c.name}
              <button
                type="button"
                onClick={() => removeCard(c.id)}
                className="text-font-muted hover:text-font-primary"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
