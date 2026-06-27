'use client'

import { useRef } from 'react'
import { usePreferences } from '@/lib/contexts/PreferencesContext'

export interface GestureCoords {
  x: number
  y: number
}

export interface CardGestureHandlers {
  /** Quick action — default left-click / tap. */
  onPrimary: (coords: GestureCoords) => void
  /** Preview + contextual actions — default right-click / long-press. */
  onSecondary: (coords: GestureCoords) => void
}

/**
 * Centralised card-surface gesture handling for the deck areas (builder,
 * viewer, browser). Encapsulates long-press detection plus the
 * user-configurable control inversion, so every consumer behaves identically
 * and stays in sync with the explanation shown on /about.
 *
 * Default mapping:
 *   - Desktop: left-click → primary,  right-click → secondary
 *   - Mobile:  tap        → primary,  long-press  → secondary
 *
 * `invertDesktop` swaps left/right click; `invertMobile` swaps tap/long-press.
 * The two are independent.
 *
 * Usage — call the hook once at the top of a list/grid component, then build
 * per-item handlers inline:
 *
 *   const { getHandlers } = useCardGestures()
 *   ...
 *   <div {...getHandlers({ onPrimary, onSecondary })}>…</div>
 *
 * A single long-press timer is shared across items, which is fine because only
 * one pointer interaction happens at a time. Inner controls (buttons, badges)
 * must call `stopPropagation` so they don't also trigger the root gesture.
 */
export function useCardGestures(longPressDelay = 350) {
  const { prefs } = usePreferences()
  const { invertDesktop, invertMobile } = prefs

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)
  const startPos = useRef<{ x: number; y: number } | null>(null)
  // onClick fires for both mouse-left and touch-tap; pointer type is recorded
  // on pointerdown so we can route a tap through the mobile mapping.
  const lastPointerType = useRef<string>('mouse')

  function coordsFrom(e: React.MouseEvent | React.PointerEvent): GestureCoords {
    if (e.clientX || e.clientY) return { x: e.clientX, y: e.clientY }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  function clearTimer() {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    startPos.current = null
  }

  function getHandlers({ onPrimary, onSecondary }: CardGestureHandlers) {
    return {
      onClick(e: React.MouseEvent) {
        // Suppress the click synthesized right after a long-press fired.
        if (longPressFired.current) {
          longPressFired.current = false
          return
        }
        if (e.button !== undefined && e.button !== 0) return
        const coords = coordsFrom(e)
        if (lastPointerType.current === 'touch') {
          // Tap = mobile primary by default; inverted = secondary.
          ;(invertMobile ? onSecondary : onPrimary)(coords)
        } else {
          // Left-click = desktop primary by default; inverted = secondary.
          ;(invertDesktop ? onSecondary : onPrimary)(coords)
        }
      },
      onContextMenu(e: React.MouseEvent) {
        e.preventDefault()
        const coords = coordsFrom(e)
        // Right-click = desktop secondary by default; inverted = primary.
        ;(invertDesktop ? onPrimary : onSecondary)(coords)
      },
      onPointerDown(e: React.PointerEvent) {
        lastPointerType.current = e.pointerType
        if (e.pointerType !== 'touch') return
        longPressFired.current = false
        startPos.current = { x: e.clientX, y: e.clientY }
        const coords = coordsFrom(e)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => {
          longPressFired.current = true
          timer.current = null
          // Long-press = mobile secondary by default; inverted = primary.
          ;(invertMobile ? onPrimary : onSecondary)(coords)
        }, longPressDelay)
      },
      onPointerMove(e: React.PointerEvent) {
        if (!timer.current || !startPos.current) return
        if (
          Math.abs(e.clientX - startPos.current.x) > 10 ||
          Math.abs(e.clientY - startPos.current.y) > 10
        ) {
          clearTimer()
        }
      },
      onPointerUp: clearTimer,
      onPointerLeave: clearTimer,
      onPointerCancel: clearTimer,
      style: { touchAction: 'manipulation' as const },
    }
  }

  return { getHandlers }
}
