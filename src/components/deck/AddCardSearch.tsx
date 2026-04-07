'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

interface AddCardSearchProps {
  deckId: string
  onCardAdded: (card: CardRow, board: string) => void
  currentBoard: string
}

export default function AddCardSearch({
  deckId,
  onCardAdded,
  currentBoard,
}: AddCardSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CardRow[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const searchCards = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }

    setLoading(true)
    const supabase = createClient()

    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .ilike('name', `%${searchQuery}%`)
      .limit(10)

    if (!error && data) {
      setResults(data)
      setIsOpen(data.length > 0)
      setSelectedIndex(0)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchCards(query), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, searchCards])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function addCard(card: CardRow) {
    const res = await fetch(`/api/decks/${deckId}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_id: card.id,
        quantity: 1,
        board: currentBoard,
      }),
    })

    if (res.ok) {
      onCardAdded(card, currentBoard)
      setQuery('')
      setIsOpen(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || results.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      addCard(results[selectedIndex])
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-font-muted" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Search cards to add..."
          className="w-full rounded-lg border border-border bg-bg-card py-2.5 pl-9 pr-3 text-sm text-font-primary placeholder:text-font-muted transition-colors focus:border-bg-accent focus:outline-none focus:ring-2 focus:ring-bg-accent/20"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-bg-accent" />
          </div>
        )}
      </div>

      {/* Dropdown results */}
      {isOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-1 max-h-80 w-full overflow-y-auto rounded-lg border border-border bg-bg-surface shadow-xl">
          {results.map((card, i) => (
            <button
              key={card.id}
              onClick={() => addCard(card)}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-bg-hover ${
                i === selectedIndex ? 'bg-bg-hover' : ''
              }`}
            >
              {card.image_small && (
                <img
                  src={card.image_small}
                  alt={card.name}
                  className="h-10 w-auto rounded"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-font-primary">
                  {card.name}
                </div>
                <div className="truncate text-xs text-font-muted">
                  {card.type_line} {card.mana_cost && `· ${card.mana_cost}`}
                </div>
              </div>
              <Plus className="h-4 w-4 shrink-0 text-font-muted" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
