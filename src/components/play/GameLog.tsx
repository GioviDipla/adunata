'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { LogEntry } from '@/lib/game/types'

export default function GameLog({ entries, myUserId }: { entries: LogEntry[]; myUserId: string }) {
  const [expanded, setExpanded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries])

  const visibleEntries = expanded ? entries : entries.slice(-3)

  return (
    <div className="border-t border-border bg-bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-1"
      >
        <span className="text-[9px] font-bold tracking-wider text-font-muted">GAME LOG ({entries.length})</span>
        {expanded ? <ChevronDown size={12} className="text-font-muted" /> : <ChevronUp size={12} className="text-font-muted" />}
      </button>
      <div
        ref={scrollRef}
        className={`overflow-y-auto px-3 pb-2 ${expanded ? 'max-h-60' : 'max-h-20'}`}
      >
        {visibleEntries.map((entry) => (
          <div key={entry.seq} className="flex gap-2 py-0.5 text-[10px]">
            <span className="shrink-0 text-font-muted">
              {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className={entry.playerId === myUserId ? 'text-font-accent' : 'text-font-primary'}>
              {entry.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
