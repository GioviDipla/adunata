'use client'

import type { ReactNode } from 'react'

interface Props {
  locked: boolean
  onBlockedAttempt?: () => void
  children: ReactNode
  className?: string
}

/** Wraps an interactive game zone. When `locked`, an absolutely-positioned
 *  overlay sits on top of the children and intercepts pointer events; the
 *  underlying handlers never fire. The overlay calls `onBlockedAttempt` so
 *  the caller can pulse the priority badge. */
export default function PriorityLock({ locked, onBlockedAttempt, children, className }: Props) {
  return (
    <div className={`relative ${className ?? ''}`}>
      {children}
      {locked && (
        <div
          aria-hidden
          onPointerDownCapture={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onBlockedAttempt?.()
          }}
          className="absolute inset-0 z-30 cursor-not-allowed bg-bg-dark/35 backdrop-blur-[1px]"
        />
      )}
    </div>
  )
}
