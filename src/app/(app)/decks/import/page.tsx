'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Upload, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { parseDeckList } from '@/lib/utils/deckParser'

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

export default function ImportDeckPage() {
  const router = useRouter()
  const [deckName, setDeckName] = useState('')
  const [format, setFormat] = useState('Commander')
  const [deckText, setDeckText] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failures, setFailures] = useState<string[]>([])
  // Original paste lines for each failed card — threaded through sessionStorage
  // into the deck editor so the retry modal opens with the exact text the user
  // pasted (set codes + foil markers preserved).
  const [failureLines, setFailureLines] = useState<string[]>([])
  const deckIdRef = useRef<string>('')

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

    try {
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
      deckIdRef.current = deck.id

      // Step 2: Bulk import all cards in one request
      const res = await fetch(`/api/decks/${deck.id}/cards/bulk-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: parsedCards.map((p) => ({
            name: p.name,
            quantity: p.quantity,
            board: p.board,
            setCode: p.setCode,
            isFoil: p.isFoil,
          })),
        }),
      })

      const data = await res.json() as {
        imported?: { card: { name: string }; board: string }[]
        failures?: { name: string; reason: string }[]
        error?: string
      }

      if (!res.ok) {
        setError(data.error ?? 'Import failed')
        setImporting(false)
        return
      }

      const importFailures = data.failures ?? []
      if (importFailures.length > 0) {
        setFailures(importFailures.map((f) => f.name))
        // Map each failed parsed-name back to the line the user pasted,
        // so "Continue to Deck" can pre-fill the retry modal with the
        // full original syntax (set codes, collector numbers, foil
        // markers) instead of just a bare card name.
        const failedNames = new Set(
          importFailures.map((f) => f.name.trim().toLowerCase()),
        )
        const originals: string[] = []
        for (const rawLine of deckText.split('\n')) {
          const line = rawLine.trim()
          if (!line || line.startsWith('//')) continue
          const [parsed] = parseDeckList(line)
          if (parsed && failedNames.has(parsed.name.trim().toLowerCase())) {
            originals.push(line)
          }
        }
        setFailureLines(originals)
      } else {
        router.push(`/decks/${deck.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
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

      {importing && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-border bg-bg-surface px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-bg-accent" />
          <span className="text-sm text-font-secondary">Importing cards...</span>
        </div>
      )}

      {failures.length > 0 && (
        <div className="mt-6 rounded-xl border border-border bg-bg-surface p-4">
          <h3 className="mb-2 text-sm font-semibold text-bg-red">
            {failures.length} card(s) not found
          </h3>
          <ul className="mb-4 flex flex-col gap-1 text-sm text-font-secondary">
            {failures.map((name) => (
              <li key={name} className="flex items-center gap-2">
                <AlertCircle className="h-3 w-3 shrink-0 text-bg-red" />
                {name}
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              const deckId = deckIdRef.current
              // Stash the failed lines so the deck page can auto-open
              // the import-from-text modal pre-filled. Keyed by deck id
              // to survive the navigation; cleared after read.
              if (failureLines.length > 0 && typeof window !== 'undefined') {
                sessionStorage.setItem(
                  `retry-import-${deckId}`,
                  failureLines.join('\n'),
                )
              }
              router.push(`/decks/${deckId}`)
            }}
            className="rounded-lg bg-bg-accent px-4 py-2 text-sm font-medium text-font-white hover:bg-bg-accent-dark transition-colors"
          >
            Continue to Deck
          </button>
        </div>
      )}
    </div>
  )
}
