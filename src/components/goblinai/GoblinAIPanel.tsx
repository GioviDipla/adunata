'use client'

import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { GoblinAIMessage } from './GoblinAIMessage'
import { GoblinAIComposer } from './GoblinAIComposer'
import type { RestatementResponse, AnswerResponse, MentionedCardRef } from '@/lib/goblinai/types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  pendingConfirmation?: boolean
  serverMessageId?: string
}

export function GoblinAIPanel({ onClose }: { onClose: () => void }) {
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
        body: JSON.stringify({
          message,
          mentions,
          conversationId,
        }),
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

        setMessages((prev) => [
          ...prev,
          {
            id: data.messageId ?? crypto.randomUUID(),
            role: 'assistant',
            content: data.restatement,
            pendingConfirmation: true,
            serverMessageId: data.messageId ?? undefined,
          },
        ])
      } else if (data.answer) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: data.answer!,
          },
        ])
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

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.answer,
          serverMessageId: data.messageId ?? undefined,
        },
      ])
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
    <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-bg-dark border-l border-white/10 shadow-2xl sm:w-[420px]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-lg font-semibold text-white">GoblinAI</h2>
        <button
          onClick={onClose}
          className="rounded p-1 text-white/50 hover:text-white hover:bg-white/10"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

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
