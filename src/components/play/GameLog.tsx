'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { LogEntry, CardMap } from '@/lib/game/types'
import type { Database } from '@/types/supabase'
import LogEntryRow from './log/LogEntryRow'
import { toDisplayRows } from './log/displayRows'

type CardRow = Database['public']['Tables']['cards']['Row']

interface Props {
  entries: LogEntry[]
  myUserId: string
  cardMap: CardMap
  playerNames: Record<string, string>
  onSendChat?: (message: string) => void
  onCardPreview?: (card: CardRow) => void
  /** 'sheet' = bottom collapsible (mobile). 'side' = full-height side panel (desktop). */
  mode: 'sheet' | 'side'
}

const STORAGE_KEY = 'gameLogOpen'

export default function GameLog({
  entries, myUserId, cardMap, playerNames, onSendChat, onCardPreview, mode,
}: Props) {
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (mode === 'side') return true
    if (typeof window === 'undefined') return true
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v === null ? true : v === '1'
  })
  const [flash, setFlash] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastSeqRef = useRef<number>(entries.at(-1)?.seq ?? 0)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [entries])

  useEffect(() => {
    const lastSeq = entries.at(-1)?.seq ?? 0
    if (lastSeq > lastSeqRef.current) {
      lastSeqRef.current = lastSeq
      if (mode === 'sheet' && !expanded) {
        const tOn  = setTimeout(() => setFlash(true),  0)
        const tOff = setTimeout(() => setFlash(false), 250)
        return () => { clearTimeout(tOn); clearTimeout(tOff) }
      }
    }
  }, [entries, mode, expanded])

  const previewHandler = onCardPreview ?? (() => {})
  const rows = toDisplayRows(entries, myUserId, playerNames)

  const isSide = mode === 'side'
  const visibleRows = isSide || expanded ? rows : rows.slice(-8)

  return (
    <div
      className={
        isSide
          ? 'flex h-full w-80 shrink-0 flex-col border-l border-border bg-bg-card'
          : 'border-t border-border bg-bg-card'
      }
    >
      {!isSide && (
        <button
          onClick={() => {
            const v = !expanded
            setExpanded(v)
            try { window.localStorage.setItem(STORAGE_KEY, v ? '1' : '0') } catch {}
          }}
          className={`flex w-full items-center justify-between px-3 py-1 transition-colors ${flash ? 'animate-pulse bg-bg-accent/15' : ''}`}
        >
          <span className="text-[9px] font-bold tracking-wider text-font-muted">
            GAME LOG ({entries.length})
          </span>
          {expanded ? <ChevronDown size={12} className="text-font-muted" /> : <ChevronUp size={12} className="text-font-muted" />}
        </button>
      )}
      {isSide && (
        <div className="border-b border-border px-3 py-2">
          <span className="text-[10px] font-bold tracking-wider text-font-muted">GAME LOG ({entries.length})</span>
        </div>
      )}
      <div
        ref={scrollRef}
        className={`overflow-y-auto px-3 pb-2 ${
          isSide ? 'flex-1' : expanded ? 'max-h-60' : 'max-h-24'
        }`}
      >
        {visibleRows.map((row) => (
          <LogEntryRow
            key={`${row.entry.id}-${row.kind === 'action' ? row.verbText : row.kind}`}
            row={row}
            cardMap={cardMap}
            playerNames={playerNames}
            onCardPreview={previewHandler}
          />
        ))}
      </div>
      {onSendChat && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const input = e.currentTarget.elements.namedItem('chatInput') as HTMLInputElement
            const msg = input.value.trim()
            if (msg) { onSendChat(msg); input.value = '' }
          }}
          className="flex gap-1.5 border-t border-border/50 px-3 py-1.5"
        >
          <input
            name="chatInput"
            type="text"
            placeholder="Chat..."
            maxLength={200}
            className="flex-1 rounded bg-bg-cell px-2 py-1 text-[10px] text-font-primary placeholder:text-font-muted outline-none focus:ring-1 focus:ring-bg-accent"
          />
          <button
            type="submit"
            className="shrink-0 rounded bg-bg-accent px-2.5 py-1 text-[9px] font-bold text-font-white active:bg-bg-accent-dark"
          >
            Send
          </button>
        </form>
      )}
    </div>
  )
}
