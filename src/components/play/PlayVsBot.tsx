'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Bot, Play } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import DeckSelect from '@/components/ui/DeckSelect'

interface Deck {
  id: string
  name: string
  format: string
}

export default function PlayVsBot({ decks }: { decks: Deck[] }) {
  const router = useRouter()
  const [selectedDeck, setSelectedDeck] = useState(decks[0]?.id ?? '')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePlay() {
    if (!selectedDeck) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/lobbies/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId: selectedDeck }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to start game')
        setCreating(false)
        return
      }
      const { lobbyId } = await res.json()
      router.push(`/play/${lobbyId}/game`)
    } catch {
      setError('Network error')
      setCreating(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Bot className="h-4 w-4 text-bg-accent" />
        <h2 className="text-sm font-semibold text-font-primary">Play vs GoblinAI</h2>
      </div>

      {decks.length === 0 ? (
        <>
          <p className="mb-2 text-sm text-font-muted">No decks available.</p>
          <Link href="/decks/new" className="text-xs text-font-accent hover:underline">
            Create a deck first
          </Link>
        </>
      ) : (
        <>
          <div className="mb-3">
            <DeckSelect
              decks={decks}
              value={selectedDeck}
              onChange={setSelectedDeck}
              placeholder="Pick a deck..."
            />
          </div>
          <p className="mb-3 text-[11px] text-font-muted">
            Play a real multiplayer game against GoblinAI. Full game log, chat, and all features.
          </p>
          {error && <p className="mb-2 text-xs text-bg-red">{error}</p>}
          <Button
            variant="primary"
            size="sm"
            onClick={handlePlay}
            loading={creating}
            disabled={!selectedDeck || creating}
          >
            <Play className="h-4 w-4" /> Start
          </Button>
        </>
      )}
    </div>
  )
}
