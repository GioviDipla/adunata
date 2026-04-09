'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Deck { id: string; name: string; format: string }

export default function CreateLobby({ decks }: { decks: Deck[] }) {
  const router = useRouter()
  const [selectedDeck, setSelectedDeck] = useState(decks[0]?.id ?? '')
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!selectedDeck) return
    setCreating(true)
    const res = await fetch('/api/lobbies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deckId: selectedDeck }),
    })
    if (res.ok) {
      const { lobby } = await res.json()
      router.push(`/play/${lobby.id}`)
    }
    setCreating(false)
  }

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-font-primary">Create Lobby</h2>
      <select
        value={selectedDeck}
        onChange={(e) => setSelectedDeck(e.target.value)}
        className="mb-3 w-full rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-font-primary"
      >
        {decks.map((d) => (
          <option key={d.id} value={d.id}>{d.name} ({d.format})</option>
        ))}
      </select>
      <Button variant="primary" size="sm" onClick={handleCreate} loading={creating} disabled={!selectedDeck}>
        <Plus className="h-4 w-4" /> Create
      </Button>
    </div>
  )
}
