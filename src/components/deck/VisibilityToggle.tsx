'use client'

import { useState, useTransition } from 'react'
import { Lock, Globe, Loader2 } from 'lucide-react'

interface VisibilityToggleProps {
  deckId: string
  initialVisibility: 'private' | 'public'
}

export default function VisibilityToggle({
  deckId,
  initialVisibility,
}: VisibilityToggleProps) {
  const [visibility, setVisibility] = useState(initialVisibility)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function setTo(next: 'private' | 'public') {
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
      } catch (e) {
        setVisibility(previous)
        setError(e instanceof Error ? e.message : 'Network error')
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5 rounded-lg bg-bg-cell p-1">
        <button
          onClick={() => setTo('private')}
          disabled={pending}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            visibility === 'private'
              ? 'bg-bg-surface text-font-primary shadow-sm'
              : 'text-font-muted hover:text-font-primary'
          }`}
        >
          <Lock className="h-3.5 w-3.5" />
          Private
        </button>
        <button
          onClick={() => setTo('public')}
          disabled={pending}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            visibility === 'public'
              ? 'bg-bg-green/20 text-bg-green'
              : 'text-font-muted hover:text-font-primary'
          }`}
        >
          <Globe className="h-3.5 w-3.5" />
          Public
        </button>
      </div>
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-font-muted" />}
      {error && <span className="text-[10px] text-bg-red">{error}</span>}
    </div>
  )
}
