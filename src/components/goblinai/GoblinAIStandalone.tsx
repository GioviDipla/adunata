'use client'

import { useState, useRef, useEffect } from 'react'
import { GoblinAIMessage } from './GoblinAIMessage'
import { GoblinAIComposer } from './GoblinAIComposer'
import type { RestatementResponse, AnswerResponse, MentionedCardRef } from '@/lib/goblinai/types'

function GoblinIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <ellipse cx="16" cy="17" rx="10" ry="9" fill="#4a8c3f" />
      <path d="M6 12 L2 6 L8 10 Z" fill="#3d7234" />
      <path d="M26 12 L30 6 L24 10 Z" fill="#3d7234" />
      <ellipse cx="12" cy="15" rx="3" ry="3.5" fill="#f0c040" />
      <ellipse cx="20" cy="15" rx="3" ry="3.5" fill="#f0c040" />
      <ellipse cx="12" cy="15" rx="1.5" ry="2.5" fill="#1a1a1a" />
      <ellipse cx="20" cy="15" rx="1.5" ry="2.5" fill="#1a1a1a" />
      <path d="M10 21 Q16 27 22 21" stroke="#1a1a1a" strokeWidth="1.2" fill="none" />
      <line x1="13" y1="20" x2="13" y2="23" stroke="#fff" strokeWidth="0.8" />
      <line x1="15.5" y1="20.5" x2="15.5" y2="24" stroke="#fff" strokeWidth="0.8" />
      <line x1="18" y1="20.5" x2="18" y2="23.5" stroke="#fff" strokeWidth="0.8" />
    </svg>
  )
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  pendingConfirmation?: boolean
  serverMessageId?: string
}

export function GoblinAIStandalone() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingRestatement, setPendingRestatement] = useState<{
    conversationId: string
    restatementMessageId: string
    restatement: string
  } | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend(message: string, mentions: MentionedCardRef[]) {
    setError(null)
    setLoading(true)

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
    }
    setMessages((prev) => [...prev, userMsg])

    try {
      const res = await fetch('/api/assistant/rules/restatement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, mentions, conversationId }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Request failed')
      }

      const data: RestatementResponse = await res.json()
      setConversationId(data.conversationId)

      if (data.requiresConfirmation && data.restatement) {
        setPendingRestatement({
          conversationId: data.conversationId,
          restatementMessageId: data.messageId ?? crypto.randomUUID(),
          restatement: data.restatement,
        })
        setMessages((prev) => [...prev, {
          id: data.messageId ?? crypto.randomUUID(),
          role: 'assistant',
          content: data.restatement,
          pendingConfirmation: true,
          serverMessageId: data.messageId ?? undefined,
        }])
      } else if (data.answer) {
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.answer!,
        }])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm(userCorrection?: string) {
    if (!pendingRestatement) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/assistant/rules/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: pendingRestatement.conversationId,
          restatementMessageId: pendingRestatement.restatementMessageId,
          confirmedRestatement: pendingRestatement.restatement,
          userCorrection,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Request failed')
      }

      const data: AnswerResponse = await res.json()
      setPendingRestatement(null)
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.answer,
        serverMessageId: data.messageId ?? undefined,
      }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function handleCorrect(correction: string) {
    handleConfirm(correction)
  }

  return (
    <div className="flex flex-col h-dvh bg-bg-dark">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 pt-[env(safe-area-inset-top,0px)]">
        <GoblinIcon className="h-8 w-8" />
        <div>
          <h1 className="text-white font-bold">GoblinAI</h1>
          <p className="text-xs text-white/40">MTG Rules Assistant</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-white/50 text-center mt-8">
            Chiedi una regola. Usa @ per citare ogni carta coinvolta.
          </p>
        )}

        {messages.map((msg) => (
          <GoblinAIMessage
            key={msg.id}
            messageId={msg.serverMessageId}
            role={msg.role}
            content={msg.content}
            pendingConfirmation={msg.pendingConfirmation}
            onConfirm={() => handleConfirm()}
            onCorrect={handleCorrect}
          />
        ))}

        {loading && (
          <p className="text-sm text-white/50 animate-pulse">GoblinAI pensa...</p>
        )}

        {error && (
          <div className="rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <GoblinAIComposer
        onSend={handleSend}
        disabled={loading || pendingRestatement !== null}
        placeholder={
          pendingRestatement
            ? 'Conferma o correggi lo scenario prima di continuare'
            : 'Chiedi una regola... (@ per citare carte)'
        }
      />
    </div>
  )
}
