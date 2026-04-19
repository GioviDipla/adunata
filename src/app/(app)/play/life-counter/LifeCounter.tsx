'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ChevronLeft,
  Heart,
  Minus,
  Plus,
  RotateCcw,
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
}

function makePlayers(n: number, life: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, life }))
}

export default function LifeCounter() {
  const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(2)
  const [startingLife, setStartingLife] = useState<number>(20)
  const [players, setPlayers] = useState<Player[]>(() => makePlayers(2, 20))
  const [history, setHistory] = useState<Player[][]>([])

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

  // Keep screen awake while the counter is open (web-tab compatible — users
  // typically keep the phone on the table during the game).
  useEffect(() => {
    interface WakeLockLike {
      release: () => Promise<void>
    }
    let wakeLock: WakeLockLike | null = null

    async function request() {
      try {
        const nav = navigator as unknown as { wakeLock?: { request: (type: string) => Promise<WakeLockLike> } }
        if (nav.wakeLock) {
          wakeLock = await nav.wakeLock.request('screen')
        }
      } catch {
        /* wake lock not supported or denied — continue silently */
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

  // Players in the top row (or top half) are rotated 180° so they face the
  // opponent sitting across the table.
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

          <button
            onClick={reset}
            className="flex items-center gap-1 rounded-md bg-bg-card px-2 py-1.5 text-font-secondary transition-colors hover:text-font-primary"
            aria-label="Reset"
            title="Reset all"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Player panels */}
      <div className={`flex-1 gap-1 p-1 ${layoutClass}`}>
        {players.map((p, idx) => (
          <PlayerPanel
            key={p.id}
            index={idx}
            player={p}
            rotated={isRotated(idx)}
            onChange={(delta) => updateLife(p.id, delta)}
          />
        ))}
      </div>
    </div>
  )
}

interface PlayerPanelProps {
  index: number
  player: Player
  rotated: boolean
  onChange: (delta: number) => void
}

function PlayerPanel({ index, player, rotated, onChange }: PlayerPanelProps) {
  const accent = PLAYER_ACCENTS[index % PLAYER_ACCENTS.length]
  const isDead = player.life <= 0
  const isCritical = !isDead && player.life <= 5

  // Small ticker that flashes the last delta next to the life number so the
  // user can see "+1" / "-5" feedback after a tap.
  const [lastDelta, setLastDelta] = useState<number | null>(null)
  useEffect(() => {
    if (lastDelta == null) return
    const t = setTimeout(() => setLastDelta(null), 900)
    return () => clearTimeout(t)
  }, [lastDelta])

  const handleChange = (delta: number) => {
    setLastDelta((prev) => (prev != null ? prev + delta : delta))
    onChange(delta)
  }

  return (
    <div
      className={`relative flex items-stretch overflow-hidden rounded-lg bg-gradient-to-br ${accent.glow} to-bg-surface ring-1 ${accent.ring} ${
        rotated ? 'rotate-180' : ''
      } ${isDead ? 'grayscale opacity-70' : ''}`}
    >
      {/* Left half: decrement */}
      <button
        onClick={() => handleChange(-1)}
        className="group flex flex-1 items-center justify-start pl-4 transition-colors active:bg-black/25"
        aria-label="decrement"
      >
        <Minus className="h-8 w-8 text-font-muted transition-colors group-hover:text-font-primary" />
      </button>

      {/* Center life */}
      <div className="pointer-events-none flex flex-col items-center justify-center px-2 select-none">
        <div
          className={`text-[min(28vw,9rem)] font-bold leading-none tabular-nums transition-colors ${
            isCritical ? 'text-bg-red' : 'text-font-primary'
          }`}
        >
          {player.life}
        </div>
        <div className={`mt-1 rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${accent.chip}`}>
          Player {player.id}
        </div>
      </div>

      {/* Right half: increment */}
      <button
        onClick={() => handleChange(1)}
        className="group flex flex-1 items-center justify-end pr-4 transition-colors active:bg-black/25"
        aria-label="increment"
      >
        <Plus className="h-8 w-8 text-font-muted transition-colors group-hover:text-font-primary" />
      </button>

      {/* ±5 quick buttons */}
      <button
        onClick={() => handleChange(-5)}
        className="absolute left-2 top-2 rounded-md bg-black/30 px-2 py-0.5 text-xs font-semibold text-font-primary backdrop-blur-sm transition-colors active:bg-black/50"
      >
        −5
      </button>
      <button
        onClick={() => handleChange(5)}
        className="absolute right-2 top-2 rounded-md bg-black/30 px-2 py-0.5 text-xs font-semibold text-font-primary backdrop-blur-sm transition-colors active:bg-black/50"
      >
        +5
      </button>

      {/* Delta flash */}
      {lastDelta != null && (
        <div
          className={`pointer-events-none absolute top-10 left-1/2 -translate-x-1/2 text-2xl font-bold ${
            lastDelta > 0 ? 'text-bg-green' : 'text-bg-red'
          } animate-pulse`}
        >
          {lastDelta > 0 ? `+${lastDelta}` : lastDelta}
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
