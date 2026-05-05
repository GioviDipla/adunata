'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Check, Library, Loader2 } from 'lucide-react'
import type { DeckCardEntry } from './DeckContent'

interface Props {
  cards: DeckCardEntry[]
  onClose: () => void
}

interface SelectionState {
  selected: boolean
  quantity: number
}

/**
 * Lets the user pick which deck cards to push into their personal collection.
 * Defaults to "all selected with the deck quantity" so the common case is a
 * single tap; uncheck individual rows or tweak quantities for the rest.
 */
export default function AddToCollectionModal({ cards, onClose }: Props) {
  // Deduplicate by card id — a deck can repeat the same card across boards
  // and we want a single row in the picker (sum of quantities). The board
  // distinction doesn't survive into a collection, so collapse it here.
  const dedupedCards = useMemo(() => {
    const byId = new Map<number | string, { entry: DeckCardEntry; quantity: number }>()
    for (const e of cards) {
      const key = e.card.id
      const prev = byId.get(key)
      if (prev) prev.quantity += e.quantity
      else byId.set(key, { entry: e, quantity: e.quantity })
    }
    return Array.from(byId.values())
  }, [cards])

  const [state, setState] = useState<Record<string, SelectionState>>(() => {
    const init: Record<string, SelectionState> = {}
    for (const { entry, quantity } of dedupedCards) {
      init[String(entry.card.id)] = { selected: true, quantity }
    }
    return init
  })
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

  const totalSelected = useMemo(() => {
    let n = 0
    for (const s of Object.values(state)) if (s.selected) n += s.quantity
    return n
  }, [state])

  const allSelected = dedupedCards.every(({ entry }) => state[String(entry.card.id)]?.selected)
  const noneSelected = dedupedCards.every(({ entry }) => !state[String(entry.card.id)]?.selected)

  function toggle(id: string) {
    setState((prev) => ({
      ...prev,
      [id]: { ...prev[id], selected: !prev[id].selected },
    }))
  }

  function setQuantity(id: string, value: number) {
    if (!Number.isFinite(value) || value < 1) value = 1
    if (value > 99) value = 99
    setState((prev) => ({ ...prev, [id]: { ...prev[id], quantity: value } }))
  }

  function setAll(selected: boolean) {
    setState((prev) => {
      const next: Record<string, SelectionState> = {}
      for (const k of Object.keys(prev)) next[k] = { ...prev[k], selected }
      return next
    })
  }

  async function submit() {
    setError(null)
    setBusy(true)
    setFeedback(null)
    const items = dedupedCards
      .filter(({ entry }) => state[String(entry.card.id)]?.selected)
      .map(({ entry }) => ({
        card_id: entry.card.id,
        quantity: state[String(entry.card.id)].quantity,
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
        throw new Error(text || 'Errore durante l\'aggiunta')
      }
      const json = await res.json()
      setFeedback(`Aggiunte ${json.inserted} carte alla collezione.`)
      setTimeout(onClose, 900)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore sconosciuto')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border-light bg-bg-surface shadow-2xl">
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
                Spunta le carte che vuoi aggiungere · {totalSelected} totali
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-font-muted hover:bg-bg-hover hover:text-font-primary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex items-center gap-2 border-b border-border bg-bg-cell/30 px-4 py-2 text-[11px]">
          <button
            onClick={() => setAll(true)}
            disabled={allSelected}
            className="rounded-md px-2 py-1 font-medium text-font-secondary hover:bg-bg-hover hover:text-font-primary disabled:opacity-40"
          >
            Seleziona tutte
          </button>
          <button
            onClick={() => setAll(false)}
            disabled={noneSelected}
            className="rounded-md px-2 py-1 font-medium text-font-secondary hover:bg-bg-hover hover:text-font-primary disabled:opacity-40"
          >
            Deseleziona tutte
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <ul className="divide-y divide-border/60">
            {dedupedCards.map(({ entry }) => {
              const id = String(entry.card.id)
              const s = state[id]
              return (
                <li
                  key={id}
                  className={`flex items-center gap-3 px-4 py-2 transition-colors ${
                    s?.selected ? 'bg-bg-cell/30' : 'opacity-60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    aria-pressed={s?.selected}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      s?.selected
                        ? 'border-bg-accent bg-bg-accent text-font-white'
                        : 'border-border bg-bg-cell'
                    }`}
                  >
                    {s?.selected && <Check className="h-3.5 w-3.5" />}
                  </button>
                  {entry.card.image_small ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={entry.card.image_small}
                      alt={entry.card.name}
                      className="h-12 w-9 shrink-0 rounded object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-12 w-9 shrink-0 rounded bg-bg-cell" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-font-primary">
                      {entry.card.name}
                    </p>
                    <p className="truncate text-[11px] text-font-muted">
                      {entry.card.type_line}
                    </p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={s?.quantity ?? 1}
                    onChange={(e) => setQuantity(id, Number(e.target.value))}
                    disabled={!s?.selected}
                    className="h-8 w-14 rounded-md border border-border bg-bg-cell px-2 text-center text-sm text-font-primary focus:border-bg-accent focus:outline-none disabled:opacity-40"
                  />
                </li>
              )
            })}
          </ul>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border bg-bg-cell/30 px-4 py-3">
          <div className="text-[11px] text-font-muted">
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
              disabled={busy || totalSelected === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-bg-accent px-4 py-1.5 text-sm font-semibold text-font-white transition-colors hover:bg-bg-accent-dark disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Aggiungi {totalSelected > 0 ? `(${totalSelected})` : ''}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
