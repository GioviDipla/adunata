'use client'

import type { CardMap } from '@/lib/game/types'
import type { Database } from '@/types/supabase'
import LogText from './LogText'
import { toneClasses } from './LogEntryStyle'
import type { DisplayRow } from './displayRows'

type CardRow = Database['public']['Tables']['cards']['Row']

interface Props {
  row: DisplayRow
  cardMap: CardMap
  playerNames: Record<string, string>
  onCardPreview: (card: CardRow) => void
}

const SEVERITY_CLASS: Record<'minor' | 'normal' | 'major', string> = {
  minor:  'text-[10px] text-font-muted opacity-80',
  normal: 'text-[10px] text-font-primary',
  major:  'text-[11px] font-semibold text-font-primary',
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function LogEntryRow({ row, cardMap, playerNames, onCardPreview }: Props) {
  const time = fmtTime(row.entry.createdAt)

  if (row.kind === 'banner') {
    return (
      <div
        className={`my-0.5 flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[10px] ${toneClasses(row.style.banner!.tone)}`}
      >
        <span className="leading-none">{row.icon}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider shrink-0">{row.style.banner!.label}</span>
        <span className="flex-1 text-font-primary truncate">
          <LogText text={row.entry.text} cardMap={cardMap} playerNames={playerNames} onCardPreview={onCardPreview} />
        </span>
        <span className="shrink-0 text-[9px] text-font-muted tabular-nums">{time}</span>
      </div>
    )
  }

  if (row.kind === 'chat') {
    return (
      <div className="flex gap-2 py-0.5 text-[10px] italic text-yellow-400">
        <span className="shrink-0 text-font-muted tabular-nums">{time}</span>
        <span className="flex-1">
          💬 <LogText text={row.entry.text} cardMap={cardMap} playerNames={playerNames} onCardPreview={onCardPreview} />
        </span>
      </div>
    )
  }

  if (row.kind === 'warning') {
    return (
      <div className="my-0.5 flex items-center gap-1.5 rounded border border-bg-red/40 bg-bg-red/10 px-1.5 py-0.5 text-[10px] text-bg-red">
        <span>⚠</span>
        <span className="flex-1">{row.reason}</span>
        <span className="shrink-0 text-[9px] tabular-nums">{time}</span>
      </div>
    )
  }

  // kind === 'action'
  return (
    <div className={`flex gap-2 py-0.5 ${SEVERITY_CLASS[row.severity]}`}>
      <span className="shrink-0 text-font-muted tabular-nums">{time}</span>
      <span className="shrink-0 text-font-secondary">{row.icon}</span>
      <span className="flex-1">
        <LogText text={row.verbText} cardMap={cardMap} playerNames={playerNames} onCardPreview={onCardPreview} />
      </span>
    </div>
  )
}
