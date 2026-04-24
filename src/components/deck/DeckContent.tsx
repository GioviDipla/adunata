'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  Crown,
  List,
  LayoutGrid,
  AlignLeft,
  ArrowUpDown,
  Filter,
} from 'lucide-react'
import DeckCard from './DeckCard'
import DeckGridView from './DeckGridView'
import DeckTextView from './DeckTextView'
import { getCardTypeCategory, TYPE_ORDER } from '@/lib/utils/card'
import type { Database } from '@/types/supabase'
import type { SectionRow } from '@/types/deck'

type CardRow = Database['public']['Tables']['cards']['Row']

export interface DeckCardEntry {
  id: string
  card: CardRow
  quantity: number
  board: string
  /** True when the row was imported with a foil / etched marker. */
  isFoil?: boolean
  /** Section this card lives in (null = uncategorized). */
  section_id?: string | null
  /** Free-form user tags. */
  tags?: string[]
  /** Manual ordering within a section. */
  position_in_section?: number | null
}

type ViewMode = 'list' | 'grid' | 'text'
type SortMode = 'type' | 'name' | 'cmc' | 'price' | 'released'

const SORT_LABELS: Record<SortMode, string> = {
  type: 'Type',
  name: 'Name',
  cmc: 'Mana Cost',
  price: 'Price',
  released: 'Newest',
}

const VIEW_MODE_OPTIONS: { mode: ViewMode; icon: typeof List; label: string }[] = [
  { mode: 'list', icon: List, label: 'List view' },
  { mode: 'grid', icon: LayoutGrid, label: 'Grid view' },
  { mode: 'text', icon: AlignLeft, label: 'Text view' },
]

interface DeckContentProps {
  /** Cards for the currently-selected board (already filtered by activeTab) */
  cards: DeckCardEntry[]
  /** Commander cards (rendered in their own section above the main list) */
  commanderCards: DeckCardEntry[]
  /** Sections for the deck, if any. Enables the section sort mode + filter. */
  sections?: SectionRow[]
  /** Deck id — required when section/tag editing is enabled (owner only). */
  deckId?: string
  /** Opens the CardDetail modal when a card is tapped */
  onCardClick?: (card: CardRow) => void
  /** Returns true if the given cardId is a commander */
  isCommander?: (cardId: number) => boolean

  // Edit handlers — when undefined, the corresponding edit UI is hidden
  onQuantityChange?: (cardId: number, quantity: number, board: string) => void
  onRemove?: (cardId: number, board: string) => void
  onToggleCommander?: (cardId: number, board: string) => void
  onMoveToBoard?: (cardId: number, fromBoard: string, toBoard: string) => void
  /** Called after a section assignment is persisted (owner edit only). */
  onSectionChange?: (deckCardId: string, sectionId: string | null) => void
  /** Called after tag changes are persisted (owner edit only). */
  onTagsChange?: (deckCardId: string, tags: string[]) => void
}

export default function DeckContent({
  cards,
  commanderCards,
  sections,
  deckId,
  onCardClick,
  isCommander,
  onQuantityChange,
  onRemove,
  onToggleCommander,
  onMoveToBoard,
  onSectionChange,
  onTagsChange,
}: DeckContentProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortMode, setSortMode] = useState<SortMode>('type')
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set())
  const [showFilterPanel, setShowFilterPanel] = useState(false)

  const visibleCards = useMemo(() => {
    if (typeFilter.size === 0) return cards
    return cards.filter((c) => {
      if (!c.card) return false
      return typeFilter.has(getCardTypeCategory(c.card.type_line))
    })
  }, [cards, typeFilter])

  const groupedCards = useMemo<[string, DeckCardEntry[]][]>(() => {
    if (sortMode === 'type') {
      const groups: Record<string, DeckCardEntry[]> = {}
      visibleCards.forEach((entry) => {
        if (!entry.card) return
        const cat = getCardTypeCategory(entry.card.type_line)
        if (!groups[cat]) groups[cat] = []
        groups[cat].push(entry)
      })
      const sorted: [string, DeckCardEntry[]][] = []
      TYPE_ORDER.forEach((type) => {
        if (groups[type]) {
          sorted.push([
            type,
            groups[type].sort(
              (a, b) =>
                a.card.cmc - b.card.cmc ||
                a.card.name.localeCompare(b.card.name),
            ),
          ])
        }
      })
      return sorted
    }

    let sortFn: (a: DeckCardEntry, b: DeckCardEntry) => number
    switch (sortMode) {
      case 'name':
        sortFn = (a, b) => a.card.name.localeCompare(b.card.name)
        break
      case 'price':
        sortFn = (a, b) =>
          ((b.card.prices_eur ?? b.card.prices_usd ?? 0) as number) -
          ((a.card.prices_eur ?? a.card.prices_usd ?? 0) as number) ||
          a.card.name.localeCompare(b.card.name)
        break
      case 'released':
        sortFn = (a, b) =>
          (b.card.released_at ?? '').localeCompare(a.card.released_at ?? '') ||
          a.card.name.localeCompare(b.card.name)
        break
      case 'cmc':
      default:
        sortFn = (a, b) =>
          a.card.cmc - b.card.cmc ||
          a.card.name.localeCompare(b.card.name)
    }

    const flat = [...visibleCards].sort(sortFn)
    return flat.length > 0 ? [['All Cards', flat]] : []
  }, [visibleCards, sortMode])

  const flatSortedCards = useMemo(
    () => groupedCards.flatMap(([, entries]) => entries),
    [groupedCards],
  )

  const toggleTypeFilter = useCallback((type: string) => {
    setTypeFilter((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }, [])

  const clearTypeFilter = useCallback(() => setTypeFilter(new Set()), [])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const entry of cards) {
      if (!entry.card) continue
      const cat = getCardTypeCategory(entry.card.type_line)
      counts[cat] = (counts[cat] ?? 0) + entry.quantity
    }
    return counts
  }, [cards])

  const readOnly =
    onQuantityChange === undefined &&
    onRemove === undefined &&
    onToggleCommander === undefined

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar: view mode + sort + filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-0.5 rounded-lg bg-bg-cell p-1">
          {VIEW_MODE_OPTIONS.map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                viewMode === mode
                  ? 'bg-bg-surface text-font-primary shadow-sm'
                  : 'text-font-muted hover:text-font-primary'
              }`}
              title={label}
              aria-label={label}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        <label className="flex h-10 items-center gap-1.5 rounded-lg bg-bg-cell px-2.5 text-xs text-font-secondary">
          <ArrowUpDown className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Sort:</span>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="bg-transparent text-font-primary focus:outline-none"
            aria-label="Sort cards by"
          >
            {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
              <option key={mode} value={mode} className="bg-bg-surface">
                {SORT_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={() => setShowFilterPanel((prev) => !prev)}
          className={`flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors ${
            typeFilter.size > 0 || showFilterPanel
              ? 'bg-bg-accent/20 text-font-accent'
              : 'bg-bg-cell text-font-secondary hover:text-font-primary'
          }`}
          aria-label="Filter by type"
        >
          <Filter className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Filter</span>
          {typeFilter.size > 0 && (
            <span className="rounded-full bg-bg-accent px-1.5 py-0.5 text-[9px] font-bold text-font-white">
              {typeFilter.size}
            </span>
          )}
        </button>
      </div>

      {showFilterPanel && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-bg-surface px-3 py-2">
          {TYPE_ORDER.map((type) => {
            const count = typeCounts[type] ?? 0
            if (count === 0) return null
            const active = typeFilter.has(type)
            return (
              <button
                key={type}
                onClick={() => toggleTypeFilter(type)}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? 'bg-bg-accent text-font-white'
                    : 'bg-bg-cell text-font-secondary hover:text-font-primary'
                }`}
              >
                {type} ({count})
              </button>
            )
          })}
          {typeFilter.size > 0 && (
            <button
              onClick={clearTypeFilter}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-font-muted hover:text-font-primary"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Commander section */}
      {commanderCards.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-bg-yellow">
            <Crown className="h-4 w-4" />
            Commander
          </h3>
          {viewMode === 'grid' ? (
            <DeckGridView
              cards={commanderCards}
              onQuantityChange={onQuantityChange}
              onRemove={onRemove}
              isCommander={() => true}
              onToggleCommander={onToggleCommander}
              onCardClick={onCardClick}
              readOnly={readOnly}
              onMoveToBoard={onMoveToBoard}
            />
          ) : viewMode === 'text' ? (
            <DeckTextView
              cards={commanderCards}
              isCommander={() => true}
              onToggleCommander={onToggleCommander}
              onCardClick={onCardClick}
              onMoveToBoard={onMoveToBoard}
              onQuantityChange={onQuantityChange}
              onRemove={onRemove}
            />
          ) : (
            <div className="flex flex-col gap-1">
              {commanderCards.map((entry) => (
                <DeckCard
                  key={`${entry.card.id}-${entry.board}`}
                  card={entry.card}
                  quantity={entry.quantity}
                  board={entry.board}
                  isCommander
                  onQuantityChange={onQuantityChange}
                  onRemove={onRemove}
                  onToggleCommander={onToggleCommander}
                  onCardClick={onCardClick}
                  onMoveToBoard={onMoveToBoard}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main list */}
      {viewMode === 'list' && (
        <>
          {groupedCards.length === 0 ? (
            <div className="rounded-xl border border-border-light border-dashed bg-bg-surface p-8 text-center">
              <p className="text-font-muted">No cards here.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {groupedCards.map(([type, entries]) => (
                <div key={type}>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-font-secondary">
                    {type}
                    <span className="text-xs text-font-muted">
                      ({entries.reduce((s, e) => s + e.quantity, 0)})
                    </span>
                  </h3>
                  <div className="flex flex-col gap-1">
                    {entries.map((entry) => (
                      <DeckCard
                        key={`${entry.card.id}-${entry.board}`}
                        card={entry.card}
                        quantity={entry.quantity}
                        board={entry.board}
                        isCommander={isCommander?.(entry.card.id) ?? false}
                        onQuantityChange={onQuantityChange}
                        onRemove={onRemove}
                        onToggleCommander={onToggleCommander}
                        onCardClick={onCardClick}
                        onMoveToBoard={onMoveToBoard}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {viewMode === 'grid' && (
        <DeckGridView
          cards={flatSortedCards}
          onQuantityChange={onQuantityChange}
          onRemove={onRemove}
          isCommander={isCommander}
          onToggleCommander={onToggleCommander}
          onCardClick={onCardClick}
          readOnly={readOnly}
          onMoveToBoard={onMoveToBoard}
        />
      )}

      {viewMode === 'text' && (
        <DeckTextView
          cards={flatSortedCards}
          groups={groupedCards}
          isCommander={isCommander}
          onToggleCommander={onToggleCommander}
          onCardClick={onCardClick}
          onMoveToBoard={onMoveToBoard}
          onQuantityChange={onQuantityChange}
          onRemove={onRemove}
        />
      )}
    </div>
  )
}
