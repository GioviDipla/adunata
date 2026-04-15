'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { LogEntry } from '@/lib/game/types'

export default function GameLog({ entries, myUserId, onSendChat }: { entries: LogEntry[]; myUserId: string; onSendChat?: (message: string) => void }) {
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
            <span className={
              entry.type === 'chat' || entry.action === 'chat_message'
                ? 'italic text-font-secondary'
                : entry.playerId === myUserId ? 'text-font-accent' : 'text-font-primary'
            }>
              {entry.text}
            </span>
          </div>
        ))}
      </div>
      {onSendChat && (
        <form onSubmit={(e) => {
          e.preventDefault()
          const input = (e.currentTarget.elements.namedItem('chatInput') as HTMLInputElement)
          const msg = input.value.trim()
          if (msg) {
            onSendChat(msg)
            input.value = ''
          }
        }} className="flex gap-1.5 border-t border-border/50 px-3 py-1.5">
          <input name="chatInput" type="text" placeholder="Chat..." maxLength={200}
            className="flex-1 rounded bg-bg-cell px-2 py-1 text-[10px] text-font-primary placeholder:text-font-muted outline-none focus:ring-1 focus:ring-bg-accent" />
          <button type="submit" className="shrink-0 rounded bg-bg-accent px-2.5 py-1 text-[9px] font-bold text-font-white active:bg-bg-accent-dark">
            Send
          </button>
        </form>
      )}
    </div>
  )
}
