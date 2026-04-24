'use client'

import { useMemo } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { TYPE_ICONS } from '@/lib/utils/typeIcons'
import { useDeckStats, type DeckCardEntry } from '@/lib/hooks/useDeckStats'
import { useDeckSimulator } from '@/lib/hooks/useDeckSimulator'
import type { SimInput } from '@/lib/hooks/deckSimulatorWorker'

interface DeckStatsProps {
  cards: DeckCardEntry[]
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-md bg-bg-dark/40 px-2 py-1.5">
      <dt className="text-[10px] text-font-muted">{label}</dt>
      <dd className="text-xs font-semibold text-font-primary">{value}</dd>
    </div>
  )
}

/** MTG rarity colors for the pie chart. */
const RARITY_COLOR: Record<string, string> = {
  common: '#6b7280',
  uncommon: '#94a3b8',
  rare: '#ca8a04',
  mythic: '#ea580c',
  special: '#8b5cf6',
  bonus: '#14b8a6',
  unknown: '#475569',
}

function rarityColor(rarity: string): string {
  return RARITY_COLOR[rarity.toLowerCase()] ?? RARITY_COLOR.unknown
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
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

  // Build simulator input — flatten main+commander boards into one copy per
  // quantity, tag lands / rocks. Memoized on `cards` identity.
  const simInput = useMemo<SimInput | null>(() => {
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
  }, [cards])

  const { result: sim, running: simRunning } = useDeckSimulator(simInput)

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
            </dl>
          )}
        </div>
      )}

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
            const wubrgSum = (['W', 'U', 'B', 'R', 'G'] as const).reduce(
              (s, c) => s + stats.colorSourceCount[c],
              0,
            )
            // Fallback bucket: sources that don't produce WUBRG (colorless lands, etc.)
            const fallback = Math.max(stats.manaSourceCount - wubrgSum, 0)
            const denom = wubrgSum + fallback || 1
            return (
              <>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-bg-cell">
                  {(['W', 'U', 'B', 'R', 'G'] as const).map((color) => {
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
                  {(['W', 'U', 'B', 'R', 'G'] as const).map((color) => {
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

      {/* Rarity */}
      {stats.rarityBreakdown.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-font-secondary">Rarity</h3>
          <div style={{ width: '100%', height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.rarityBreakdown}
                  dataKey="count"
                  nameKey="rarity"
                  cx="50%"
                  cy="50%"
                  outerRadius={60}
                  label={false}
                  labelLine={false}
                >
                  {stats.rarityBreakdown.map((entry) => (
                    <Cell key={entry.rarity} fill={rarityColor(entry.rarity)} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: '#1f2937',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                  formatter={(value, name) => [
                    String(value),
                    capitalize(String(name)),
                  ]}
                />
                <Legend
                  iconSize={8}
                  wrapperStyle={{ fontSize: 10 }}
                  formatter={(value: string) => capitalize(value)}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
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

      {/* Top 10 Expensive */}
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
  )
}
