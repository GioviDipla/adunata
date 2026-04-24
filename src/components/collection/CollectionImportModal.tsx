'use client'

import { useRef, useState } from 'react'
import { X } from 'lucide-react'

interface Summary {
  flavor: string
  inserted: number
  skipped: number
  total: number
}

interface Props {
  onClose: () => void
  onImported: (summary: Summary) => void
}

/**
 * CSV import modal for `/collection`. Accepts Deckbox, Moxfield, Manabox
 * exports (and a generic name+quantity fallback). Posts the raw CSV text
 * to `/api/collection/bulk-import`; the server sniffs the flavor from
 * the header row.
 */
export default function CollectionImportModal({ onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)

  async function submit() {
    const f = fileRef.current?.files?.[0]
    if (!f) return
    setBusy(true)
    setError(null)
    try {
      const text = await f.text()
      const res = await fetch('/api/collection/bulk-import', {
        method: 'POST',
        headers: { 'content-type': 'text/csv' },
        body: text,
      })
      if (!res.ok) {
        const msg = await res.text().catch(() => 'import failed')
        setError(msg)
        return
      }
      const result = (await res.json()) as Summary
      setSummary(result)
      onImported(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-font-primary">
            Import collection
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-font-muted transition-colors hover:text-font-primary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-3 text-xs text-font-muted">
          Supported formats: Deckbox, Moxfield, Manabox CSV exports. Generic
          name + quantity CSVs also work. Rows whose names can&apos;t be
          resolved to a known card are skipped silently.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="mb-3 block w-full text-sm text-font-secondary"
        />

        {error && (
          <div className="mb-2 rounded border border-bg-red/50 bg-bg-red/10 px-2 py-1 text-xs text-bg-red">
            {error}
          </div>
        )}

        {summary && (
          <div className="mb-2 rounded border border-border bg-bg-cell px-2 py-1 text-xs text-font-secondary">
            <div>
              Flavor: <span className="text-font-primary">{summary.flavor}</span>
            </div>
            <div>
              Inserted:{' '}
              <span className="text-font-primary">{summary.inserted}</span>
              {' · '}
              Skipped:{' '}
              <span className="text-font-primary">{summary.skipped}</span>
              {' / '}
              {summary.total}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-3 py-1.5 text-xs text-font-secondary transition-colors hover:text-font-primary"
          >
            Close
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded bg-bg-accent px-3 py-1.5 text-xs font-semibold text-font-white transition-opacity disabled:opacity-50"
          >
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}
