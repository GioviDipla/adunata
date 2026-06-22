'use client'

import CardListFilter from './CardListFilter'
import CardAutocomplete from './CardAutocomplete'
import UserAutocomplete from './UserAutocomplete'

export interface FilterState {
  name: string
  creator: { id: string; name: string } | null
  commander: { id: string; name: string } | null
  colors: string[]
  colorIdentity: string[]
  cards: { id: string; name: string }[]
  cardMode: 'and' | 'or'
  format: string
  sort: string
}

export const EMPTY_FILTERS: FilterState = {
  name: '',
  creator: null,
  commander: null,
  colors: [],
  colorIdentity: [],
  cards: [],
  cardMode: 'and',
  format: '',
  sort: 'updated',
}

const SORTS: { value: string; label: string }[] = [
  { value: 'updated', label: 'Last modified' },
  { value: 'created', label: 'Creation date' },
  { value: 'likes', label: 'Most liked' },
  { value: 'price', label: 'Price (high→low)' },
  { value: 'name', label: 'Name (A→Z)' },
]

const COLORS: { code: string; label: string; cls: string }[] = [
  { code: 'W', label: 'W', cls: 'bg-bg-surface border-font-secondary' },
  { code: 'U', label: 'U', cls: 'bg-bg-surface border-blue-400' },
  { code: 'B', label: 'B', cls: 'bg-bg-surface border-zinc-700' },
  { code: 'R', label: 'R', cls: 'bg-bg-surface border-red-500' },
  { code: 'G', label: 'G', cls: 'bg-bg-surface border-green-500' },
]

const FORMATS = ['Commander', 'Standard', 'Modern', 'Legacy']

interface DeckFiltersProps {
  filters: FilterState
  onChange: (f: FilterState) => void
}

function ColorGroup({
  label,
  selected,
  onToggle,
}: {
  label: string
  selected: string[]
  onToggle: (c: string) => void
}) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-font-secondary">
        {label}
      </span>
      <div className="flex gap-1.5">
        {COLORS.map((c) => {
          const active = selected.includes(c.code)
          return (
            <button
              key={c.code}
              type="button"
              onClick={() => onToggle(c.code)}
              className={`h-8 w-8 rounded-md border-2 text-xs font-bold ${
                active
                  ? `${c.cls} text-font-primary ring-2 ring-bg-accent`
                  : `${c.cls} text-font-muted opacity-60`
              }`}
            >
              {c.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function DeckFilters({ filters, onChange }: DeckFiltersProps) {
  const toggle = (key: 'colors' | 'colorIdentity', code: string) => {
    const arr = filters[key]
    onChange({
      ...filters,
      [key]: arr.includes(code)
        ? arr.filter((x) => x !== code)
        : [...arr, code],
    })
  }
  const set = <K extends keyof FilterState>(key: K, val: FilterState[K]) =>
    onChange({ ...filters, [key]: val })

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-font-secondary">
            Deck name
          </span>
          <input
            type="text"
            value={filters.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Search deck name..."
            className="rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-font-primary placeholder:text-font-muted focus:border-bg-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-font-secondary">Creator</span>
          <UserAutocomplete
            value={filters.creator}
            onChange={(u) => set('creator', u)}
            placeholder="Search creator..."
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-font-secondary">Commander</span>
          <CardAutocomplete
            value={filters.commander}
            onChange={(c) => set('commander', c)}
            placeholder="Search commander..."
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ColorGroup
          label="Color (mana cost)"
          selected={filters.colors}
          onToggle={(c) => toggle('colors', c)}
        />
        <ColorGroup
          label="Color identity"
          selected={filters.colorIdentity}
          onToggle={(c) => toggle('colorIdentity', c)}
        />
      </div>

      <CardListFilter
        cards={filters.cards}
        mode={filters.cardMode}
        onChange={(cards, mode) =>
          onChange({ ...filters, cards, cardMode: mode })
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-font-secondary">Format</span>
          <select
            value={filters.format}
            onChange={(e) => set('format', e.target.value)}
            className="rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-font-primary focus:border-bg-accent focus:outline-none"
          >
            <option value="">Any</option>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-font-secondary">Sort by</span>
          <select
            value={filters.sort}
            onChange={(e) => set('sort', e.target.value)}
            className="rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-font-primary focus:border-bg-accent focus:outline-none"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => onChange({ ...EMPTY_FILTERS })}
          className="rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-font-secondary hover:bg-bg-hover"
        >
          Clear filters
        </button>
      </div>
    </div>
  )
}
