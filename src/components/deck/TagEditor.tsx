'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  initialTags: string[]
  /** Existing tags already used in the deck (for autocomplete). */
  suggestions: string[]
  /** Notified after persistence (or rollback on failure). */
  onChange?: (tags: string[]) => void
  /** Max-width hint for mobile vs desktop. */
  compact?: boolean
}

/**
 * Pill-style tag editor for a single deck_card row. Enter adds a tag,
 * backspace-on-empty removes the last one. Persistence is owned by the
 * parent: this component just emits `onChange(next)` and the editor
 * PATCHes + rolls back on failure.
 */
export default function TagEditor({
  initialTags,
  suggestions,
  onChange,
  compact,
}: Props) {
  const [tags, setTags] = useState<string[]>(initialTags)
  const [draft, setDraft] = useState('')

  // Keep local state in sync when the parent row mutates (e.g. after a
  // bulk op) so we don't drift from the server truth.
  useEffect(() => {
    setTags(initialTags)
  }, [initialTags])

  const filtered = suggestions
    .filter(
      (s) =>
        s.toLowerCase().includes(draft.toLowerCase()) && !tags.includes(s),
    )
    .slice(0, 6)

  function commit(next: string[]) {
    setTags(next)
    onChange?.(next)
  }

  function add(t: string) {
    const val = t.trim()
    if (!val || tags.includes(val) || tags.length >= 20) return
    commit([...tags, val])
    setDraft('')
  }

  function remove(t: string) {
    commit(tags.filter((x) => x !== t))
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((t) => (
        <span
          key={t}
          className="flex items-center gap-1 rounded-full bg-bg-cell px-2 py-0.5 text-[10px] text-font-secondary"
        >
          {t}
          <button
            onClick={(e) => {
              e.stopPropagation()
              remove(t)
            }}
            aria-label={`remove ${t}`}
            className="text-font-muted hover:text-font-danger"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <div className="relative">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(draft)
            } else if (e.key === 'Backspace' && !draft && tags.length > 0) {
              remove(tags[tags.length - 1])
            }
          }}
          placeholder="+ tag"
          className={`rounded border border-border bg-bg-dark px-1.5 py-0.5 text-[10px] text-font-primary placeholder:text-font-muted focus:outline-none focus:ring-1 focus:ring-bg-accent ${
            compact ? 'w-16' : 'w-20'
          }`}
          maxLength={32}
        />
        {draft && filtered.length > 0 && (
          <ul className="absolute left-0 z-30 mt-0.5 min-w-full rounded border border-border bg-bg-surface text-[10px] shadow-lg">
            {filtered.map((s) => (
              <li key={s}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    add(s)
                  }}
                  className="block w-full px-2 py-0.5 text-left text-font-secondary hover:bg-bg-hover hover:text-font-primary"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
