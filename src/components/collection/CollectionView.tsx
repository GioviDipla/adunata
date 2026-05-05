'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import dynamic from 'next/dynamic'
import { VirtuosoGrid } from 'react-virtuoso'
import {
  Upload,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  BarChart3,
  Loader2,
  Search,
  ArrowUpDown,
} from 'lucide-react'
import CollectionTile from './CollectionTile'
import CardContextMenu from '@/components/cards/CardContextMenu'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { createClient } from '@/lib/supabase/client'
import { CARD_DETAIL_COLUMNS } from '@/lib/supabase/columns'
import type { Database } from '@/types/supabase'

type FullCard = Database['public']['Tables']['cards']['Row']

const CollectionImportModal = dynamic(() => import('./CollectionImportModal'), {
  ssr: false,
})

// CardDetail mounts only when a tile is opened. Keeps the printings
// panel + Scryfall renderer off the initial /cards chunk.
const CardDetail = dynamic(() => import('@/components/cards/CardDetail'), {
  ssr: false,
})

export interface CollectionCard {
  id: number
  scryfall_id?: string | null
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
  released_at?: string | null
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

interface SetInfo {
  set_code: string
  set_name: string
  latest_release: string
}

interface DeckSummary {
  id: string
  name: string
  format: string
}

interface Props {
  initialItems: CollectionItem[]
  total: number
  sets?: SetInfo[]
  userDecks?: DeckSummary[]
  initialLikedIds?: string[]
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

// Sort options mirror CardBrowser exactly so users moving between tabs
// share muscle memory.
const SORT_OPTIONS = [
  { value: 'released_at_desc', label: 'Newest' },
  { value: 'name_asc',  label: 'Name A→Z' },
  { value: 'name_desc', label: 'Name Z→A' },
  { value: 'cmc_asc',   label: 'CMC Low→High' },
  { value: 'cmc_desc',  label: 'CMC High→Low' },
  { value: 'type_asc',  label: 'Type' },
  { value: 'price_asc',  label: 'Price Low→High' },
  { value: 'price_desc', label: 'Price High→Low' },
] as const

type SortValue = typeof SORT_OPTIONS[number]['value']

function categorizeType(typeLine: string | null): string {
  if (!typeLine) return 'Other'
  const lc = typeLine.toLowerCase()
  if (lc.includes('token')) return 'Token'
  for (const t of CARD_TYPES) {
    if (t === 'Token') continue
    if (lc.includes(t.toLowerCase())) return t
  }
  return 'Other'
}

export default function CollectionView({
  initialItems,
  total,
  sets = [],
  userDecks = [],
  initialLikedIds = [],
}: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<CollectionItem[]>(initialItems)
  const [totalCount, setTotalCount] = useState(total)
  const [importOpen, setImportOpen] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [loadingAll, setLoadingAll] = useState(false)

  // Detail modal + context menu state — mirrors CardBrowser.
  const [selectedCard, setSelectedCard] = useState<FullCard | null>(null)
  const [contextMenu, setContextMenu] = useState<{ card: CollectionCard; x: number; y: number } | null>(null)
  const [likedIds, setLikedIds] = useState<Set<string>>(() => new Set(initialLikedIds))

  // ---- Filters (same primitive set as CardBrowser).
  const [searchText, setSearchText] = useState('')
  const debouncedSearch = useDebounce(searchText, 200)
  const [selectedColors, setSelectedColors] = useState<string[]>([])
  const [colorMode, setColorMode] = useState<'and' | 'or'>('or')
  const [commanderIdentity, setCommanderIdentity] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [typeMode, setTypeMode] = useState<'and' | 'or'>('and')
  const [selectedRarity, setSelectedRarity] = useState('')
  const [cmcMin, setCmcMin] = useState('')
  const [cmcMax, setCmcMax] = useState('')
  const [selectedSet, setSelectedSet] = useState('')
  const [setSearch, setSetSearch] = useState('')
  const [setDropdownOpen, setSetDropdownOpen] = useState(false)
  const setBoxRef = useRef<HTMLDivElement | null>(null)
  const [creatureType, setCreatureType] = useState('')
  const debouncedCreatureType = useDebounce(creatureType, 200)
  const [foilOnly, setFoilOnly] = useState(false)
  const [sortBy, setSortBy] = useState<SortValue>('price_desc')
  const [gridCols, setGridCols] = useState<number>(4)

  // Persisted grid columns — same key shape as CardBrowser keeps them
  // separate from the browse view.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = window.localStorage.getItem('adunata:collection-view')
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as { cols?: number; sort?: SortValue }
      if (typeof parsed.cols === 'number') setGridCols(parsed.cols)
      if (parsed.sort) setSortBy(parsed.sort)
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      'adunata:collection-view',
      JSON.stringify({ cols: gridCols, sort: sortBy }),
    )
  }, [gridCols, sortBy])

  // Close set dropdown on outside click — copied from CardBrowser.
  useEffect(() => {
    if (!setDropdownOpen) return
    const onClick = (e: MouseEvent) => {
      if (setBoxRef.current && !setBoxRef.current.contains(e.target as Node)) {
        setSetDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [setDropdownOpen])

  const sortedSets = useMemo(
    () => [...sets].sort((a, b) => a.set_name.localeCompare(b.set_name)),
    [sets],
  )
  const filteredSets = useMemo(() => {
    const q = setSearch.trim().toLowerCase()
    if (!q) return sortedSets
    return sortedSets.filter(
      (s) =>
        s.set_name.toLowerCase().includes(q) ||
        s.set_code.toLowerCase().includes(q),
    )
  }, [sortedSets, setSearch])
  const selectedSetInfo = useMemo(
    () => sets.find((s) => s.set_code === selectedSet) || null,
    [sets, selectedSet],
  )

  // ---- Auto-load full dataset when filters / stats / sort beyond
  // simple paging are needed. Sorting client-side requires the whole
  // collection to be present, so we trigger the loop on any signal that
  // the user wants to reason about more than the first page.
  const fullLoadedRef = useRef(false)
  // Always load the full dataset — sort + stats + filters all need it,
  // and the default Price High→Low sort would be wrong on a partial
  // page. The sequential paginated fetch (loadAll) runs on mount and
  // every time totals change, falling through quickly when we already
  // have everything.
  const needFullDataset = true

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
    const q = debouncedSearch.trim().toLowerCase()
    const noColor = selectedColors.length === 0
    const noCommander = commanderIdentity.length === 0
    const noType = selectedTypes.length === 0
    const cmcMinNum = cmcMin === '' ? null : Number(cmcMin)
    const cmcMaxNum = cmcMax === '' ? null : Number(cmcMax)
    const creatureNeedle = debouncedCreatureType.trim().toLowerCase()

    return items.filter((it) => {
      const c = it.card
      if (q.length >= 2) {
        const name = c.name.toLowerCase()
        const nameIt = c.name_it?.toLowerCase() ?? ''
        if (!name.includes(q) && !nameIt.includes(q)) return false
      }
      if (foilOnly && !it.foil) return false
      if (!noColor) {
        const ci = c.color_identity ?? []
        if (colorMode === 'and') {
          if (!selectedColors.every((col) => ci.includes(col))) return false
        } else {
          if (!selectedColors.some((col) => ci.includes(col))) return false
        }
      }
      if (!noCommander) {
        // Subset semantics — card identity must be ⊆ commanderIdentity.
        const ci = c.color_identity ?? []
        if (!ci.every((col) => commanderIdentity.includes(col))) return false
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
      if (creatureNeedle.length > 0 &&
          !(c.type_line ?? '').toLowerCase().includes(creatureNeedle)) return false
      return true
    })
  }, [
    items, debouncedSearch, foilOnly, selectedColors, colorMode,
    commanderIdentity, selectedTypes, typeMode, selectedRarity,
    cmcMin, cmcMax, selectedSet, debouncedCreatureType,
  ])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    const cmp = (a: CollectionItem, b: CollectionItem) => a.card.name.localeCompare(b.card.name)
    switch (sortBy) {
      case 'name_asc':
        arr.sort(cmp); break
      case 'name_desc':
        arr.sort((a, b) => b.card.name.localeCompare(a.card.name)); break
      case 'cmc_asc':
        arr.sort((a, b) => (a.card.cmc ?? 0) - (b.card.cmc ?? 0) || cmp(a, b)); break
      case 'cmc_desc':
        arr.sort((a, b) => (b.card.cmc ?? 0) - (a.card.cmc ?? 0) || cmp(a, b)); break
      case 'type_asc':
        arr.sort((a, b) =>
          (a.card.type_line ?? '').localeCompare(b.card.type_line ?? '') || cmp(a, b),
        ); break
      case 'price_asc':
        arr.sort((a, b) =>
          (a.card.prices_eur ?? a.card.prices_usd ?? 0) -
          (b.card.prices_eur ?? b.card.prices_usd ?? 0) || cmp(a, b),
        ); break
      case 'price_desc':
        arr.sort((a, b) =>
          (b.card.prices_eur ?? b.card.prices_usd ?? 0) -
          (a.card.prices_eur ?? a.card.prices_usd ?? 0) || cmp(a, b),
        ); break
      case 'released_at_desc':
        // No released_at on CollectionCard — fall back to name to keep the
        // option visible without a UI lie.
        arr.sort(cmp); break
    }
    return arr
  }, [filtered, sortBy])

  // ---- Stats from full dataset.
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

  // ---- Mutations.
  const loadMore = useCallback(async () => {
    if (items.length >= totalCount) return
    if (needFullDataset) return
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

  // Tap on a tile → context menu (Add to Deck / Like / Share). Mirrors
  // CardBrowser's `handleContextAction`.
  const handleContextAction = useCallback(
    (card: CollectionCard, x: number, y: number) => {
      setContextMenu({ card, x, y })
    },
    [],
  )

  // Long-press / right-click / double-click → CardDetail. Collection rows
  // carry only the grid-projection fields; fetch the full row before
  // mounting the modal so printings + legalities + image_art_crop work.
  const handleSelectCard = useCallback(
    async (card: CollectionCard) => {
      // Optimistic open with the partial card so the modal isn't a blank
      // flash. CardDetail tolerates the projected shape because every
      // column it reads is nullable; the full row replaces it in-place.
      setSelectedCard({
        ...(card as unknown as FullCard),
      })
      const { data } = await supabase
        .from('cards')
        .select(CARD_DETAIL_COLUMNS)
        .eq('id', card.id as unknown as number)
        .maybeSingle()
      if (data) setSelectedCard(data as unknown as FullCard)
    },
    [supabase],
  )

  const toggleLike = useCallback(async (card: CollectionCard) => {
    const id = String(card.id)
    const wasLiked = likedIds.has(id)
    setLikedIds((prev) => {
      const next = new Set(prev)
      if (wasLiked) next.delete(id)
      else next.add(id)
      return next
    })
    try {
      const res = await fetch(`/api/cards/${id}/like`, { method: 'POST' })
      if (!res.ok) throw new Error('like failed')
    } catch {
      setLikedIds((prev) => {
        const next = new Set(prev)
        if (wasLiked) next.add(id)
        else next.delete(id)
        return next
      })
    }
  }, [likedIds])

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
    setSearchText('')
    setSelectedColors([])
    setCommanderIdentity([])
    setSelectedTypes([])
    setSelectedRarity('')
    setCmcMin('')
    setCmcMax('')
    setSelectedSet('')
    setSetSearch('')
    setColorMode('or')
    setTypeMode('and')
    setCreatureType('')
    setFoilOnly(false)
  }

  const toggleColor = (color: string) =>
    setSelectedColors((prev) =>
      prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color],
    )
  const toggleCommanderColor = (color: string) =>
    setCommanderIdentity((prev) =>
      prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color],
    )
  const toggleType = (t: string) =>
    setSelectedTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    )

  const activeFilterCount = [
    debouncedSearch.trim().length > 0,
    selectedColors.length > 0,
    commanderIdentity.length > 0,
    selectedTypes.length > 0,
    selectedRarity,
    cmcMin,
    cmcMax,
    selectedSet,
    debouncedCreatureType.trim().length > 0,
    foilOnly,
  ].filter(Boolean).length

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

      {/* ---- Search bar (CardBrowser parity) */}
      <div className="relative flex items-stretch gap-2">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-font-muted"
            size={18}
          />
          <input
            type="text"
            placeholder="Search by card name…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg-card py-3 pl-10 pr-4 text-font-primary placeholder:text-font-muted transition-colors focus:border-bg-accent focus:outline-none focus:ring-1 focus:ring-bg-accent"
          />
        </div>
      </div>

      {/* ---- Filter toggle + sort + grid cols (CardBrowser parity) */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setShowFilters((p) => !p)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
            showFilters || activeFilterCount > 0
              ? 'bg-bg-accent/20 text-font-accent'
              : 'border border-border bg-bg-card text-font-secondary hover:text-font-primary'
          }`}
        >
          {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Filters
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-bg-accent px-1.5 py-0.5 text-[9px] font-bold text-font-white">
              {activeFilterCount}
            </span>
          )}
        </button>

        <div className="h-6 w-px bg-border" />

        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-bg-card px-2.5 py-2 text-sm text-font-secondary">
          <ArrowUpDown size={14} className="shrink-0 text-font-muted" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortValue)}
            className="cursor-pointer bg-transparent text-sm text-font-primary focus:outline-none"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-bg-surface">
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <div
          className="flex items-center gap-0.5 rounded-lg border border-border bg-bg-card p-1"
          role="group"
          aria-label="Grid columns"
        >
          <span className="px-1.5 text-[10px] font-semibold uppercase tracking-wide text-font-muted">
            Cols
          </span>
          {[2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              onClick={() => setGridCols(n)}
              className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium transition-colors ${
                gridCols === n
                  ? 'bg-bg-surface text-font-primary shadow-sm'
                  : 'text-font-muted hover:text-font-primary'
              }`}
              title={`${n} columns`}
              aria-label={`${n} columns`}
              aria-pressed={gridCols === n}
            >
              {n}
            </button>
          ))}
        </div>

        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="text-xs text-font-accent transition-colors hover:text-font-primary"
          >
            Clear all
          </button>
        )}

        {loadingAll && items.length < totalCount && (
          <span className="inline-flex items-center gap-1 text-[11px] text-font-muted">
            <Loader2 className="h-3 w-3 animate-spin" />
            {items.length}/{totalCount}…
          </span>
        )}
      </div>

      {/* ---- Expanded filters (CardBrowser parity) */}
      {showFilters && (
        <div className="space-y-4 rounded-xl border border-border bg-bg-surface p-4">
          {/* Colors */}
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-xs font-medium text-font-muted">Colors</span>
              {selectedColors.length > 1 && (
                <button
                  onClick={() => setColorMode((m) => (m === 'and' ? 'or' : 'and'))}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                    colorMode === 'and'
                      ? 'bg-bg-accent/20 text-font-accent'
                      : 'bg-bg-yellow/20 text-bg-yellow'
                  }`}
                  title={
                    colorMode === 'and'
                      ? 'AND: card must include ALL selected colors'
                      : 'OR: card must include ANY selected color'
                  }
                >
                  {colorMode.toUpperCase()}
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {MANA_COLORS.map((color) => {
                const isActive = selectedColors.includes(color.code)
                return (
                  <button
                    key={color.code}
                    onClick={() => toggleColor(color.code)}
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-all ${
                      isActive
                        ? 'scale-110 ring-2 ring-font-primary ring-offset-2 ring-offset-bg-surface'
                        : 'opacity-60 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: color.bg, color: color.text }}
                    title={color.code}
                  >
                    {color.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Foil only */}
          <div>
            <button
              type="button"
              onClick={() => setFoilOnly((v) => !v)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                foilOnly
                  ? 'bg-purple-500/20 text-purple-200 ring-1 ring-purple-500/40'
                  : 'border border-border bg-bg-card text-font-secondary hover:text-font-primary'
              }`}
            >
              ✦ Foil only
            </button>
          </div>

          {/* Commander Color Identity */}
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-xs font-medium text-font-muted">
                Commander Color Identity{' '}
                <span className="text-font-muted">
                  (only cards legal in this identity)
                </span>
              </span>
              {commanderIdentity.length > 0 && (
                <button
                  onClick={() => setCommanderIdentity([])}
                  className="text-[10px] text-font-accent transition-colors hover:text-font-primary"
                  type="button"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {MANA_COLORS.map((color) => {
                const isActive = commanderIdentity.includes(color.code)
                return (
                  <button
                    key={color.code}
                    onClick={() => toggleCommanderColor(color.code)}
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-all ${
                      isActive
                        ? 'scale-110 ring-2 ring-font-primary ring-offset-2 ring-offset-bg-surface'
                        : 'opacity-60 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: color.bg, color: color.text }}
                    title={`Include ${color.code} in commander identity`}
                    type="button"
                  >
                    {color.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {/* Set combobox */}
            <div ref={setBoxRef} className="relative min-w-[240px] flex-1">
              <label className="mb-1 block text-xs font-medium text-font-muted">
                Set
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={
                    setDropdownOpen
                      ? setSearch
                      : selectedSetInfo
                        ? `${selectedSetInfo.set_name} (${selectedSetInfo.set_code.toUpperCase()})`
                        : setSearch
                  }
                  onFocus={() => {
                    setSetDropdownOpen(true)
                    setSetSearch('')
                  }}
                  onChange={(e) => {
                    setSetSearch(e.target.value)
                    setSetDropdownOpen(true)
                  }}
                  placeholder="All Sets — type to search..."
                  className="w-full rounded-lg border border-border bg-bg-card py-2 pl-3 pr-16 text-sm text-font-primary placeholder:text-font-muted focus:border-bg-accent focus:outline-none"
                />
                {selectedSet && (
                  <button
                    onClick={() => {
                      setSelectedSet('')
                      setSetSearch('')
                      setSetDropdownOpen(false)
                    }}
                    className="absolute right-7 top-1/2 -translate-y-1/2 text-font-muted hover:text-font-primary"
                    title="Clear set"
                    type="button"
                  >
                    <X size={14} />
                  </button>
                )}
                <ChevronDown
                  className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-font-muted"
                  size={14}
                  onClick={() => setSetDropdownOpen((v) => !v)}
                />
              </div>
              {setDropdownOpen && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-bg-surface shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSet('')
                      setSetSearch('')
                      setSetDropdownOpen(false)
                    }}
                    className={`block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-bg-hover ${
                      !selectedSet ? 'text-font-accent' : 'text-font-secondary'
                    }`}
                  >
                    All Sets
                  </button>
                  {filteredSets.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-font-muted">
                      No matching sets
                    </div>
                  ) : (
                    filteredSets.map((s) => (
                      <button
                        key={s.set_code}
                        type="button"
                        onClick={() => {
                          setSelectedSet(s.set_code)
                          setSetSearch('')
                          setSetDropdownOpen(false)
                        }}
                        className={`block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-bg-hover ${
                          s.set_code === selectedSet ? 'text-font-accent' : 'text-font-primary'
                        }`}
                      >
                        {s.set_name}{' '}
                        <span className="text-font-muted">
                          ({s.set_code.toUpperCase()})
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Rarity */}
            <div className="min-w-[140px]">
              <label className="mb-1 block text-xs font-medium text-font-muted">
                Rarity
              </label>
              <div className="relative">
                <select
                  value={selectedRarity}
                  onChange={(e) => setSelectedRarity(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-border bg-bg-card py-2 pl-3 pr-8 text-sm capitalize text-font-primary focus:border-bg-accent focus:outline-none"
                >
                  <option value="">All Rarities</option>
                  {RARITIES.map((r) => (
                    <option key={r} value={r} className="capitalize">
                      {r}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-font-muted"
                />
              </div>
            </div>

            {/* CMC */}
            <div className="min-w-[160px]">
              <label className="mb-1 block text-xs font-medium text-font-muted">
                CMC
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={cmcMin}
                  onChange={(e) => setCmcMin(e.target.value)}
                  placeholder="min"
                  className="w-20 rounded-lg border border-border bg-bg-card px-2 py-2 text-sm text-font-primary placeholder:text-font-muted focus:border-bg-accent focus:outline-none"
                />
                <span className="text-font-muted">—</span>
                <input
                  type="number"
                  value={cmcMax}
                  onChange={(e) => setCmcMax(e.target.value)}
                  placeholder="max"
                  className="w-20 rounded-lg border border-border bg-bg-card px-2 py-2 text-sm text-font-primary placeholder:text-font-muted focus:border-bg-accent focus:outline-none"
                />
              </div>
            </div>

            {/* Creature type / subtype */}
            <div className="min-w-[180px] flex-1">
              <label className="mb-1 block text-xs font-medium text-font-muted">
                Creature type / subtype
              </label>
              <input
                type="text"
                value={creatureType}
                onChange={(e) => setCreatureType(e.target.value)}
                placeholder="es. Goblin, Dragon, Equipment…"
                className="w-full rounded-lg border border-border bg-bg-card px-3 py-2 text-sm text-font-primary placeholder:text-font-muted focus:border-bg-accent focus:outline-none"
              />
            </div>
          </div>

          {/* Types */}
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-xs font-medium text-font-muted">Card type</span>
              {selectedTypes.length > 1 && (
                <button
                  onClick={() => setTypeMode((m) => (m === 'and' ? 'or' : 'and'))}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                    typeMode === 'and'
                      ? 'bg-bg-accent/20 text-font-accent'
                      : 'bg-bg-yellow/20 text-bg-yellow'
                  }`}
                >
                  {typeMode.toUpperCase()}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CARD_TYPES.map((t) => {
                const active = selectedTypes.includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-bg-accent text-font-white'
                        : 'bg-bg-card text-font-secondary hover:bg-bg-hover'
                    }`}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

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
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-bg-surface p-8 text-center">
          <p className="text-font-muted">Nessuna carta corrisponde ai filtri.</p>
        </div>
      ) : (
        <>
          <div className="text-[11px] text-font-muted">
            {sorted.length} di {totalCount} carte
            {activeFilterCount > 0 && ' (filtrate)'}
          </div>
          <VirtuosoGrid
            style={{ height: '75vh' }}
            data={sorted}
            endReached={loadMore}
            // VirtuosoGrid doesn't accept inline `style` on its list slot
            // through the typed surface, so we force grid layout via a
            // class derived from the chosen column count. The five
            // possible class strings below are statically present so the
            // Tailwind JIT compiles them.
            listClassName={
              gridCols === 2 ? 'grid grid-cols-2 gap-2'
              : gridCols === 3 ? 'grid grid-cols-3 gap-2'
              : gridCols === 4 ? 'grid grid-cols-4 gap-2'
              : gridCols === 5 ? 'grid grid-cols-5 gap-2'
              : 'grid grid-cols-6 gap-2'
            }
            itemContent={(_, item) => (
              <CollectionTile
                item={item}
                onQuantity={handleQuantity}
                onRemove={handleRemove}
                onContextAction={handleContextAction}
                onSelectCard={handleSelectCard}
                liked={likedIds.has(String(item.card.id))}
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

      {selectedCard && (
        <CardDetail
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          userDecks={userDecks}
        />
      )}

      {contextMenu && (
        <CardContextMenu
          cardId={contextMenu.card.id}
          cardName={contextMenu.card.name}
          shareUrl={
            typeof window !== 'undefined'
              ? `${window.location.origin}/cards?open=${contextMenu.card.id}`
              : `/cards?open=${contextMenu.card.id}`
          }
          x={contextMenu.x}
          y={contextMenu.y}
          liked={likedIds.has(String(contextMenu.card.id))}
          userDecks={userDecks}
          onToggleLike={() => toggleLike(contextMenu.card)}
          onClose={() => setContextMenu(null)}
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
