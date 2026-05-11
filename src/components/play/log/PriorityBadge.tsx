'use client'

import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react'

export interface PriorityBadgeHandle {
  pulse: () => void
}

interface Props {
  hasPriority: boolean
  activePlayerName: string
}

const PriorityBadge = forwardRef<PriorityBadgeHandle, Props>(function PriorityBadge(
  { hasPriority, activePlayerName },
  ref,
) {
  const [pulsing, setPulsing] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useImperativeHandle(ref, () => ({
    pulse() {
      setPulsing(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setPulsing(false), 250)
    },
  }), [])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  if (hasPriority) return null

  return (
    <div
      className={`pointer-events-none fixed left-1/2 top-2 z-50 -translate-x-1/2 rounded-full border bg-bg-card/95 px-3 py-1 text-[11px] font-semibold text-font-secondary shadow-md backdrop-blur ${
        pulsing ? 'border-bg-red animate-pulse' : 'border-border/60'
      }`}
      style={{ top: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
    >
      ⏳ Aspetta priorità — turno di {activePlayerName}
    </div>
  )
})

export default PriorityBadge
