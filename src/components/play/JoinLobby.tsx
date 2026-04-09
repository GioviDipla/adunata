'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogIn } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Deck { id: string; name: string; format: string }

export default function JoinLobby({ decks }: { decks: Deck[] }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [selectedDeck, setSelectedDeck] = useState(decks[0]?.id ?? '')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleJoin() {
    if (!code || !selectedDeck) return
    setJoining(true)
    setError(null)
    const res = await fetch('/api/lobbies/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.toUpperCase(), deckId: selectedDeck }),
    })
    if (res.ok) {
      const { lobby } = await res.json()
      router.push(`/play/${lobby.id}`)
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to join')
    }
    setJoining(false)
  }

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-font-primary">Join Lobby</h2>
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Enter code (e.g. XKRM42)"
        maxLength={6}
        className="mb-2 w-full rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm font-mono tracking-widest text-font-primary uppercase placeholder:text-font-muted placeholder:tracking-normal placeholder:font-sans"
      />
      <select
        value={selectedDeck}
        onChange={(e) => setSelectedDeck(e.target.value)}
        className="mb-3 w-full rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-font-primary"
      >
        {decks.map((d) => (
          <option key={d.id} value={d.id}>{d.name} ({d.format})</option>
        ))}
      </select>
      {error && <p className="mb-2 text-xs text-bg-red">{error}</p>}
      <Button variant="primary" size="sm" onClick={handleJoin} loading={joining} disabled={code.length < 6 || !selectedDeck}>
        <LogIn className="h-4 w-4" /> Join
      </Button>
    </div>
  )
}
