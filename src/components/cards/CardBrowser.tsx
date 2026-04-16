'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Loader2, ChevronDown, ChevronUp, X, ArrowUpDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/types/supabase'
import { useDebounce } from '@/lib/hooks/useDebounce'
import CardGrid from './CardGrid'
import CardDetail from './CardDetail'

type Card = Database['public']['Tables']['cards']['Row']

const PAGE_SIZE = 80

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

interface CardBrowserProps {
  initialCards: Card[]
  sets?: SetInfo[]
  userDecks?: DeckSummary[]
}

export default function CardBrowser({ initialCards, sets = [], userDecks = [] }: CardBrowserProps) {
  const supabase = createClient()

  const [cards, setCards] = useState<Card[]>(initialCards)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // No "Load More" on the unfiltered landing view — the initial 80 cards are enough.
  // Paging kicks in only when filters/search are active.
  const [hasMore, setHasMore] = useState(false)
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  // Filters
  const [searchText, setSearchText] = useState('')
  const [selectedColors, setSelectedColors] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [selectedRarity, setSelectedRarity] = useState('')
  const [cmcMin, setCmcMin] = useState('')
  const [cmcMax, setCmcMax] = useState('')
  const [selectedSet, setSelectedSet] = useState('')
  const [creatureType, setCreatureType] = useState('')
  const [selectedKeyword, setSelectedKeyword] = useState('')
  const [typeMode, setTypeMode] = useState<'and' | 'or'>('and')
  const [sortBy, setSortBy] = useState<string>('released_at_desc')

  const debouncedSearch = useDebounce(searchText, 300)
  const debouncedCreatureType = useDebounce(creatureType, 300)

  const buildQuery = useCallback(
    (offset: number) => {
      let query = supabase
        .from('cards')
        .select('*')
        .range(offset, offset + PAGE_SIZE - 1)

      if (debouncedSearch.trim()) {
        query = query.textSearch('search_vector', debouncedSearch.trim(), { type: 'websearch' })
      }

      // Apply sort
      switch (sortBy) {
        case 'name_asc':
          query = query.order('name', { ascending: true }); break
        case 'name_desc':
          query = query.order('name', { ascending: false }); break
        case 'cmc_asc':
          query = query.order('cmc', { ascending: true }).order('name', { ascending: true }); break
        case 'cmc_desc':
          query = query.order('cmc', { ascending: false }).order('name', { ascending: true }); break
        case 'price_asc':
          query = query.order('prices_eur', { ascending: true, nullsFirst: false }).order('name', { ascending: true }); break
        case 'price_desc':
          query = query.order('prices_eur', { ascending: false, nullsFirst: false }).order('name', { ascending: true }); break
        case 'type_asc':
          query = query.order('type_line', { ascending: true }).order('name', { ascending: true }); break
        case 'released_at_desc':
        default:
          query = query.order('released_at', { ascending: false, nullsFirst: false }); break
      }

      if (selectedColors.length > 0) {
        query = query.contains('color_identity', selectedColors)
      }

      if (selectedTypes.length === 1) {
        query = query.ilike('type_line', `%${selectedTypes[0]}%`)
      } else if (selectedTypes.length > 1) {
        if (typeMode === 'and') {
          // AND: each type must appear in type_line (e.g. "Artifact Creature")
          for (const t of selectedTypes) {
            query = query.ilike('type_line', `%${t}%`)
          }
        } else {
          // OR: any of the types
          query = query.or(selectedTypes.map(t => `type_line.ilike.%${t}%`).join(','))
        }
      }

      if (selectedRarity) query = query.eq('rarity', selectedRarity)
      if (cmcMin !== '') query = query.gte('cmc', Number(cmcMin))
      if (cmcMax !== '') query = query.lte('cmc', Number(cmcMax))
      if (selectedSet) query = query.eq('set_code', selectedSet)

      if (debouncedCreatureType.trim()) {
        query = query.ilike('type_line', `%${debouncedCreatureType.trim()}%`)
      }

      if (selectedKeyword.trim()) {
        query = query.contains('keywords', [selectedKeyword.trim()])
      }

      return query
    },
    [supabase, debouncedSearch, selectedColors, selectedTypes, typeMode, selectedRarity, cmcMin, cmcMax, selectedSet, debouncedCreatureType, selectedKeyword, sortBy]
  )

  useEffect(() => {
    let cancelled = false
    let controller: AbortController | null = null

    async function fetchCards() {
      setLoading(true)
      const { data, error } = await buildQuery(0)
      if (cancelled) return

      if (error) {
        console.error('Error fetching cards:', error)
        setCards([])
        setHasMore(false)
        setLoading(false)
        return
      }

      if (data && data.length > 0) {
        setCards(data)
        setHasMore(data.length === PAGE_SIZE)
        setLoading(false)
        return
      }

      if (debouncedSearch.trim().length >= 2) {
        try {
          controller = new AbortController()
          const res = await fetch(
            `/api/cards/search?q=${encodeURIComponent(debouncedSearch.trim())}`,
            { signal: controller.signal }
          )
          if (!cancelled && res.ok) {
            const json = await res.json()
            setCards(json.cards ?? [])
            setHasMore(false)
            setLoading(false)
            return
          }
        } catch { /* ignore */ }
      }

      if (!cancelled) {
        setCards(data ?? [])
        setHasMore(false)
        setLoading(false)
      }
    }

    const hasFilters =
      debouncedSearch || selectedColors.length > 0 || selectedTypes.length > 0 ||
      selectedRarity || cmcMin !== '' || cmcMax !== '' || selectedSet ||
      debouncedCreatureType.trim() || selectedKeyword.trim()

    if (hasFilters) {
      fetchCards()
    } else {
      setCards(initialCards)
      setHasMore(false)
      setLoading(false)
    }

    return () => { cancelled = true; controller?.abort() }
  }, [debouncedSearch, selectedColors, selectedTypes, selectedRarity, cmcMin, cmcMax, selectedSet, debouncedCreatureType, selectedKeyword, buildQuery, initialCards])

  const loadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const { data, error } = await buildQuery(cards.length)
    if (error) console.error('Error loading more:', error)
    else {
      setCards((prev) => [...prev, ...(data || [])])
      setHasMore((data || []).length === PAGE_SIZE)
    }
    setLoadingMore(false)
  }

  const toggleColor = (color: string) =>
    setSelectedColors((prev) => prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color])

  const toggleType = (type: string) =>
    setSelectedTypes((prev) => prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type])

  const clearFilters = () => {
    setSearchText(''); setSelectedColors([]); setSelectedTypes([])
    setSelectedRarity(''); setCmcMin(''); setCmcMax('')
    setSelectedSet(''); setCreatureType(''); setSelectedKeyword('')
  }

  const activeFilterCount = [
    searchText, selectedColors.length > 0, selectedTypes.length > 0,
    selectedRarity, cmcMin, cmcMax, selectedSet, creatureType, selectedKeyword,
  ].filter(Boolean).length

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-font-muted" size={18} />
        <input
          type="text"
          placeholder="Search cards by name, type, or text..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-lg bg-bg-card border border-border text-font-primary placeholder:text-font-muted focus:outline-none focus:border-bg-accent focus:ring-1 focus:ring-bg-accent transition-colors"
        />
      </div>

      {/* Color buttons + filter toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {MANA_COLORS.map((color) => {
            const isActive = selectedColors.includes(color.code)
            return (
              <button
                key={color.code}
                onClick={() => toggleColor(color.code)}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  isActive ? 'ring-2 ring-font-primary ring-offset-2 ring-offset-bg-dark scale-110' : 'opacity-60 hover:opacity-100'
                }`}
                style={{ backgroundColor: color.bg, color: color.text }}
                title={color.code}
              >
                {color.label}
              </button>
            )
          })}
        </div>

        <div className="w-px h-6 bg-border" />

        <button
          onClick={() => setShowFilters((p) => !p)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
            showFilters || activeFilterCount > 0
              ? 'bg-bg-accent/20 text-font-accent'
              : 'bg-bg-card border border-border text-font-secondary hover:text-font-primary'
          }`}
        >
          {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Filters
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-bg-accent px-1.5 py-0.5 text-[9px] font-bold text-font-white">{activeFilterCount}</span>
          )}
        </button>

        <div className="w-px h-6 bg-border" />

        {/* Sort dropdown */}
        <label className="flex items-center gap-1.5 rounded-lg bg-bg-card border border-border px-2.5 py-2 text-sm text-font-secondary cursor-pointer">
          <ArrowUpDown size={14} className="shrink-0 text-font-muted" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-transparent text-font-primary text-sm focus:outline-none cursor-pointer"
          >
            <option value="released_at_desc" className="bg-bg-surface">Newest</option>
            <option value="name_asc" className="bg-bg-surface">Name A→Z</option>
            <option value="name_desc" className="bg-bg-surface">Name Z→A</option>
            <option value="cmc_asc" className="bg-bg-surface">CMC Low→High</option>
            <option value="cmc_desc" className="bg-bg-surface">CMC High→Low</option>
            <option value="type_asc" className="bg-bg-surface">Type</option>
            <option value="price_asc" className="bg-bg-surface">Price Low→High</option>
            <option value="price_desc" className="bg-bg-surface">Price High→Low</option>
          </select>
        </label>

        {activeFilterCount > 0 && (
          <button onClick={clearFilters} className="text-xs text-font-accent hover:text-font-primary transition-colors">
            Clear all
          </button>
        )}
      </div>

      {/* Expanded filters */}
      {showFilters && (
        <div className="rounded-xl border border-border bg-bg-surface p-4 space-y-4">
          <div className="flex flex-wrap gap-3">
            {/* Set dropdown */}
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block text-xs font-medium text-font-muted">Set</label>
              <div className="relative">
                <select
                  value={selectedSet}
                  onChange={(e) => setSelectedSet(e.target.value)}
                  className="w-full appearance-none bg-bg-card border border-border text-font-primary rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:border-bg-accent cursor-pointer"
                >
                  <option value="">All Sets</option>
                  {sets.map((s) => (
                    <option key={s.set_code} value={s.set_code}>
                      {s.set_name} ({s.set_code.toUpperCase()})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-font-muted pointer-events-none" size={14} />
              </div>
            </div>

            {/* Rarity */}
            <div className="min-w-[140px]">
              <label className="mb-1 block text-xs font-medium text-font-muted">Rarity</label>
              <div className="relative">
                <select
                  value={selectedRarity}
                  onChange={(e) => setSelectedRarity(e.target.value)}
                  className="w-full appearance-none bg-bg-card border border-border text-font-primary rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:border-bg-accent cursor-pointer capitalize"
                >
                  <option value="">All Rarities</option>
                  {RARITIES.map((r) => (
                    <option key={r} value={r} className="capitalize">
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-font-muted pointer-events-none" size={14} />
              </div>
            </div>

            {/* CMC range */}
            <div className="min-w-[160px]">
              <label className="mb-1 block text-xs font-medium text-font-muted">Mana Value</label>
              <div className="flex items-center gap-1.5">
                <input type="number" placeholder="Min" value={cmcMin} onChange={(e) => setCmcMin(e.target.value)} min={0}
                  className="w-16 bg-bg-card border border-border text-font-primary rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-bg-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                <span className="text-font-muted">-</span>
                <input type="number" placeholder="Max" value={cmcMax} onChange={(e) => setCmcMax(e.target.value)} min={0}
                  className="w-16 bg-bg-card border border-border text-font-primary rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-bg-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              </div>
            </div>
          </div>

          {/* Card types (multi-select toggle) */}
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-xs font-medium text-font-muted">Card Type</span>
              {selectedTypes.length > 1 && (
                <button
                  onClick={() => setTypeMode((m) => m === 'and' ? 'or' : 'and')}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                    typeMode === 'and'
                      ? 'bg-bg-accent/20 text-font-accent'
                      : 'bg-bg-yellow/20 text-bg-yellow'
                  }`}
                  title={typeMode === 'and' ? 'AND: card must match ALL selected types' : 'OR: card must match ANY selected type'}
                >
                  {typeMode.toUpperCase()}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CARD_TYPES.map((type) => {
                const isActive = selectedTypes.includes(type)
                return (
                  <button key={type} onClick={() => toggleType(type)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      isActive ? 'bg-bg-accent text-font-white' : 'bg-bg-card border border-border text-font-secondary hover:text-font-primary hover:bg-bg-hover'
                    }`}
                  >
                    {type}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Creature subtype + Keyword */}
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block text-xs font-medium text-font-muted">
                Creature Subtype <span className="text-font-muted">(e.g. Zombie, God, Dinosaur)</span>
              </label>
              <div className="relative">
                <input type="text" placeholder="Elf, Dragon, Wizard..." value={creatureType} onChange={(e) => setCreatureType(e.target.value)}
                  className="w-full bg-bg-card border border-border text-font-primary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-bg-accent placeholder:text-font-muted" />
                {creatureType && (
                  <button onClick={() => setCreatureType('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-font-muted hover:text-font-primary">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            <div className="min-w-[200px]">
              <label className="mb-1 block text-xs font-medium text-font-muted">
                Keyword <span className="text-font-muted">(e.g. Flying, Deathtouch)</span>
              </label>
              <div className="relative">
                <input type="text" placeholder="Flying, Trample..." value={selectedKeyword} onChange={(e) => setSelectedKeyword(e.target.value)}
                  className="w-full bg-bg-card border border-border text-font-primary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-bg-accent placeholder:text-font-muted" />
                {selectedKeyword && (
                  <button onClick={() => setSelectedKeyword('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-font-muted hover:text-font-primary">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results count */}
      <div className="text-sm text-font-muted">
        {loading ? 'Searching...' : `${cards.length} card${cards.length !== 1 ? 's' : ''} shown`}
      </div>

      {/* Card grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="w-full aspect-[5/7] rounded-lg bg-bg-card" />
              <div className="mt-2 space-y-1.5">
                <div className="h-3.5 bg-bg-card rounded w-3/4" />
                <div className="h-3 bg-bg-card rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <CardGrid cards={cards} onSelectCard={setSelectedCard} />
      )}

      {/* Load more */}
      {!loading && hasMore && cards.length > 0 && (
        <div className="flex justify-center pt-4 pb-8">
          <button onClick={loadMore} disabled={loadingMore}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-bg-card border border-border text-font-secondary hover:bg-bg-hover hover:text-font-primary transition-colors disabled:opacity-50">
            {loadingMore ? (<><Loader2 size={16} className="animate-spin" /> Loading...</>) : 'Load More'}
          </button>
        </div>
      )}

      {selectedCard && <CardDetail card={selectedCard} onClose={() => setSelectedCard(null)} userDecks={userDecks} />}
    </div>
  )
}
