'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { LogEntry, CardMap } from '@/lib/game/types'
import type { Database } from '@/types/supabase'
import LogText from './log/LogText'
import { styleForEntry, toneClasses } from './log/LogEntryStyle'

type CardRow = Database['public']['Tables']['cards']['Row']

export default function GameLog({
  entries,
  myUserId,
  cardMap,
  playerNames,
  onSendChat,
  onCardPreview,
}: {
  entries: LogEntry[]
  myUserId: string
  cardMap: CardMap
  playerNames: Record<string, string>
  onSendChat?: (message: string) => void
  onCardPreview?: (card: CardRow) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries])

  const visibleEntries = expanded ? entries : entries.slice(-5)
  const previewHandler = onCardPreview ?? (() => {})

  return (
    <div className="border-t border-border bg-bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-1"
      >
        <span className="text-[9px] font-bold tracking-wider text-font-muted">
          GAME LOG ({entries.length})
        </span>
        {expanded ? (
          <ChevronDown size={12} className="text-font-muted" />
        ) : (
          <ChevronUp size={12} className="text-font-muted" />
        )}
      </button>
      <div
        ref={scrollRef}
        className={`overflow-y-auto px-3 pb-2 ${expanded ? 'max-h-60' : 'max-h-20'}`}
      >
        {visibleEntries.map((entry) => {
          const style = styleForEntry(entry, myUserId)
          const time = new Date(entry.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })

          if (style.banner) {
            return (
              <div
                key={entry.seq}
                className={`my-0.5 flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[10px] ${toneClasses(style.banner.tone)}`}
              >
                <span className="leading-none">{style.glyph ?? '•'}</span>
                <span className="text-[9px] font-bold uppercase tracking-wider shrink-0">
                  {style.banner.label}
                </span>
                <span className="flex-1 text-font-primary truncate">
                  <LogText
                    text={entry.text}
                    cardMap={cardMap}
                    playerNames={playerNames}
                    onCardPreview={previewHandler}
                  />
                </span>
                <span className="shrink-0 text-[9px] text-font-muted tabular-nums">
                  {time}
                </span>
              </div>
            )
          }

          return (
            <div key={entry.seq} className="flex gap-2 py-0.5 text-[10px]">
              <span className="shrink-0 text-font-muted tabular-nums">{time}</span>
              <span className={`flex-1 ${style.textClass}`}>
                <LogText
                  text={entry.text}
                  cardMap={cardMap}
                  playerNames={playerNames}
                  onCardPreview={previewHandler}
                />
              </span>
            </div>
          )
        })}
      </div>
      {onSendChat && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const input = e.currentTarget.elements.namedItem('chatInput') as HTMLInputElement
            const msg = input.value.trim()
            if (msg) {
              onSendChat(msg)
              input.value = ''
            }
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
