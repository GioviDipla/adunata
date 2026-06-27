'use client'

import { useState } from 'react'
import { ThumbsDown } from 'lucide-react'

interface GoblinAIMessageProps {
  role: 'user' | 'assistant'
  content: string
  messageId?: string
  pendingConfirmation?: boolean
  onConfirm?: () => void
  onCorrect?: (correction: string) => void
}

export function GoblinAIMessage({
  role,
  content,
  messageId,
  pendingConfirmation,
  onConfirm,
  onCorrect,
}: GoblinAIMessageProps) {
  const [correcting, setCorrecting] = useState(false)
  const [correction, setCorrection] = useState('')
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [showingFeedback, setShowingFeedback] = useState(false)

  const isAssistant = role === 'assistant'

  async function sendFeedback(correction: string) {
    if (!messageId) return
    try {
      await fetch('/api/assistant/rules/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          correction,
          originalAnswer: content,
        }),
      })
      setFeedbackSent(true)
    } catch {
      // silent
    }
  }

  return (
    <div className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isAssistant
            ? 'bg-bg-cell/40 text-font-primary'
            : 'bg-primary-600/30 text-font-primary'
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs font-semibold text-font-muted">
            {isAssistant ? 'GoblinAI' : 'Tu'}
          </p>
          {isAssistant && !pendingConfirmation && messageId && (
            <button
              onClick={() => setShowingFeedback(!showingFeedback)}
              className={`p-0.5 rounded hover:bg-bg-cell ${feedbackSent ? 'text-orange-400' : 'text-font-muted hover:text-font-secondary'}`}
              title="Segnala risposta sbagliata"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="whitespace-pre-wrap">{content}</div>

        {/* Pending confirmation buttons (complex scenario) */}
        {pendingConfirmation && onConfirm && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={onConfirm}
              className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-font-white hover:bg-green-700"
            >
              Conferma scenario
            </button>
            <button
              onClick={() => setCorrecting(true)}
              className="rounded bg-bg-cell px-3 py-1 text-xs font-medium text-font-secondary hover:bg-bg-hover"
            >
              Correggi
            </button>
          </div>
        )}

        {/* Scenario correction textarea */}
        {correcting && onCorrect && (
          <div className="mt-2 space-y-2">
            <textarea
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              placeholder="Scrivi la correzione..."
              className="w-full rounded bg-bg-cell border border-border-light px-2 py-1 text-xs text-font-primary placeholder:text-font-muted"
              rows={3}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onCorrect(correction)
                  setCorrecting(false)
                }}
                className="rounded bg-primary-600 px-3 py-1 text-xs font-medium text-font-white hover:bg-primary-700"
              >
                Invia correzione
              </button>
              <button
                onClick={() => setCorrecting(false)}
                className="rounded bg-bg-cell px-3 py-1 text-xs text-font-muted hover:bg-bg-hover"
              >
                Annulla
              </button>
            </div>
          </div>
        )}

        {/* Feedback form for wrong answers */}
        {showingFeedback && !feedbackSent && (
          <div className="mt-3 space-y-2 border-t border-border pt-2">
            <p className="text-xs text-font-muted">Cosa ha sbagliato GoblinAI?</p>
            <textarea
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              placeholder="Descrivi l'errore così possiamo migliorare..."
              className="w-full rounded bg-bg-cell border border-border-light px-2 py-1 text-xs text-font-primary placeholder:text-font-muted"
              rows={2}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  sendFeedback(correction)
                  setShowingFeedback(false)
                  setCorrection('')
                }}
                disabled={!correction.trim()}
                className="rounded bg-orange-600 px-3 py-1 text-xs font-medium text-font-white hover:bg-orange-700 disabled:opacity-40"
              >
                Invia feedback
              </button>
              <button
                onClick={() => setShowingFeedback(false)}
                className="rounded bg-bg-cell px-3 py-1 text-xs text-font-muted hover:bg-bg-hover"
              >
                Annulla
              </button>
            </div>
          </div>
        )}

        {feedbackSent && (
          <p className="mt-2 text-xs text-orange-400">Feedback inviato, grazie!</p>
        )}
      </div>
    </div>
  )
}
