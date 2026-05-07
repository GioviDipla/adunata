'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'

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
  const previewRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = anchorRef.current
    const preview = previewRef.current
    if (!el || !preview) return

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

    preview.style.top = `${top}px`
    preview.style.left = onRight ? `${rect.right + gap}px` : ''
    preview.style.right = onRight ? '' : `${vw - rect.left + gap}px`
    preview.style.visibility = 'visible'
  }, [anchorRef])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={previewRef}
      className="pointer-events-none fixed z-[60] hidden md:block"
      style={{ visibility: 'hidden' }}
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
