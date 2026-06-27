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

  function handlePlay() {
    if (!selectedDeck) return
    router.push(`/decks/${selectedDeck}/goldfish`)
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
            Test your deck against a bot opponent that plays lands, casts creatures, attacks, and blocks.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={handlePlay}
            disabled={!selectedDeck}
          >
            <Play className="h-4 w-4" /> Start
          </Button>
        </>
      )}
    </div>
  )
}
