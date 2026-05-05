'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { useLongPress } from '@/lib/hooks/useLongPress'
import { formatPreferredPrice } from '@/lib/utils/price'
import ManaCost from '@/components/cards/ManaCost'
import type { CollectionItem, CollectionCard } from './CollectionView'

interface Props {
  item: CollectionItem
  onQuantity: (id: string, nextQty: number) => void
  onRemove: (id: string) => void
  /** Tap → context menu (Add to deck / Like / Share). Mirrors CardItem. */
  onContextAction?: (card: CollectionCard, x: number, y: number) => void
  /** Long-press / right-click / double-click → CardDetail modal. */
  onSelectCard?: (card: CollectionCard) => void
  liked?: boolean
}

/**
 * Collection grid cell. Behaves like `CardItem` for primary gestures
 * (tap → context, long-press / right-click / double-click → detail) and
 * adds collection-specific overlays for quantity (+/-) and removal.
 */
export default function CollectionTile({
  item,
  onQuantity,
  onRemove,
  onContextAction,
  onSelectCard,
  liked,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    }
  }, [])

  const clearPendingClick = () => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
  }

  // Long-press → detail (matches CardBrowser behaviour).
  const longPress = useLongPress({
    onLongPress: () => {
      if (onSelectCard) onSelectCard(item.card)
    },
  })

  async function delta(step: number) {
    const next = Math.max(0, item.quantity + step)
    if (next === item.quantity) return
    setBusy(true)
    try {
      if (next === 0) await onRemove(item.id)
      else await onQuantity(item.id, next)
    } finally {
      setBusy(false)
    }
  }

  const price = formatPreferredPrice(item.card)

  return (
    <div
      ref={rootRef}
      className="group relative cursor-pointer"
      onClick={(e) => {
        if (longPress.wasLongPress()) return
        if (onContextAction) {
          const { clientX, clientY } = e
          clearPendingClick()
          clickTimerRef.current = setTimeout(() => {
            clickTimerRef.current = null
            if (clientX || clientY) {
              onContextAction(item.card, clientX, clientY)
            } else {
              const rect = rootRef.current?.getBoundingClientRect()
              if (rect) onContextAction(item.card, rect.left + rect.width / 2, rect.top + rect.height / 2)
              else onContextAction(item.card, 0, 0)
            }
          }, 220)
        } else if (onSelectCard) {
          onSelectCard(item.card)
        }
      }}
      onDoubleClick={(e) => {
        if (!onSelectCard) return
        e.preventDefault()
        e.stopPropagation()
        clearPendingClick()
        onSelectCard(item.card)
      }}
      onContextMenu={(e) => {
        if (!onSelectCard) return
        e.preventDefault()
        clearPendingClick()
        onSelectCard(item.card)
      }}
      onMouseEnter={() => setShowPreview(true)}
      onMouseLeave={() => setShowPreview(false)}
      {...longPress.handlers}
    >
      {/* Card image — `image_normal` (488×680), same as CardItem and DeckGridView. */}
      <div className="relative overflow-hidden rounded-lg border border-border bg-bg-card transition-all duration-200 group-hover:scale-[1.03] group-hover:border-border-light group-hover:shadow-xl">
        {item.card.image_normal || item.card.image_small ? (
          <Image
            src={(item.card.image_normal ?? item.card.image_small)!}
            alt={item.card.name}
            width={488}
            height={680}
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1280px) 25vw, 20vw"
            className="aspect-[488/680] w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex aspect-[5/7] w-full items-center justify-center bg-bg-cell p-4 text-center text-sm text-font-muted">
            {item.card.name}
          </div>
        )}

        {/* Quantity badge — top-left */}
        <div className="absolute left-1.5 top-1.5 rounded-full bg-black/75 px-2 py-0.5 text-[11px] font-bold text-font-primary backdrop-blur-sm">
          ×{item.quantity}
          {item.foil && (
            <span className="ml-1 text-[9px] uppercase text-bg-yellow">foil</span>
          )}
        </div>

        {/* Liked + Price — top-right */}
        <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
          {liked && (
            <div className="rounded-full bg-black/70 p-1 backdrop-blur-sm">
              <svg
                className="h-3 w-3 fill-red-500 text-red-500"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M12 21s-7-4.5-9.5-9C.86 8.62 2.5 5 6 5c2 0 3.5 1 4 2 .5-1 2-2 4-2 3.5 0 5.14 3.62 3.5 7-2.5 4.5-9.5 9-9.5 9z" />
              </svg>
            </div>
          )}
          {price && (
            <div className="rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium text-font-primary backdrop-blur-sm">
              {price}
            </div>
          )}
        </div>

        {/* Remove — top-right, slid down so it doesn't collide with the price.
            Only visible on hover (group-hover). */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(item.id)
          }}
          disabled={busy}
          className="absolute right-1.5 top-9 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-font-secondary opacity-0 backdrop-blur-sm transition-opacity hover:text-bg-red group-hover:opacity-100 disabled:opacity-40"
          aria-label="Remove from collection"
        >
          <Trash2 className="h-3 w-3" />
        </button>

        {/* +/- bar — bottom. stopPropagation so it doesn't trigger the
            tile's gesture handlers. */}
        <div
          className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1 rounded-md bg-black/70 px-1.5 py-1 text-font-primary opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => delta(-1)}
            disabled={busy}
            className="flex h-5 w-5 items-center justify-center rounded bg-bg-cell/80 transition-colors hover:bg-bg-hover disabled:opacity-40"
            aria-label="Decrease quantity"
          >
            <Minus className="h-2.5 w-2.5" />
          </button>
          <span className="text-[11px] tabular-nums">{item.quantity}</span>
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

      {/* Card info — name + mana cost row + type, like CardItem */}
      <div className="mt-2 px-0.5">
        <div className="flex items-start justify-between gap-1">
          <p className="truncate text-sm font-medium leading-tight text-font-primary">
            {item.card.name}
          </p>
          <ManaCost manaCost={item.card.mana_cost} />
        </div>
        <p className="mt-0.5 truncate text-xs text-font-muted">
          {item.card.type_line}
        </p>
      </div>

      {/* Hover preview — desktop only. Mirrors CardItem. */}
      {showPreview && item.card.image_normal && (
        <div className="pointer-events-none absolute left-full top-0 z-50 ml-3 hidden lg:block">
          <Image
            src={item.card.image_normal}
            alt={item.card.name}
            width={256}
            height={358}
            className="w-64 rounded-lg border border-border-light shadow-2xl"
            unoptimized
          />
        </div>
      )}
    </div>
  )
}
