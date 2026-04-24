'use client'

import { TYPE_ICONS } from '@/lib/utils/typeIcons'
import { useDeckStats, type DeckCardEntry } from '@/lib/hooks/useDeckStats'

interface DeckStatsProps {
  cards: DeckCardEntry[]
}

const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'] as const
const COLOR_NAMES: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless' }
const COLOR_BG: Record<string, string> = { W: 'bg-mana-white', U: 'bg-mana-blue', B: 'bg-mana-black', R: 'bg-mana-red', G: 'bg-mana-green', C: 'bg-bg-cell' }
const COLOR_TEXT: Record<string, string> = { W: 'text-mana-white', U: 'text-mana-blue', B: 'text-mana-black', R: 'text-mana-red', G: 'text-mana-green', C: 'text-font-muted' }
// Mana symbol display colors (text on circle)
const COLOR_SYMBOL_TEXT: Record<string, string> = { W: 'text-bg-dark', U: 'text-font-white', B: 'text-font-white', R: 'text-font-white', G: 'text-font-white', C: 'text-font-primary' }

const CMC_BUCKETS = ['0', '1', '2', '3', '4', '5', '6', '7+'] as const

export default function DeckStats({ cards }: DeckStatsProps) {
  const stats = useDeckStats(cards)

  function getDominantColorClass(bucket: string): string {
    const colors = stats.cmcByColor[bucket]
    if (!colors || Object.keys(colors).length === 0) return 'bg-bg-accent'
    const dominant = Object.entries(colors).sort((a, b) => b[1] - a[1])[0][0]
    return COLOR_BG[dominant] || 'bg-bg-accent'
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-bg-cell p-3">
          <div className="text-xs text-font-muted">Main Deck</div>
          <div className="text-lg font-bold text-font-primary">{stats.totalMain}</div>
        </div>
        <div className="rounded-lg border border-border bg-bg-cell p-3">
          <div className="text-xs text-font-muted">Sideboard</div>
          <div className="text-lg font-bold text-font-primary">{stats.totalSideboard}</div>
        </div>
        <div className="rounded-lg border border-border bg-bg-cell p-3">
          <div className="text-xs text-font-muted">Avg Mana Value</div>
          <div className="text-lg font-bold text-font-primary">{stats.avgCMC.toFixed(2)}</div>
        </div>
        <div className="rounded-lg border border-border bg-bg-cell p-3">
          <div className="text-xs text-font-muted">Lands</div>
          <div className="text-lg font-bold text-font-primary">
            {stats.landCount}
            <span className="ml-1 text-xs font-normal text-font-muted">
              ({stats.totalMain > 0 ? ((stats.landCount / stats.totalMain) * 100).toFixed(0) : 0}%)
            </span>
          </div>
        </div>
      </div>

      {/* Estimated value */}
      <div className="rounded-lg border border-border bg-bg-cell p-3">
        <div className="text-xs text-font-muted">Estimated Value (Cardmarket)</div>
        <div className="flex items-baseline gap-3">
          {stats.totalValueEur > 0 ? (
            <span className="text-lg font-bold text-font-accent">€{stats.totalValueEur.toFixed(2)}</span>
          ) : (
            <span className="text-lg font-bold text-font-accent">${stats.totalValueUsd.toFixed(2)}</span>
          )}
          {stats.totalValueEur > 0 && stats.totalValueUsd > 0 && (
            <span className="text-sm font-semibold text-font-secondary">${stats.totalValueUsd.toFixed(2)}</span>
          )}
        </div>
      </div>

      {/* Cost & Production bars */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-font-secondary">Mana Cost vs Production</h3>

        {/* Cost bar */}
        <div className="mb-2">
          <div className="mb-1 text-[10px] font-medium text-font-muted">Cost</div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-bg-cell">
            {(['W', 'U', 'B', 'R', 'G'] as const).map((color) => {
              const pct = stats.totalCostPips > 0 ? (stats.costPips[color] / stats.totalCostPips) * 100 : 0
              if (pct === 0) return null
              return <div key={color} className={`${COLOR_BG[color]} opacity-80`} style={{ width: `${pct}%` }} title={`${COLOR_NAMES[color]}: ${stats.costPips[color]} pips (${pct.toFixed(0)}%)`} />
            })}
          </div>
        </div>

        {/* Production bar */}
        <div>
          <div className="mb-1 text-[10px] font-medium text-font-muted">Production</div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-bg-cell">
            {COLORS.map((color) => {
              const pct = stats.totalProduction > 0 ? (stats.productionCounts[color] / stats.totalProduction) * 100 : 0
              if (pct === 0) return null
              return <div key={color} className={`${COLOR_BG[color]} opacity-80`} style={{ width: `${pct}%` }} title={`${COLOR_NAMES[color]}: ${stats.productionCounts[color]} sources (${pct.toFixed(0)}%)`} />
            })}
          </div>
        </div>
      </div>

      {/* Per-color Cost vs Production breakdown */}
      <div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(['W', 'U', 'B', 'R', 'G', 'C'] as const).map((color) => {
            const costPct = stats.totalCostPips > 0 ? ((stats.costPips[color] || 0) / stats.totalCostPips) * 100 : 0
            const prodPct = stats.totalProduction > 0 ? (stats.productionCounts[color] / stats.totalProduction) * 100 : 0
            if (costPct === 0 && prodPct === 0) return null
            return (
              <div key={color} className="rounded-lg border border-border bg-bg-cell p-2">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <div className={`flex h-5 w-5 items-center justify-center rounded-full ${COLOR_BG[color]} ${COLOR_SYMBOL_TEXT[color]} text-[9px] font-bold`}>
                    {color}
                  </div>
                  <span className="text-[10px] text-font-muted">{COLOR_NAMES[color]}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-9 text-[9px] text-font-muted">Cost</span>
                    <div className="h-1.5 flex-1 rounded-full bg-bg-dark">
                      <div className={`h-1.5 rounded-full ${COLOR_BG[color]} opacity-80`} style={{ width: `${Math.min(costPct, 100)}%` }} />
                    </div>
                    <span className="w-7 text-right text-[9px] text-font-secondary">{costPct.toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-9 text-[9px] text-font-muted">Prod</span>
                    <div className="h-1.5 flex-1 rounded-full bg-bg-dark">
                      <div className={`h-1.5 rounded-full ${COLOR_BG[color]} opacity-60`} style={{ width: `${Math.min(prodPct, 100)}%` }} />
                    </div>
                    <span className="w-7 text-right text-[9px] text-font-secondary">{prodPct.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Mana Curve */}
      <div>
        <h3 className="mb-1 text-sm font-semibold text-font-secondary">Mana Curve</h3>
        <div className="mb-1 flex items-baseline gap-2 text-[10px] text-font-muted">
          <span>Avg: {stats.avgCMC.toFixed(2)}</span>
          <span>Total: {stats.totalManaValue.toFixed(0)}</span>
        </div>
        <div className="flex items-end gap-1.5" style={{ height: '120px' }}>
          {CMC_BUCKETS.map((cmc) => {
            const count = stats.manaCurve[cmc]
            return (
              <div key={cmc} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] text-font-muted">{count || ''}</span>
                <div className="relative w-full" style={{ height: '80px' }}>
                  <div
                    className={`absolute bottom-0 w-full rounded-t transition-all ${getDominantColorClass(cmc)}`}
                    style={{
                      height: count > 0 ? `${Math.max((count / stats.maxCurve) * 100, 8)}%` : '0%',
                      opacity: count > 0 ? 0.8 : 0,
                    }}
                  />
                </div>
                <span className="text-xs text-font-muted">{cmc}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Mana Curve by Color */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-font-secondary">Mana Curve by Color</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {COLORS.map((color) => {
            const curve = stats.perColorCurve[color]
            const max = Math.max(...Object.values(curve), 1)
            const total = Object.values(curve).reduce((a, b) => a + b, 0)
            if (total === 0) return null
            return (
              <div key={color} className="rounded-lg border border-border bg-bg-cell p-2">
                <div className="mb-1 flex items-center gap-1.5">
                  <div className={`flex h-4 w-4 items-center justify-center rounded-full ${COLOR_BG[color]} ${COLOR_SYMBOL_TEXT[color]} text-[8px] font-bold`}>
                    {color}
                  </div>
                  <span className="text-[10px] text-font-muted">{COLOR_NAMES[color]}</span>
                </div>
                <div className="flex items-end gap-0.5" style={{ height: '40px' }}>
                  {CMC_BUCKETS.map((cmc) => {
                    const count = curve[cmc]
                    return (
                      <div key={cmc} className="flex flex-1 flex-col items-center">
                        {count > 0 && <span className="text-[7px] text-font-muted">{count}</span>}
                        <div className="relative w-full" style={{ height: '28px' }}>
                          <div
                            className={`absolute bottom-0 w-full rounded-t ${COLOR_BG[color]}`}
                            style={{
                              height: count > 0 ? `${Math.max((count / max) * 100, 10)}%` : '0%',
                              opacity: count > 0 ? 0.7 : 0,
                            }}
                          />
                        </div>
                        <span className="text-[7px] text-font-muted">{cmc}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Color Distribution */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-font-secondary">Color Distribution</h3>
        <div className="flex flex-col gap-2">
          {COLORS
            .filter((color) => stats.colorCounts[color] > 0)
            .sort((a, b) => stats.colorCounts[b] - stats.colorCounts[a])
            .map((color) => {
              const count = stats.colorCounts[color]
              return (
                <div key={color} className="flex items-center gap-2">
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${COLOR_BG[color]} ${COLOR_SYMBOL_TEXT[color]} text-[9px] font-bold`}>
                    {color}
                  </div>
                  <span className="w-16 text-xs text-font-secondary">{COLOR_NAMES[color]}</span>
                  <div className="flex-1">
                    <div className="h-2 w-full rounded-full bg-bg-cell">
                      <div className={`h-2 rounded-full ${COLOR_BG[color]} opacity-80`} style={{ width: `${(count / stats.totalColoredCards) * 100}%` }} />
                    </div>
                  </div>
                  <span className="w-8 text-right text-xs text-font-muted">{count}</span>
                </div>
              )
            })}
        </div>
      </div>

      {/* Type Distribution */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-font-secondary">Type Distribution</h3>
        <div className="flex flex-col gap-1">
          {Object.entries(stats.typeCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => {
              const Icon = TYPE_ICONS[type]
              return (
                <div key={type} className="flex items-center gap-2 text-sm">
                  {Icon && <Icon className="h-3.5 w-3.5 text-font-muted shrink-0" />}
                  <span className="flex-1 text-font-secondary">{type}</span>
                  <span className="font-medium text-font-primary">{count}</span>
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}
