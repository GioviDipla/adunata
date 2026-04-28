'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  Crown,
  List,
  LayoutGrid,
  AlignLeft,
  ArrowUpDown,
  Filter,
  Layers,
} from 'lucide-react'
import DeckCard from './DeckCard'
import DeckGridView from './DeckGridView'
import DeckTextView from './DeckTextView'
import { getCardTypeCategory, TYPE_ORDER } from '@/lib/utils/card'
import { getPriceSortValue, summarizePreferredPrices } from '@/lib/utils/price'
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
type GroupMode = 'section' | 'type' | 'none'
type SortMode = 'cmc' | 'name' | 'price' | 'released'

const SORT_LABELS: Record<SortMode, string> = {
  cmc: 'Mana Cost',
  name: 'Name',
  price: 'Price',
  released: 'Newest',
}

const GROUP_LABELS: Record<GroupMode, string> = {
  section: 'Section',
  type: 'Type',
  none: 'No groups',
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

  /** Per-card owned/missing map keyed by `cards.id`. When present the
   *  DeckCard list-view tiles render an owned/missing chip. Grid/text
   *  views intentionally skip the badge to keep visual density low. */
  overlayByCardId?: Map<number, { owned: number; needed: number; missing: number }>
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
  overlayByCardId,
}: DeckContentProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const initialGroupMode: GroupMode = (sections?.length ?? 0) > 0 ? 'section' : 'type'
  const [groupMode, setGroupMode] = useState<GroupMode>(initialGroupMode)
  const [sortMode, setSortMode] = useState<SortMode>('cmc')
  // Grid column override (2-6). null = pick a sensible default at first
  // render based on viewport width (5 desktop / 3 mobile). Persisted as a
  // single integer once the user touches the segmented control.
  const [gridCols, setGridCols] = useState<number | null>(null)

  // Persist user preference per-deck. Hydration guard prevents flash.
  useEffect(() => {
    if (typeof window === 'undefined' || !deckId) return
    const k = `adunata:deck-view:${deckId}`
    const raw = window.localStorage.getItem(k)
    let stored: { view?: ViewMode; group?: GroupMode; sort?: SortMode; cols?: number } | null = null
    if (raw) {
      try {
        stored = JSON.parse(raw)
      } catch { /* ignore */ }
    }
    if (stored?.view) setViewMode(stored.view)
    if (stored?.group) setGroupMode(stored.group)
    if (stored?.sort) setSortMode(stored.sort)
    if (typeof stored?.cols === 'number') {
      setGridCols(stored.cols)
    } else {
      // Pick the responsive default once. ≥sm (640px) → 5, else 3.
      const isWide = window.matchMedia('(min-width: 640px)').matches
      setGridCols(isWide ? 5 : 3)
    }
  }, [deckId])

  useEffect(() => {
    if (typeof window === 'undefined' || !deckId) return
    const k = `adunata:deck-view:${deckId}`
    window.localStorage.setItem(
      k,
      JSON.stringify({ view: viewMode, group: groupMode, sort: sortMode, cols: gridCols ?? undefined }),
    )
  }, [deckId, viewMode, groupMode, sortMode, gridCols])

  // If sections appear/disappear, fix orphan group selection.
  useEffect(() => {
    if (groupMode === 'section' && (sections?.length ?? 0) === 0) {
      setGroupMode('type')
    }
  }, [groupMode, sections])

  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set())
  // Section filter: we store `''` to mean "Uncategorized" so the Set can
  // still hold a string sentinel for the null branch.
  const [sectionFilter, setSectionFilter] = useState<Set<string>>(new Set())
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set())
  const [showFilterPanel, setShowFilterPanel] = useState(false)

  const visibleCards = useMemo(() => {
    const noType = typeFilter.size === 0
    const noSection = sectionFilter.size === 0
    const noTag = tagFilter.size === 0
    if (noType && noSection && noTag) return cards
    return cards.filter((c) => {
      if (!c.card) return false
      if (!noType && !typeFilter.has(getCardTypeCategory(c.card.type_line)))
        return false
      if (!noSection) {
        const key = c.section_id ?? ''
        if (!sectionFilter.has(key)) return false
      }
      if (!noTag) {
        const cardTags = c.tags ?? []
        // AND semantics: every active tag must be present on the card.
        for (const t of tagFilter) {
          if (!cardTags.includes(t)) return false
        }
      }
      return true
    })
  }, [cards, typeFilter, sectionFilter, tagFilter])

  // Autocomplete suggestions for the TagEditor — every tag currently used
  // in the deck, deduped + alphabetical. Cheap to compute, re-runs only
  // when the cards array identity changes (card add/remove/tag-edit).
  const tagSuggestions = useMemo(
    () =>
      Array.from(new Set(cards.flatMap((c) => c.tags ?? []))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [cards],
  )

  // Shape expected by <SectionPicker>. Narrowed to the fields it renders.
  const sectionOptions = useMemo(
    () =>
      (sections ?? []).map((s) => ({ id: s.id, name: s.name, color: s.color })),
    [sections],
  )

  const editingWired =
    !!deckId && onSectionChange !== undefined && onTagsChange !== undefined

  const sortFn = useMemo<(a: DeckCardEntry, b: DeckCardEntry) => number>(() => {
    switch (sortMode) {
      case 'name':
        return (a, b) => a.card.name.localeCompare(b.card.name)
      case 'price':
        return (a, b) =>
          getPriceSortValue(b.card) -
          getPriceSortValue(a.card) ||
          a.card.name.localeCompare(b.card.name)
      case 'released':
        return (a, b) =>
          (b.card.released_at ?? '').localeCompare(a.card.released_at ?? '') ||
          a.card.name.localeCompare(b.card.name)
      case 'cmc':
      default:
        return (a, b) =>
          (a.card.cmc ?? 0) - (b.card.cmc ?? 0) ||
          a.card.name.localeCompare(b.card.name)
    }
  }, [sortMode])

  const groupedCards = useMemo<[string, DeckCardEntry[]][]>(() => {
    if (groupMode === 'section') {
      const byId = new Map<string, DeckCardEntry[]>()
      const uncategorized: DeckCardEntry[] = []
      for (const entry of visibleCards) {
        if (!entry.card) continue
        const sid = entry.section_id ?? null
        if (!sid) uncategorized.push(entry)
        else {
          if (!byId.has(sid)) byId.set(sid, [])
          byId.get(sid)!.push(entry)
        }
      }
      const out: [string, DeckCardEntry[]][] = []
      for (const s of sections ?? []) {
        const entries = byId.get(s.id) ?? []
        entries.sort(sortFn)
        out.push([s.id, entries])
      }
      if (uncategorized.length > 0) {
        uncategorized.sort(sortFn)
        out.push(['', uncategorized])
      }
      return out
    }

    if (groupMode === 'type') {
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
          sorted.push([type, groups[type].sort(sortFn)])
        }
      })
      return sorted
    }

    // groupMode === 'none' — single bucket
    const flat = [...visibleCards].sort(sortFn)
    return flat.length > 0 ? [['All Cards', flat]] : []
    // Note: caller filters out empty groups via `entries.length > 0` so
    // "Wincons (0)" / "Self Mill (0)" never render.
  }, [visibleCards, groupMode, sortMode, sections, sortFn])

  // Filtered for render — drops empty buckets so non-matching groups
  // don't show "No cards in this section." stubs.
  const renderGroups = useMemo(
    () => groupedCards.filter(([, entries]) => entries.length > 0),
    [groupedCards],
  )

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

  const toggleSectionFilter = useCallback((key: string) => {
    setSectionFilter((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleTagFilter = useCallback((tag: string) => {
    setTagFilter((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }, [])

  const clearAllFilters = useCallback(() => {
    setTypeFilter(new Set())
    setSectionFilter(new Set())
    setTagFilter(new Set())
  }, [])

  const totalFilterCount = typeFilter.size + sectionFilter.size + tagFilter.size

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
      {/* Toolbar: view mode + group + sort + filter — single row of h-10 chips */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-10 items-center gap-0.5 rounded-lg bg-bg-cell p-1">
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

        {viewMode === 'grid' && (
          <div
            className="flex h-10 items-center gap-0.5 rounded-lg bg-bg-cell p-1"
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
                className={`flex h-8 w-7 items-center justify-center rounded-md text-xs font-medium transition-colors ${
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
        )}

        <label className="flex h-10 items-center gap-1.5 rounded-lg bg-bg-cell px-3 text-xs text-font-secondary">
          <Layers className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Group:</span>
          <select
            value={groupMode}
            onChange={(e) => setGroupMode(e.target.value as GroupMode)}
            className="bg-transparent text-font-primary focus:outline-none"
            aria-label="Group cards by"
          >
            {(Object.keys(GROUP_LABELS) as GroupMode[]).map((mode) => {
              if (mode === 'section' && (sections?.length ?? 0) === 0) return null
              return (
                <option key={mode} value={mode} className="bg-bg-surface">
                  {GROUP_LABELS[mode]}
                </option>
              )
            })}
          </select>
        </label>

        <label className="flex h-10 items-center gap-1.5 rounded-lg bg-bg-cell px-3 text-xs text-font-secondary">
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
          className={`flex h-10 items-center gap-1.5 rounded-lg px-3 text-xs transition-colors ${
            totalFilterCount > 0 || showFilterPanel
              ? 'bg-bg-accent/20 text-font-accent'
              : 'bg-bg-cell text-font-secondary hover:text-font-primary'
          }`}
          aria-label="Filter cards"
        >
          <Filter className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Filter</span>
          {totalFilterCount > 0 && (
            <span className="rounded-full bg-bg-accent px-1.5 py-0.5 text-[9px] font-bold text-font-white">
              {totalFilterCount}
            </span>
          )}
        </button>
      </div>

      {showFilterPanel && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg-surface px-3 py-2">
          {/* Type group */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-font-muted">
              Type
            </span>
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
          </div>

          {/* Section group — only if the deck has sections or uncategorized cards */}
          {(sections?.length ?? 0) > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-font-muted">
                Section
              </span>
              {sections!.map((s) => {
                const active = sectionFilter.has(s.id)
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleSectionFilter(s.id)}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                      active
                        ? 'bg-bg-accent text-font-white'
                        : 'bg-bg-cell text-font-secondary hover:text-font-primary'
                    }`}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: s.color ?? '#475569' }}
                    />
                    {s.name}
                  </button>
                )
              })}
              {/* Uncategorized — only show if any card has no section_id */}
              {cards.some((c) => !c.section_id) && (
                <button
                  onClick={() => toggleSectionFilter('')}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                    sectionFilter.has('')
                      ? 'bg-bg-accent text-font-white'
                      : 'bg-bg-cell text-font-secondary hover:text-font-primary'
                  }`}
                >
                  Uncategorized
                </button>
              )}
            </div>
          )}

          {/* Tag group */}
          {tagSuggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-font-muted">
                Tag
              </span>
              {tagSuggestions.map((t) => {
                const active = tagFilter.has(t)
                return (
                  <button
                    key={t}
                    onClick={() => toggleTagFilter(t)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      active
                        ? 'bg-bg-accent text-font-white'
                        : 'bg-bg-cell text-font-secondary hover:text-font-primary'
                    }`}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          )}

          {totalFilterCount > 0 && (
            <div className="pt-1">
              <button
                onClick={clearAllFilters}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-font-muted hover:text-font-primary"
              >
                Clear filters
              </button>
            </div>
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
              sections={editingWired ? sectionOptions : undefined}
              onSectionChange={onSectionChange}
              cols={gridCols ?? undefined}
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
              sections={editingWired ? sectionOptions : undefined}
              onSectionChange={onSectionChange}
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
                  overlay={overlayByCardId?.get(entry.card.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main list */}
      {viewMode === 'list' && (
        <>
          {renderGroups.length === 0 ? (
            <div className="rounded-xl border border-border-light border-dashed bg-bg-surface p-8 text-center">
              <p className="text-font-muted">No cards here.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {renderGroups.map(([key, entries]) => {
                const count = entries.reduce((s, e) => s + e.quantity, 0)
                let headerLabel: string = key
                let headerDot: string | null = null
                let headerExtras: string | null = null

                if (groupMode === 'section') {
                  const section = sections?.find((x) => x.id === key)
                  headerLabel = section?.name ?? 'Uncategorized'
                  headerDot = section?.color ?? (section ? '#475569' : null)
                  const nonLand = entries.filter(
                    (e) => !(e.card.type_line ?? '').toLowerCase().includes('land'),
                  )
                  const totalCmc = nonLand.reduce(
                    (sum, e) => sum + Number(e.card.cmc ?? 0) * e.quantity,
                    0,
                  )
                  const totalNonLandQty = nonLand.reduce((sum, e) => sum + e.quantity, 0)
                  const avgCmc = totalNonLandQty > 0 ? totalCmc / totalNonLandQty : 0
                  const parts: string[] = []
                  const priceSummary = summarizePreferredPrices(entries)
                  if (priceSummary) parts.push(priceSummary)
                  if (totalNonLandQty > 0) parts.push(`avg ${avgCmc.toFixed(2)} CMC`)
                  headerExtras = parts.length > 0 ? parts.join(' · ') : null
                }

                return (
                  <div key={key || '__uncategorized__'}>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-font-secondary">
                      {headerDot && (
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ background: headerDot }}
                        />
                      )}
                      {headerLabel}
                      <span className="text-xs text-font-muted">({count})</span>
                      {headerExtras && (
                        <span className="text-[10px] text-font-muted">
                          {headerExtras}
                        </span>
                      )}
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
                          deckId={editingWired ? deckId : undefined}
                          deckCardId={entry.id}
                          sections={sectionOptions}
                          sectionId={entry.section_id ?? null}
                          tags={entry.tags ?? []}
                          tagSuggestions={tagSuggestions}
                          onSectionChange={onSectionChange}
                          onTagsChange={onTagsChange}
                          overlay={overlayByCardId?.get(entry.card.id)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {viewMode === 'grid' && (
        groupMode !== 'none' && renderGroups.length > 0 ? (
          <div className="flex flex-col gap-4">
            {renderGroups.map(([key, entries]) => {
              const count = entries.reduce((s, e) => s + e.quantity, 0)
              let headerLabel: string = key
              let headerDot: string | null = null
              let headerExtras: string | null = null
              if (groupMode === 'section') {
                const section = sections?.find((x) => x.id === key)
                headerLabel = section?.name ?? 'Uncategorized'
                headerDot = section?.color ?? (section ? '#475569' : null)
                const nonLand = entries.filter(
                  (e) => !(e.card.type_line ?? '').toLowerCase().includes('land'),
                )
                const totalCmc = nonLand.reduce(
                  (sum, e) => sum + Number(e.card.cmc ?? 0) * e.quantity,
                  0,
                )
                const totalNonLandQty = nonLand.reduce((sum, e) => sum + e.quantity, 0)
                const avgCmc = totalNonLandQty > 0 ? totalCmc / totalNonLandQty : 0
                const parts: string[] = []
                const priceSummary = summarizePreferredPrices(entries)
                if (priceSummary) parts.push(priceSummary)
                if (totalNonLandQty > 0) parts.push(`avg ${avgCmc.toFixed(2)} CMC`)
                headerExtras = parts.length > 0 ? parts.join(' · ') : null
              }
              return (
                <div key={key || '__uncategorized__'}>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-font-secondary">
                    {headerDot && (
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: headerDot }}
                      />
                    )}
                    {headerLabel}
                    <span className="text-xs text-font-muted">({count})</span>
                    {headerExtras && (
                      <span className="text-[10px] text-font-muted">
                        {headerExtras}
                      </span>
                    )}
                  </h3>
                  <DeckGridView
                    cards={entries}
                    onQuantityChange={onQuantityChange}
                    onRemove={onRemove}
                    isCommander={isCommander}
                    onToggleCommander={onToggleCommander}
                    onCardClick={onCardClick}
                    readOnly={readOnly}
                    onMoveToBoard={onMoveToBoard}
                    sections={editingWired ? sectionOptions : undefined}
                    onSectionChange={onSectionChange}
                    cols={gridCols ?? undefined}
                  />
                </div>
              )
            })}
          </div>
        ) : (
          <DeckGridView
            cards={flatSortedCards}
            onQuantityChange={onQuantityChange}
            onRemove={onRemove}
            isCommander={isCommander}
            onToggleCommander={onToggleCommander}
            onCardClick={onCardClick}
            readOnly={readOnly}
            onMoveToBoard={onMoveToBoard}
            sections={editingWired ? sectionOptions : undefined}
            onSectionChange={onSectionChange}
            cols={gridCols ?? undefined}
          />
        )
      )}

      {viewMode === 'text' && (
        <DeckTextView
          cards={flatSortedCards}
          groups={renderGroups}
          isCommander={isCommander}
          onToggleCommander={onToggleCommander}
          onCardClick={onCardClick}
          onMoveToBoard={onMoveToBoard}
          onQuantityChange={onQuantityChange}
          onRemove={onRemove}
          sections={editingWired ? sectionOptions : undefined}
          onSectionChange={onSectionChange}
        />
      )}
    </div>
  )
}
