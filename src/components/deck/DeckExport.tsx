'use client'

import { useState } from 'react'
import { X, Copy, Download, Check, Library, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

interface DeckCardEntry {
  card: CardRow
  quantity: number
  board: string
  isFoil?: boolean
}

interface DeckExportProps {
  deckId: string
  deckName: string
  cards: DeckCardEntry[]
  onClose: () => void
}

type ExportFormat = 'mtgo' | 'moxfield' | 'simple' | 'csv'

function csvEscape(v: string | number | boolean): string {
  const s = String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function generateExport(
  cards: DeckCardEntry[],
  deckName: string,
  format: ExportFormat
): string {
  if (format === 'csv') {
    const headers = [
      'Quantity', 'Name', 'Set Code', 'Collector Number', 'Foil', 'Board', 'Price EUR', 'Price USD',
    ]
    const lines = [headers.join(',')]
    for (const e of cards) {
      lines.push([
        e.quantity,
        csvEscape(e.card.name),
        (e.card.set_code ?? '').toUpperCase(),
        csvEscape(e.card.collector_number ?? ''),
        e.isFoil ? 'foil' : '',
        e.board,
        e.card.prices_eur ?? '',
        e.card.prices_usd ?? '',
      ].join(','))
    }
    return lines.join('\n')
  }

  const mainCards = cards.filter((c) => c.board === 'main')
  const sideboardCards = cards.filter((c) => c.board === 'sideboard')

  const lines: string[] = []

  if (format === 'moxfield') {
    lines.push(`// ${deckName}`)
    lines.push('')
  }

  const formatLine = (entry: DeckCardEntry) => {
    const { card, quantity, isFoil } = entry
    // `*F*` is the Moxfield convention; MTGO accepts it as a trailing marker
    // without choking, and our own parser detects it — so round-trip is clean.
    const foilSuffix = isFoil ? ' *F*' : ''
    switch (format) {
      case 'mtgo':
        return `${quantity} ${card.name}${foilSuffix}`
      case 'moxfield':
        return `${quantity} ${card.name} (${card.set_code.toUpperCase()}) ${card.collector_number}${foilSuffix}`
      case 'simple':
        return `${quantity}x ${card.name}${foilSuffix}`
      default:
        return `${quantity} ${card.name}${foilSuffix}`
    }
  }

  mainCards.forEach((entry) => lines.push(formatLine(entry)))

  if (sideboardCards.length > 0) {
    lines.push('')
    if (format === 'mtgo' || format === 'moxfield') {
      lines.push('Sideboard')
    } else {
      lines.push('// Sideboard')
    }
    sideboardCards.forEach((entry) => lines.push(formatLine(entry)))
  }

  return lines.join('\n')
}

export default function DeckExport({ deckId, deckName, cards, onClose }: DeckExportProps) {
  const [format, setFormat] = useState<ExportFormat>('mtgo')
  const [copied, setCopied] = useState(false)
  const [collectionStatus, setCollectionStatus] = useState<
    | { state: 'idle' }
    | { state: 'busy' }
    | { state: 'done'; inserted: number; skipped: number }
    | { state: 'error'; message: string }
  >({ state: 'idle' })

  const exportText = generateExport(cards, deckName, format)

  async function addToCollection() {
    if (collectionStatus.state === 'busy') return
    setCollectionStatus({ state: 'busy' })
    try {
      const res = await fetch(`/api/decks/${deckId}/add-to-collection`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        setCollectionStatus({ state: 'error', message: text || 'failed' })
        return
      }
      const { inserted, skipped } = await res.json()
      setCollectionStatus({ state: 'done', inserted, skipped })
    } catch (e) {
      setCollectionStatus({
        state: 'error',
        message: e instanceof Error ? e.message : 'network error',
      })
    }
  }

  async function copyToClipboard() {
    await navigator.clipboard.writeText(exportText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadAsFile() {
    const ext = format === 'csv' ? 'csv' : 'txt'
    const mime = format === 'csv' ? 'text/csv' : 'text/plain'
    const blob = new Blob([exportText], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${deckName.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-dark/80 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-bg-surface p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-font-primary">Export Deck</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-font-muted transition-colors hover:bg-bg-hover hover:text-font-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Format selector */}
        <div className="mb-4 flex flex-wrap gap-2">
          {([
            ['mtgo', 'MTGO'],
            ['moxfield', 'Moxfield'],
            ['simple', 'Simple List'],
            ['csv', 'CSV'],
          ] as [ExportFormat, string][]).map(([f, label]) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                format === f
                  ? 'bg-bg-accent text-font-primary'
                  : 'bg-bg-cell text-font-secondary hover:bg-bg-hover'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Export text */}
        <textarea
          readOnly
          value={exportText}
          className="mb-4 h-64 w-full resize-none rounded-lg border border-border bg-bg-card p-3 font-mono text-xs text-font-primary focus:outline-none"
        />

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="primary" onClick={copyToClipboard} className="flex-1">
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy to Clipboard
              </>
            )}
          </Button>
          <Button variant="secondary" onClick={downloadAsFile} className="flex-1">
            <Download className="h-4 w-4" />
            Download .{format === 'csv' ? 'csv' : 'txt'}
          </Button>
        </div>

        {/* Add deck cards to collection */}
        <div className="mt-4 rounded-lg border border-border bg-bg-card p-3">
          <div className="mb-2 flex items-start gap-2">
            <Library className="mt-0.5 h-4 w-4 shrink-0 text-font-secondary" />
            <div className="flex-1 text-xs text-font-secondary">
              Add every card in this deck to your collection. Foil markers carry over;
              quantities merge with what you already own.
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={addToCollection}
            disabled={collectionStatus.state === 'busy'}
            className="w-full"
          >
            {collectionStatus.state === 'busy' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Adding…
              </>
            ) : collectionStatus.state === 'done' ? (
              <>
                <Check className="h-4 w-4" />
                Added {collectionStatus.inserted}
                {collectionStatus.skipped > 0 ? ` (skipped ${collectionStatus.skipped})` : ''}
              </>
            ) : (
              <>
                <Library className="h-4 w-4" />
                Add deck to collection
              </>
            )}
          </Button>
          {collectionStatus.state === 'error' && (
            <div className="mt-2 text-[11px] text-font-danger">
              {collectionStatus.message}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
