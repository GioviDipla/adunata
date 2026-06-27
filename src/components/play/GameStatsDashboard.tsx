'use client'

import { useState } from 'react'
import type { GameStats, PlayerStats, CardTypeBreakdown } from '@/lib/game/stats'
import { Swords, Zap, Heart, TrendingDown, TrendingUp, Clock, Play, Shield, Sword, ChevronUp, ChevronDown } from 'lucide-react'

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-bg-surface p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-font-muted" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-font-muted">{label}</p>
        <p className="text-sm font-bold text-font-primary">{value}</p>
        {sub && <p className="text-[10px] text-font-muted">{sub}</p>}
      </div>
    </div>
  )
}

function TypeBar({ breakdown, label }: { breakdown: CardTypeBreakdown; label: string }) {
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0)
  if (total === 0) return null
  const items = [
    { key: 'creature', label: 'Creatures', color: 'bg-emerald-500' },
    { key: 'instant', label: 'Instants', color: 'bg-blue-500' },
    { key: 'sorcery', label: 'Sorceries', color: 'bg-violet-500' },
    { key: 'enchantment', label: 'Enchants', color: 'bg-amber-500' },
    { key: 'artifact', label: 'Artifacts', color: 'bg-orange-500' },
    { key: 'planeswalker', label: 'Planeswalkers', color: 'bg-rose-500' },
    { key: 'land', label: 'Lands', color: 'bg-stone-500' },
    { key: 'other', label: 'Other', color: 'bg-gray-500' },
  ] as const

  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-font-muted">{label}</p>
      <div className="flex h-3 overflow-hidden rounded-sm">
        {items.map((it) => {
          const count = breakdown[it.key]
          if (count === 0) return null
          const pct = Math.max((count / total) * 100, 2)
          return (
            <div
              key={it.key}
              className={`${it.color} flex items-center justify-center text-[7px] font-bold text-white`}
              style={{ width: `${pct}%` }}
              title={`${it.label}: ${count}`}
            >
              {pct > 8 ? count : ''}
            </div>
          )
        })}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        {items.filter((it) => breakdown[it.key] > 0).map((it) => (
          <span key={it.key} className="text-[10px] text-font-muted">
            <span className="font-medium text-font-secondary">{breakdown[it.key]}</span> {it.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function PlayerStatBlock({ ps, playerName, isWinner }: { ps: PlayerStats; playerName: string; isWinner: boolean }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-lg border border-border bg-bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className={`h-2.5 w-2.5 rounded-full ${isWinner ? 'bg-bg-green' : 'bg-bg-red'}`} />
        <h3 className="text-sm font-bold text-font-primary">{playerName}</h3>
        {isWinner && <span className="rounded-full bg-bg-green/20 px-2 py-0.5 text-[9px] font-bold text-bg-green">WINNER</span>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatCard icon={Play} label="Cards Played" value={ps.cardsPlayed} />
        <StatCard icon={Zap} label="Actions" value={ps.actions} />
        <StatCard icon={Heart} label="Life Range" value={`${ps.minLifeReached}–${ps.maxLifeReached}`} />
        <StatCard icon={TrendingDown} label="Life Lost" value={ps.lifeLost} />
        {ps.lifeGained > 0 && <StatCard icon={TrendingUp} label="Life Gained" value={ps.lifeGained} />}
        <StatCard icon={Sword} label="Attacks" value={ps.attacksDeclared} />
        <StatCard icon={Shield} label="Blocks" value={ps.blocksDeclared} />
        {ps.biggestLifeSwing > 0 && <StatCard icon={Zap} label="Biggest Hit" value={ps.biggestLifeSwing} />}
        <StatCard icon={Play} label="Cards Drawn" value={ps.cardsDrawn} />
        {ps.mulligans > 0 && <StatCard icon={Play} label="Mulligans" value={ps.mulligans} />}
      </div>

      <div className="mt-3">
        <TypeBar breakdown={ps.cardsByType} label={`Cards by Type (${playerName})`} />
      </div>

      {ps.mostPlayedCard && (
        <p className="mt-3 text-[11px] text-font-muted">
          Most played: <span className="font-semibold text-font-primary">{ps.mostPlayedCard.name}</span> ({ps.mostPlayedCard.count}x)
        </p>
      )}

      {/* Expandable creature details */}
      {ps.creaturesPlayed.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-3 flex w-full items-center justify-between rounded-md bg-bg-surface px-2 py-1.5 text-[10px] font-semibold text-font-muted hover:text-font-secondary transition-colors"
          >
            <span>{ps.creaturesPlayed.length} creatures played</span>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {expanded && (
            <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-bg-surface">
              {ps.creaturesPlayed
                .sort((a, b) => b.power + b.toughness - (a.power + a.toughness))
                .map((c) => (
                  <div key={c.instanceId} className="flex items-center justify-between px-2 py-1 text-[10px] border-b border-border last:border-0">
                    <span className="font-medium text-font-primary truncate flex-1">{c.name}</span>
                    <span className="shrink-0 ml-2 text-font-muted tabular-nums">
                      {c.power}/{c.toughness}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function GameStatsDashboard({
  stats,
  playerNames,
}: {
  stats: GameStats
  playerNames: Record<string, string>
}) {
  const totalCardsPlayed = stats.players.reduce((s, p) => s + p.cardsPlayed, 0)

  return (
    <div className="mb-6 space-y-4">
      {/* Top-level summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard icon={Clock} label="Duration" value={stats.duration ?? '—'} />
        <StatCard icon={Zap} label="Turns" value={stats.turns} />
        <StatCard icon={Play} label="Actions" value={stats.totalActions} />
        <StatCard icon={Swords} label="Total Cards" value={totalCardsPlayed} />
      </div>

      {/* Global superlatives */}
      <div className="rounded-lg border border-border bg-bg-card p-4">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-font-secondary">Game Highlights</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {stats.strongestByPower && (
            <div className="rounded-md bg-bg-surface p-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-font-muted">Strongest (Power)</p>
              <p className="text-xs font-bold text-font-primary truncate">{stats.strongestByPower.name}</p>
              <p className="text-[10px] text-font-muted">{stats.strongestByPower.power}/{stats.strongestByPower.toughness}</p>
            </div>
          )}
          {stats.strongestByToughness && (
            <div className="rounded-md bg-bg-surface p-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-font-muted">Strongest (Toughness)</p>
              <p className="text-xs font-bold text-font-primary truncate">{stats.strongestByToughness.name}</p>
              <p className="text-[10px] text-font-muted">{stats.strongestByToughness.power}/{stats.strongestByToughness.toughness}</p>
            </div>
          )}
          {stats.largestCreature && (
            <div className="rounded-md bg-bg-surface p-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-font-muted">Largest Creature</p>
              <p className="text-xs font-bold text-font-primary truncate">{stats.largestCreature.name}</p>
              <p className="text-[10px] text-font-muted">{stats.largestCreature.power}/{stats.largestCreature.toughness}</p>
            </div>
          )}
          {stats.biggestHit && (
            <div className="rounded-md bg-bg-surface p-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-font-muted">Biggest Hit</p>
              <p className="text-xs font-bold text-font-primary">{stats.biggestHit.amount} dmg</p>
              <p className="text-[10px] text-font-muted truncate">{stats.biggestHit.cardName ?? 'Combat'}</p>
            </div>
          )}
          {stats.mostTapped && (
            <div className="rounded-md bg-bg-surface p-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-font-muted">Most Tapped</p>
              <p className="text-xs font-bold text-font-primary truncate">{stats.mostTapped.name}</p>
              <p className="text-[10px] text-font-muted">{stats.mostTapped.times}x tapped</p>
            </div>
          )}
          {stats.mostAttacking && (
            <div className="rounded-md bg-bg-surface p-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-font-muted">Most Aggressive</p>
              <p className="text-xs font-bold text-font-primary truncate">{stats.mostAttacking.name}</p>
              <p className="text-[10px] text-font-muted">{stats.mostAttacking.times}x attacked</p>
            </div>
          )}
          {stats.mostBlocking && (
            <div className="rounded-md bg-bg-surface p-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-font-muted">Best Defender</p>
              <p className="text-xs font-bold text-font-primary truncate">{stats.mostBlocking.name}</p>
              <p className="text-[10px] text-font-muted">{stats.mostBlocking.times}x blocked</p>
            </div>
          )}
          {stats.deadliestCreature && (
            <div className="rounded-md bg-bg-surface p-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-font-muted">Deadliest</p>
              <p className="text-xs font-bold text-font-primary truncate">{stats.deadliestCreature.name}</p>
              <p className="text-[10px] text-font-muted">{stats.deadliestCreature.kills} kills</p>
            </div>
          )}
          {stats.mostPlayedCardGlobal && (
            <div className="rounded-md bg-bg-surface p-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-font-muted">Most Played</p>
              <p className="text-xs font-bold text-font-primary truncate">{stats.mostPlayedCardGlobal.name}</p>
              <p className="text-[10px] text-font-muted">{stats.mostPlayedCardGlobal.count}x played</p>
            </div>
          )}
          {stats.firstBlood && (
            <div className="rounded-md bg-bg-surface p-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-font-muted">First Blood</p>
              <p className="text-xs font-bold text-font-primary">{playerNames[stats.firstBlood.playerId] ?? 'Player'}</p>
              <p className="text-[10px] text-font-muted truncate">{stats.firstBlood.cardName ?? 'Combat'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Global card type breakdown */}
      <div className="rounded-lg border border-border bg-bg-card p-4">
        <TypeBar breakdown={stats.cardsByType} label="All Cards Played by Type" />
      </div>

      {/* Per-player stats */}
      <div className="grid gap-4 sm:grid-cols-2">
        {stats.players.map((ps) => (
          <PlayerStatBlock
            key={ps.playerId}
            ps={ps}
            playerName={playerNames[ps.playerId] ?? 'Player'}
            isWinner={stats.winnerId === ps.playerId}
          />
        ))}
      </div>
    </div>
  )
}
