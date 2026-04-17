'use client'

import { useEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

interface Position {
  top: number
  left?: number
  right?: number
}

/**
 * Floating card image preview anchored to the opposite side of the viewport
 * from the trigger (so a chip in the left half puts the preview on the right
 * and vice-versa). Desktop only — the md:block gate on the portal hides it
 * on touch devices where the long-press modal is the right pattern.
 */
export default function CardHoverPreview({
  anchorRef,
  imageUrl,
  name,
}: {
  anchorRef: RefObject<HTMLElement | null>
  imageUrl: string
  name: string
}) {
  const [position, setPosition] = useState<Position | null>(null)

  useEffect(() => {
    const el = anchorRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const previewW = 300
    const previewH = 418
    const gap = 12

    const spaceRight = vw - rect.right
    const spaceLeft = rect.left
    const onRight = spaceRight >= previewW + gap || spaceRight >= spaceLeft

    let top = rect.top + rect.height / 2 - previewH / 2
    top = Math.max(8, Math.min(vh - previewH - 8, top))

    setPosition(
      onRight
        ? { top, left: rect.right + gap }
        : { top, right: vw - rect.left + gap },
    )
  }, [anchorRef])

  if (!position || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="pointer-events-none fixed z-[60] hidden md:block"
      style={{ top: position.top, left: position.left, right: position.right }}
    >
      <img
        src={imageUrl}
        alt={name}
        className="w-[300px] rounded-xl shadow-2xl ring-1 ring-white/20"
      />
    </div>,
    document.body,
  )
}
