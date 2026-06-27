'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'

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
    <div className="rounded-none border-2 border-[#2A2A2A] bg-[#141414] p-5">
      <h2 className="mb-3 font-mono text-sm font-bold tracking-widest uppercase">[ CREATE LOBBY ]</h2>
      {decks.length === 0 ? (
        <>
          <p className="mb-2 font-mono text-xs text-[#787878]">NO DECKS AVAILABLE</p>
          <Link href="/decks/new" className="font-mono text-xs text-[#FF2A2A] hover:underline">CREATE DECK FIRST</Link>
        </>
      ) : (
        <>
          <select
            value={selectedDeck}
            onChange={(e) => setSelectedDeck(e.target.value)}
            className="mb-3 w-full rounded-none border border-[#2A2A2A] bg-[#0D0D0D] px-3 py-2.5 font-mono text-sm text-[#E8E8E8] focus:border-[#FF2A2A] focus:outline-none"
          >
            {decks.map((d) => (
              <option key={d.id} value={d.id} className="font-mono">{d.name} ({d.format})</option>
            ))}
          </select>
          {error && <p className="mb-2 font-mono text-xs text-[#FF2A2A]">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={!selectedDeck || creating}
            className={`flex items-center gap-2 rounded-none px-4 py-2.5 font-mono text-xs font-bold tracking-widest uppercase transition-colors ${
              !selectedDeck || creating
                ? 'cursor-not-allowed bg-[#1A1A1A] text-[#555]'
                : 'bg-[#E8E8E8] text-[#0D0D0D] hover:bg-white'
            }`}
          >
            {creating ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                [ EXECUTING ]
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                [ EXECUTE ]
              </>
            )}
          </button>
        </>
      )}
    </div>
  )
}
