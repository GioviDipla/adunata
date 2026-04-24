'use client'

import { useState } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import type { CollectionItem } from './CollectionView'

interface Props {
  item: CollectionItem
  onQuantity: (id: string, nextQty: number) => void
  onRemove: (id: string) => void
}

/**
 * Single grid cell for the collection view. Card face + quantity badge +
 * inline +/- buttons + remove. Uses plain `<img loading="lazy">` to stay
 * consistent with deck components (see CLAUDE.md — no mixed next/image
 * and `<img>` in the same feature).
 */
export default function CollectionTile({ item, onQuantity, onRemove }: Props) {
  const [busy, setBusy] = useState(false)
  const img = item.card.image_small ?? item.card.image_normal

  async function delta(step: number) {
    const next = Math.max(0, item.quantity + step)
    if (next === item.quantity) return
    setBusy(true)
    try {
      if (next === 0) {
        await onRemove(item.id)
      } else {
        await onQuantity(item.id, next)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-bg-surface">
      {img ? (
        <img
          src={img}
          alt={item.card.name}
          loading="lazy"
          className="w-full aspect-[5/7] object-cover"
        />
      ) : (
        <div className="w-full aspect-[5/7] flex items-center justify-center bg-bg-cell text-font-muted text-xs p-2 text-center">
          {item.card.name}
        </div>
      )}

      {/* Quantity badge — top-left */}
      <div className="absolute top-1.5 left-1.5 rounded-full bg-black/75 px-2 py-0.5 text-[11px] font-bold text-font-primary backdrop-blur-sm">
        ×{item.quantity}
        {item.foil && (
          <span className="ml-1 text-[9px] uppercase text-bg-yellow">foil</span>
        )}
      </div>

      {/* Remove — top-right */}
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        disabled={busy}
        className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-font-secondary opacity-0 backdrop-blur-sm transition-opacity hover:text-bg-red group-hover:opacity-100 disabled:opacity-40"
        aria-label="Remove from collection"
      >
        <Trash2 className="h-3 w-3" />
      </button>

      {/* +/- controls — bottom bar (always visible on mobile, fades in on desktop) */}
      <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1 rounded-md bg-black/70 px-1.5 py-1 text-font-primary backdrop-blur-sm">
        <button
          type="button"
          onClick={() => delta(-1)}
          disabled={busy}
          className="flex h-5 w-5 items-center justify-center rounded bg-bg-cell/80 transition-colors hover:bg-bg-hover disabled:opacity-40"
          aria-label="Decrease quantity"
        >
          <Minus className="h-2.5 w-2.5" />
        </button>
        <span className="text-[11px] truncate" title={item.card.name}>
          {item.card.name}
        </span>
        <button
          type="button"
          onClick={() => delta(1)}
          disabled={busy}
          className="flex h-5 w-5 items-center justify-center rounded bg-bg-cell/80 transition-colors hover:bg-bg-hover disabled:opacity-40"
          aria-label="Increase quantity"
        >
          <Plus className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  )
}
