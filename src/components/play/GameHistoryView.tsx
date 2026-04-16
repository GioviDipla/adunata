'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useLongPress } from '@/lib/hooks/useLongPress'
import CardPreviewOverlay from '@/components/game/CardPreviewOverlay'
import type { PreviewState } from '@/components/game/CardPreviewOverlay'
import type { LogEntry, CardMap } from '@/lib/game/types'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

function toCardRow(cardId: number, data: CardMap[string]): CardRow {
  return {
    id: cardId, scryfall_id: '', name: data.name, mana_cost: data.manaCost ?? null,
    cmc: 0, type_line: data.typeLine, oracle_text: data.oracleText ?? null,
    colors: null, color_identity: [], rarity: '', set_code: '', set_name: '',
    collector_number: '', image_small: data.imageSmall ?? null, image_normal: data.imageNormal ?? null,
    image_art_crop: null, prices_usd: null, prices_usd_foil: null, prices_eur: null,
    prices_eur_foil: null, released_at: null, legalities: null, power: data.power ?? null,
    toughness: data.toughness ?? null, keywords: null, produced_mana: null, layout: null,
    card_faces: null, search_vector: null, created_at: '', updated_at: '',
  }
}

function LogEntryRow({ entry, cardMap, userId, onCardPreview }: {
  entry: LogEntry
  cardMap: CardMap
  userId: string
  onCardPreview: (card: CardRow) => void
}) {
  const instanceId = (entry.data as Record<string, unknown> | null)?.instanceId as string | undefined
  const hasCard = !!(instanceId && cardMap[instanceId])

  const longPress = useLongPress({
    onLongPress: () => {
      if (hasCard) {
        const d = cardMap[instanceId!]
        onCardPreview(toCardRow(d.cardId, d))
      }
    },
    delay: 400,
  })

  const { wasLongPress, style: lpStyle, ...lpHandlers } = longPress

  const handleClick = () => {
    if (wasLongPress()) return
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (hasCard) {
      const d = cardMap[instanceId!]
      onCardPreview(toCardRow(d.cardId, d))
    }
  }

  return (
    <div
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      {...lpHandlers}
      style={lpStyle}
      className={`flex gap-2 py-1 text-xs ${hasCard ? 'cursor-pointer active:bg-bg-hover rounded' : ''}`}
    >
      <span className="shrink-0 text-font-muted w-16 text-right">
        {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <span className={
        entry.type === 'chat' || entry.action === 'chat_message'
          ? 'italic text-yellow-400'
          : entry.playerId === userId ? 'text-font-accent' : 'text-font-primary'
      }>
        {entry.text}
      </span>
    </div>
  )
}

export default function GameHistoryView({
  gameName, winnerId, playerNames, userId, log, cardMap, startedAt, finishedAt,
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
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <Link href="/play" className="flex items-center gap-1 text-font-secondary mb-3">
          <ChevronLeft size={16} /><span className="text-xs font-medium">Back to Play</span>
        </Link>
        <h1 className="text-lg font-bold text-font-primary">{gameName}</h1>
        <div className="flex items-center gap-3 mt-1">
          {startedAt && (
            <span className="text-[10px] text-font-muted">
              {new Date(startedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {winnerName && (
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
              won ? 'bg-bg-green/20 text-bg-green' : 'bg-bg-red/20 text-bg-red'
            }`}>
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
              userId={userId}
              onCardPreview={(card) => setPreview({ card })}
            />
          ))}
        </div>
      </div>

      {/* Card preview overlay (read-only) */}
      <CardPreviewOverlay
        preview={preview}
        onClose={() => setPreview(null)}
        readOnly
      />
    </div>
  )
}
