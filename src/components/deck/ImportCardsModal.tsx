'use client'

import { useState } from 'react'
import { X, Upload, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { parseDeckList } from '@/lib/utils/deckParser'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

interface ImportCardsModalProps {
  deckId: string
  currentBoard: string
  /** Pre-fills the textarea — used by the import-retry flow. */
  initialText?: string
  onClose: () => void
  onCardsImported: (cards: { card: CardRow; board: string }[]) => void
}

export default function ImportCardsModal({
  deckId,
  currentBoard,
  initialText,
  onClose,
  onCardsImported,
}: ImportCardsModalProps) {
  const [text, setText] = useState(initialText ?? '')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failures, setFailures] = useState<string[]>([])

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
    setFailures([])

    try {
      const res = await fetch(`/api/decks/${deckId}/cards/bulk-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: parsed.map((p) => ({
            name: p.name,
            quantity: p.quantity,
            board: p.board,
            setCode: p.setCode,
            isFoil: p.isFoil,
          })),
        }),
      })

      const data = await res.json() as {
        imported?: { card: CardRow; board: string }[]
        failures?: { name: string; reason: string }[]
        error?: string
      }

      if (!res.ok) {
        setError(data.error ?? 'Import failed')
        setImporting(false)
        return
      }

      const imported = data.imported ?? []
      const failed = data.failures ?? []

      if (imported.length > 0) {
        onCardsImported(imported.map((i) => ({ card: i.card, board: i.board })))
      }

      if (failed.length === 0) {
        onClose()
      } else {
        setFailures(failed.map((f) => f.name))
        setError(`${failed.length} card(s) could not be imported.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    }

    setImporting(false)
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
              <div className="flex flex-col gap-1">
                <span>{error}</span>
                {failures.length > 0 && (
                  <ul className="list-disc pl-4 text-[11px] text-bg-red/80">
                    {failures.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {importing && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-bg-card px-3 py-2 text-xs text-font-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Importing {parseDeckList(text, currentBoard).length} cards...
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
