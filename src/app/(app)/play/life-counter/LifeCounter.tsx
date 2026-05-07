'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ComponentType, ReactNode } from 'react'
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
  Settings2,
  Undo2,
  Users,
} from 'lucide-react'

const STARTING_LIFE_OPTIONS = [20, 30, 40] as const
const PLAYER_COUNT_OPTIONS = [2, 3, 4, 5] as const
const LAYOUT_OPTIONS = [
  { value: 'table', label: 'Table' },
  { value: 'grid', label: 'Grid' },
  { value: 'stack', label: 'Stack' },
] as const

const PLAYER_ACCENTS = [
  {
    name: 'Crimson',
    panel: 'bg-bg-card',
    glow: 'shadow-black/24',
    ring: 'ring-bg-red/35',
    rail: 'bg-bg-red',
    chip: 'bg-bg-red/16 text-red-200 ring-bg-red/24',
    soft: 'bg-bg-red/14 text-red-200 ring-bg-red/24',
    text: 'text-red-200',
  },
  {
    name: 'Azure',
    panel: 'bg-bg-card',
    glow: 'shadow-black/24',
    ring: 'ring-bg-accent/35',
    rail: 'bg-bg-accent',
    chip: 'bg-bg-accent/16 text-blue-200 ring-bg-accent/24',
    soft: 'bg-bg-accent/14 text-blue-200 ring-bg-accent/24',
    text: 'text-blue-200',
  },
  {
    name: 'Verdant',
    panel: 'bg-bg-card',
    glow: 'shadow-black/24',
    ring: 'ring-bg-green/35',
    rail: 'bg-bg-green',
    chip: 'bg-bg-green/16 text-emerald-200 ring-bg-green/24',
    soft: 'bg-bg-green/14 text-emerald-200 ring-bg-green/24',
    text: 'text-emerald-200',
  },
  {
    name: 'Amber',
    panel: 'bg-bg-card',
    glow: 'shadow-black/24',
    ring: 'ring-bg-yellow/35',
    rail: 'bg-bg-yellow',
    chip: 'bg-bg-yellow/16 text-yellow-200 ring-bg-yellow/24',
    soft: 'bg-bg-yellow/14 text-yellow-200 ring-bg-yellow/24',
    text: 'text-yellow-200',
  },
  {
    name: 'Violet',
    panel: 'bg-bg-card',
    glow: 'shadow-black/24',
    ring: 'ring-purple-500/35',
    rail: 'bg-purple-500',
    chip: 'bg-purple-500/16 text-purple-200 ring-purple-500/24',
    soft: 'bg-purple-500/14 text-purple-200 ring-purple-500/24',
    text: 'text-purple-200',
  },
] as const

type PlayerCount = (typeof PLAYER_COUNT_OPTIONS)[number]
type PanelOrientation = 'normal' | 'opposite' | 'left' | 'right'
type LayoutMode = (typeof LAYOUT_OPTIONS)[number]['value']

interface Player {
  id: number
  life: number
  poison: number
  commanderDamage: Record<number, number>
}

interface DiceRoll {
  label: string
  value: string
  key: number
}

function makePlayers(n: number, life: number): Player[] {
  return Array.from({ length: n }, (_, i) => {
    const id = i + 1
    const commanderDamage: Record<number, number> = {}
    for (let j = 1; j <= n; j++) {
      if (j !== id) commanderDamage[j] = 0
    }
    return { id, life, poison: 0, commanderDamage }
  })
}

export default function LifeCounter() {
  const [playerCount, setPlayerCount] = useState<PlayerCount>(2)
  const [startingLife, setStartingLife] = useState(20)
  const [players, setPlayers] = useState<Player[]>(() => makePlayers(2, 20))
  const [history, setHistory] = useState<Player[][]>([])
  const [hubOpen, setHubOpen] = useState(false)
  const [showPoison, setShowPoison] = useState(false)
  const [showCmdDmg, setShowCmdDmg] = useState(false)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('table')
  const [dice, setDice] = useState<DiceRoll | null>(null)

  const hubRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hubOpen) return
    const close = (event: PointerEvent) => {
      if (!hubRef.current?.contains(event.target as Node)) {
        setHubOpen(false)
      }
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [hubOpen])

  const pushHistory = useCallback(() => {
    setHistory((current) => [...current.slice(-30), players])
  }, [players])

  const updateLife = useCallback(
    (id: number, delta: number) => {
      pushHistory()
      setPlayers((current) =>
        current.map((player) =>
          player.id === id ? { ...player, life: player.life + delta } : player,
        ),
      )
    },
    [pushHistory],
  )

  const updatePoison = useCallback(
    (id: number, delta: number) => {
      pushHistory()
      setPlayers((current) =>
        current.map((player) =>
          player.id === id
            ? { ...player, poison: Math.max(0, player.poison + delta) }
            : player,
        ),
      )
    },
    [pushHistory],
  )

  const updateCmdDmg = useCallback(
    (playerId: number, sourceId: number, delta: number) => {
      pushHistory()
      setPlayers((current) =>
        current.map((player) => {
          if (player.id !== playerId) return player
          const value = player.commanderDamage[sourceId] ?? 0
          return {
            ...player,
            commanderDamage: {
              ...player.commanderDamage,
              [sourceId]: Math.max(0, value + delta),
            },
          }
        }),
      )
    },
    [pushHistory],
  )

  const undo = useCallback(() => {
    setHistory((current) => {
      if (current.length === 0) return current
      setPlayers(current[current.length - 1])
      return current.slice(0, -1)
    })
  }, [])

  const reset = useCallback(() => {
    pushHistory()
    setPlayers(makePlayers(playerCount, startingLife))
    setHubOpen(false)
  }, [playerCount, pushHistory, startingLife])

  const changePlayerCount = (n: PlayerCount) => {
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
    setDice({ label: 'Coin', value: Math.random() < 0.5 ? 'Heads' : 'Tails', key: Date.now() })
    setHubOpen(false)
  }

  useEffect(() => {
    if (!dice) return
    const timeout = setTimeout(() => setDice(null), 2200)
    return () => clearTimeout(timeout)
  }, [dice])

  useEffect(() => {
    interface WakeLockLike {
      release: () => Promise<void>
    }

    let wakeLock: WakeLockLike | null = null
    const request = async () => {
      try {
        const nav = navigator as unknown as {
          wakeLock?: { request: (type: string) => Promise<WakeLockLike> }
        }
        if (nav.wakeLock) wakeLock = await nav.wakeLock.request('screen')
      } catch {
        /* Best effort only. */
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
    if (layoutMode === 'stack') return 'grid grid-rows-[repeat(var(--players),minmax(0,1fr))]'
    if (layoutMode === 'grid') {
      if (playerCount <= 2) return 'grid grid-rows-2'
      if (playerCount === 3) return 'grid grid-cols-2 [grid-template-rows:1fr_1fr]'
      if (playerCount === 4) return 'grid grid-cols-2 grid-rows-2'
      return 'grid grid-cols-2 [grid-template-rows:1fr_1fr_1fr]'
    }
    if (playerCount === 2) return 'grid grid-rows-2'
    if (playerCount === 3) return 'grid grid-cols-2 [grid-template-rows:1.08fr_1fr]'
    if (playerCount === 4) return 'grid grid-cols-2 grid-rows-2'
    return 'grid grid-cols-2 [grid-template-rows:1fr_1.18fr_1fr]'
  }, [layoutMode, playerCount])

  const orientationFor = (index: number): PanelOrientation => {
    if (layoutMode === 'stack') return index % 2 === 0 ? 'opposite' : 'normal'
    if (layoutMode === 'grid') {
      if (playerCount === 2) return index === 0 ? 'opposite' : 'normal'
      if (playerCount === 3) return index === 0 ? 'opposite' : 'normal'
      if (playerCount === 4) return index < 2 ? 'opposite' : 'normal'
      return index < 2 ? 'opposite' : 'normal'
    }
    if (playerCount === 2 || playerCount === 3) return index === 0 ? 'opposite' : 'normal'
    if (playerCount === 4) return index < 2 ? 'opposite' : 'normal'
    if (index === 0) return 'opposite'
    if (index === 1) return 'left'
    if (index === 2) return 'right'
    return 'normal'
  }

  const panelClassFor = (index: number) => {
    if (layoutMode === 'stack') return ''
    if (layoutMode === 'grid') {
      if (playerCount === 3 && index === 0) return 'col-span-2'
      if (playerCount === 5 && index === 4) return 'col-span-2'
      return ''
    }
    if ((playerCount === 3 || playerCount === 5) && index === 0) return 'col-span-2'
    return ''
  }

  return (
    <main className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-bg-dark text-font-primary">
      <header
        className="z-30 flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-black/72 px-3 pb-2 backdrop-blur-xl"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 0.5rem)' }}
      >
        <Link
          href="/play"
          className="flex min-h-11 min-w-11 items-center gap-1 rounded-md px-2.5 py-2 text-sm font-semibold text-white/74 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Torna al menu Play"
        >
          <ChevronLeft size={22} />
          <span className="hidden sm:inline">Indietro</span>
        </Link>

        <div className="flex items-center gap-2 rounded-full bg-white/7 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white/72 ring-1 ring-white/10">
          <span>{playerCount}P</span>
          <span className="h-1 w-1 rounded-full bg-white/36" />
          <span>{startingLife} life</span>
        </div>

        <button
          onClick={undo}
          disabled={history.length === 0}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-md p-2.5 text-white/74 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
          aria-label="Annulla ultima modifica"
          title="Annulla"
        >
          <Undo2 size={20} />
        </button>
      </header>

      <section className="relative min-h-0 flex-1">
        <div
          className={`absolute inset-0 gap-2 p-2 ${layoutClass}`}
          style={{ '--players': playerCount } as CSSProperties}
        >
          {players.map((player, index) => (
            <PlayerPanel
              key={player.id}
              index={index}
              player={player}
              allPlayers={players}
              orientation={orientationFor(index)}
              showPoison={showPoison}
              showCmdDmg={showCmdDmg}
              panelClassName={panelClassFor(index)}
              onLife={(delta) => updateLife(player.id, delta)}
              onPoison={(delta) => updatePoison(player.id, delta)}
              onCmdDmg={(sourceId, delta) => updateCmdDmg(player.id, sourceId, delta)}
            />
          ))}
        </div>

        <div
          ref={hubRef}
          className="absolute left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2"
        >
          <button
            onClick={() => setHubOpen((open) => !open)}
            aria-label="Strumenti partita"
            className={`flex h-16 w-16 items-center justify-center rounded-full bg-zinc-950 text-white shadow-2xl ring-1 ring-white/20 transition-all active:scale-95 ${
              hubOpen ? 'scale-105 bg-white text-zinc-950' : 'hover:bg-zinc-900'
            }`}
          >
            <Settings2 className="h-7 w-7" />
          </button>

          {hubOpen && (
            <div className="absolute left-1/2 top-full mt-3 w-[min(21rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-white/12 bg-zinc-950/96 p-3 shadow-2xl backdrop-blur-xl">
              <HubSection label="Random">
                <div className="grid grid-cols-3 gap-2">
                  <HubTile icon={Dices} label="d6" onClick={() => rollDie(6)} />
                  <HubTile icon={Dices} label="d20" onClick={() => rollDie(20)} />
                  <HubTile icon={Coins} label="Coin" onClick={flipCoin} />
                </div>
              </HubSection>

              <HubSection label="Setup" icon={Users}>
                <FieldRow label="Giocatori">
                  <SegmentedControl
                    options={PLAYER_COUNT_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
                    value={playerCount}
                    onChange={(value) => changePlayerCount(value as PlayerCount)}
                  />
                </FieldRow>
                <FieldRow label="Vita">
                  <SegmentedControl
                    options={STARTING_LIFE_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
                    value={startingLife}
                    onChange={(value) => changeStartingLife(value as number)}
                  />
                </FieldRow>
                <FieldRow label="Layout">
                  <SegmentedControl
                    options={LAYOUT_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                    value={layoutMode}
                    onChange={(value) => setLayoutMode(value as LayoutMode)}
                  />
                </FieldRow>
              </HubSection>

              <HubSection label="Moduli">
                <div className="grid grid-cols-2 gap-2">
                  <HubToggle
                    icon={Droplet}
                    label="Poison"
                    active={showPoison}
                    onToggle={() => setShowPoison((value) => !value)}
                    activeClass="bg-emerald-500/22 text-emerald-100 ring-emerald-200/30"
                  />
                  <HubToggle
                    icon={Crown}
                    label="Commander"
                    active={showCmdDmg}
                    onToggle={() => setShowCmdDmg((value) => !value)}
                    activeClass="bg-amber-500/22 text-amber-100 ring-amber-200/30"
                  />
                </div>
              </HubSection>

              <div className="mt-2 flex gap-2 border-t border-white/10 pt-2">
                <button
                  onClick={undo}
                  disabled={history.length === 0}
                  className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-white/8 px-3 text-sm font-semibold text-white/78 transition-colors hover:bg-white/12 hover:text-white disabled:opacity-40"
                >
                  <Undo2 size={16} />
                  Undo
                </button>
                <button
                  onClick={reset}
                  className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-red-500/18 px-3 text-sm font-semibold text-red-100 ring-1 ring-red-200/12 transition-colors hover:bg-red-500/26"
                >
                  <RotateCcw size={16} />
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>

        {dice && (
          <div
            key={dice.key}
            className="pointer-events-none absolute left-1/2 top-1/2 z-50 flex -translate-x-1/2 -translate-y-[calc(50%+5rem)] flex-col items-center gap-1 rounded-2xl border border-white/12 bg-black/86 px-8 py-5 shadow-2xl backdrop-blur-md"
          >
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/48">
              {dice.label}
            </div>
            <div className="text-5xl font-black tabular-nums text-white">{dice.value}</div>
          </div>
        )}
      </section>
    </main>
  )
}

function HubSection({
  label,
  icon: Icon,
  children,
}: {
  label: string
  icon?: ComponentType<{ className?: string; size?: number }>
  children: ReactNode
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/44">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      {children}
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2 last:mb-0">
      <span className="w-16 shrink-0 text-xs font-medium text-white/48">{label}</span>
      {children}
    </div>
  )
}

function HubTile({
  icon: Icon,
  label,
  onClick,
}: {
  icon: ComponentType<{ className?: string; size?: number }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg bg-white/8 px-2 text-white/74 ring-1 ring-white/8 transition-colors hover:bg-white/12 hover:text-white"
    >
      <Icon className="h-5 w-5" />
      <span className="text-xs font-bold">{label}</span>
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
  icon: ComponentType<{ className?: string; size?: number }>
  label: string
  active: boolean
  onToggle: () => void
  activeClass: string
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold ring-1 transition-colors ${
        active
          ? activeClass
          : 'bg-white/8 text-white/66 ring-white/8 hover:bg-white/12 hover:text-white'
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
    <div className="grid flex-1 grid-flow-col gap-1 rounded-lg bg-black/28 p-1 ring-1 ring-white/8">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`min-h-9 rounded-md px-2 text-sm font-black transition-colors ${
            value === option.value
              ? 'bg-white text-zinc-950 shadow-sm'
              : 'text-white/62 hover:bg-white/10 hover:text-white'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

interface PlayerPanelProps {
  index: number
  player: Player
  allPlayers: Player[]
  orientation: PanelOrientation
  showPoison: boolean
  showCmdDmg: boolean
  panelClassName?: string
  onLife: (delta: number) => void
  onPoison: (delta: number) => void
  onCmdDmg: (sourceId: number, delta: number) => void
}

function PlayerPanel({
  index,
  player,
  allPlayers,
  orientation,
  showPoison,
  showCmdDmg,
  panelClassName = '',
  onLife,
  onPoison,
  onCmdDmg,
}: PlayerPanelProps) {
  const accent = PLAYER_ACCENTS[index % PLAYER_ACCENTS.length]
  const others = allPlayers.filter((other) => other.id !== player.id)
  const maxCmdDmg = Math.max(0, ...Object.values(player.commanderDamage))
  const isDead = player.life <= 0 || player.poison >= 10 || maxCmdDmg >= 21
  const isCritical = !isDead && (player.life <= 5 || player.poison >= 7 || maxCmdDmg >= 18)
  const [lastDelta, setLastDelta] = useState<{
    type: 'life' | 'poison' | 'cmd'
    value: number
    anchor: 'left' | 'right'
    key: number
  } | null>(null)

  useEffect(() => {
    if (!lastDelta) return
    const timeout = setTimeout(() => setLastDelta(null), 850)
    return () => clearTimeout(timeout)
  }, [lastDelta])

  const markDelta = (type: 'life' | 'poison' | 'cmd', value: number, anchor: 'left' | 'right') => {
    setLastDelta((previous) =>
      previous?.type === type && previous.anchor === anchor
        ? { type, value: previous.value + value, anchor, key: Date.now() }
        : { type, value, anchor, key: Date.now() },
    )
  }

  const handleLife = (delta: number, anchor: 'left' | 'right') => {
    markDelta('life', delta, anchor)
    onLife(delta)
  }

  const handlePoison = (delta: number) => {
    markDelta('poison', delta, delta > 0 ? 'right' : 'left')
    onPoison(delta)
  }

  const handleCmd = (sourceId: number, delta: number) => {
    markDelta('cmd', delta, delta > 0 ? 'right' : 'left')
    onCmdDmg(sourceId, delta)
  }

  const orientedContentClass =
    orientation === 'normal'
      ? 'absolute inset-0 grid grid-cols-[1fr_auto_1fr] items-center'
      : orientation === 'opposite'
        ? 'absolute inset-0 grid rotate-180 grid-cols-[1fr_auto_1fr] items-center'
        : `absolute left-1/2 top-1/2 grid h-[min(100%,34rem)] w-[min(100%,28rem)] -translate-x-1/2 -translate-y-1/2 grid-cols-[1fr_auto_1fr] items-center ${
            orientation === 'left' ? 'rotate-90' : '-rotate-90'
          }`

  const counterDockClass =
    orientation === 'normal'
      ? 'bottom-3 right-3'
      : orientation === 'opposite'
        ? 'left-3 top-3 rotate-180'
        : orientation === 'left'
          ? 'left-3 top-1/2 -translate-y-1/2 rotate-90'
          : 'right-3 top-1/2 -translate-y-1/2 -rotate-90'

  return (
    <article
      className={`relative min-h-0 overflow-hidden rounded-xl border border-border ${accent.panel} shadow-xl ${accent.glow} ring-1 ${accent.ring} ${
        isDead ? 'saturate-50 opacity-80' : ''
      } ${panelClassName}`}
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),transparent_38%,rgba(0,0,0,0.16))]" />
      <div className={`absolute inset-x-0 top-0 h-1.5 ${accent.rail}`} />

      <div className={orientedContentClass}>
        <LifeZone
          delta={-1}
          label={`Diminuisci vita Player ${player.id}`}
          shortcut="-5"
          anchor="left"
          onClick={handleLife}
        />

        <div className="pointer-events-none relative z-10 flex min-w-[7.4rem] flex-col items-center justify-center px-1 text-center select-none sm:min-w-[9rem]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-font-muted">
            Player {player.id}
          </div>
          <div className="mt-1 flex items-baseline justify-center gap-1">
            <span
              className={`text-[clamp(4.9rem,24vmin,11.5rem)] font-black leading-[0.82] tracking-normal tabular-nums ${
                isCritical ? 'text-bg-red' : 'text-font-primary'
              }`}
            >
              {player.life}
            </span>
          </div>
          <div className={`mt-2 h-1 w-14 rounded-full ${accent.rail}`} />
        </div>

        <LifeZone
          delta={1}
          label={`Aumenta vita Player ${player.id}`}
          shortcut="+5"
          anchor="right"
          onClick={handleLife}
        />

        {lastDelta && (
          <div
            key={lastDelta.key}
            className={`pointer-events-none absolute top-1/2 z-30 -translate-y-1/2 text-3xl font-black tabular-nums drop-shadow-[0_6px_18px_rgba(0,0,0,0.5)] animate-pulse ${
              lastDelta.anchor === 'left' ? 'left-[18%]' : 'right-[18%]'
            } ${
              lastDelta.type === 'life'
                ? lastDelta.value > 0
                  ? 'text-emerald-200'
                  : 'text-red-200'
                : lastDelta.type === 'poison'
                  ? 'text-emerald-200'
                  : 'text-amber-200'
            }`}
          >
            {lastDelta.value > 0 ? `+${lastDelta.value}` : lastDelta.value}
          </div>
        )}
      </div>

      {(showPoison || (showCmdDmg && others.length > 0)) && (
        <aside
          className={`absolute z-20 flex max-w-[calc(100%-1.5rem)] gap-1.5 overflow-x-auto ${counterDockClass}`}
        >
          {showPoison && (
            <CounterPill
              icon={Droplet}
              value={player.poison}
              label="Poison"
              className="bg-emerald-950/58 text-emerald-100 ring-emerald-100/20"
              onIncrement={() => handlePoison(1)}
              onDecrement={() => handlePoison(-1)}
            />
          )}

          {showCmdDmg &&
            others.map((other) => {
              const sourceAccent = PLAYER_ACCENTS[(other.id - 1) % PLAYER_ACCENTS.length]
              return (
                <CounterPill
                  key={other.id}
                  icon={Crown}
                  value={player.commanderDamage[other.id] ?? 0}
                  label={`Commander damage da P${other.id}`}
                  className={`${sourceAccent.soft} ${sourceAccent.text}`}
                  onIncrement={() => handleCmd(other.id, 1)}
                  onDecrement={() => handleCmd(other.id, -1)}
                />
              )
            })}
        </aside>
      )}

      {isDead && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black/24">
          <div className="rounded-full bg-black/78 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-red-100 ring-1 ring-red-100/30">
            Defeated
          </div>
        </div>
      )}
    </article>
  )
}

function LifeZone({
  delta,
  label,
  shortcut,
  anchor,
  onClick,
}: {
  delta: number
  label: string
  shortcut: string
  anchor: 'left' | 'right'
  onClick: (delta: number, anchor: 'left' | 'right') => void
}) {
  const Icon = delta > 0 ? Plus : Minus

  return (
    <div className="relative z-10 flex h-full min-w-0 flex-col">
      <button
        onClick={() => onClick(delta, anchor)}
        className="group flex min-h-0 flex-1 items-center justify-center transition-colors active:bg-bg-hover/55"
        aria-label={label}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bg-surface text-font-secondary ring-1 ring-border-light transition-colors group-hover:text-font-primary group-active:bg-bg-cell">
          <Icon className="h-8 w-8" strokeWidth={2.75} />
        </span>
      </button>
      <button
        onClick={() => onClick(delta * 5, anchor)}
        className="mx-auto mb-3 flex min-h-9 min-w-14 items-center justify-center rounded-lg bg-bg-surface px-3 text-sm font-bold text-font-secondary ring-1 ring-border transition-colors hover:bg-bg-hover hover:text-font-primary active:bg-bg-cell"
        aria-label={`${label} di 5`}
      >
        {shortcut}
      </button>
    </div>
  )
}

function CounterPill({
  icon: Icon,
  value,
  label,
  className,
  onIncrement,
  onDecrement,
}: {
  icon: ComponentType<{ className?: string; size?: number }>
  value: number
  label: string
  className: string
  onIncrement: () => void
  onDecrement: () => void
}) {
  return (
    <div
      className={`grid w-14 overflow-hidden rounded-full text-center shadow-xl ring-1 backdrop-blur-md ${className}`}
      aria-label={label}
    >
      <button
        onClick={onIncrement}
        className="flex h-9 items-center justify-center text-sm font-black transition-colors active:bg-white/16"
        aria-label={`${label}: aumenta`}
      >
        +
      </button>
      <div className="flex min-h-9 flex-col items-center justify-center gap-0.5 border-y border-white/10 px-1">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-sm font-black leading-none tabular-nums">{value}</span>
      </div>
      <button
        onClick={onDecrement}
        className="flex h-9 items-center justify-center text-sm font-black transition-colors active:bg-white/16"
        aria-label={`${label}: diminuisci`}
      >
        -
      </button>
    </div>
  )
}
