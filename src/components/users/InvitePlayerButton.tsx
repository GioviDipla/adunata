'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Swords, Send, Loader2, X } from 'lucide-react'

interface Deck { id: string; name: string; format: string }

interface InvitePlayerButtonProps {
  toUserId: string
  toDisplayName: string
  decks: Deck[]
}

/**
 * Public-profile CTA that fires off a 1v1 invitation to the profile
 * owner. Expands inline into a deck picker instead of opening a modal
 * — the page is small and a lightbox would feel heavy for a two-click
 * action. The server handles lobby creation; on success we navigate
 * to the new lobby's waiting room.
 */
export default function InvitePlayerButton({
  toUserId,
  toDisplayName,
  decks,
}: InvitePlayerButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selectedDeck, setSelectedDeck] = useState(decks[0]?.id ?? '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasDecks = decks.length > 0

  async function send() {
    if (!selectedDeck) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/lobbies/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId, deckId: selectedDeck }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Failed to send invite')
        setSending(false)
        return
      }
      const { lobby } = await res.json()
      router.push(`/play/${lobby.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite')
      setSending(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 self-start rounded-lg bg-bg-accent px-3 py-1.5 text-xs font-medium text-font-white transition-colors hover:bg-bg-accent-dark"
      >
        <Swords className="h-3.5 w-3.5" />
        Invite to 1v1
      </button>
    )
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-2 self-start rounded-lg border border-border bg-bg-surface p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-font-primary">
          Challenge {toDisplayName}
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Cancel"
          className="rounded-md p-1 text-font-muted hover:bg-bg-hover hover:text-font-primary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {hasDecks ? (
        <select
          value={selectedDeck}
          onChange={(e) => setSelectedDeck(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg-card px-2 py-1.5 text-xs text-font-primary"
          disabled={sending}
        >
          {decks.map((d) => (
            <option key={d.id} value={d.id}>{d.name} ({d.format})</option>
          ))}
        </select>
      ) : (
        <p className="rounded-md bg-bg-card px-2 py-1.5 text-xs text-font-muted">
          Create a deck before inviting someone.
        </p>
      )}

      {error && <p className="text-[11px] text-bg-red">{error}</p>}

      <button
        type="button"
        onClick={send}
        disabled={!hasDecks || !selectedDeck || sending}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-bg-accent px-3 py-1.5 text-xs font-medium text-font-white transition-colors hover:bg-bg-accent-dark disabled:opacity-60"
      >
        {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        Send invite
      </button>
    </div>
  )
}
