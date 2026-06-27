'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import DeckSelect from '@/components/ui/DeckSelect'

interface Deck { id: string; name: string; format: string }

export default function CreateLobby({ decks }: { decks: Deck[] }) {
  const router = useRouter()
  const [selectedDeck, setSelectedDeck] = useState(decks[0]?.id ?? '')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!selectedDeck) return
    setCreating(true)
    setError(null)
    const res = await fetch('/api/lobbies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deckId: selectedDeck }),
    })
    if (res.ok) {
      const { lobby } = await res.json()
      router.push(`/play/${lobby.id}`)
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to create lobby')
    }
    setCreating(false)
  }

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-font-primary">Create Lobby</h2>
      {decks.length === 0 ? (
        <>
          <p className="mb-2 text-sm text-font-muted">No decks available.</p>
          <Link href="/decks/new" className="text-xs text-font-accent hover:underline">Create a deck first</Link>
        </>
      ) : (
        <>
          <div className="mb-3">
            <DeckSelect
              decks={decks}
              value={selectedDeck}
              onChange={setSelectedDeck}
              placeholder="Select a deck..."
            />
          </div>
          {error && <p className="mb-2 text-xs text-bg-red">{error}</p>}
          <Button variant="primary" size="sm" onClick={handleCreate} loading={creating} disabled={!selectedDeck}>
            <Plus className="h-4 w-4" /> Create
          </Button>
        </>
      )}
    </div>
  )
}
