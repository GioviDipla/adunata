'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Upload, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const FORMATS = [
  'Standard',
  'Modern',
  'Legacy',
  'Vintage',
  'Pioneer',
  'Commander',
  'Pauper',
  'Historic',
  'Alchemy',
  'Explorer',
  'Brawl',
  'Casual',
]

interface ParsedCard {
  name: string
  quantity: number
  board: 'main' | 'sideboard'
  setCode?: string
}

interface ImportResult {
  name: string
  status: 'success' | 'error' | 'pending'
  message?: string
}

function parseDeckList(text: string): ParsedCard[] {
  const lines = text.split('\n')
  const cards: ParsedCard[] = []
  let currentBoard: 'main' | 'sideboard' = 'main'

  for (const rawLine of lines) {
    const line = rawLine.trim()

    // Skip empty lines and comments
    if (!line || line.startsWith('//')) continue

    // Check for sideboard section markers
    if (/^sideboard\s*$/i.test(line) || /^SB:\s*$/i.test(line)) {
      currentBoard = 'sideboard'
      continue
    }

    // Handle "SB: 4 Card Name" inline prefix
    let workingLine = line
    let board = currentBoard
    if (/^SB:\s*/i.test(workingLine)) {
      board = 'sideboard'
      workingLine = workingLine.replace(/^SB:\s*/i, '')
    }

    // Parse card line: "4 Lightning Bolt" or "4x Lightning Bolt" or "4 Lightning Bolt (M21)" or "4 Lightning Bolt (M21) 123"
    const match = workingLine.match(
      /^(\d+)\s*x?\s+(.+?)(?:\s+\(([A-Za-z0-9]+)\))?(?:\s+\d+)?$/
    )

    if (match) {
      const quantity = parseInt(match[1], 10)
      const name = match[2].trim()
      const setCode = match[3] || undefined

      if (quantity > 0 && name) {
        cards.push({ name, quantity, board, setCode })
      }
    }
  }

  return cards
}

export default function ImportDeckPage() {
  const router = useRouter()
  const [deckName, setDeckName] = useState('')
  const [format, setFormat] = useState('Standard')
  const [deckText, setDeckText] = useState('')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<ImportResult[]>([])
  const [error, setError] = useState<string | null>(null)

  async function handleImport(e: React.FormEvent) {
    e.preventDefault()

    if (!deckName.trim()) {
      setError('Deck name is required')
      return
    }

    if (!deckText.trim()) {
      setError('Deck list is required')
      return
    }

    const parsedCards = parseDeckList(deckText)
    if (parsedCards.length === 0) {
      setError('Could not parse any cards from the list. Check the format.')
      return
    }

    setImporting(true)
    setError(null)
    setProgress(
      parsedCards.map((c) => ({
        name: `${c.quantity}x ${c.name}`,
        status: 'pending' as const,
      }))
    )

    // Step 1: Create the deck
    const deckRes = await fetch('/api/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: deckName.trim(),
        format,
      }),
    })

    if (!deckRes.ok) {
      setError('Failed to create deck')
      setImporting(false)
      return
    }

    const { deck } = await deckRes.json()
    const errors: string[] = []

    // Step 2: Look up each card and add to deck
    for (let i = 0; i < parsedCards.length; i++) {
      const parsed = parsedCards[i]

      setProgress((prev) =>
        prev.map((p, idx) =>
          idx === i ? { ...p, status: 'pending' as const, message: 'Looking up...' } : p
        )
      )

      try {
        // Look up card via API (checks local DB, falls back to Scryfall)
        const lookupRes = await fetch(
          `/api/cards/lookup?name=${encodeURIComponent(parsed.name)}`
        )

        if (!lookupRes.ok) {
          setProgress((prev) =>
            prev.map((p, idx) =>
              idx === i
                ? { ...p, status: 'error' as const, message: `Card not found: ${parsed.name}` }
                : p
            )
          )
          errors.push(parsed.name)
          continue
        }

        const { card } = await lookupRes.json()

        // Add card to deck
        const addRes = await fetch(`/api/decks/${deck.id}/cards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            card_id: card.id,
            quantity: parsed.quantity,
            board: parsed.board,
          }),
        })

        if (addRes.ok) {
          setProgress((prev) =>
            prev.map((p, idx) =>
              idx === i ? { ...p, status: 'success' as const, message: 'Added' } : p
            )
          )
        } else {
          setProgress((prev) =>
            prev.map((p, idx) =>
              idx === i
                ? { ...p, status: 'error' as const, message: 'Failed to add to deck' }
                : p
            )
          )
          errors.push(parsed.name)
        }
      } catch {
        setProgress((prev) =>
          prev.map((p, idx) =>
            idx === i
              ? { ...p, status: 'error' as const, message: 'Lookup failed' }
              : p
          )
        )
        errors.push(parsed.name)
      }

      // Small delay to avoid hammering Scryfall rate limit
      await new Promise((r) => setTimeout(r, 120))
    }

    if (errors.length === 0) {
      // All cards imported successfully, redirect
      router.push(`/decks/${deck.id}`)
    } else {
      setError(
        `${errors.length} card(s) could not be imported. You can add them manually in the deck editor.`
      )
      // Still allow navigation
      setTimeout(() => {
        router.push(`/decks/${deck.id}`)
      }, 3000)
    }

    setImporting(false)
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Back link */}
      <Link
        href="/decks"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-font-secondary transition-colors hover:text-font-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Decks
      </Link>

      <h1 className="mb-2 text-2xl font-bold text-font-primary">Import Deck</h1>
      <p className="mb-6 text-sm text-font-secondary">
        Paste a decklist from MTGO, Moxfield, or Archidekt. Supports formats like
        &quot;4 Lightning Bolt&quot;, &quot;4x Lightning Bolt&quot;, and set codes in parentheses.
      </p>

      <form onSubmit={handleImport} className="flex flex-col gap-5">
        <Input
          label="Deck Name"
          placeholder="e.g. Imported Burn"
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          required
        />

        {/* Format selector */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="format"
            className="text-sm font-medium text-font-secondary"
          >
            Format
          </label>
          <select
            id="format"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg-card px-3 py-2.5 text-sm text-font-primary transition-colors focus:border-bg-accent focus:outline-none focus:ring-2 focus:ring-bg-accent/20"
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        {/* Deck list textarea */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="decklist"
            className="text-sm font-medium text-font-secondary"
          >
            Deck List
          </label>
          <textarea
            id="decklist"
            placeholder={`4 Lightning Bolt\n4 Monastery Swiftspear\n4 Goblin Guide\n20 Mountain\n\nSideboard\n2 Smash to Smithereens`}
            value={deckText}
            onChange={(e) => setDeckText(e.target.value)}
            rows={12}
            className="w-full resize-y rounded-lg border border-border bg-bg-card px-3 py-2.5 font-mono text-sm text-font-primary placeholder:text-font-muted transition-colors focus:border-bg-accent focus:outline-none focus:ring-2 focus:ring-bg-accent/20"
            disabled={importing}
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-bg-red/10 px-4 py-3 text-sm text-bg-red">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={importing}
          disabled={importing}
        >
          <Upload className="h-4 w-4" />
          Import Deck
        </Button>
      </form>

      {/* Progress display */}
      {progress.length > 0 && (
        <div className="mt-6 rounded-xl border border-border bg-bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-font-secondary">
            Import Progress
          </h3>
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {progress.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded px-2 py-1 text-sm"
              >
                {item.status === 'pending' && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-font-muted" />
                )}
                {item.status === 'success' && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-bg-green" />
                )}
                {item.status === 'error' && (
                  <AlertCircle className="h-3.5 w-3.5 text-bg-red" />
                )}
                <span
                  className={
                    item.status === 'error'
                      ? 'text-bg-red'
                      : item.status === 'success'
                        ? 'text-font-primary'
                        : 'text-font-muted'
                  }
                >
                  {item.name}
                </span>
                {item.message && (
                  <span className="text-xs text-font-muted">- {item.message}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
