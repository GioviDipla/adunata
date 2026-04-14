'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, ChevronDown, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/types/supabase'
import { useDebounce } from '@/lib/hooks/useDebounce'
import CardGrid from './CardGrid'
import CardDetail from './CardDetail'

type Card = Database['public']['Tables']['cards']['Row']

const PAGE_SIZE = 40

const CARD_TYPES = [
  'Creature',
  'Instant',
  'Sorcery',
  'Enchantment',
  'Artifact',
  'Planeswalker',
  'Land',
] as const

const RARITIES = ['common', 'uncommon', 'rare', 'mythic'] as const

const MANA_COLORS = [
  { code: 'W', label: 'W', bg: '#F5F0E1', text: '#333' },
  { code: 'U', label: 'U', bg: '#0E7FC0', text: '#fff' },
  { code: 'B', label: 'B', bg: '#3D3229', text: '#fff' },
  { code: 'R', label: 'R', bg: '#D32029', text: '#fff' },
  { code: 'G', label: 'G', bg: '#00733E', text: '#fff' },
] as const

interface CardBrowserProps {
  initialCards: Card[]
}

export default function CardBrowser({ initialCards }: CardBrowserProps) {
  const supabase = createClient()

  const [cards, setCards] = useState<Card[]>(initialCards)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(initialCards.length === PAGE_SIZE)
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)

  // Filters
  const [searchText, setSearchText] = useState('')
  const [selectedColors, setSelectedColors] = useState<string[]>([])
  const [selectedType, setSelectedType] = useState('')
  const [selectedRarity, setSelectedRarity] = useState('')
  const [cmcMin, setCmcMin] = useState('')
  const [cmcMax, setCmcMax] = useState('')
  const [setCode, setSetCode] = useState('')

  const debouncedSearch = useDebounce(searchText, 300)

  const buildQuery = useCallback(
    (offset: number) => {
      let query = supabase
        .from('cards')
        .select('*')
        .order('name', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)

      if (debouncedSearch.trim()) {
        query = query.textSearch('search_vector', debouncedSearch.trim(), {
          type: 'websearch',
        })
      }

      if (selectedColors.length > 0) {
        query = query.contains('color_identity', selectedColors)
      }

      if (selectedType) {
        query = query.ilike('type_line', `%${selectedType}%`)
      }

      if (selectedRarity) {
        query = query.eq('rarity', selectedRarity)
      }

      if (cmcMin !== '') {
        query = query.gte('cmc', Number(cmcMin))
      }

      if (cmcMax !== '') {
        query = query.lte('cmc', Number(cmcMax))
      }

      if (setCode.trim()) {
        query = query.eq('set_code', setCode.trim().toLowerCase())
      }

      return query
    },
    [supabase, debouncedSearch, selectedColors, selectedType, selectedRarity, cmcMin, cmcMax, setCode]
  )

  // Fetch cards when filters change
  useEffect(() => {
    let cancelled = false
    let controller: AbortController | null = null

    async function fetchCards() {
      setLoading(true)

      // Primary: Supabase textSearch (fast, GIN-indexed)
      const { data, error } = await buildQuery(0)

      if (cancelled) return

      if (error) {
        console.error('Error fetching cards:', error)
        setCards([])
        setHasMore(false)
        setLoading(false)
        return
      }

      // If textSearch found results, use them
      if (data && data.length > 0) {
        setCards(data)
        setHasMore(data.length === PAGE_SIZE)
        setLoading(false)
        return
      }

      // Fallback: if textSearch returned 0 and we have a search term,
      // try the /api/cards/search endpoint (ilike + Scryfall fallback)
      if (debouncedSearch.trim().length >= 2) {
        try {
          controller = new AbortController()
          const res = await fetch(
            `/api/cards/search?q=${encodeURIComponent(debouncedSearch.trim())}`,
            { signal: controller.signal }
          )
          if (!cancelled && res.ok) {
            const json = await res.json()
            const fallbackCards = json.cards ?? []
            setCards(fallbackCards)
            setHasMore(false)
            setLoading(false)
            return
          }
        } catch {
          // Ignore abort/network errors
        }
      }

      if (!cancelled) {
        setCards(data ?? [])
        setHasMore(false)
        setLoading(false)
      }
    }

    // Skip initial fetch if no filters active (we have initialCards)
    const hasFilters =
      debouncedSearch ||
      selectedColors.length > 0 ||
      selectedType ||
      selectedRarity ||
      cmcMin !== '' ||
      cmcMax !== '' ||
      setCode.trim()

    if (hasFilters) {
      fetchCards()
    } else {
      setCards(initialCards)
      setHasMore(initialCards.length === PAGE_SIZE)
      setLoading(false)
    }

    return () => {
      cancelled = true
      controller?.abort()
    }
  }, [debouncedSearch, selectedColors, selectedType, selectedRarity, cmcMin, cmcMax, setCode, buildQuery, initialCards])

  const loadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)

    const { data, error } = await buildQuery(cards.length)

    if (error) {
      console.error('Error loading more cards:', error)
    } else {
      const newCards = data || []
      setCards((prev) => [...prev, ...newCards])
      setHasMore(newCards.length === PAGE_SIZE)
    }

    setLoadingMore(false)
  }

  const toggleColor = (color: string) => {
    setSelectedColors((prev) =>
      prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color]
    )
  }

  const clearFilters = () => {
    setSearchText('')
    setSelectedColors([])
    setSelectedType('')
    setSelectedRarity('')
    setCmcMin('')
    setCmcMax('')
    setSetCode('')
  }

  const hasActiveFilters =
    searchText ||
    selectedColors.length > 0 ||
    selectedType ||
    selectedRarity ||
    cmcMin !== '' ||
    cmcMax !== '' ||
    setCode.trim()

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-font-muted"
          size={18}
        />
        <input
          type="text"
          placeholder="Search cards by name, type, or text..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-lg bg-bg-card border border-border text-font-primary placeholder:text-font-muted focus:outline-none focus:border-bg-accent focus:ring-1 focus:ring-bg-accent transition-colors"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Color buttons */}
        <div className="flex items-center gap-1">
          {MANA_COLORS.map((color) => {
            const isActive = selectedColors.includes(color.code)
            return (
              <button
                key={color.code}
                onClick={() => toggleColor(color.code)}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  isActive
                    ? 'ring-2 ring-font-primary ring-offset-2 ring-offset-bg-dark scale-110'
                    : 'opacity-60 hover:opacity-100'
                }`}
                style={{ backgroundColor: color.bg, color: color.text }}
                title={`Filter by ${color.code}`}
              >
                {color.label}
              </button>
            )
          })}
        </div>

        <div className="w-px h-6 bg-border" />

        {/* Type dropdown */}
        <div className="relative">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="appearance-none bg-bg-card border border-border text-font-secondary rounded-lg pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:border-bg-accent cursor-pointer"
          >
            <option value="">All Types</option>
            {CARD_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <ChevronDown
            className="absolute right-2 top-1/2 -translate-y-1/2 text-font-muted pointer-events-none"
            size={14}
          />
        </div>

        {/* Rarity dropdown */}
        <div className="relative">
          <select
            value={selectedRarity}
            onChange={(e) => setSelectedRarity(e.target.value)}
            className="appearance-none bg-bg-card border border-border text-font-secondary rounded-lg pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:border-bg-accent cursor-pointer capitalize"
          >
            <option value="">All Rarities</option>
            {RARITIES.map((rarity) => (
              <option key={rarity} value={rarity} className="capitalize">
                {rarity.charAt(0).toUpperCase() + rarity.slice(1)}
              </option>
            ))}
          </select>
          <ChevronDown
            className="absolute right-2 top-1/2 -translate-y-1/2 text-font-muted pointer-events-none"
            size={14}
          />
        </div>

        {/* CMC range */}
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-font-muted">CMC</span>
          <input
            type="number"
            placeholder="Min"
            value={cmcMin}
            onChange={(e) => setCmcMin(e.target.value)}
            min={0}
            className="w-14 bg-bg-card border border-border text-font-secondary rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-bg-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-font-muted">-</span>
          <input
            type="number"
            placeholder="Max"
            value={cmcMax}
            onChange={(e) => setCmcMax(e.target.value)}
            min={0}
            className="w-14 bg-bg-card border border-border text-font-secondary rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-bg-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>

        {/* Set code */}
        <input
          type="text"
          placeholder="Set code"
          value={setCode}
          onChange={(e) => setSetCode(e.target.value)}
          className="w-20 bg-bg-card border border-border text-font-secondary rounded-lg px-2 py-1.5 text-sm uppercase focus:outline-none focus:border-bg-accent placeholder:normal-case"
        />

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-font-accent hover:text-font-primary transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Results count */}
      <div className="text-sm text-font-muted">
        {loading ? 'Searching...' : `${cards.length} card${cards.length !== 1 ? 's' : ''} shown`}
      </div>

      {/* Card grid or loading skeleton */}
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
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-bg-card border border-border text-font-secondary hover:bg-bg-hover hover:text-font-primary transition-colors disabled:opacity-50"
          >
            {loadingMore ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Loading...
              </>
            ) : (
              'Load More'
            )}
          </button>
        </div>
      )}

      {/* Card detail modal */}
      {selectedCard && (
        <CardDetail card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </div>
  )
}
