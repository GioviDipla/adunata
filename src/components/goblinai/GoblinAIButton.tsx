'use client'

import { useState } from 'react'
import { Bot } from 'lucide-react'
import { GoblinAIPanel } from './GoblinAIPanel'

export function GoblinAIButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg hover:bg-primary-700 transition-colors sm:bottom-8 sm:right-8"
        aria-label="GoblinAI Rules Assistant"
      >
        <Bot className="h-6 w-6" />
      </button>

      {open && <GoblinAIPanel onClose={() => setOpen(false)} />}
    </>
  )
}
