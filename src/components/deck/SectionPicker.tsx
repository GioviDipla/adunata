'use client'

import { useEffect, useRef, useState } from 'react'
import { Layers, Check } from 'lucide-react'

export interface SectionOption {
  id: string
  name: string
  color: string | null
}

interface Props {
  deckId: string
  deckCardId: string
  currentSectionId: string | null
  sections: SectionOption[]
  /** Notified after the server accepts the change (or rolled back). */
  onChange?: (sectionId: string | null) => void
}

/**
 * Inline section pill + dropdown picker for a single deck_card row.
 * Persists via `PATCH /api/decks/:id/cards/:cardId` with `{ section_id }`.
 * Rolls back local optimistic state on non-ok response.
 */
export default function SectionPicker({
  deckId,
  deckCardId,
  currentSectionId,
  sections,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<string | null>(currentSectionId)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setValue(currentSectionId)
  }, [currentSectionId])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [open])

  async function pick(id: string | null) {
    setOpen(false)
    if (id === value) return
    const prev = value
    setValue(id)
    onChange?.(id)
    try {
      const res = await fetch(`/api/decks/${deckId}/cards/${deckCardId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ section_id: id }),
      })
      if (!res.ok) {
        setValue(prev)
        onChange?.(prev)
      }
    } catch {
      setValue(prev)
      onChange?.(prev)
    }
  }

  const current = sections.find((s) => s.id === value)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className="flex items-center gap-1 rounded border border-border bg-bg-cell px-1.5 py-0.5 text-[10px] text-font-secondary hover:bg-bg-dark hover:text-font-primary"
      >
        {current ? (
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: current.color ?? '#475569' }}
          />
        ) : (
          <Layers className="h-3 w-3" />
        )}
        <span className="max-w-[6rem] truncate">
          {current?.name ?? 'Section'}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 min-w-[10rem] rounded-md border border-border bg-bg-surface shadow-lg">
          <ul className="max-h-60 overflow-auto py-1 text-xs">
            <li>
              <button
                onClick={() => pick(null)}
                className="flex w-full items-center gap-2 px-2 py-1 text-left text-font-secondary hover:bg-bg-hover"
              >
                <span className="flex h-3 w-3 items-center justify-center">
                  {value == null && <Check className="h-3 w-3" />}
                </span>
                <span>Uncategorized</span>
              </button>
            </li>
            {sections.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => pick(s.id)}
                  className="flex w-full items-center gap-2 px-2 py-1 text-left text-font-primary hover:bg-bg-hover"
                >
                  <span className="flex h-3 w-3 items-center justify-center">
                    {value === s.id && <Check className="h-3 w-3" />}
                  </span>
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: s.color ?? '#475569' }}
                  />
                  <span className="truncate">{s.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
