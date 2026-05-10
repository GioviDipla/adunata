'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { GoblinAIPanel } from './GoblinAIPanel'

// Routes that mount their own in-header GoblinAI launcher (goldfish + the
// multiplayer game view). On those pages, the floating button would clash
// with the bottom action bar and duplicate the header entry.
const HIDE_FLOATING_PATTERNS = [
  /^\/decks\/[^/]+\/goldfish(?:\/|$)/,
  /^\/play\/[^/]+\/game(?:\/|$)/,
]

function GoblinIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Goblin head — green, big ears, sharp teeth */}
      <ellipse cx="16" cy="17" rx="10" ry="9" fill="#4a8c3f" />
      {/* Ears */}
      <path d="M6 12 L2 6 L8 10 Z" fill="#3d7234" />
      <path d="M26 12 L30 6 L24 10 Z" fill="#3d7234" />
      {/* Eyes — yellow, menacing */}
      <ellipse cx="12" cy="15" rx="3" ry="3.5" fill="#f0c040" />
      <ellipse cx="20" cy="15" rx="3" ry="3.5" fill="#f0c040" />
      <ellipse cx="12" cy="15" rx="1.5" ry="2.5" fill="#1a1a1a" />
      <ellipse cx="20" cy="15" rx="1.5" ry="2.5" fill="#1a1a1a" />
      {/* Mouth — sharp teeth */}
      <path d="M10 21 Q16 27 22 21" stroke="#1a1a1a" strokeWidth="1.2" fill="none" />
      <line x1="13" y1="20" x2="13" y2="23" stroke="#fff" strokeWidth="0.8" />
      <line x1="15.5" y1="20.5" x2="15.5" y2="24" stroke="#fff" strokeWidth="0.8" />
      <line x1="18" y1="20.5" x2="18" y2="23.5" stroke="#fff" strokeWidth="0.8" />
    </svg>
  )
}

export function GoblinAIButton() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  if (pathname && HIDE_FLOATING_PATTERNS.some((re) => re.test(pathname))) {
    return null
  }

  return (
    <>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-orange-600 pl-3 pr-4 py-3 text-white shadow-lg hover:bg-orange-700 transition-all hover:scale-105 sm:bottom-8 sm:right-8"
        aria-label="GoblinAI Rules Assistant"
      >
        <GoblinIcon className="h-7 w-7" />
        <span className="text-sm font-bold hidden sm:inline">GoblinAI</span>
      </button>

      {open && <GoblinAIPanel onClose={() => setOpen(false)} />}
    </>
  )
}
