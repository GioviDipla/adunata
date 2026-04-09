'use client'

import { Loader2 } from 'lucide-react'

export default function PriorityIndicator({ hasPriority }: { hasPriority: boolean }) {
  if (hasPriority) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 animate-pulse rounded-full bg-bg-green" />
        <span className="text-[10px] font-bold text-bg-green">YOUR PRIORITY</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <Loader2 size={12} className="animate-spin text-font-muted" />
      <span className="text-[10px] font-bold text-font-muted">WAITING...</span>
    </div>
  )
}
