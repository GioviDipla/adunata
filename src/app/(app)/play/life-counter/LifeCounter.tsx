'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ChevronLeft,
  Coins,
  Crown,
  Dices,
  Droplet,
  Minus,
  Plus,
  RotateCcw,
  Undo2,
  Users,
} from 'lucide-react'

const STARTING_LIFE_OPTIONS = [20, 30, 40] as const
const PLAYER_COUNT_OPTIONS = [2, 3, 4] as const

// Per-player accent — ring around the panel, glow gradient, label chip,
// plus a text token used elsewhere (e.g. commander-damage pills that show
// where the damage came from).
const PLAYER_ACCENTS = [
  {
    ring: 'ring-red-500/60',
    glow: 'from-red-600/30',
    chip: 'bg-red-500/20 text-red-300',
    text: 'text-red-300',
    bg: 'bg-red-500/25',
  },
  {
    ring: 'ring-blue-500/60',
    glow: 'from-blue-600/30',
    chip: 'bg-blue-500/20 text-blue-300',
    text: 'text-blue-300',
    bg: 'bg-blue-500/25',
  },
  {
    ring: 'ring-green-500/60',
    glow: 'from-green-600/30',
    chip: 'bg-green-500/20 text-green-300',
    text: 'text-green-300',
    bg: 'bg-green-500/25',
  },
  {
    ring: 'ring-amber-500/60',
    glow: 'from-amber-600/30',
    chip: 'bg-amber-500/20 text-amber-300',
    text: 'text-amber-300',
    bg: 'bg-amber-500/25',
  },
] as const

interface Player {
  id: number
  life: number
  poison: number
  /** key = source player id, value = accumulated commander damage from that source */
  commanderDamage: Record<number, number>
}

interface DiceRoll {
  label: string
  value: string
  /** key to force React to replay the overlay animation on repeat rolls */
  key: number
}

function makePlayers(n: number, life: number): Player[] {
  return Array.from({ length: n }, (_, i) => {
    const id = i + 1
    const cmd: Record<number, number> = {}
    for (let j = 1; j <= n; j++) if (j !== id) cmd[j] = 0
    return { id, life, poison: 0, commanderDamage: cmd }
  })
}

export default function LifeCounter() {
  const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(2)
  const [startingLife, setStartingLife] = useState<number>(20)
  const [players, setPlayers] = useState<Player[]>(() => makePlayers(2, 20))
  const [history, setHistory] = useState<Player[][]>([])
  const [hubOpen, setHubOpen] = useState(false)
  const [showPoison, setShowPoison] = useState(false)
  const [showCmdDmg, setShowCmdDmg] = useState(false)
  const [dice, setDice] = useState<DiceRoll | null>(null)

  const hubRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!hubOpen) return
    const close = (e: MouseEvent) => {
      if (hubRef.current && !hubRef.current.contains(e.target as Node)) {
        setHubOpen(false)
      }
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [hubOpen])

  const pushHistory = useCallback(() => {
    setHistory((h) => [...h.slice(-30), players])
  }, [players])

  const updateLife = useCallback(
    (id: number, delta: number) => {
      pushHistory()
      setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, life: p.life + delta } : p)))
    },
    [pushHistory],
  )

  const updatePoison = useCallback(
    (id: number, delta: number) => {
      pushHistory()
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, poison: Math.max(0, p.poison + delta) } : p,
        ),
      )
    },
    [pushHistory],
  )

  const updateCmdDmg = useCallback(
    (playerId: number, sourceId: number, delta: number) => {
      pushHistory()
      setPlayers((prev) =>
        prev.map((p) => {
          if (p.id !== playerId) return p
          const current = p.commanderDamage[sourceId] ?? 0
          return {
            ...p,
            commanderDamage: {
              ...p.commanderDamage,
              [sourceId]: Math.max(0, current + delta),
            },
          }
        }),
      )
    },
    [pushHistory],
  )

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h
      const prev = h[h.length - 1]
      setPlayers(prev)
      return h.slice(0, -1)
    })
  }, [])

  const reset = useCallback(() => {
    pushHistory()
    setPlayers(makePlayers(playerCount, startingLife))
    setHubOpen(false)
  }, [playerCount, startingLife, pushHistory])

  const changePlayerCount = (n: 2 | 3 | 4) => {
    setPlayerCount(n)
    setPlayers(makePlayers(n, startingLife))
    setHistory([])
  }

  const changeStartingLife = (life: number) => {
    setStartingLife(life)
    setPlayers(makePlayers(playerCount, life))
    setHistory([])
  }

  const rollDie = (sides: number) => {
    const value = Math.floor(Math.random() * sides) + 1
    setDice({ label: `d${sides}`, value: String(value), key: Date.now() })
    setHubOpen(false)
  }

  const flipCoin = () => {
    const value = Math.random() < 0.5 ? 'Heads' : 'Tails'
    setDice({ label: 'Coin', value, key: Date.now() })
    setHubOpen(false)
  }

  useEffect(() => {
    if (!dice) return
    const t = setTimeout(() => setDice(null), 2200)
    return () => clearTimeout(t)
  }, [dice])

  // Keep screen awake.
  useEffect(() => {
    interface WakeLockLike {
      release: () => Promise<void>
    }
    let wakeLock: WakeLockLike | null = null
    async function request() {
      try {
        const nav = navigator as unknown as {
          wakeLock?: { request: (type: string) => Promise<WakeLockLike> }
        }
        if (nav.wakeLock) wakeLock = await nav.wakeLock.request('screen')
      } catch {
        /* noop */
      }
    }
    request()
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !wakeLock) request()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      wakeLock?.release().catch(() => {})
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const layoutClass = useMemo(() => {
    if (playerCount === 2) return 'grid grid-rows-2'
    if (playerCount === 3) return 'grid grid-rows-3'
    return 'grid grid-cols-2 grid-rows-2'
  }, [playerCount])

  const isRotated = (idx: number) => {
    if (playerCount === 2) return idx === 0
    if (playerCount === 3) return idx < 2
    return idx < 2
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg-dark">
      {/* Minimal top bar: Back + title + Undo. All game controls live in the hub. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-bg-surface/80 px-3 py-2 backdrop-blur-md">
        <Link
          href="/play"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-font-secondary transition-colors hover:bg-bg-hover hover:text-font-primary"
        >
          <ChevronLeft size={16} />
          <span className="hidden sm:inline">Play</span>
        </Link>
        <div className="text-xs font-medium uppercase tracking-widest text-font-muted">
          Life Counter
        </div>
        <button
          onClick={undo}
          disabled={history.length === 0}
          className="rounded-md p-1.5 text-font-secondary transition-colors hover:bg-bg-hover hover:text-font-primary disabled:opacity-30"
          aria-label="Undo"
          title="Undo"
        >
          <Undo2 size={16} />
        </button>
      </div>

      {/* Player panels */}
      <div className="relative flex-1">
        <div className={`absolute inset-0 gap-1 p-1 ${layoutClass}`}>
          {players.map((p, idx) => (
            <PlayerPanel
              key={p.id}
              index={idx}
              player={p}
              allPlayers={players}
              rotated={isRotated(idx)}
              showPoison={showPoison}
              showCmdDmg={showCmdDmg}
              onLife={(delta) => updateLife(p.id, delta)}
              onPoison={(delta) => updatePoison(p.id, delta)}
              onCmdDmg={(sourceId, delta) => updateCmdDmg(p.id, sourceId, delta)}
            />
          ))}
        </div>

        {/* Central hub button + expanded menu */}
        <div
          ref={hubRef}
          className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
        >
          <button
            onClick={() => setHubOpen((v) => !v)}
            aria-label="Game tools"
            className={`flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-bg-accent to-purple-600 text-font-white shadow-2xl ring-2 transition-all ${
              hubOpen
                ? 'scale-110 ring-font-white/40'
                : 'ring-font-white/10 hover:scale-105 hover:ring-font-white/20'
            }`}
          >
            <Dices className="h-7 w-7" />
          </button>

          {hubOpen && (
            <div className="absolute left-1/2 top-full z-30 mt-4 w-72 -translate-x-1/2 rounded-2xl border border-border bg-bg-surface/95 p-3 shadow-2xl backdrop-blur-md">
              {/* Random */}
              <HubSection label="Random">
                <div className="grid grid-cols-3 gap-2">
                  <HubTile icon={Dices} label="1d6" onClick={() => rollDie(6)} />
                  <HubTile icon={Dices} label="1d20" onClick={() => rollDie(20)} />
                  <HubTile icon={Coins} label="Coin" onClick={flipCoin} />
                </div>
              </HubSection>

              {/* Setup */}
              <HubSection label="Setup" icon={Users}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="w-16 text-xs text-font-muted">Giocatori</span>
                  <SegmentedControl
                    options={PLAYER_COUNT_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
                    value={playerCount}
                    onChange={(v) => changePlayerCount(v as 2 | 3 | 4)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-16 text-xs text-font-muted">Vita</span>
                  <SegmentedControl
                    options={STARTING_LIFE_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
                    value={startingLife}
                    onChange={(v) => changeStartingLife(v as number)}
                  />
                </div>
              </HubSection>

              {/* Modes */}
              <HubSection label="Moduli">
                <div className="grid grid-cols-2 gap-2">
                  <HubToggle
                    icon={Droplet}
                    label="Poison"
                    active={showPoison}
                    onToggle={() => setShowPoison((v) => !v)}
                    activeClass="bg-bg-green/25 text-bg-green ring-bg-green/40"
                  />
                  <HubToggle
                    icon={Crown}
                    label="Commander"
                    active={showCmdDmg}
                    onToggle={() => setShowCmdDmg((v) => !v)}
                    activeClass="bg-amber-500/25 text-amber-300 ring-amber-500/40"
                  />
                </div>
              </HubSection>

              {/* Actions */}
              <div className="mt-2 flex gap-2 border-t border-border pt-2">
                <button
                  onClick={undo}
                  disabled={history.length === 0}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-bg-card px-3 py-2 text-sm text-font-secondary transition-colors hover:bg-bg-hover hover:text-font-primary disabled:opacity-40"
                >
                  <Undo2 size={14} /> Undo
                </button>
                <button
                  onClick={reset}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-bg-red/20 px-3 py-2 text-sm font-medium text-bg-red transition-colors hover:bg-bg-red/30"
                >
                  <RotateCcw size={14} /> Reset
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Dice result overlay */}
        {dice && (
          <div
            key={dice.key}
            className="pointer-events-none absolute left-1/2 top-1/2 z-40 flex -translate-x-1/2 -translate-y-[calc(50%+5rem)] flex-col items-center gap-1 rounded-2xl border border-font-white/10 bg-black/80 px-8 py-5 shadow-2xl backdrop-blur-md"
          >
            <div className="text-xs font-medium uppercase tracking-widest text-font-muted">
              {dice.label}
            </div>
            <div className="text-5xl font-bold tabular-nums text-font-primary">
              {dice.value}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Hub components ──────────────────────────────────────────────────────

function HubSection({
  label,
  icon: Icon,
  children,
}: {
  label: string
  icon?: React.ComponentType<{ className?: string; size?: number }>
  children: React.ReactNode
}) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-font-muted">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      {children}
    </div>
  )
}

function HubTile({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string; size?: number }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 rounded-lg bg-bg-card px-2 py-3 text-font-secondary transition-all hover:-translate-y-0.5 hover:bg-bg-hover hover:text-font-primary active:translate-y-0"
    >
      <Icon className="h-5 w-5" />
      <span className="text-xs font-medium">{label}</span>
    </button>
  )
}

function HubToggle({
  icon: Icon,
  label,
  active,
  onToggle,
  activeClass,
}: {
  icon: React.ComponentType<{ className?: string; size?: number }>
  label: string
  active: boolean
  onToggle: () => void
  activeClass: string
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ring-1 transition-all ${
        active
          ? activeClass
          : 'bg-bg-card text-font-secondary ring-border hover:bg-bg-hover hover:text-font-primary'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-1 gap-1 rounded-lg bg-bg-card p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            value === opt.value
              ? 'bg-bg-accent text-font-white shadow-sm'
              : 'text-font-secondary hover:text-font-primary'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Player panel ─────────────────────────────────────────────────────────

interface PlayerPanelProps {
  index: number
  player: Player
  allPlayers: Player[]
  rotated: boolean
  showPoison: boolean
  showCmdDmg: boolean
  onLife: (delta: number) => void
  onPoison: (delta: number) => void
  onCmdDmg: (sourceId: number, delta: number) => void
}

function PlayerPanel({
  index,
  player,
  allPlayers,
  rotated,
  showPoison,
  showCmdDmg,
  onLife,
  onPoison,
  onCmdDmg,
}: PlayerPanelProps) {
  const accent = PLAYER_ACCENTS[index % PLAYER_ACCENTS.length]

  const maxCmdDmg = Math.max(0, ...Object.values(player.commanderDamage))
  const isDead = player.life <= 0 || player.poison >= 10 || maxCmdDmg >= 21
  const isCritical =
    !isDead && (player.life <= 5 || player.poison >= 7 || maxCmdDmg >= 18)

  const [lastDelta, setLastDelta] = useState<{
    type: 'life' | 'poison' | 'cmd'
    value: number
    key: number
  } | null>(null)
  useEffect(() => {
    if (!lastDelta) return
    const t = setTimeout(() => setLastDelta(null), 900)
    return () => clearTimeout(t)
  }, [lastDelta])

  const handleLife = (delta: number) => {
    setLastDelta((prev) =>
      prev?.type === 'life'
        ? { type: 'life', value: prev.value + delta, key: Date.now() }
        : { type: 'life', value: delta, key: Date.now() },
    )
    onLife(delta)
  }

  const handlePoison = (delta: number) => {
    setLastDelta({ type: 'poison', value: delta, key: Date.now() })
    onPoison(delta)
  }

  const handleCmd = (sourceId: number, delta: number) => {
    setLastDelta({ type: 'cmd', value: delta, key: Date.now() })
    onCmdDmg(sourceId, delta)
  }

  const others = allPlayers.filter((o) => o.id !== player.id)

  return (
    <div
      className={`relative flex items-stretch overflow-hidden rounded-lg bg-gradient-to-br ${accent.glow} to-bg-surface ring-1 ${accent.ring} ${
        rotated ? 'rotate-180' : ''
      } ${isDead ? 'grayscale opacity-70' : ''}`}
    >
      {/* Left half: -1 life */}
      <button
        onClick={() => handleLife(-1)}
        className="group flex flex-1 items-center justify-start pl-4 transition-colors active:bg-black/25"
        aria-label="decrement life"
      >
        <Minus className="h-8 w-8 text-font-muted transition-colors group-hover:text-font-primary" />
      </button>

      {/* Center */}
      <div className="pointer-events-none flex flex-col items-center justify-center px-2 select-none">
        <div
          className={`text-[min(24vw,8rem)] font-bold leading-none tabular-nums transition-colors ${
            isCritical ? 'text-bg-red' : 'text-font-primary'
          }`}
        >
          {player.life}
        </div>

        <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
          <div
            className={`rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${accent.chip}`}
          >
            Player {player.id}
          </div>
          {showPoison && player.poison > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-bg-green/25 px-2 py-0.5 text-xs font-semibold text-bg-green">
              <Droplet size={12} /> {player.poison}
            </div>
          )}
        </div>

        {/* Commander damage row — one mini control per opponent */}
        {showCmdDmg && others.length > 0 && (
          <div className="pointer-events-auto mt-2 flex flex-wrap items-center justify-center gap-1">
            {others.map((other) => {
              const srcAccent = PLAYER_ACCENTS[(other.id - 1) % PLAYER_ACCENTS.length]
              const dmg = player.commanderDamage[other.id] ?? 0
              return (
                <div
                  key={other.id}
                  className={`flex items-center gap-0.5 rounded-full ${srcAccent.bg} px-1 py-0.5 ring-1 ring-white/10`}
                >
                  <button
                    onClick={() => handleCmd(other.id, -1)}
                    className="rounded-full px-1.5 py-0.5 text-xs leading-none text-font-secondary transition-colors hover:bg-black/30 hover:text-font-primary"
                    aria-label={`decrement commander damage from P${other.id}`}
                  >
                    −
                  </button>
                  <div className="flex items-center gap-0.5">
                    <Crown size={10} className={srcAccent.text} />
                    <span
                      className={`min-w-[0.8rem] text-center text-xs font-bold tabular-nums ${srcAccent.text}`}
                    >
                      {dmg}
                    </span>
                  </div>
                  <button
                    onClick={() => handleCmd(other.id, 1)}
                    className="rounded-full px-1.5 py-0.5 text-xs leading-none text-font-secondary transition-colors hover:bg-black/30 hover:text-font-primary"
                    aria-label={`increment commander damage from P${other.id}`}
                  >
                    +
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Right half: +1 life */}
      <button
        onClick={() => handleLife(1)}
        className="group flex flex-1 items-center justify-end pr-4 transition-colors active:bg-black/25"
        aria-label="increment life"
      >
        <Plus className="h-8 w-8 text-font-muted transition-colors group-hover:text-font-primary" />
      </button>

      {/* Top corner pills: ±5 life */}
      <button
        onClick={() => handleLife(-5)}
        className="absolute left-2 top-2 rounded-md bg-black/30 px-2 py-0.5 text-xs font-semibold text-font-primary backdrop-blur-sm transition-colors active:bg-black/50"
      >
        −5
      </button>
      <button
        onClick={() => handleLife(5)}
        className="absolute right-2 top-2 rounded-md bg-black/30 px-2 py-0.5 text-xs font-semibold text-font-primary backdrop-blur-sm transition-colors active:bg-black/50"
      >
        +5
      </button>

      {/* Bottom corner pills: poison ±1 (mode-gated) */}
      {showPoison && (
        <>
          <button
            onClick={() => handlePoison(-1)}
            className="absolute left-2 bottom-2 flex items-center gap-1 rounded-md bg-bg-green/25 px-2 py-0.5 text-xs font-semibold text-bg-green backdrop-blur-sm transition-colors active:bg-bg-green/40"
          >
            <Droplet size={10} /> −
          </button>
          <button
            onClick={() => handlePoison(1)}
            className="absolute right-2 bottom-2 flex items-center gap-1 rounded-md bg-bg-green/25 px-2 py-0.5 text-xs font-semibold text-bg-green backdrop-blur-sm transition-colors active:bg-bg-green/40"
          >
            <Droplet size={10} /> +
          </button>
        </>
      )}

      {/* Delta flash */}
      {lastDelta && (
        <div
          key={lastDelta.key}
          className={`pointer-events-none absolute top-8 left-1/2 -translate-x-1/2 text-2xl font-bold animate-pulse ${
            lastDelta.type === 'life'
              ? lastDelta.value > 0
                ? 'text-bg-green'
                : 'text-bg-red'
              : lastDelta.type === 'poison'
              ? 'text-bg-green'
              : 'text-amber-300'
          }`}
        >
          {lastDelta.value > 0 ? `+${lastDelta.value}` : lastDelta.value}
          {lastDelta.type === 'poison' && ' ☠'}
          {lastDelta.type === 'cmd' && ' 👑'}
        </div>
      )}

      {isDead && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-black/70 px-4 py-1 text-xs font-bold uppercase tracking-widest text-bg-red">
            Defeated
          </div>
        </div>
      )}
    </div>
  )
}

