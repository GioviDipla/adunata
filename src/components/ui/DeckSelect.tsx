'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Search, ChevronDown, Check } from 'lucide-react'

export interface DeckOption {
  id: string
  name: string
  format: string
}

interface DeckSelectProps {
  decks: DeckOption[]
  value: string
  onChange: (deckId: string) => void
  disabled?: boolean
  placeholder?: string
  emptyMessage?: string
  id?: string
}

export default function DeckSelect({
  decks,
  value,
  onChange,
  disabled = false,
  placeholder = 'Select a deck',
  emptyMessage = 'No decks available',
  id,
}: DeckSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Sort alphabetically
  const sorted = useMemo(
    () => [...decks].sort((a, b) => a.name.localeCompare(b.name)),
    [decks],
  )

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return sorted
    const q = search.toLowerCase()
    return sorted.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.format.toLowerCase().includes(q),
    )
  }, [sorted, search])

  const selected = decks.find((d) => d.id === value)

  // Reset highlight when search changes
  useEffect(() => {
    setHighlightIndex(0)
  }, [search])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // Focus search input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightIndex((prev) => Math.min(prev + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightIndex((prev) => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filtered[highlightIndex]) {
          onChange(filtered[highlightIndex].id)
          setOpen(false)
          setSearch('')
        }
        break
    }
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current || !open) return
    const item = listRef.current.children[highlightIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex, open])

  return (
    <div className="relative" ref={containerRef} id={id}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => { if (!disabled) { setOpen(!open); setSearch('') } }}
        disabled={disabled}
        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
          disabled
            ? 'cursor-not-allowed border-border bg-bg-cell text-font-muted'
            : 'border-border bg-bg-surface text-font-primary hover:border-border-light focus:border-bg-accent focus:outline-none focus:ring-2 focus:ring-bg-accent/20'
        }`}
      >
        {selected ? (
          <>
            <span className="flex-1 truncate text-left">{selected.name}</span>
            <span className="shrink-0 rounded-full bg-bg-cell px-2 py-0.5 text-[10px] font-semibold text-font-muted">
              {selected.format}
            </span>
          </>
        ) : (
          <span className="flex-1 truncate text-left text-font-muted">{placeholder}</span>
        )}
        <ChevronDown
          size={14}
          className={`shrink-0 text-font-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border bg-bg-surface shadow-lg">
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search size={14} className="shrink-0 text-font-muted" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search decks..."
              className="flex-1 bg-transparent text-sm text-font-primary placeholder:text-font-muted outline-none"
            />
          </div>

          {/* List */}
          {filtered.length > 0 ? (
            <ul ref={listRef} className="max-h-48 overflow-y-auto py-1" role="listbox">
              {filtered.map((deck, i) => {
                const isSelected = deck.id === value
                const isHighlighted = i === highlightIndex
                return (
                  <li key={deck.id} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(deck.id)
                        setOpen(false)
                        setSearch('')
                      }}
                      onMouseEnter={() => setHighlightIndex(i)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                        isHighlighted
                          ? 'bg-bg-hover'
                          : ''
                      }`}
                    >
                      <span className="flex-1 truncate text-font-primary">{deck.name}</span>
                      <span className="shrink-0 rounded-full bg-bg-cell px-2 py-0.5 text-[10px] font-semibold text-font-muted">
                        {deck.format}
                      </span>
                      {isSelected && <Check size={14} className="shrink-0 text-bg-accent" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="px-3 py-4 text-center text-xs text-font-muted">
              {search ? 'No matching decks' : emptyMessage}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
