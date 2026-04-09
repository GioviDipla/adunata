'use client'

import { getCardTypeCategory } from '@/lib/utils/card'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

interface DeckCardEntry {
  card: CardRow
  quantity: number
  board: string
}

interface DeckStatsProps {
  cards: DeckCardEntry[]
}

function getColorForMana(color: string): string {
  switch (color) {
    case 'W': return 'bg-mana-white'
    case 'U': return 'bg-mana-blue'
    case 'B': return 'bg-mana-black'
    case 'R': return 'bg-mana-red'
    case 'G': return 'bg-mana-green'
    default: return 'bg-bg-cell'
  }
}

export default function DeckStats({ cards }: DeckStatsProps) {
  const mainCards = cards.filter((c) => c.board === 'main')
  const sideboardCards = cards.filter((c) => c.board === 'sideboard')

  // Total cards
  const totalMain = mainCards.reduce((sum, c) => sum + c.quantity, 0)
  const totalSideboard = sideboardCards.reduce((sum, c) => sum + c.quantity, 0)

  // Non-land cards for average CMC
  const nonLandCards = mainCards.filter(
    (c) => !c.card.type_line?.toLowerCase().includes('land')
  )
  const totalCMC = nonLandCards.reduce(
    (sum, c) => sum + c.card.cmc * c.quantity,
    0
  )
  const totalNonLandCount = nonLandCards.reduce((sum, c) => sum + c.quantity, 0)
  const avgCMC = totalNonLandCount > 0 ? totalCMC / totalNonLandCount : 0

  // Mana curve (CMC distribution for non-land cards)
  const manaCurve: Record<string, number> = {
    '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7+': 0,
  }
  // Track dominant colors per CMC bucket
  const cmcColors: Record<string, Record<string, number>> = {
    '0': {}, '1': {}, '2': {}, '3': {}, '4': {}, '5': {}, '6': {}, '7+': {},
  }

  nonLandCards.forEach(({ card, quantity }) => {
    const bucket = card.cmc >= 7 ? '7+' : String(Math.floor(card.cmc))
    manaCurve[bucket] += quantity
    if (card.colors) {
      card.colors.forEach((color) => {
        cmcColors[bucket][color] = (cmcColors[bucket][color] || 0) + quantity
      })
    }
    if (!card.colors || card.colors.length === 0) {
      cmcColors[bucket]['C'] = (cmcColors[bucket]['C'] || 0) + quantity
    }
  })

  const maxCurve = Math.max(...Object.values(manaCurve), 1)

  function getDominantColorClass(bucket: string): string {
    const colors = cmcColors[bucket]
    if (!colors || Object.keys(colors).length === 0) return 'bg-bg-accent'
    const dominant = Object.entries(colors).sort((a, b) => b[1] - a[1])[0][0]
    return getColorForMana(dominant)
  }

  // Color distribution
  const colorCounts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }
  mainCards.forEach(({ card, quantity }) => {
    if (card.colors && card.colors.length > 0) {
      card.colors.forEach((color) => {
        if (color in colorCounts) colorCounts[color] += quantity
      })
    } else if (!card.type_line?.toLowerCase().includes('land')) {
      colorCounts['C'] += quantity
    }
  })
  const totalColoredCards = Object.values(colorCounts).reduce((a, b) => a + b, 0) || 1

  // Type distribution
  const typeCounts: Record<string, number> = {}
  mainCards.forEach(({ card, quantity }) => {
    const category = getCardTypeCategory(card.type_line)
    typeCounts[category] = (typeCounts[category] || 0) + quantity
  })

  // Land count
  const landCount = typeCounts['Lands'] || 0

  // Total value
  const totalValue = mainCards.reduce(
    (sum, c) => sum + (c.card.prices_usd || 0) * c.quantity,
    0
  ) + sideboardCards.reduce(
    (sum, c) => sum + (c.card.prices_usd || 0) * c.quantity,
    0
  )

  const colorNames: Record<string, string> = {
    W: 'White',
    U: 'Blue',
    B: 'Black',
    R: 'Red',
    G: 'Green',
    C: 'Colorless',
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-bg-cell p-3">
          <div className="text-xs text-font-muted">Main Deck</div>
          <div className="text-lg font-bold text-font-primary">{totalMain}</div>
        </div>
        <div className="rounded-lg border border-border bg-bg-cell p-3">
          <div className="text-xs text-font-muted">Sideboard</div>
          <div className="text-lg font-bold text-font-primary">{totalSideboard}</div>
        </div>
        <div className="rounded-lg border border-border bg-bg-cell p-3">
          <div className="text-xs text-font-muted">Avg CMC</div>
          <div className="text-lg font-bold text-font-primary">{avgCMC.toFixed(2)}</div>
        </div>
        <div className="rounded-lg border border-border bg-bg-cell p-3">
          <div className="text-xs text-font-muted">Lands</div>
          <div className="text-lg font-bold text-font-primary">
            {landCount}
            <span className="ml-1 text-xs font-normal text-font-muted">
              ({totalMain > 0 ? ((landCount / totalMain) * 100).toFixed(0) : 0}%)
            </span>
          </div>
        </div>
      </div>

      {/* Estimated value */}
      <div className="rounded-lg border border-border bg-bg-cell p-3">
        <div className="text-xs text-font-muted">Estimated Value</div>
        <div className="text-lg font-bold text-font-accent">
          ${totalValue.toFixed(2)}
        </div>
      </div>

      {/* Mana Curve */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-font-secondary">Mana Curve</h3>
        <div className="flex items-end gap-1.5" style={{ height: '120px' }}>
          {Object.entries(manaCurve).map(([cmc, count]) => (
            <div key={cmc} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-font-muted">{count || ''}</span>
              <div className="relative w-full" style={{ height: '80px' }}>
                <div
                  className={`absolute bottom-0 w-full rounded-t transition-all ${getDominantColorClass(cmc)}`}
                  style={{
                    height: count > 0 ? `${Math.max((count / maxCurve) * 100, 8)}%` : '0%',
                    opacity: count > 0 ? 0.8 : 0,
                  }}
                />
              </div>
              <span className="text-xs text-font-muted">{cmc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Color Distribution */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-font-secondary">Color Distribution</h3>
        <div className="flex flex-col gap-2">
          {Object.entries(colorCounts)
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([color, count]) => (
              <div key={color} className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${getColorForMana(color)}`} />
                <span className="w-16 text-xs text-font-secondary">
                  {colorNames[color]}
                </span>
                <div className="flex-1">
                  <div className="h-2 w-full rounded-full bg-bg-cell">
                    <div
                      className={`h-2 rounded-full transition-all ${getColorForMana(color)}`}
                      style={{
                        width: `${(count / totalColoredCards) * 100}%`,
                        opacity: 0.8,
                      }}
                    />
                  </div>
                </div>
                <span className="w-8 text-right text-xs text-font-muted">
                  {count}
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* Type Distribution */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-font-secondary">Type Distribution</h3>
        <div className="flex flex-col gap-1">
          {Object.entries(typeCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => (
              <div key={type} className="flex items-center justify-between text-sm">
                <span className="text-font-secondary">{type}</span>
                <span className="font-medium text-font-primary">{count}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
