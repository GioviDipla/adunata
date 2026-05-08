'use client'

import { useState } from 'react'

interface GoblinAIMessageProps {
  role: 'user' | 'assistant'
  content: string
  pendingConfirmation?: boolean
  onConfirm?: () => void
  onCorrect?: (correction: string) => void
}

export function GoblinAIMessage({
  role,
  content,
  pendingConfirmation,
  onConfirm,
  onCorrect,
}: GoblinAIMessageProps) {
  const [correcting, setCorrecting] = useState(false)
  const [correction, setCorrection] = useState('')

  const isAssistant = role === 'assistant'

  return (
    <div className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isAssistant
            ? 'bg-white/5 text-white/90'
            : 'bg-primary-600/30 text-white'
        }`}
      >
        <p className="text-xs font-semibold mb-1 text-white/50">
          {isAssistant ? 'GoblinAI' : 'Tu'}
        </p>

        <div className="whitespace-pre-wrap">{content}</div>

        {pendingConfirmation && onConfirm && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={onConfirm}
              className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
            >
              Conferma scenario
            </button>
            <button
              onClick={() => setCorrecting(true)}
              className="rounded bg-white/10 px-3 py-1 text-xs font-medium text-white/70 hover:bg-white/20"
            >
              Correggi
            </button>
          </div>
        )}

        {correcting && onCorrect && (
          <div className="mt-2 space-y-2">
            <textarea
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              placeholder="Scrivi la correzione..."
              className="w-full rounded bg-white/10 border border-white/20 px-2 py-1 text-xs text-white placeholder:text-white/30"
              rows={3}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onCorrect(correction)
                  setCorrecting(false)
                }}
                className="rounded bg-primary-600 px-3 py-1 text-xs font-medium text-white hover:bg-primary-700"
              >
                Invia correzione
              </button>
              <button
                onClick={() => setCorrecting(false)}
                className="rounded bg-white/10 px-3 py-1 text-xs text-white/50 hover:bg-white/20"
              >
                Annulla
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
