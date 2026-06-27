'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogIn, ClipboardPaste } from 'lucide-react'
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
      <div className="relative mb-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Enter code (e.g. XKRM42)"
          maxLength={6}
          className="w-full rounded-lg border border-border bg-bg-surface px-3 py-2 pr-9 text-sm font-mono tracking-widest text-font-primary uppercase placeholder:text-font-muted placeholder:tracking-normal placeholder:font-sans"
        />
        <button
          onClick={async () => { try { const text = await navigator.clipboard.readText(); setCode(text.slice(0, 6).toUpperCase()); } catch {} }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-font-muted hover:text-font-primary hover:bg-bg-hover transition-colors"
          title="Paste from clipboard"
        >
          <ClipboardPaste className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-3 text-[11px] text-font-muted -mt-1">{code.length}/6 characters</p>
      {decks.length === 0 ? (
        <>
          <p className="mb-2 text-sm text-font-muted">No decks available.</p>
          <Link href="/decks/new" className="text-xs text-font-accent hover:underline">Create a deck first</Link>
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  )
}
