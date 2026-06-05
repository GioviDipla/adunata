'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Lock, Link as LinkIcon, Globe, Loader2, ChevronDown, Check } from 'lucide-react'

export type DeckVisibility = 'private' | 'unlisted' | 'public'

interface VisibilityToggleProps {
  deckId: string
  initialVisibility: DeckVisibility
  /** Fires after a successful flip — the ShareDeckButton uses this to
   *  stay in sync so it skips the auto-promote prompt when the user
   *  already flipped the dropdown. */
  onChange?: (next: DeckVisibility) => void
}

interface Option {
  value: DeckVisibility
  label: string
  Icon: typeof Lock
  /** Short one-liner shown next to the option label and below the
   *  collapsed control. Mirrors what was previously surfaced only on
   *  hover. */
  description: string
  iconClass: string
}

const OPTIONS: Option[] = [
  {
    value: 'private',
    label: 'Private',
    Icon: Lock,
    description: 'Visibile solo a te.',
    iconClass: 'text-font-secondary',
  },
  {
    value: 'unlisted',
    label: 'Unlisted',
    Icon: LinkIcon,
    description: 'Chiunque abbia il link può vederlo. Non listato sul tuo profilo.',
    iconClass: 'text-bg-blue',
  },
  {
    value: 'public',
    label: 'Public',
    Icon: Globe,
    description: 'Visibile a tutti e listato sul tuo profilo pubblico.',
    iconClass: 'text-bg-green',
  },
]

function optionFor(value: DeckVisibility): Option {
  return OPTIONS.find((o) => o.value === value) ?? OPTIONS[0]
}

export default function VisibilityToggle({
  deckId,
  initialVisibility,
  onChange,
}: VisibilityToggleProps) {
  const [visibility, setVisibility] = useState<DeckVisibility>(initialVisibility)
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  // Close on outside click and on Escape so the dropdown behaves like
  // the native <select> the rest of the app uses elsewhere.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function setTo(next: DeckVisibility) {
    setOpen(false)
    if (next === visibility) return
    const previous = visibility
    setVisibility(next)
    setError(null)

    startTransition(async () => {
      try {
        const res = await fetch(`/api/decks/${deckId}/visibility`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visibility: next }),
        })
        if (!res.ok) {
          setVisibility(previous)
          const data = await res.json().catch(() => ({ error: 'Update failed' }))
          setError(data.error ?? 'Update failed')
          return
        }
        onChange?.(next)
      } catch (e) {
        setVisibility(previous)
        setError(e instanceof Error ? e.message : 'Network error')
      }
    })
  }

  const current = optionFor(visibility)
  const CurrentIcon = current.Icon

  return (
    <div ref={wrapperRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={current.description}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-surface px-3 py-1.5 text-xs font-medium text-font-primary transition-colors hover:bg-bg-hover disabled:opacity-60"
      >
        <CurrentIcon className={`h-3.5 w-3.5 ${current.iconClass}`} />
        <span>{current.label}</span>
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-font-muted" />
        ) : (
          <ChevronDown className={`h-3.5 w-3.5 text-font-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {error && <span className="ml-2 text-[10px] text-bg-red">{error}</span>}

      {open && (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 w-64 max-w-[80vw] rounded-xl border border-border bg-bg-surface p-1 shadow-2xl"
        >
          {OPTIONS.map((opt) => {
            const Icon = opt.Icon
            const active = opt.value === visibility
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => setTo(opt.value)}
                  className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-bg-hover ${
                    active ? 'bg-bg-hover' : ''
                  }`}
                >
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${opt.iconClass}`} />
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-xs font-semibold text-font-primary">
                      {opt.label}
                      {active && <Check className="h-3 w-3 text-bg-accent" />}
                    </span>
                    <span className="text-[11px] leading-snug text-font-muted">
                      {opt.description}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
