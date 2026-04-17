'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import CardPreviewOverlay from '@/components/game/CardPreviewOverlay'
import type { PreviewState } from '@/components/game/CardPreviewOverlay'
import type { LogEntry, CardMap } from '@/lib/game/types'
import type { Database } from '@/types/supabase'
import LogText from './log/LogText'
import { styleForEntry, toneClasses } from './log/LogEntryStyle'

type CardRow = Database['public']['Tables']['cards']['Row']

function LogEntryRow({
  entry,
  cardMap,
  playerNames,
  userId,
  onCardPreview,
}: {
  entry: LogEntry
  cardMap: CardMap
  playerNames: Record<string, string>
  userId: string
  onCardPreview: (card: CardRow) => void
}) {
  const style = styleForEntry(entry, userId)
  const time = new Date(entry.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  if (style.banner) {
    return (
      <div className={`my-1 flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${toneClasses(style.banner.tone)}`}>
        <span className="text-[13px] leading-none">{style.glyph ?? '•'}</span>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider">
          {style.banner.label}
        </span>
        <span className="flex-1 text-font-primary">
          <LogText
            text={entry.text}
            cardMap={cardMap}
            playerNames={playerNames}
            onCardPreview={onCardPreview}
          />
        </span>
        <span className="shrink-0 text-[10px] text-font-muted tabular-nums">{time}</span>
      </div>
    )
  }

  return (
    <div className="flex gap-2 py-1 text-xs leading-relaxed">
      {style.glyph && <span className="text-font-muted">{style.glyph}</span>}
      <span className="shrink-0 text-font-muted tabular-nums">{time}</span>
      <span className={`flex-1 ${style.textClass}`}>
        <LogText
          text={entry.text}
          cardMap={cardMap}
          playerNames={playerNames}
          onCardPreview={onCardPreview}
        />
      </span>
    </div>
  )
}

export default function GameHistoryView({
  gameName,
  winnerId,
  playerNames,
  userId,
  log,
  cardMap,
  startedAt,
  finishedAt: _finishedAt,
}: {
  gameName: string
  winnerId: string | null
  playerNames: Record<string, string>
  userId: string
  log: LogEntry[]
  cardMap: CardMap
  startedAt: string | null
  finishedAt: string
}) {
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const won = winnerId === userId
  const winnerName = winnerId ? (playerNames[winnerId] ?? 'Unknown') : null

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <Link href="/play" className="flex items-center gap-1 text-font-secondary mb-3">
          <ChevronLeft size={16} />
          <span className="text-xs font-medium">Back to Play</span>
        </Link>
        <h1 className="text-lg font-bold text-font-primary">{gameName}</h1>
        <div className="flex items-center gap-3 mt-1">
          {startedAt && (
            <span className="text-[10px] text-font-muted">
              {new Date(startedAt).toLocaleDateString('it-IT', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          {winnerName && (
            <span
              className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                won ? 'bg-bg-green/20 text-bg-green' : 'bg-bg-red/20 text-bg-red'
              }`}
            >
              {won ? 'Victory' : `${winnerName} wins`}
            </span>
          )}
          <span className="text-[10px] text-font-muted">{log.length} actions</span>
        </div>
      </div>

      {/* Log */}
      <div className="rounded-xl border border-border bg-bg-card p-4">
        <div className="flex flex-col">
          {log.map((entry) => (
            <LogEntryRow
              key={entry.id}
              entry={entry}
              cardMap={cardMap}
              playerNames={playerNames}
              userId={userId}
              onCardPreview={(card) => setPreview({ card })}
            />
          ))}
        </div>
      </div>

      {/* Card preview modal (mobile long-press / right-click) */}
      <CardPreviewOverlay preview={preview} onClose={() => setPreview(null)} readOnly />
    </div>
  )
}
