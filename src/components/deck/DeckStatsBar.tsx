'use client'

import { useMemo } from 'react'
import {
  Swords, Sparkles, Zap, Flame, Shield, Box, Mountain,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import { getCardTypeCategory } from '@/lib/utils/card'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

interface DeckCardEntry {
  card: CardRow
  quantity: number
  board: string
}

interface DeckStatsBarProps {
  cards: DeckCardEntry[]
  format?: string
  expanded: boolean
  onToggleExpand: () => void
}

const TYPE_ICONS: Record<string, typeof Swords> = {
  Creatures: Swords,
  Planeswalkers: Sparkles,
  Instants: Zap,
  Sorceries: Flame,
  Enchantments: Shield,
  Artifacts: Box,
  Lands: Mountain,
}

export default function DeckStatsBar({ cards, format, expanded, onToggleExpand }: DeckStatsBarProps) {
  const stats = useMemo(() => {
    const mainCards = cards.filter((c) => c.board === 'main' || c.board === 'commander')
    const sideboardCards = cards.filter((c) => c.board === 'sideboard')

    const totalMain = mainCards.reduce((s, c) => s + c.quantity, 0)
    const totalSideboard = sideboardCards.reduce((s, c) => s + c.quantity, 0)

    // EUR price (Cardmarket) primary, USD secondary
    const totalEur = [...mainCards, ...sideboardCards].reduce(
      (s, c) => s + (c.card.prices_eur || 0) * c.quantity, 0
    )
    const totalUsd = [...mainCards, ...sideboardCards].reduce(
      (s, c) => s + (c.card.prices_usd || 0) * c.quantity, 0
    )

    // Type counts for main deck only
    const typeCounts: Record<string, number> = {}
    mainCards.forEach(({ card, quantity }) => {
      const cat = getCardTypeCategory(card.type_line)
      typeCounts[cat] = (typeCounts[cat] || 0) + quantity
    })

    return { totalMain, totalSideboard, totalEur, totalUsd, typeCounts }
  }, [cards])

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-border bg-bg-surface px-3 py-2 text-xs"
    >
      {/* Card counts */}
      <span className="font-semibold text-font-primary">
        {stats.totalMain} <span className="font-normal text-font-muted">main</span>
      </span>
      {stats.totalSideboard > 0 && (
        <span className="font-semibold text-font-primary">
          {stats.totalSideboard} <span className="font-normal text-font-muted">side</span>
        </span>
      )}

      {/* Format badge */}
      {format && (
        <span className="rounded-full bg-bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-font-accent">
          {format}
        </span>
      )}

      {/* Price — EUR primary */}
      {(stats.totalEur > 0 || stats.totalUsd > 0) && (
        <span className="font-semibold text-font-accent">
          {stats.totalEur > 0 ? (
            <>€{stats.totalEur.toFixed(2)}</>
          ) : (
            <>${stats.totalUsd.toFixed(2)}</>
          )}
          {stats.totalEur > 0 && stats.totalUsd > 0 && (
            <span className="ml-1.5 font-normal text-font-muted">
              ${stats.totalUsd.toFixed(2)}
            </span>
          )}
        </span>
      )}

      {/* Type distribution icons */}
      <div className="hidden sm:flex items-center gap-2 text-font-muted">
        {Object.entries(TYPE_ICONS).map(([type, Icon]) => {
          const count = stats.typeCounts[type] || 0
          if (count === 0) return null
          return (
            <span key={type} className="flex items-center gap-0.5" title={type}>
              <Icon className="h-3 w-3" />
              <span className="text-font-secondary">{count}</span>
            </span>
          )
        })}
      </div>

      {/* Expand toggle — only on small screens where right panel is hidden */}
      <button
        onClick={onToggleExpand}
        className="ml-auto flex items-center gap-1 text-font-muted hover:text-font-primary transition-colors lg:hidden"
        title={expanded ? 'Hide statistics' : 'Show statistics'}
      >
        <span className="text-[10px]">Stats</span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
