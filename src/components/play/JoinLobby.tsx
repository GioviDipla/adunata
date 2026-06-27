'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogIn, ClipboardPaste } from 'lucide-react'

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
    <div className="rounded-none border-2 border-[#2A2A2A] bg-[#141414] p-5">
      <h2 className="mb-3 font-mono text-sm font-bold tracking-widest uppercase">[ JOIN BY CODE ]</h2>
      <div className="relative mb-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Enter code (e.g. XKRM42)"
          maxLength={6}
          className="w-full rounded-none border border-[#2A2A2A] bg-[#0D0D0D] px-3 py-2.5 pr-12 font-mono text-lg uppercase tracking-[0.2em] text-[#E8E8E8] placeholder:text-[#555] placeholder:tracking-normal focus:border-[#FF2A2A] focus:outline-none"
        />
        <button
          onClick={async () => { try { const text = await navigator.clipboard.readText(); setCode(text.slice(0, 6).toUpperCase()); } catch {} }}
          className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-none text-[#787878] hover:text-[#E8E8E8]"
          title="Paste from clipboard"
        >
          <ClipboardPaste className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-3 -mt-1 font-mono text-[11px] text-[#555]">{code.length}/6 CHARS</p>
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
            onClick={handleJoin}
            disabled={code.length < 6 || !selectedDeck || joining}
            className={`flex items-center gap-2 rounded-none px-4 py-2.5 font-mono text-xs font-bold tracking-widest uppercase transition-colors ${
              code.length < 6 || !selectedDeck || joining
                ? 'cursor-not-allowed bg-[#1A1A1A] text-[#555]'
                : 'bg-[#E8E8E8] text-[#0D0D0D] hover:bg-white'
            }`}
          >
            {joining ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                [ EXECUTING ]
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                [ EXECUTE ]
              </>
            )}
          </button>
        </>
      )}
    </div>
  )
}
