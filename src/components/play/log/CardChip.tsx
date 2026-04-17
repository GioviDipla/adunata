'use client'

import { useRef, useState } from 'react'
import { useLongPress } from '@/lib/hooks/useLongPress'
import CardHoverPreview from './CardHoverPreview'

/**
 * Inline card-name chip inside a log entry.
 * - Desktop: dashed underline + hover shows a large preview anchored to the
 *   opposite side of the viewport (Moxfield-style).
 * - Mobile / right-click: long-press or context menu opens the full card
 *   detail modal (handled by parent via onPreview).
 */
export default function CardChip({
  name,
  imageNormal,
  onPreview,
}: {
  name: string
  imageNormal: string | null
  onPreview: () => void
}) {
  const [hovering, setHovering] = useState(false)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const longPress = useLongPress({ onLongPress: onPreview, delay: 400 })
  const { wasLongPress, style, ...lpHandlers } = longPress

  const handleClick = (e: React.MouseEvent) => {
    if (wasLongPress()) {
      e.stopPropagation()
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onPreview()
  }

  return (
    <>
      <span
        ref={anchorRef}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        {...lpHandlers}
        style={style}
        className="cursor-pointer underline decoration-dashed decoration-font-accent/60 underline-offset-[3px] hover:decoration-font-accent"
      >
        {name}
      </span>
      {hovering && imageNormal && (
        <CardHoverPreview anchorRef={anchorRef} imageUrl={imageNormal} name={name} />
      )}
    </>
  )
}
