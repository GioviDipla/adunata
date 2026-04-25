'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { TYPE_ICONS } from '@/lib/utils/typeIcons'
import { useDeckStats, type DeckCardEntry } from '@/lib/hooks/useDeckStats'
import { useDeckSimulator } from '@/lib/hooks/useDeckSimulator'
import type { SimInput } from '@/lib/hooks/deckSimulatorWorker'

// Recharts is ~940KB before tree-shaking; the rarity pie is the only
// place we use it. Defer it so the Stats panel proper paints first and
// the chart loads when its tab actually has data.
const RarityPie = dynamic(() => import('./RarityPie'), {
  ssr: false,
  loading: () => (
    <div className="flex h-40 w-full items-center justify-center text-xs text-font-muted">
      Loading chart…
    </div>
  ),
})

interface DeckStatsProps {
  cards: DeckCardEntry[]
  format?: string
  commanderIdentity?: string[]
}

type TabKey = 'overview' | 'mana' | 'functions' | 'power' | 'quality'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'mana', label: 'Mana' },
  { key: 'functions', label: 'Functions' },
  { key: 'power', label: 'Power' },
  { key: 'quality', label: 'Quality' },
]

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-md bg-bg-dark/40 px-2 py-1.5">
      <dt className="text-[10px] text-font-muted">{label}</dt>
      <dd className="text-xs font-semibold text-font-primary">{value}</dd>
    </div>
  )
}

const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'] as const
const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const
const COLOR_NAMES: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless' }
const COLOR_BG: Record<string, string> = { W: 'bg-mana-white', U: 'bg-mana-blue', B: 'bg-mana-black', R: 'bg-mana-red', G: 'bg-mana-green', C: 'bg-bg-cell' }
// Mana symbol display colors (text on circle)
const COLOR_SYMBOL_TEXT: Record<string, string> = { W: 'text-bg-dark', U: 'text-font-white', B: 'text-font-white', R: 'text-font-white', G: 'text-font-white', C: 'text-font-primary' }

const CMC_BUCKETS = ['0', '1', '2', '3', '4', '5', '6', '7+'] as const

/** Commander best-practices recommended ranges per category. */
const FUNCTION_RECS: Record<string, { min: number; max: number; label: string }> = {
  Ramp: { min: 10, max: 14, label: '10-14' },
  'Card Draw': { min: 10, max: Infinity, label: '10+' },
  Removal: { min: 8, max: 10, label: '8-10' },
  Tutors: { min: 0, max: 4, label: '0-4' },
  Protection: { min: 4, max: Infinity, label: '4+' },
  Lands: { min: 36, max: 36, label: '36' },
}

function healthScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400'
  if (score >= 60) return 'text-yellow-400'
  if (score >= 40) return 'text-orange-400'
  return 'text-font-danger'
}

function healthScoreBg(score: number): string {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-yellow-500'
  if (score >= 40) return 'bg-orange-500'
  return 'bg-red-600'
}

function functionStatus(count: number, rec: { min: number; max: number }): {
  symbol: string
  cls: string
} {
  if (count < rec.min) return { symbol: '↓', cls: 'text-orange-400' }
  if (count > rec.max) return { symbol: '↑', cls: 'text-yellow-400' }
  return { symbol: '✓', cls: 'text-emerald-400' }
}

function powerBracketColor(bracket: string): string {
  if (bracket === 'cEDH') return 'text-red-400'
  if (bracket === 'Optimized') return 'text-orange-400'
  if (bracket === 'Focused') return 'text-yellow-400'
  return 'text-emerald-400'
}

export default function DeckStats({ cards, format, commanderIdentity }: DeckStatsProps) {
  const stats = useDeckStats(cards, { format, commanderIdentity })
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const isCommanderFormat = (format ?? '').toLowerCase() === 'commander' || (format ?? '').toLowerCase() === 'edh'

  // Build simulator input — flatten main+commander boards into one copy per
  // quantity, tag lands / rocks. Only built once the user opens the Power
  // tab; before that the heavy flatMap + worker spawn are skipped entirely.
  const simInput = useMemo<SimInput | null>(() => {
    if (activeTab !== 'power') return null
    const main = cards.filter((c) => c.board === 'main' || c.board === 'commander')
    if (main.length === 0) return null
    const mainDeck = main.flatMap(({ card, quantity }) => {
      const tl = (card.type_line ?? '').toLowerCase()
      const is_land = tl.includes('land')
      const producedLen = ((card.produced_mana as string[] | null) ?? []).length
      const is_rock = !is_land && producedLen > 0
      return Array.from({ length: quantity }, () => ({
        cmc: card.cmc ?? 0,
        is_land,
        is_rock,
      }))
    })
    const cmd = cards.find((c) => c.board === 'commander')
    return {
      mainDeck,
      commanderCmc: cmd ? cmd.card.cmc : null,
      iterations: 5000,
    }
  }, [cards, activeTab])

  const { result: sim, running: simRunning } = useDeckSimulator(simInput)

  function getDominantColorClass(bucket: string): string {
    const colors = stats.cmcByColor[bucket]
    if (!colors || Object.keys(colors).length === 0) return 'bg-bg-accent'
    const dominant = Object.entries(colors).sort((a, b) => b[1] - a[1])[0][0]
    return COLOR_BG[dominant] || 'bg-bg-accent'
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Tab bar — horizontal scroll on mobile */}
      <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1 pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`whitespace-nowrap rounded-t-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === t.key
                ? 'bg-bg-cell text-font-primary'
                : 'text-font-muted hover:text-font-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
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

          {/* Mana Base Health Score */}
          <div className="rounded-lg border border-border bg-bg-cell p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-font-secondary">Mana Base Health</h3>
              <span className={`text-2xl font-bold ${healthScoreColor(stats.manaBaseHealth.score)}`}>
                {stats.manaBaseHealth.score}
                <span className="text-xs font-normal text-font-muted">/100</span>
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {stats.manaBaseHealth.breakdown.map((b) => (
                <div key={b.label} className="flex items-center gap-2">
                  <span className="w-36 shrink-0 text-[10px] text-font-muted">{b.label}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-bg-dark">
                    <div
                      className={`h-1.5 rounded-full ${healthScoreBg(b.value)}`}
                      style={{ width: `${(b.value / b.max) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-[10px] font-medium text-font-secondary">
                    {b.value}
                  </span>
                </div>
              ))}
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
        </div>
      )}

      {activeTab === 'mana' && (
        <div className="flex flex-col gap-5">
          {/* Cost & Production bars */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-font-secondary">Mana Cost vs Production</h3>

            {/* Cost bar */}
            <div className="mb-2">
              <div className="mb-1 text-[10px] font-medium text-font-muted">Cost</div>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-bg-cell">
                {WUBRG.map((color) => {
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
              {COLORS.map((color) => {
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

          {/* Color gap (demand vs source share) */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-font-secondary">
              Color Source Gap
              <span className="ml-2 text-[10px] font-normal text-font-muted">demand vs sources</span>
            </h3>
            <div className="flex flex-col gap-2">
              {WUBRG.filter((c) => stats.colorGap[c].pipDemand > 0 || stats.colorGap[c].sourceShare > 0).map((color) => {
                const g = stats.colorGap[color]
                const gapPct = g.gap * 100
                const isStarved = gapPct < -5
                const isOversupplied = gapPct > 5
                return (
                  <div key={color} className="rounded-md border border-border bg-bg-cell p-2">
                    <div className="mb-1 flex items-center gap-2">
                      <div className={`flex h-4 w-4 items-center justify-center rounded-full ${COLOR_BG[color]} ${COLOR_SYMBOL_TEXT[color]} text-[8px] font-bold`}>
                        {color}
                      </div>
                      <span className="flex-1 text-[10px] text-font-secondary">{COLOR_NAMES[color]}</span>
                      <span
                        className={`text-[10px] font-semibold ${
                          isStarved ? 'text-font-danger' : isOversupplied ? 'text-emerald-400' : 'text-font-muted'
                        }`}
                      >
                        {gapPct >= 0 ? '+' : ''}
                        {gapPct.toFixed(0)}%
                        {isStarved && ' starved'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-12 text-[9px] text-font-muted">Demand</span>
                      <div className="h-1.5 flex-1 rounded-full bg-bg-dark">
                        <div className={`h-1.5 rounded-full ${COLOR_BG[color]} opacity-80`} style={{ width: `${Math.min(g.pipDemand * 100, 100)}%` }} />
                      </div>
                      <span className="w-9 text-right text-[9px] text-font-secondary">{(g.pipDemand * 100).toFixed(0)}%</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="w-12 text-[9px] text-font-muted">Sources</span>
                      <div className="h-1.5 flex-1 rounded-full bg-bg-dark">
                        <div className={`h-1.5 rounded-full ${COLOR_BG[color]} opacity-50`} style={{ width: `${Math.min(g.sourceShare * 100, 100)}%` }} />
                      </div>
                      <span className="w-9 text-right text-[9px] text-font-secondary">{(g.sourceShare * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Mana Sources */}
          {stats.manaSourceCount > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-font-secondary">
                Mana Sources
                <span className="ml-2 text-xs font-normal text-font-muted">
                  {stats.manaSourceCount} total
                </span>
              </h3>
              {(() => {
                const wubrgSum = WUBRG.reduce((s, c) => s + stats.colorSourceCount[c], 0)
                const fallback = Math.max(stats.manaSourceCount - wubrgSum, 0)
                const denom = wubrgSum + fallback || 1
                return (
                  <>
                    <div className="flex h-3 w-full overflow-hidden rounded-full bg-bg-cell">
                      {WUBRG.map((color) => {
                        const count = stats.colorSourceCount[color]
                        if (count === 0) return null
                        const pct = (count / denom) * 100
                        return (
                          <div
                            key={color}
                            className={`${COLOR_BG[color]} opacity-80`}
                            style={{ width: `${pct}%` }}
                            title={`${COLOR_NAMES[color]}: ${count} sources`}
                          />
                        )
                      })}
                      {fallback > 0 && (
                        <div
                          className="bg-bg-accent opacity-50"
                          style={{ width: `${(fallback / denom) * 100}%` }}
                          title={`Other/colorless: ${fallback} sources`}
                        />
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-font-muted">
                      {WUBRG.map((color) => {
                        const count = stats.colorSourceCount[color]
                        if (count === 0) return null
                        return (
                          <span key={color} className="inline-flex items-center gap-1">
                            <span
                              className={`inline-block h-2 w-2 rounded-full ${COLOR_BG[color]} opacity-80`}
                            />
                            <span className="text-font-secondary">{count}</span>
                          </span>
                        )
                      })}
                      {fallback > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block h-2 w-2 rounded-full bg-bg-accent opacity-50" />
                          <span className="text-font-secondary">{fallback} other</span>
                        </span>
                      )}
                    </div>
                  </>
                )
              })()}
            </div>
          )}

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
        </div>
      )}

      {activeTab === 'functions' && (
        <div className="flex flex-col gap-5">
          {/* Function density */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-font-secondary">
              Function Density
              {!isCommanderFormat && (
                <span className="ml-2 text-[10px] font-normal text-font-muted">
                  (recommendations apply to Commander)
                </span>
              )}
            </h3>
            <div className="overflow-hidden rounded-lg border border-border bg-bg-cell">
              <table className="w-full text-xs">
                <thead className="bg-bg-dark/40 text-[10px] uppercase text-font-muted">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-semibold">Category</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Count</th>
                    {isCommanderFormat && (
                      <>
                        <th className="px-2 py-1.5 text-right font-semibold">Range</th>
                        <th className="px-2 py-1.5 text-center font-semibold">Status</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(['Lands', 'Ramp', 'Card Draw', 'Removal', 'Tutors', 'Protection', 'Utility'] as const).map((cat) => {
                    const count = stats.functions[cat]
                    const rec = FUNCTION_RECS[cat]
                    return (
                      <tr key={cat} className="border-t border-border">
                        <td className="px-2 py-1.5 text-font-secondary">{cat}</td>
                        <td className="px-2 py-1.5 text-right font-semibold text-font-primary">{count}</td>
                        {isCommanderFormat && (
                          <>
                            <td className="px-2 py-1.5 text-right text-font-muted">{rec ? rec.label : '—'}</td>
                            <td className="px-2 py-1.5 text-center">
                              {rec ? (
                                <span className={functionStatus(count, rec).cls}>{functionStatus(count, rec).symbol}</span>
                              ) : (
                                <span className="text-font-muted">—</span>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
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

          {/* Rarity */}
          {stats.rarityBreakdown.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-font-secondary">Rarity</h3>
              <RarityPie data={stats.rarityBreakdown} />
            </div>
          )}

          {/* Top Sets */}
          {stats.setBreakdown.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-font-secondary">Top Sets</h3>
              <div className="flex flex-col gap-1.5">
                {(() => {
                  const max = Math.max(...stats.setBreakdown.map((s) => s.count), 1)
                  return stats.setBreakdown.map((s) => (
                    <div key={s.code} className="flex items-center gap-2 text-xs">
                      <span className="w-10 shrink-0 font-mono text-[10px] uppercase text-font-muted">
                        {s.code}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-font-secondary">
                        {s.name ?? s.code}
                      </span>
                      <div className="h-1.5 w-16 shrink-0 rounded-full bg-bg-cell">
                        <div
                          className="h-1.5 rounded-full bg-bg-accent opacity-70"
                          style={{ width: `${(s.count / max) * 100}%` }}
                        />
                      </div>
                      <span className="w-6 shrink-0 text-right font-medium text-font-primary">
                        {s.count}
                      </span>
                    </div>
                  ))
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'power' && (
        <div className="flex flex-col gap-5">
          {/* Power Level gauge */}
          <div className="rounded-lg border border-border bg-bg-cell p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-font-secondary">Power Level</h3>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-bold ${powerBracketColor(stats.powerLevel.bracket)}`}>
                  {stats.powerLevel.score.toFixed(1)}
                </span>
                <span className="text-xs font-normal text-font-muted">/10</span>
              </div>
            </div>
            <div className="mb-2 flex h-2 w-full overflow-hidden rounded-full bg-bg-dark">
              {Array.from({ length: 10 }, (_, i) => {
                const filled = i + 1 <= Math.floor(stats.powerLevel.score)
                const partial = !filled && i + 1 === Math.ceil(stats.powerLevel.score)
                const frac = partial ? stats.powerLevel.score - Math.floor(stats.powerLevel.score) : 0
                return (
                  <div key={i} className="relative h-2 flex-1 border-r border-bg-dark last:border-r-0">
                    {filled && <div className="h-2 w-full bg-orange-500 opacity-80" />}
                    {partial && (
                      <div
                        className="h-2 bg-orange-500 opacity-80"
                        style={{ width: `${frac * 100}%` }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-font-muted">Casual</span>
              <span className={`font-semibold ${powerBracketColor(stats.powerLevel.bracket)}`}>
                {stats.powerLevel.bracket}
              </span>
              <span className="text-font-muted">cEDH</span>
            </div>
          </div>

          {/* Speed Tier */}
          <div className="rounded-lg border border-border bg-bg-cell p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-font-secondary">Speed Tier</h3>
              <span className="text-xs font-semibold text-font-accent">{stats.speedTier.label}</span>
            </div>
            {stats.speedTier.total > 0 ? (
              <>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-bg-dark">
                  {(['early', 'mid', 'late'] as const).map((b) => {
                    const v = stats.speedTier[b]
                    const pct = (v / stats.speedTier.total) * 100
                    if (pct === 0) return null
                    const cls =
                      b === 'early' ? 'bg-emerald-500' : b === 'mid' ? 'bg-yellow-500' : 'bg-orange-500'
                    return (
                      <div
                        key={b}
                        className={`${cls} opacity-80`}
                        style={{ width: `${pct}%` }}
                        title={`${b}: ${v} (${pct.toFixed(0)}%)`}
                      />
                    )
                  })}
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-font-muted">
                  <span>
                    Early (≤2): <span className="text-font-secondary">{stats.speedTier.early}</span>
                  </span>
                  <span>
                    Mid (3-4): <span className="text-font-secondary">{stats.speedTier.mid}</span>
                  </span>
                  <span>
                    Late (5+): <span className="text-font-secondary">{stats.speedTier.late}</span>
                  </span>
                </div>
              </>
            ) : (
              <div className="text-xs text-font-muted">No non-land cards yet.</div>
            )}
          </div>

          {/* Goldfish Stats (Monte Carlo) */}
          {simInput && (
            <div className="rounded-lg border border-border bg-bg-cell p-3">
              <h3 className="mb-2 text-sm font-semibold text-font-secondary">
                Goldfish Stats
                <span className="ml-2 text-[10px] font-normal text-font-muted">
                  (5k sims)
                </span>
              </h3>
              {simRunning && (
                <div className="text-xs text-font-muted">Simulating…</div>
              )}
              {sim && (
                <dl className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  <StatRow
                    label="Keep rate (2-5 lands)"
                    value={`${(sim.keepRate * 100).toFixed(0)}%`}
                  />
                  <StatRow
                    label="Mana screw @ T3"
                    value={`${(sim.screwRate * 100).toFixed(0)}%`}
                  />
                  <StatRow
                    label="Mana flood @ T7"
                    value={`${(sim.floodRate * 100).toFixed(0)}%`}
                  />
                  {simInput.commanderCmc != null && sim.turnToCommanderP50 != null && (
                    <StatRow
                      label="Turn to commander (P50 / P90)"
                      value={`T${sim.turnToCommanderP50} / T${sim.turnToCommanderP90 ?? '?'}`}
                    />
                  )}
                  <StatRow
                    label="Castable on curve"
                    value={`${(sim.castableOnCurve * 100).toFixed(0)}%`}
                  />
                  <StatRow
                    label="Avg mana @ T5"
                    value={sim.avgManaSpentByT5.toFixed(1)}
                  />
                </dl>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'quality' && (
        <div className="flex flex-col gap-5">
          {/* Tribal */}
          <div className="rounded-lg border border-border bg-bg-cell p-3">
            <h3 className="mb-2 text-sm font-semibold text-font-secondary">Tribal</h3>
            {stats.tribal.isTribal && stats.tribal.topType ? (
              <div className="mb-2 rounded-md bg-emerald-900/20 px-2 py-1.5 text-xs text-emerald-300">
                Tribal detected: <span className="font-semibold">{stats.tribal.topType}</span> ×
                {stats.tribal.topCount}
              </div>
            ) : (
              <div className="mb-2 text-xs text-font-muted">No tribal pattern detected.</div>
            )}
            {stats.tribal.topByType.length > 0 && (
              <div className="flex flex-col gap-1">
                {stats.tribal.topByType.map((t) => (
                  <div key={t.type} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 text-font-secondary">{t.type}</span>
                    <span className="font-medium text-font-primary">{t.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Keywords */}
          {stats.keywords.length > 0 && (
            <div className="rounded-lg border border-border bg-bg-cell p-3">
              <h3 className="mb-2 text-sm font-semibold text-font-secondary">Top Keywords</h3>
              <div className="flex flex-wrap gap-2 text-xs">
                {stats.keywords.map((k) => (
                  <span
                    key={k.keyword}
                    className="rounded-full bg-bg-dark px-2 py-0.5 text-font-secondary"
                  >
                    {k.keyword} <span className="text-font-muted">×{k.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Identity violations (Commander only) */}
          {isCommanderFormat && commanderIdentity && stats.identityViolations.length > 0 && (
            <div className="rounded-lg border border-red-700/60 bg-red-950/20 p-3">
              <h3 className="mb-2 text-sm font-semibold text-font-danger">
                Color Identity Violations
                <span className="ml-2 text-[10px] font-normal text-font-muted">
                  {stats.identityViolations.length} card{stats.identityViolations.length === 1 ? '' : 's'}
                </span>
              </h3>
              <div className="flex flex-col gap-1">
                {stats.identityViolations.map((v) => (
                  <div key={v.name} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 text-font-secondary">{v.name}</span>
                    <span className="font-mono text-[10px] text-font-danger">
                      {v.offending.join('')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Expensive */}
          {stats.topExpensive.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-font-secondary">Top 10 Expensive</h3>
              <div className="flex flex-col gap-1">
                {stats.topExpensive.map((c) => {
                  const useEur = c.priceEur > 0
                  const unit = useEur ? c.priceEur : c.priceUsd
                  const total = unit * c.quantity
                  const symbol = useEur ? '€' : '$'
                  return (
                    <div
                      key={`${c.cardId}-${c.name}`}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate text-font-secondary">
                        {c.name}
                        {c.quantity > 1 && (
                          <span className="ml-1 text-font-muted">×{c.quantity}</span>
                        )}
                      </span>
                      <span className="shrink-0 font-medium text-font-accent">
                        {symbol}
                        {total.toFixed(2)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
