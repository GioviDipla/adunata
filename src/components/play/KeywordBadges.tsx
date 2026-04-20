'use client'

import {
  Eye,
  Feather,
  Footprints,
  Skull,
  HeartPulse,
  Zap,
  Flame,
  Shield,
  ShieldCheck,
  ShieldPlus,
  Swords,
  Sword,
  Ghost,
  Sparkles,
  MoveUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type KeywordMeta = {
  icon: LucideIcon
  label: string
  /** tailwind color class applied to the badge ring + icon */
  tone: string
}

const KEYWORD_MAP: Record<string, KeywordMeta> = {
  vigilance: { icon: Eye, label: 'Vigilance', tone: 'text-amber-300' },
  flying: { icon: Feather, label: 'Flying', tone: 'text-sky-300' },
  reach: { icon: MoveUp, label: 'Reach', tone: 'text-emerald-300' },
  trample: { icon: Footprints, label: 'Trample', tone: 'text-orange-300' },
  deathtouch: { icon: Skull, label: 'Deathtouch', tone: 'text-lime-300' },
  lifelink: { icon: HeartPulse, label: 'Lifelink', tone: 'text-rose-300' },
  haste: { icon: Zap, label: 'Haste', tone: 'text-red-300' },
  menace: { icon: Flame, label: 'Menace', tone: 'text-orange-400' },
  defender: { icon: Shield, label: 'Defender', tone: 'text-slate-300' },
  hexproof: { icon: ShieldCheck, label: 'Hexproof', tone: 'text-violet-300' },
  indestructible: { icon: ShieldPlus, label: 'Indestructible', tone: 'text-yellow-300' },
  'double strike': { icon: Swords, label: 'Double Strike', tone: 'text-red-400' },
  'first strike': { icon: Sword, label: 'First Strike', tone: 'text-red-300' },
  fear: { icon: Ghost, label: 'Fear', tone: 'text-purple-300' },
  flash: { icon: Sparkles, label: 'Flash', tone: 'text-cyan-300' },
}

const PRIORITY = [
  'flying', 'reach', 'vigilance', 'haste', 'trample', 'menace',
  'deathtouch', 'lifelink', 'first strike', 'double strike',
  'indestructible', 'hexproof', 'defender', 'fear', 'flash',
]

interface KeywordBadgesProps {
  keywords: string[] | null | undefined
  size?: number
  max?: number
}

/** Renders a stack of icon badges for the card's keyword abilities.
 *  Keywords are looked up in a static map — unknown ones are skipped rather than
 *  shown as text, to keep the badge layer compact. */
export default function KeywordBadges({ keywords, size = 11, max = 3 }: KeywordBadgesProps) {
  if (!keywords || keywords.length === 0) return null
  const normalized = keywords.map((k) => k.toLowerCase())
  const ordered = PRIORITY.filter((k) => normalized.includes(k)).slice(0, max)
  if (ordered.length === 0) return null

  return (
    <div className="pointer-events-none absolute right-0.5 top-0.5 flex flex-col gap-0.5">
      {ordered.map((k) => {
        const meta = KEYWORD_MAP[k]
        if (!meta) return null
        const Icon = meta.icon
        return (
          <span
            key={k}
            title={meta.label}
            className={`flex items-center justify-center rounded-full bg-black/70 ring-1 ring-white/30 ${meta.tone}`}
            style={{ width: size + 4, height: size + 4 }}
          >
            <Icon size={size} strokeWidth={2.5} />
          </span>
        )
      })}
    </div>
  )
}
