'use client'

import { memo, useState } from 'react'
import Image from 'next/image'
import { Heart } from 'lucide-react'
import type { Database } from '@/types/supabase'
import ManaCost from './ManaCost'
import UpscaledBadge from './UpscaledBadge'
import { useCardGestures } from '@/lib/hooks/useCardGestures'
import { formatPreferredPrice } from '@/lib/utils/price'

type Card = Database['public']['Tables']['cards']['Row']

interface CardItemProps {
  card: Card
  liked?: boolean
  onSelect: (card: Card) => void
  onContextAction?: (card: Card, x: number, y: number) => void
}

const CardItem = memo(function CardItem({ card, liked, onSelect, onContextAction }: CardItemProps) {
  const [showPreview, setShowPreview] = useState(false)
  // Centralised gesture handling + user control inversion (desktop click /
  // mobile long-press). When `onContextAction` is wired the quick action opens
  // the context menu (Add to deck / Like / Share) and the preview gesture opens
  // the card detail modal. Without it, both gestures open the detail.
  const { getHandlers } = useCardGestures()
  const gestures = getHandlers({
    onPrimary: onContextAction
      ? (c) => onContextAction(card, c.x, c.y)
      : () => onSelect(card),
    onSecondary: () => onSelect(card),
  })

  return (
    <div
      className="group relative cursor-pointer"
      onMouseEnter={() => setShowPreview(true)}
      onMouseLeave={() => setShowPreview(false)}
      {...gestures}
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
        {formatPreferredPrice(card) ? (
          <div className="absolute top-1.5 right-1.5 bg-black/75 backdrop-blur-sm text-font-primary text-xs font-medium px-1.5 py-0.5 rounded">
            {formatPreferredPrice(card)}
          </div>
        ) : null}

        {card.has_upscaled_2x && (
          <UpscaledBadge className="absolute bottom-1.5 right-1.5" />
        )}
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
}, (prev, next) =>
  prev.card.id === next.card.id &&
  prev.liked === next.liked &&
  prev.card.has_upscaled_2x === next.card.has_upscaled_2x
)

export default CardItem
