'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { Heart } from 'lucide-react'
import type { Database } from '@/types/supabase'
import ManaCost from './ManaCost'
import { useLongPress } from '@/lib/hooks/useLongPress'

type Card = Database['public']['Tables']['cards']['Row']

interface CardItemProps {
  card: Card
  liked?: boolean
  onSelect: (card: Card) => void
  onContextAction?: (card: Card, x: number, y: number) => void
}

export default function CardItem({ card, liked, onSelect, onContextAction }: CardItemProps) {
  const [showPreview, setShowPreview] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // When `onContextAction` is wired, swap the gestures: tap opens the
  // context menu (Add to deck / Like / Share), long-press / right-click
  // opens the card detail modal. Without `onContextAction`, click keeps
  // the legacy behaviour (open detail).
  const longPress = useLongPress({
    onLongPress: () => {
      if (onContextAction) onSelect(card)
    },
  })

  return (
    <div
      ref={rootRef}
      className="group relative cursor-pointer"
      onClick={(e) => {
        if (longPress.wasLongPress()) return
        if (onContextAction) {
          // Anchor the menu at the click position when present, otherwise
          // fall back to the centre of the tile (touch/synthetic events).
          if (e.clientX || e.clientY) {
            onContextAction(card, e.clientX, e.clientY)
          } else {
            const rect = rootRef.current?.getBoundingClientRect()
            if (rect) onContextAction(card, rect.left + rect.width / 2, rect.top + rect.height / 2)
            else onContextAction(card, 0, 0)
          }
        } else {
          onSelect(card)
        }
      }}
      onContextMenu={(e) => {
        if (!onContextAction) return
        e.preventDefault()
        // Right-click in cards-browser mode opens detail (was: context).
        onSelect(card)
      }}
      onMouseEnter={() => setShowPreview(true)}
      onMouseLeave={() => setShowPreview(false)}
      {...longPress}
    >
      {/* Card image — `image_normal` (488×680), same as DeckGridView. next/image
       *  downscales via `sizes` so the actual bytes on the wire match the rendered size. */}
      <div className="relative overflow-hidden rounded-lg bg-bg-card border border-border transition-all duration-200 group-hover:scale-[1.03] group-hover:shadow-xl group-hover:border-border-light">
        {card.image_normal || card.image_small ? (
          <Image
            src={(card.image_normal ?? card.image_small)!}
            alt={card.name}
            width={488}
            height={680}
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1280px) 25vw, 20vw"
            className="w-full aspect-[488/680] object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full aspect-[5/7] flex items-center justify-center bg-bg-cell text-font-muted text-sm p-4 text-center">
            {card.name}
          </div>
        )}

        {/* Liked badge — top-left */}
        {liked && (
          <div className="absolute top-1.5 left-1.5 bg-black/70 backdrop-blur-sm rounded-full p-1">
            <Heart size={12} className="fill-red-500 text-red-500" />
          </div>
        )}

        {/* Price badge — EUR (Cardmarket) primary, USD fallback */}
        {card.prices_eur != null ? (
          <div className="absolute top-1.5 right-1.5 bg-black/75 backdrop-blur-sm text-font-primary text-xs font-medium px-1.5 py-0.5 rounded">
            €{Number(card.prices_eur).toFixed(2)}
          </div>
        ) : card.prices_usd != null ? (
          <div className="absolute top-1.5 right-1.5 bg-black/75 backdrop-blur-sm text-font-primary text-xs font-medium px-1.5 py-0.5 rounded">
            ${Number(card.prices_usd).toFixed(2)}
          </div>
        ) : null}
      </div>

      {/* Card info */}
      <div className="mt-2 px-0.5">
        <div className="flex items-start justify-between gap-1">
          <p className="text-sm font-medium text-font-primary truncate leading-tight">
            {card.name}
          </p>
          <ManaCost manaCost={card.mana_cost} />
        </div>
        <p className="text-xs text-font-muted truncate mt-0.5">{card.type_line}</p>
      </div>

      {/* Hover preview tooltip */}
      {showPreview && card.image_normal && (
        <div className="hidden lg:block absolute z-50 left-full ml-3 top-0 pointer-events-none">
          <Image
            src={card.image_normal}
            alt={card.name}
            width={256}
            height={358}
            className="w-64 rounded-lg shadow-2xl border border-border-light"
            unoptimized
          />
        </div>
      )}
    </div>
  )
}
