'use client'

import { useState } from 'react'
import { X, Upload, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { parseDeckList } from '@/lib/utils/deckParser'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

interface ImportResult {
  name: string
  status: 'success' | 'error' | 'pending'
  message?: string
}

interface ImportCardsModalProps {
  deckId: string
  currentBoard: string
  onClose: () => void
  onCardsImported: (cards: { card: CardRow; board: string }[]) => void
}

export default function ImportCardsModal({
  deckId,
  currentBoard,
  onClose,
  onCardsImported,
}: ImportCardsModalProps) {
  const [text, setText] = useState('')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<ImportResult[]>([])
  const [error, setError] = useState<string | null>(null)

  async function handleImport() {
    if (!text.trim()) {
      setError('Paste a card list first')
      return
    }

    const parsed = parseDeckList(text, currentBoard)
    if (parsed.length === 0) {
      setError('Could not parse any cards. Use format: "4 Lightning Bolt"')
      return
    }

    setImporting(true)
    setError(null)
    setProgress(
      parsed.map((c) => ({
        name: `${c.quantity}x ${c.name}`,
        status: 'pending' as const,
      }))
    )

    const importedCards: { card: CardRow; board: string }[] = []
    const errors: string[] = []

    for (let i = 0; i < parsed.length; i++) {
      const entry = parsed[i]

      setProgress((prev) =>
        prev.map((p, idx) =>
          idx === i ? { ...p, message: 'Looking up...' } : p
        )
      )

      try {
        const lookupRes = await fetch(
          `/api/cards/lookup?name=${encodeURIComponent(entry.name)}`
        )

        if (!lookupRes.ok) {
          setProgress((prev) =>
            prev.map((p, idx) =>
              idx === i
                ? { ...p, status: 'error' as const, message: 'Card not found' }
                : p
            )
          )
          errors.push(entry.name)
          continue
        }

        const { card } = await lookupRes.json()

        const addRes = await fetch(`/api/decks/${deckId}/cards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            card_id: card.id,
            quantity: entry.quantity,
            board: entry.board,
          }),
        })

        if (addRes.ok) {
          setProgress((prev) =>
            prev.map((p, idx) =>
              idx === i
                ? { ...p, status: 'success' as const, message: 'Added' }
                : p
            )
          )
          importedCards.push({ card, board: entry.board })
        } else {
          setProgress((prev) =>
            prev.map((p, idx) =>
              idx === i
                ? { ...p, status: 'error' as const, message: 'Failed to add' }
                : p
            )
          )
          errors.push(entry.name)
        }
      } catch {
        setProgress((prev) =>
          prev.map((p, idx) =>
            idx === i
              ? { ...p, status: 'error' as const, message: 'Lookup failed' }
              : p
          )
        )
        errors.push(entry.name)
      }

      await new Promise((r) => setTimeout(r, 120))
    }

    setImporting(false)

    if (importedCards.length > 0) {
      onCardsImported(importedCards)
    }

    if (errors.length === 0) {
      onClose()
    } else {
      setError(`${errors.length} card(s) could not be imported.`)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-lg font-bold text-font-primary">Import Cards from Text</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-font-muted transition-colors hover:bg-bg-hover hover:text-font-primary"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          <p className="mb-3 text-xs text-font-muted">
            Paste a card list. Format: &quot;4 Lightning Bolt&quot; or &quot;4x Lightning Bolt&quot;.
            Use &quot;Sideboard&quot; on a separate line to switch to sideboard.
          </p>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`4 Lightning Bolt\n2 Counterspell\n1 Sol Ring\n\nSideboard\n2 Pyroblast`}
            rows={8}
            className="w-full resize-y rounded-lg border border-border bg-bg-card px-3 py-2.5 font-mono text-sm text-font-primary placeholder:text-font-muted transition-colors focus:border-bg-accent focus:outline-none focus:ring-2 focus:ring-bg-accent/20"
            disabled={importing}
          />

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-bg-red/10 px-3 py-2 text-xs text-bg-red">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {progress.length > 0 && (
            <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-border bg-bg-card p-3">
              <div className="flex flex-col gap-1">
                {progress.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {item.status === 'pending' && (
                      <Loader2 className="h-3 w-3 animate-spin text-font-muted" />
                    )}
                    {item.status === 'success' && (
                      <CheckCircle2 className="h-3 w-3 text-bg-green" />
                    )}
                    {item.status === 'error' && (
                      <AlertCircle className="h-3 w-3 text-bg-red" />
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
                      <span className="text-font-muted">— {item.message}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={importing}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleImport}
              loading={importing}
              disabled={importing || !text.trim()}
            >
              <Upload className="h-4 w-4" />
              Import
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
