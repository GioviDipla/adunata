'use client'

import { useCallback, useMemo, useState } from 'react'
import { VirtuosoGrid } from 'react-virtuoso'
import { Upload } from 'lucide-react'
import CollectionImportModal from './CollectionImportModal'
import CollectionTile from './CollectionTile'
import { useDebounce } from '@/lib/hooks/useDebounce'

// Narrow card shape — only what CollectionTile renders. Matches the
// column list in `src/app/api/collection/route.ts` and the server-side
// fetch in `page.tsx`.
export interface CollectionCard {
  id: number
  name: string
  name_it: string | null
  mana_cost: string | null
  type_line: string | null
  image_small: string | null
  image_normal: string | null
  cmc: number | null
  rarity: string | null
  set_code: string | null
  color_identity: string[] | null
  prices_eur: number | null
  prices_usd: number | null
}

export interface CollectionItem {
  id: string
  quantity: number
  foil: boolean
  language: string
  condition: string | null
  acquired_price_eur: number | null
  card: CollectionCard
}

interface Props {
  initialItems: CollectionItem[]
  total: number
}

/**
 * Virtualized grid of the signed-in user's collection.
 *
 * Search is client-side across already-loaded pages (server search is a
 * follow-up). Pagination pulls 50-row pages from `/api/collection?offset`
 * as the grid end is reached.
 */
export default function CollectionView({ initialItems, total }: Props) {
  const [items, setItems] = useState<CollectionItem[]>(initialItems)
  const [totalCount, setTotalCount] = useState(total)
  const [importOpen, setImportOpen] = useState(false)
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 200)

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    if (q.length < 2) return items
    return items.filter((it) => {
      const name = it.card.name.toLowerCase()
      const nameIt = it.card.name_it?.toLowerCase() ?? ''
      return name.includes(q) || nameIt.includes(q)
    })
  }, [items, debouncedQuery])

  const loadMore = useCallback(async () => {
    if (items.length >= totalCount) return
    const res = await fetch(`/api/collection?limit=50&offset=${items.length}`)
    if (!res.ok) return
    const { items: next, total: t } = (await res.json()) as {
      items: CollectionItem[]
      total: number
    }
    if (Array.isArray(next) && next.length > 0) {
      setItems((p) => [...p, ...next])
    }
    if (typeof t === 'number') setTotalCount(t)
  }, [items.length, totalCount])

  const handleQuantity = useCallback(async (id: string, nextQty: number) => {
    // Optimistic update with rollback on failure (CLAUDE.md: always check
    // `res.ok` for user-triggered mutations).
    const prev = items
    setItems((p) =>
      p.map((it) => (it.id === id ? { ...it, quantity: nextQty } : it)),
    )
    const res = await fetch(`/api/collection/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quantity: nextQty }),
    })
    if (!res.ok) setItems(prev)
  }, [items])

  const handleRemove = useCallback(async (id: string) => {
    const prev = items
    setItems((p) => p.filter((it) => it.id !== id))
    setTotalCount((c) => Math.max(0, c - 1))
    const res = await fetch(`/api/collection/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      setItems(prev)
      setTotalCount((c) => c + 1)
    }
  }, [items])

  async function refetchFirstPage() {
    const res = await fetch('/api/collection?limit=50&offset=0')
    if (!res.ok) return
    const { items: next, total: t } = (await res.json()) as {
      items: CollectionItem[]
      total: number
    }
    setItems(next)
    setTotalCount(t)
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-3 p-3 sm:p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-font-primary sm:text-2xl">
          Collection{' '}
          <span className="text-sm font-medium text-font-muted">
            ({totalCount})
          </span>
        </h1>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-bg-accent px-3 py-1.5 text-xs font-semibold text-font-white transition-opacity hover:opacity-90"
        >
          <Upload className="h-3.5 w-3.5" /> Import CSV
        </button>
      </header>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name…"
        className="rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-font-primary placeholder:text-font-muted focus:border-bg-accent focus:outline-none"
      />

      {totalCount === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-bg-surface p-8 text-center">
          <p className="mb-3 text-font-muted">Your collection is empty.</p>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-bg-accent px-3 py-2 text-sm font-semibold text-font-white"
          >
            <Upload className="h-4 w-4" /> Import a CSV to start
          </button>
        </div>
      ) : (
        <VirtuosoGrid
          style={{ height: '75vh' }}
          data={filtered}
          endReached={loadMore}
          listClassName="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6"
          itemContent={(_, item) => (
            <CollectionTile
              item={item}
              onQuantity={handleQuantity}
              onRemove={handleRemove}
            />
          )}
        />
      )}

      {importOpen && (
        <CollectionImportModal
          onClose={() => setImportOpen(false)}
          onImported={() => {
            void refetchFirstPage()
          }}
        />
      )}
    </div>
  )
}
