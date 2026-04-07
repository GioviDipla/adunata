'use client'

import { useState } from 'react'
import { X, Copy, Download, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

interface DeckCardEntry {
  card: CardRow
  quantity: number
  board: string
}

interface DeckExportProps {
  deckName: string
  cards: DeckCardEntry[]
  onClose: () => void
}

type ExportFormat = 'mtgo' | 'moxfield' | 'simple'

function generateExport(
  cards: DeckCardEntry[],
  deckName: string,
  format: ExportFormat
): string {
  const mainCards = cards.filter((c) => c.board === 'main')
  const sideboardCards = cards.filter((c) => c.board === 'sideboard')

  const lines: string[] = []

  if (format === 'moxfield') {
    lines.push(`// ${deckName}`)
    lines.push('')
  }

  // Main deck
  mainCards.forEach(({ card, quantity }) => {
    switch (format) {
      case 'mtgo':
        lines.push(`${quantity} ${card.name}`)
        break
      case 'moxfield':
        lines.push(`${quantity} ${card.name} (${card.set_code.toUpperCase()}) ${card.collector_number}`)
        break
      case 'simple':
        lines.push(`${quantity}x ${card.name}`)
        break
    }
  })

  if (sideboardCards.length > 0) {
    lines.push('')
    if (format === 'mtgo' || format === 'moxfield') {
      lines.push('Sideboard')
    } else {
      lines.push('// Sideboard')
    }

    sideboardCards.forEach(({ card, quantity }) => {
      switch (format) {
        case 'mtgo':
          lines.push(`${quantity} ${card.name}`)
          break
        case 'moxfield':
          lines.push(`${quantity} ${card.name} (${card.set_code.toUpperCase()}) ${card.collector_number}`)
          break
        case 'simple':
          lines.push(`${quantity}x ${card.name}`)
          break
      }
    })
  }

  return lines.join('\n')
}

export default function DeckExport({ deckName, cards, onClose }: DeckExportProps) {
  const [format, setFormat] = useState<ExportFormat>('mtgo')
  const [copied, setCopied] = useState(false)

  const exportText = generateExport(cards, deckName, format)

  async function copyToClipboard() {
    await navigator.clipboard.writeText(exportText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadAsTxt() {
    const blob = new Blob([exportText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${deckName.replace(/[^a-zA-Z0-9]/g, '_')}.txt`
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
        <div className="mb-4 flex gap-2">
          {([
            ['mtgo', 'MTGO'],
            ['moxfield', 'Moxfield'],
            ['simple', 'Simple List'],
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
          <Button variant="secondary" onClick={downloadAsTxt} className="flex-1">
            <Download className="h-4 w-4" />
            Download .txt
          </Button>
        </div>
      </div>
    </div>
  )
}
