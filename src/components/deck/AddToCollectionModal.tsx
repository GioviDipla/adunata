'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  X,
  Library,
  Loader2,
  CheckSquare,
  Square,
  Plus,
  Minus,
  Sparkles,
} from 'lucide-react'
import type { DeckCardEntry } from './DeckContent'

interface Props {
  cards: DeckCardEntry[]
  onClose: () => void
}

const SECTIONS: { key: string; label: string }[] = [
  { key: 'commander', label: 'Commander' },
  { key: 'main', label: 'Maindeck' },
  { key: 'sideboard', label: 'Sideboard' },
  { key: 'maybeboard', label: 'Maybeboard' },
  { key: 'tokens', label: 'Tokens' },
]

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'it', label: 'Italiano' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ru', label: 'Russian' },
  { code: 'zhs', label: '中文' },
] as const

const CONDITIONS = [
  { code: 'M',  label: 'Mint (M)' },
  { code: 'NM', label: 'Near Mint (NM)' },
  { code: 'LP', label: 'Lightly Played (LP)' },
  { code: 'MP', label: 'Moderately Played (MP)' },
  { code: 'HP', label: 'Heavily Played (HP)' },
  { code: 'D',  label: 'Damaged (D)' },
] as const

interface RowState {
  selected: boolean
  quantity: number
  foil: boolean
}

function entryKey(e: DeckCardEntry): string {
  return `${e.card.id}-${e.board}`
}

/**
 * Picker for "add deck cards to my collection". Mirrors the proxy print
 * modal layout (card image grid, sectioned by board) and adds:
 *  - per-card +/- quantity controls (default = deck quantity)
 *  - per-card foil toggle (default seeded from the deck row's `isFoil`)
 *  - global language + condition pickers in the footer
 *
 * Edition (`set_code`) is preserved by the underlying card row id we
 * push to /api/collection/bulk-add — the printing the deck references is
 * the printing that lands in the collection.
 */
export default function AddToCollectionModal({ cards, onClose }: Props) {
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {}
    for (const e of cards) {
      init[entryKey(e)] = {
        selected: true,
        quantity: e.quantity,
        foil: !!e.isFoil,
      }
    }
    return init
  })
  const [language, setLanguage] = useState<string>('en')
  const [condition, setCondition] = useState<string>('NM')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  // Group cards by board section, alphabetical within section.
  const sections = useMemo(() => {
    return SECTIONS.map((s) => ({
      ...s,
      cards: cards
        .filter((e) => e.board === s.key)
        .sort((a, b) => a.card.name.localeCompare(b.card.name)),
    })).filter((s) => s.cards.length > 0)
  }, [cards])

  const totals = useMemo(() => {
    let cardsCount = 0
    let foilCount = 0
    for (const e of cards) {
      const r = rows[entryKey(e)]
      if (!r?.selected) continue
      cardsCount += r.quantity
      if (r.foil) foilCount += r.quantity
    }
    return { cardsCount, foilCount }
  }, [cards, rows])

  const toggle = useCallback((key: string) => {
    setRows((prev) => ({
      ...prev,
      [key]: { ...prev[key], selected: !prev[key].selected },
    }))
  }, [])

  const setQuantity = useCallback((key: string, value: number) => {
    if (!Number.isFinite(value) || value < 1) value = 1
    if (value > 99) value = 99
    setRows((prev) => ({
      ...prev,
      [key]: { ...prev[key], quantity: value, selected: prev[key].selected || true },
    }))
  }, [])

  const toggleFoil = useCallback((key: string) => {
    setRows((prev) => ({
      ...prev,
      [key]: { ...prev[key], foil: !prev[key].foil },
    }))
  }, [])

  const selectSection = useCallback((sectionKey: string, on: boolean) => {
    setRows((prev) => {
      const next = { ...prev }
      for (const e of cards) {
        if (e.board !== sectionKey) continue
        const k = entryKey(e)
        next[k] = { ...next[k], selected: on }
      }
      return next
    })
  }, [cards])

  const setAll = useCallback((on: boolean) => {
    setRows((prev) => {
      const next: Record<string, RowState> = {}
      for (const k of Object.keys(prev)) next[k] = { ...prev[k], selected: on }
      return next
    })
  }, [])

  async function submit() {
    setError(null)
    setBusy(true)
    setFeedback(null)
    const items = cards
      .filter((e) => rows[entryKey(e)]?.selected)
      .map((e) => ({
        card_id: e.card.id,
        quantity: rows[entryKey(e)].quantity,
        foil: rows[entryKey(e)].foil,
        language,
        condition,
      }))
    if (items.length === 0) {
      setError('Seleziona almeno una carta.')
      setBusy(false)
      return
    }
    try {
      const res = await fetch('/api/collection/bulk-add', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || 'Errore durante aggiunta')
      }
      const json = await res.json()
      setFeedback(`Aggiunte ${json.inserted} righe alla collezione.`)
      setTimeout(onClose, 900)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore sconosciuto')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border-light bg-bg-surface shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-accent/15 text-font-accent">
              <Library className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-font-primary">
                Aggiungi alla collezione
              </h2>
              <p className="text-[11px] text-font-muted">
                {totals.cardsCount} carte
                {totals.foilCount > 0 && ` · ${totals.foilCount} foil`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAll(true)}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-font-accent hover:underline"
            >
              All
            </button>
            <span className="text-font-muted text-[10px]">·</span>
            <button
              onClick={() => setAll(false)}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-font-accent hover:underline"
            >
              None
            </button>
            <button
              onClick={onClose}
              className="ml-1 rounded-lg p-1 text-font-muted hover:bg-bg-hover hover:text-font-primary"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Card grid */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {sections.length === 0 ? (
            <p className="py-8 text-center text-sm text-font-muted">
              Nessuna carta nel deck.
            </p>
          ) : (
            sections.map((section) => {
              const inSection = section.cards.length
              const selectedInSection = section.cards.filter(
                (e) => rows[entryKey(e)]?.selected,
              ).length
              return (
                <div key={section.key} className="mb-4 last:mb-0">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-font-secondary">
                      {section.label} ({selectedInSection}/{inSection})
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => selectSection(section.key, true)}
                        className="text-[10px] font-medium text-font-accent hover:underline"
                      >
                        All
                      </button>
                      <span className="text-[10px] text-font-muted">·</span>
                      <button
                        onClick={() => selectSection(section.key, false)}
                        className="text-[10px] font-medium text-font-accent hover:underline"
                      >
                        None
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {section.cards.map((entry) => {
                      const key = entryKey(entry)
                      const r = rows[key]
                      const selected = !!r?.selected
                      const qty = r?.quantity ?? entry.quantity
                      const foil = !!r?.foil
                      return (
                        <div
                          key={key}
                          className={`relative overflow-hidden rounded-lg border-2 transition-all ${
                            selected
                              ? 'border-bg-accent ring-1 ring-bg-accent/30'
                              : 'border-border opacity-60'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggle(key)}
                            className="block w-full"
                            style={{ touchAction: 'manipulation' }}
                          >
                            {entry.card.image_small ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={entry.card.image_small}
                                alt={entry.card.name}
                                className="h-auto w-full"
                                loading="lazy"
                                draggable={false}
                              />
                            ) : (
                              <div className="flex aspect-[488/680] items-center justify-center bg-bg-cell p-2">
                                <span className="text-center text-[9px] text-font-muted">
                                  {entry.card.name}
                                </span>
                              </div>
                            )}
                            {/* Edition badge — top-left so the image still shows */}
                            {entry.card.set_code && (
                              <div className="absolute left-1 top-1 rounded bg-bg-dark/85 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-font-primary backdrop-blur-sm">
                                {entry.card.set_code}
                              </div>
                            )}
                            {/* Selection icon — top-right */}
                            <div className="absolute right-1 top-1">
                              {selected ? (
                                <CheckSquare size={16} className="text-bg-accent drop-shadow" />
                              ) : (
                                <Square size={16} className="text-font-muted drop-shadow" />
                              )}
                            </div>
                            {/* Foil indicator — when on, slim shimmer at top edge */}
                            {foil && (
                              <div
                                className="pointer-events-none absolute inset-x-0 top-0 h-1"
                                style={{
                                  background:
                                    'linear-gradient(90deg,#a855f7,#ec4899,#facc15,#22d3ee,#a855f7)',
                                }}
                              />
                            )}
                          </button>

                          {/* Controls bar — qty +/- and foil toggle. Sits
                              below the image so taps on it don't clash with
                              the select toggle. */}
                          <div className="flex items-center justify-between gap-1 border-t border-border bg-bg-cell/70 px-1.5 py-1">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setQuantity(key, qty - 1)}
                                disabled={!selected}
                                className="flex h-6 w-6 items-center justify-center rounded-md text-font-muted hover:bg-bg-hover hover:text-font-primary disabled:opacity-40"
                                aria-label="Decrease quantity"
                              >
                                <Minus size={12} />
                              </button>
                              <span className="min-w-[1.25rem] text-center text-xs font-semibold tabular-nums text-font-primary">
                                {qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => setQuantity(key, qty + 1)}
                                disabled={!selected}
                                className="flex h-6 w-6 items-center justify-center rounded-md text-font-muted hover:bg-bg-hover hover:text-font-primary disabled:opacity-40"
                                aria-label="Increase quantity"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleFoil(key)}
                              disabled={!selected}
                              title={foil ? 'Foil — clicca per togliere' : 'Aggiungi come foil'}
                              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-40 ${
                                foil
                                  ? 'bg-bg-accent/20 text-font-accent'
                                  : 'text-font-muted hover:bg-bg-hover hover:text-font-primary'
                              }`}
                            >
                              <Sparkles size={11} />
                              Foil
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer: global language + condition + submit */}
        <footer className="flex flex-col gap-3 border-t border-border bg-bg-cell/30 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-font-secondary">
              Lingua
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-font-secondary">
              Stato
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="rounded border border-border bg-bg-card px-2 py-1 text-xs text-font-primary"
              >
                {CONDITIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-[10px] leading-tight text-font-muted">
              Lingua e stato si applicano a tutte le carte selezionate. Foil ed
              edizione restano per-carta.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px]">
              {feedback && <span className="text-bg-green">{feedback}</span>}
              {error && <span className="text-bg-red">{error}</span>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-border bg-bg-surface px-3 py-1.5 text-sm font-medium text-font-secondary transition-colors hover:bg-bg-hover"
              >
                Annulla
              </button>
              <button
                onClick={submit}
                disabled={busy || totals.cardsCount === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-bg-accent px-4 py-1.5 text-sm font-semibold text-font-white transition-colors hover:bg-bg-accent-dark disabled:opacity-50"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Aggiungi {totals.cardsCount > 0 ? `(${totals.cardsCount})` : ''}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
