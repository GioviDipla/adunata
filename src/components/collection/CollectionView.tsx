'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { VirtuosoGrid } from 'react-virtuoso'
import {
  Upload,
  Trash2,
  Filter,
  ChevronDown,
  X,
  BarChart3,
  Loader2,
} from 'lucide-react'
import CollectionTile from './CollectionTile'
import { useDebounce } from '@/lib/hooks/useDebounce'

const CollectionImportModal = dynamic(() => import('./CollectionImportModal'), {
  ssr: false,
})

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

const CARD_TYPES = [
  'Creature', 'Instant', 'Sorcery', 'Enchantment',
  'Artifact', 'Planeswalker', 'Land', 'Battle', 'Token',
] as const

const RARITIES = ['common', 'uncommon', 'rare', 'mythic'] as const

const MANA_COLORS = [
  { code: 'W', label: 'W', bg: '#F5F0E1', text: '#333' },
  { code: 'U', label: 'U', bg: '#0E7FC0', text: '#fff' },
  { code: 'B', label: 'B', bg: '#3D3229', text: '#fff' },
  { code: 'R', label: 'R', bg: '#D32029', text: '#fff' },
  { code: 'G', label: 'G', bg: '#00733E', text: '#fff' },
] as const

const PAGE_SIZE = 200

/** Map a card's `type_line` onto one of the canonical CARD_TYPES bins. */
function categorizeType(typeLine: string | null): string {
  if (!typeLine) return 'Other'
  const lc = typeLine.toLowerCase()
  // Order matters — "Token" appears in token-creating types so check first.
  if (lc.includes('token')) return 'Token'
  for (const t of CARD_TYPES) {
    if (t === 'Token') continue
    if (lc.includes(t.toLowerCase())) return t
  }
  return 'Other'
}

export default function CollectionView({ initialItems, total }: Props) {
  const [items, setItems] = useState<CollectionItem[]>(initialItems)
  const [totalCount, setTotalCount] = useState(total)
  const [importOpen, setImportOpen] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [loadingAll, setLoadingAll] = useState(false)

  // Filters
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 200)
  const [selectedColors, setSelectedColors] = useState<string[]>([])
  const [colorMode, setColorMode] = useState<'and' | 'or' | 'identity'>('or')
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [typeMode, setTypeMode] = useState<'and' | 'or'>('and')
  const [selectedRarity, setSelectedRarity] = useState('')
  const [cmcMin, setCmcMin] = useState('')
  const [cmcMax, setCmcMax] = useState('')
  const [selectedSet, setSelectedSet] = useState('')

  // Auto-load every page when filters or stats are active so client-side
  // filtering and stats reflect the entire collection — not just the
  // first paginated page.
  const needFullDataset = filtersOpen || statsOpen
  const fullLoadedRef = useRef(false)
  useEffect(() => {
    if (!needFullDataset) return
    if (fullLoadedRef.current) return
    if (items.length >= totalCount) {
      fullLoadedRef.current = true
      return
    }
    let cancelled = false
    async function fetchAll() {
      setLoadingAll(true)
      try {
        let offset = items.length
        // Loop fetch in PAGE_SIZE chunks until we have everything.
        while (!cancelled && offset < totalCount) {
          const res = await fetch(
            `/api/collection?limit=${PAGE_SIZE}&offset=${offset}`,
          )
          if (!res.ok) break
          const { items: next, total: t } = (await res.json()) as {
            items: CollectionItem[]
            total: number
          }
          if (cancelled) break
          if (Array.isArray(next) && next.length > 0) {
            setItems((p) => {
              // Dedup on item id — server pagination is stable but a
              // concurrent refetch (e.g. import success) may overlap.
              const existing = new Set(p.map((it) => it.id))
              const fresh = next.filter((it) => !existing.has(it.id))
              return [...p, ...fresh]
            })
            offset += next.length
          } else break
          if (typeof t === 'number') setTotalCount(t)
        }
      } finally {
        if (!cancelled) {
          setLoadingAll(false)
          fullLoadedRef.current = true
        }
      }
    }
    void fetchAll()
    return () => { cancelled = true }
  }, [needFullDataset, items.length, totalCount])

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    const noColor = selectedColors.length === 0
    const noType = selectedTypes.length === 0
    const cmcMinNum = cmcMin === '' ? null : Number(cmcMin)
    const cmcMaxNum = cmcMax === '' ? null : Number(cmcMax)

    return items.filter((it) => {
      const c = it.card
      if (q.length >= 2) {
        const name = c.name.toLowerCase()
        const nameIt = c.name_it?.toLowerCase() ?? ''
        if (!name.includes(q) && !nameIt.includes(q)) return false
      }
      if (!noColor) {
        const ci = c.color_identity ?? []
        if (colorMode === 'identity') {
          // Card's color identity must be a subset of the chips.
          if (!ci.every((col) => selectedColors.includes(col))) return false
        } else if (colorMode === 'and') {
          if (!selectedColors.every((col) => ci.includes(col))) return false
        } else {
          if (!selectedColors.some((col) => ci.includes(col))) return false
        }
      }
      if (!noType) {
        const tl = (c.type_line ?? '').toLowerCase()
        if (typeMode === 'and') {
          if (!selectedTypes.every((t) => tl.includes(t.toLowerCase()))) return false
        } else {
          if (!selectedTypes.some((t) => tl.includes(t.toLowerCase()))) return false
        }
      }
      if (selectedRarity && c.rarity !== selectedRarity) return false
      if (cmcMinNum != null && (c.cmc ?? 0) < cmcMinNum) return false
      if (cmcMaxNum != null && (c.cmc ?? 0) > cmcMaxNum) return false
      if (selectedSet && c.set_code !== selectedSet) return false
      return true
    })
  }, [
    items, debouncedQuery, selectedColors, colorMode, selectedTypes, typeMode,
    selectedRarity, cmcMin, cmcMax, selectedSet,
  ])

  // ---- Stats: computed from the *full* dataset once auto-load resolves.
  const stats = useMemo(() => {
    let totalCards = 0
    let totalEur = 0
    let totalUsd = 0
    const bySet = new Map<string, { count: number; eur: number; usd: number }>()
    const byType = new Map<string, number>()
    const byRarity = new Map<string, number>()
    const byColor = new Map<string, number>()
    for (const it of items) {
      const qty = it.quantity
      totalCards += qty
      const eur = (it.card.prices_eur ?? 0) * qty
      const usd = (it.card.prices_usd ?? 0) * qty
      totalEur += eur
      totalUsd += usd

      const setCode = it.card.set_code ?? '—'
      const setRow = bySet.get(setCode) ?? { count: 0, eur: 0, usd: 0 }
      setRow.count += qty
      setRow.eur += eur
      setRow.usd += usd
      bySet.set(setCode, setRow)

      const cat = categorizeType(it.card.type_line)
      byType.set(cat, (byType.get(cat) ?? 0) + qty)

      const rarity = it.card.rarity ?? 'unknown'
      byRarity.set(rarity, (byRarity.get(rarity) ?? 0) + qty)

      for (const col of it.card.color_identity ?? []) {
        byColor.set(col, (byColor.get(col) ?? 0) + qty)
      }
    }
    return {
      totalCards,
      totalEur,
      totalUsd,
      bySet: Array.from(bySet.entries()).sort((a, b) => b[1].count - a[1].count),
      byType: Array.from(byType.entries()).sort((a, b) => b[1] - a[1]),
      byRarity: Array.from(byRarity.entries()).sort((a, b) => b[1] - a[1]),
      byColor: Array.from(byColor.entries()).sort((a, b) => b[1] - a[1]),
    }
  }, [items])

  // Distinct sets from the (possibly partial) dataset — used to populate
  // the set filter dropdown without an extra round-trip.
  const setOptions = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) {
      const c = it.card.set_code
      if (!c) continue
      m.set(c, (m.get(c) ?? 0) + it.quantity)
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [items])

  const loadMore = useCallback(async () => {
    if (items.length >= totalCount) return
    if (needFullDataset) return // full-load loop handles this
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
  }, [items.length, totalCount, needFullDataset])

  const handleQuantity = useCallback(async (id: string, nextQty: number) => {
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
    fullLoadedRef.current = false
  }

  async function handleReset() {
    setResetting(true)
    try {
      const res = await fetch('/api/collection/reset', { method: 'DELETE' })
      if (!res.ok) {
        setResetting(false)
        return
      }
      setItems([])
      setTotalCount(0)
      setShowResetConfirm(false)
    } finally {
      setResetting(false)
    }
  }

  function clearFilters() {
    setQuery('')
    setSelectedColors([])
    setSelectedTypes([])
    setSelectedRarity('')
    setCmcMin('')
    setCmcMax('')
    setSelectedSet('')
  }

  const filtersActive =
    debouncedQuery.trim().length > 0 ||
    selectedColors.length > 0 ||
    selectedTypes.length > 0 ||
    !!selectedRarity ||
    cmcMin !== '' ||
    cmcMax !== '' ||
    !!selectedSet

  const toggleColor = (c: string) =>
    setSelectedColors((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c])
  const toggleType = (t: string) =>
    setSelectedTypes((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t])

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-3 p-3 sm:p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-font-primary sm:text-2xl">
          Collection{' '}
          <span className="text-sm font-medium text-font-muted">
            ({totalCount})
          </span>
        </h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStatsOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              statsOpen
                ? 'border-bg-accent bg-bg-accent/15 text-font-accent'
                : 'border-border bg-bg-surface text-font-secondary hover:bg-bg-hover'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Statistiche
          </button>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              filtersOpen || filtersActive
                ? 'border-bg-accent bg-bg-accent/15 text-font-accent'
                : 'border-border bg-bg-surface text-font-secondary hover:bg-bg-hover'
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Filtri
            {filtersActive && (
              <span className="ml-1 rounded-full bg-bg-accent px-1.5 py-0.5 text-[9px] font-bold text-font-white">
                ON
              </span>
            )}
            <ChevronDown
              className={`h-3 w-3 transition-transform ${filtersOpen ? 'rotate-180' : ''}`}
            />
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-bg-accent px-3 py-1.5 text-xs font-semibold text-font-white transition-opacity hover:opacity-90"
          >
            <Upload className="h-3.5 w-3.5" /> Import CSV
          </button>
          {totalCount > 0 && (
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-bg-red/40 bg-bg-red/10 px-3 py-1.5 text-xs font-semibold text-bg-red transition-colors hover:bg-bg-red/20"
              title="Cancella l'intera collezione"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}
        </div>
      </header>

      {statsOpen && (
        <StatsPanel
          stats={stats}
          loading={loadingAll && items.length < totalCount}
        />
      )}

      {filtersOpen && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-bg-surface p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-font-secondary">Filtri</span>
            {filtersActive && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-[11px] text-font-muted hover:text-font-primary"
              >
                <X className="h-3 w-3" /> Pulisci tutto
              </button>
            )}
          </div>

          {/* Colors */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-font-muted">
              Colori
            </span>
            <div className="flex gap-1">
              {MANA_COLORS.map((c) => {
                const active = selectedColors.includes(c.code)
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggleColor(c.code)}
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-transform ${
                      active ? 'scale-110 ring-2 ring-font-accent' : 'opacity-70'
                    }`}
                    style={{ background: c.bg, color: c.text }}
                  >
                    {c.label}
                  </button>
                )
              })}
            </div>
            <select
              value={colorMode}
              onChange={(e) => setColorMode(e.target.value as typeof colorMode)}
              className="ml-1 rounded border border-border bg-bg-cell px-2 py-1 text-[11px] text-font-secondary"
            >
              <option value="or">Almeno uno</option>
              <option value="and">Tutti</option>
              <option value="identity">Identità ⊆ selezione</option>
            </select>
          </div>

          {/* Types */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-font-muted">
              Tipi
            </span>
            <div className="flex flex-wrap gap-1">
              {CARD_TYPES.map((t) => {
                const active = selectedTypes.includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                      active
                        ? 'bg-bg-accent text-font-white'
                        : 'bg-bg-cell text-font-secondary hover:bg-bg-hover'
                    }`}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
            <select
              value={typeMode}
              onChange={(e) => setTypeMode(e.target.value as typeof typeMode)}
              className="ml-1 rounded border border-border bg-bg-cell px-2 py-1 text-[11px] text-font-secondary"
            >
              <option value="and">Tutti</option>
              <option value="or">Almeno uno</option>
            </select>
          </div>

          {/* Rarity / CMC / Set */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-font-muted">
              Rarità
              <select
                value={selectedRarity}
                onChange={(e) => setSelectedRarity(e.target.value)}
                className="rounded border border-border bg-bg-cell px-2 py-1 text-[11px] text-font-secondary"
              >
                <option value="">Tutte</option>
                {RARITIES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-font-muted">
              CMC
              <input
                type="number"
                value={cmcMin}
                onChange={(e) => setCmcMin(e.target.value)}
                placeholder="min"
                className="h-7 w-14 rounded border border-border bg-bg-cell px-2 text-[11px] text-font-primary"
              />
              <span>—</span>
              <input
                type="number"
                value={cmcMax}
                onChange={(e) => setCmcMax(e.target.value)}
                placeholder="max"
                className="h-7 w-14 rounded border border-border bg-bg-cell px-2 text-[11px] text-font-primary"
              />
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-font-muted">
              Set
              <select
                value={selectedSet}
                onChange={(e) => setSelectedSet(e.target.value)}
                className="rounded border border-border bg-bg-cell px-2 py-1 text-[11px] text-font-secondary"
              >
                <option value="">Tutti</option>
                {setOptions.map(([code, count]) => (
                  <option key={code} value={code}>{code.toUpperCase()} ({count})</option>
                ))}
              </select>
            </label>
            {loadingAll && items.length < totalCount && (
              <span className="inline-flex items-center gap-1 text-[11px] text-font-muted">
                <Loader2 className="h-3 w-3 animate-spin" />
                Carico {items.length}/{totalCount}…
              </span>
            )}
          </div>
        </div>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cerca per nome…"
        className="rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-font-primary placeholder:text-font-muted focus:border-bg-accent focus:outline-none"
      />

      {totalCount === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-bg-surface p-8 text-center">
          <p className="mb-3 text-font-muted">La tua collezione è vuota.</p>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-bg-accent px-3 py-2 text-sm font-semibold text-font-white"
          >
            <Upload className="h-4 w-4" /> Importa un CSV per iniziare
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-bg-surface p-8 text-center">
          <p className="text-font-muted">Nessuna carta corrisponde ai filtri.</p>
        </div>
      ) : (
        <>
          <div className="text-[11px] text-font-muted">
            {filtered.length} di {totalCount} carte
            {filtersActive && ' (filtrate)'}
          </div>
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
        </>
      )}

      {importOpen && (
        <CollectionImportModal
          onClose={() => setImportOpen(false)}
          onImported={() => {
            void refetchFirstPage()
          }}
        />
      )}

      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl border border-bg-red/30 bg-bg-surface p-6 shadow-2xl">
            <h2 className="mb-2 text-lg font-bold text-bg-red">
              Reset Collezione
            </h2>
            <p className="mb-6 text-sm text-font-secondary">
              Stai per eliminare{' '}
              <span className="font-semibold text-font-primary">
                {totalCount}
              </span>{' '}
              carte dalla collezione. L&apos;azione non è reversibile.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                disabled={resetting}
                className="flex-1 rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm font-medium text-font-secondary hover:bg-bg-hover disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-bg-red px-3 py-2 text-sm font-semibold text-font-white hover:bg-bg-red/90 disabled:opacity-50"
              >
                {resetting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Elimina tutto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatsPanel({
  stats,
  loading,
}: {
  stats: {
    totalCards: number
    totalEur: number
    totalUsd: number
    bySet: [string, { count: number; eur: number; usd: number }][]
    byType: [string, number][]
    byRarity: [string, number][]
    byColor: [string, number][]
  }
  loading: boolean
}) {
  return (
    <section className="rounded-xl border border-border bg-bg-surface p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-font-primary">
          Statistiche collezione
        </h2>
        {loading && (
          <span className="inline-flex items-center gap-1 text-[11px] text-font-muted">
            <Loader2 className="h-3 w-3 animate-spin" />
            Calcolo su intero dataset…
          </span>
        )}
      </div>

      {/* Totals */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Tile label="Carte" value={stats.totalCards.toString()} />
        <Tile
          label="Valore Cardmarket"
          value={`€${stats.totalEur.toFixed(2)}`}
          accent="text-bg-green"
        />
        <Tile
          label="Valore TCGPlayer"
          value={`$${stats.totalUsd.toFixed(2)}`}
          accent="text-font-accent"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Breakdown title="Per tipo" rows={stats.byType} />
        <Breakdown title="Per rarità" rows={stats.byRarity} />
        <Breakdown title="Per identità di colore" rows={stats.byColor} />
        <Breakdown
          title="Per espansione"
          rows={stats.bySet.map(([code, v]) => [
            `${code.toUpperCase()} · €${v.eur.toFixed(2)}`,
            v.count,
          ])}
          maxRows={20}
        />
      </div>
    </section>
  )
}

function Tile({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="rounded-lg bg-bg-cell px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-font-muted">
        {label}
      </div>
      <div className={`text-base font-bold ${accent ?? 'text-font-primary'}`}>
        {value}
      </div>
    </div>
  )
}

function Breakdown({
  title,
  rows,
  maxRows = 10,
}: {
  title: string
  rows: [string, number][]
  maxRows?: number
}) {
  const total = rows.reduce((s, [, n]) => s + n, 0) || 1
  const visible = rows.slice(0, maxRows)
  return (
    <div className="rounded-lg bg-bg-cell/50 p-2">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-font-muted">
        {title}
      </div>
      {visible.length === 0 ? (
        <p className="text-[11px] text-font-muted">Nessun dato</p>
      ) : (
        <ul className="space-y-1">
          {visible.map(([k, n]) => {
            const pct = (n / total) * 100
            return (
              <li key={k} className="flex items-center gap-2 text-[11px]">
                <span className="w-28 truncate text-font-secondary">{k}</span>
                <div className="relative h-1.5 flex-1 overflow-hidden rounded bg-bg-dark">
                  <div
                    className="absolute inset-y-0 left-0 bg-bg-accent"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-10 text-right font-semibold tabular-nums text-font-primary">
                  {n}
                </span>
              </li>
            )
          })}
          {rows.length > maxRows && (
            <li className="text-[10px] text-font-muted">
              + altri {rows.length - maxRows}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
