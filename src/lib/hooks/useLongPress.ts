import { useCallback, useRef } from 'react'

interface UseLongPressOptions {
  onLongPress: () => void
  delay?: number
}

/**
 * Long-press detector wired to pointer events.
 *
 * Fires `onLongPress` exactly once per press; the `wasLongPress()` check
 * is a one-shot consume — reading it returns the value and clears the
 * flag. Clearing on read prevents the classic bug where a long-press
 * leaves `triggered=true` and the next tap is silently suppressed.
 *
 * `cancel` clears the timer AND clears the flag, so an interrupted
 * long-press (scroll, pointercancel) doesn't leak state into the next
 * gesture.
 */
export function useLongPress({ onLongPress, delay = 350 }: UseLongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggered = useRef(false)
  const startPos = useRef<{ x: number; y: number } | null>(null)

  const start = useCallback(
    (e?: React.PointerEvent | React.MouseEvent) => {
      triggered.current = false
      if (e) startPos.current = { x: e.clientX, y: e.clientY }
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        triggered.current = true
        timerRef.current = null
        onLongPress()
      }, delay)
    },
    [onLongPress, delay],
  )

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startPos.current = null
  }, [])

  // Cancel if the pointer drifts >10px (user is scrolling, not pressing).
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!timerRef.current || !startPos.current) return
    const dx = Math.abs(e.clientX - startPos.current.x)
    const dy = Math.abs(e.clientY - startPos.current.y)
    if (dx > 10 || dy > 10) cancel()
  }, [cancel])

  // One-shot consume: returns the flag and clears it. Subsequent calls
  // return false until the next long-press fires.
  const consumeLongPress = useCallback(() => {
    const v = triggered.current
    triggered.current = false
    return v
  }, [])

  const handlers = {
    onPointerDown: start,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onPointerMove,
    /** Allows scroll/pinch-zoom while keeping pointer events for long-press */
    style: { touchAction: 'manipulation' as const },
  }

  return {
    ...handlers,
    handlers,
    /** true if the long press fired — use to suppress the click. Consuming. */
    wasLongPress: consumeLongPress,
  }
}
