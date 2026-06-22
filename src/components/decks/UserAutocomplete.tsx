'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, X, Loader2 } from 'lucide-react'

export interface PickedUser {
  id: string
  name: string
}

interface UserResult {
  id: string
  username: string
  display_name: string | null
  public_deck_count: number
}

interface UserAutocompleteProps {
  value: PickedUser | null
  onChange: (user: PickedUser | null) => void
  placeholder?: string
}

// Single-select user autocomplete for the Creator filter. Mirrors
// CardAutocomplete UX: debounced search (min 2 chars), dropdown, keyboard
// nav, click-outside, AbortController.
export default function UserAutocomplete({
  value,
  onChange,
  placeholder,
}: UserAutocompleteProps) {
  const [query, setQuery] = useState(value?.name ?? '')
  const [results, setResults] = useState<UserResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    queueMicrotask(() => setQuery(value?.name ?? ''))
  }, [value])

  useEffect(() => {
    const trimmed = query.trim()
    const tooShort = trimmed.length < 2
    const echoesValue = !!value && trimmed === value.name
    if (tooShort || echoesValue) {
      abortRef.current?.abort()
      queueMicrotask(() => {
        setResults([])
        setOpen(false)
        if (tooShort) setLoading(false)
      })
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    queueMicrotask(() => setLoading(true))
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        )
        if (controller.signal.aborted) return
        if (res.ok) {
          const data = await res.json()
          const rows: UserResult[] = data.users ?? []
          setResults(rows.slice(0, 8))
          setOpen(rows.length > 0)
          setSelectedIdx(0)
        } else {
          setResults([])
          setOpen(false)
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setResults([])
          setOpen(false)
        }
      }
      if (!controller.signal.aborted) setLoading(false)
    }, 300)
    return () => {
      clearTimeout(handle)
      controller.abort()
    }
  }, [query, value])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function selectUser(u: UserResult) {
    const name = u.display_name || u.username
    onChange({ id: u.id, name })
    setQuery(name)
    setOpen(false)
  }

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    if (value) onChange(null)
  }

  function clear() {
    onChange(null)
    setQuery('')
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      selectUser(results[selectedIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-font-muted" />
        <input
          type="text"
          value={query}
          onChange={onInput}
          onKeyDown={onKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder ?? 'Search creator...'}
          className="w-full rounded-lg border border-border bg-bg-surface py-2 pl-9 pr-9 text-sm text-font-primary placeholder:text-font-muted focus:border-bg-accent focus:outline-none"
        />
        {loading && (
          <Loader2 className="absolute right-8 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-font-muted" />
        )}
        {value && !loading && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-font-muted hover:text-font-primary"
            aria-label="Clear"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-border bg-bg-surface shadow-xl">
          {results.map((u, i) => (
            <button
              key={u.id}
              type="button"
              onClick={() => selectUser(u)}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-bg-hover ${
                i === selectedIdx ? 'bg-bg-hover' : ''
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-font-primary">
                  {u.display_name || u.username}
                </span>
                <span className="block truncate text-xs text-font-muted">
                  @{u.username} · {u.public_deck_count} public
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
