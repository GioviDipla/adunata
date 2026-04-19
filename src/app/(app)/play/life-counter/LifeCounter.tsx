'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ChevronLeft,
  Coins,
  Dices,
  Droplet,
  Heart,
  Minus,
  Plus,
  RotateCcw,
  Skull,
  Undo2,
  Users,
} from 'lucide-react'

const STARTING_LIFE_OPTIONS = [20, 30, 40] as const
const PLAYER_COUNT_OPTIONS = [2, 3, 4] as const

// Pre-assigned player colors — each panel gets a distinct accent so players
// can identify their own quickly at a glance.
const PLAYER_ACCENTS = [
  { ring: 'ring-red-500/60', glow: 'from-red-600/30', chip: 'bg-red-500/20 text-red-300' },
  { ring: 'ring-blue-500/60', glow: 'from-blue-600/30', chip: 'bg-blue-500/20 text-blue-300' },
  { ring: 'ring-green-500/60', glow: 'from-green-600/30', chip: 'bg-green-500/20 text-green-300' },
  { ring: 'ring-amber-500/60', glow: 'from-amber-600/30', chip: 'bg-amber-500/20 text-amber-300' },
] as const

interface Player {
  id: number
  life: number
  poison: number
}

interface DiceRoll {
  label: string
  value: string
  /** key to force React to replay the overlay animation on repeat rolls */
  key: number
}

function makePlayers(n: number, life: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, life, poison: 0 }))
}

function clampLife(v: number) {
  // Life can go negative in MTG for interaction tracking; we let it.
  return v
}

function clampPoison(v: number) {
  return Math.max(0, v)
}

export default function LifeCounter() {
  const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(2)
  const [startingLife, setStartingLife] = useState<number>(20)
  const [players, setPlayers] = useState<Player[]>(() => makePlayers(2, 20))
  const [history, setHistory] = useState<Player[][]>([])
  const [hubOpen, setHubOpen] = useState(false)
  const [showPoison, setShowPoison] = useState(false)
  const [dice, setDice] = useState<DiceRoll | null>(null)

  // Close the hub menu on outside click.
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
      setPlayers((prev) =>
        prev.map((p) => (p.id === id ? { ...p, life: clampLife(p.life + delta) } : p)),
      )
    },
    [pushHistory],
  )

  const updatePoison = useCallback(
    (id: number, delta: number) => {
      pushHistory()
      setPlayers((prev) =>
        prev.map((p) => (p.id === id ? { ...p, poison: clampPoison(p.poison + delta) } : p)),
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

  // Dice overlay auto-dismiss
  useEffect(() => {
    if (!dice) return
    const t = setTimeout(() => setDice(null), 2200)
    return () => clearTimeout(t)
  }, [dice])

  // Keep screen awake while the counter is open.
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
        if (nav.wakeLock) {
          wakeLock = await nav.wakeLock.request('screen')
        }
      } catch {
        /* silently fall back */
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
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-bg-surface/80 px-3 py-2 backdrop-blur-md">
        <Link
          href="/play"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-font-secondary transition-colors hover:bg-bg-hover hover:text-font-primary"
        >
          <ChevronLeft size={16} />
          <span className="hidden sm:inline">Play</span>
        </Link>

        <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
          <div className="flex items-center gap-1 rounded-md bg-bg-card px-2 py-1">
            <Users size={14} className="text-font-muted" />
            {PLAYER_COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => changePlayerCount(n)}
                className={`rounded px-2 py-0.5 font-medium transition-colors ${
                  playerCount === n
                    ? 'bg-bg-accent text-font-white'
                    : 'text-font-secondary hover:text-font-primary'
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-md bg-bg-card px-2 py-1">
            <Heart size={14} className="text-font-muted" />
            {STARTING_LIFE_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => changeStartingLife(n)}
                className={`rounded px-2 py-0.5 font-medium transition-colors ${
                  startingLife === n
                    ? 'bg-bg-accent text-font-white'
                    : 'text-font-secondary hover:text-font-primary'
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          <button
            onClick={undo}
            disabled={history.length === 0}
            className="flex items-center gap-1 rounded-md bg-bg-card px-2 py-1.5 text-font-secondary transition-colors hover:text-font-primary disabled:opacity-40"
            aria-label="Undo"
            title="Undo"
          >
            <Undo2 size={14} />
          </button>
        </div>
      </div>

      {/* Player panels */}
      <div className="relative flex-1">
        <div className={`absolute inset-0 gap-1 p-1 ${layoutClass}`}>
          {players.map((p, idx) => (
            <PlayerPanel
              key={p.id}
              index={idx}
              player={p}
              rotated={isRotated(idx)}
              showPoison={showPoison}
              onLife={(delta) => updateLife(p.id, delta)}
              onPoison={(delta) => updatePoison(p.id, delta)}
            />
          ))}
        </div>

        {/* Central hub: floating FAB that opens dice / coin / poison / reset */}
        <div
          ref={hubRef}
          className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
        >
          <button
            onClick={() => setHubOpen((v) => !v)}
            aria-label="Game tools"
            className={`flex h-14 w-14 items-center justify-center rounded-full bg-bg-surface text-font-primary shadow-xl ring-2 transition-all ${
              hubOpen ? 'ring-bg-accent scale-105' : 'ring-border hover:ring-border-light'
            }`}
          >
            <Dices className="h-6 w-6" />
          </button>
          {hubOpen && (
            <div className="absolute left-1/2 top-full mt-3 w-56 -translate-x-1/2 rounded-xl border border-border bg-bg-surface p-2 shadow-2xl">
              <HubItem icon={Dices} label="Tira 1d6" onClick={() => rollDie(6)} />
              <HubItem icon={Dices} label="Tira 1d20" onClick={() => rollDie(20)} />
              <HubItem icon={Coins} label="Testa o croce" onClick={flipCoin} />
              <div className="my-1 h-px bg-border" />
              <HubItem
                icon={Skull}
                label={showPoison ? 'Nascondi poison' : 'Mostra poison'}
                onClick={() => setShowPoison((v) => !v)}
                active={showPoison}
              />
              <HubItem icon={RotateCcw} label="Reset partita" onClick={reset} danger />
            </div>
          )}
        </div>

        {/* Dice result overlay */}
        {dice && (
          <div
            key={dice.key}
            className="pointer-events-none absolute left-1/2 top-1/2 z-30 flex -translate-x-1/2 -translate-y-[calc(50%+4rem)] flex-col items-center gap-1 rounded-2xl bg-black/80 px-8 py-5 shadow-2xl backdrop-blur-md duration-500 animate-in fade-in zoom-in-95"
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

interface HubItemProps {
  icon: React.ComponentType<{ className?: string; size?: number }>
  label: string
  onClick: () => void
  active?: boolean
  danger?: boolean
}

function HubItem({ icon: Icon, label, onClick, active, danger }: HubItemProps) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        active
          ? 'bg-bg-accent/20 text-font-accent'
          : danger
          ? 'text-bg-red hover:bg-bg-red/10'
          : 'text-font-secondary hover:bg-bg-hover hover:text-font-primary'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

interface PlayerPanelProps {
  index: number
  player: Player
  rotated: boolean
  showPoison: boolean
  onLife: (delta: number) => void
  onPoison: (delta: number) => void
}

function PlayerPanel({ index, player, rotated, showPoison, onLife, onPoison }: PlayerPanelProps) {
  const accent = PLAYER_ACCENTS[index % PLAYER_ACCENTS.length]
  const isDead = player.life <= 0 || player.poison >= 10
  const isCritical = !isDead && (player.life <= 5 || player.poison >= 7)

  const [lastDelta, setLastDelta] = useState<{ type: 'life' | 'poison'; value: number; key: number } | null>(null)
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

  return (
    <div
      className={`relative flex items-stretch overflow-hidden rounded-lg bg-gradient-to-br ${accent.glow} to-bg-surface ring-1 ${accent.ring} ${
        rotated ? 'rotate-180' : ''
      } ${isDead ? 'grayscale opacity-70' : ''}`}
    >
      {/* Left half: decrement life */}
      <button
        onClick={() => handleLife(-1)}
        className="group flex flex-1 items-center justify-start pl-4 transition-colors active:bg-black/25"
        aria-label="decrement life"
      >
        <Minus className="h-8 w-8 text-font-muted transition-colors group-hover:text-font-primary" />
      </button>

      {/* Center — life + poison badge */}
      <div className="pointer-events-none flex flex-col items-center justify-center px-2 select-none">
        <div
          className={`text-[min(26vw,8rem)] font-bold leading-none tabular-nums transition-colors ${
            isCritical ? 'text-bg-red' : 'text-font-primary'
          }`}
        >
          {player.life}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <div
            className={`rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${accent.chip}`}
          >
            Player {player.id}
          </div>
          {showPoison && player.poison > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-bg-green/20 px-2 py-0.5 text-xs font-semibold text-bg-green">
              <Droplet size={12} />
              {player.poison}
            </div>
          )}
        </div>
      </div>

      {/* Right half: increment life */}
      <button
        onClick={() => handleLife(1)}
        className="group flex flex-1 items-center justify-end pr-4 transition-colors active:bg-black/25"
        aria-label="increment life"
      >
        <Plus className="h-8 w-8 text-font-muted transition-colors group-hover:text-font-primary" />
      </button>

      {/* Corner pills — ±5 life (top) */}
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

      {/* Corner pills — poison (bottom), only when mode is active */}
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
          className={`pointer-events-none absolute top-8 left-1/2 -translate-x-1/2 text-2xl font-bold ${
            lastDelta.type === 'poison'
              ? 'text-bg-green'
              : lastDelta.value > 0
              ? 'text-bg-green'
              : 'text-bg-red'
          } animate-pulse`}
        >
          {lastDelta.value > 0 ? `+${lastDelta.value}` : lastDelta.value}
          {lastDelta.type === 'poison' && ' ☠'}
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
