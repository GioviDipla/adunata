import { useCallback, useRef } from 'react'

interface UseLongPressOptions {
  onLongPress: () => void
  delay?: number
}

export function useLongPress({ onLongPress, delay = 500 }: UseLongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggered = useRef(false)

  const start = useCallback(() => {
    triggered.current = false
    timerRef.current = setTimeout(() => {
      triggered.current = true
      onLongPress()
    }, delay)
  }, [onLongPress, delay])

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  return {
    onPointerDown: start,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    /** true if the long press fired — use to suppress the click */
    wasLongPress: () => triggered.current,
  }
}
