'use client'

import { useState, useRef, useEffect } from 'react'
import { Clock, Plus, Trash2 } from 'lucide-react'

interface ConvItem {
  id: string
  title: string | null
  updated_at: string
}

interface GoblinAIHistoryDropdownProps {
  activeConversationId: string | null
  onSelectConversation: (id: string, title: string | null) => void
  onNewConversation: () => void
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'oggi'
  if (diffDays === 1) return 'ieri'
  if (diffDays < 7) return `${diffDays} giorni fa`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} sett. fa`
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

export function GoblinAIHistoryDropdown({
  activeConversationId,
  onSelectConversation,
  onNewConversation,
}: GoblinAIHistoryDropdownProps) {
  const [open, setOpen] = useState(false)
  const [conversations, setConversations] = useState<ConvItem[]>([])
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    setLoading(true)
    fetch('/api/assistant/conversations')
      .then((r) => r.json())
      .then((data) => setConversations(data.conversations ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  async function handleDelete(e: React.MouseEvent, convId: string) {
    e.stopPropagation()
    setConversations((prev) => prev.filter((c) => c.id !== convId))
    await fetch(`/api/assistant/conversations/${convId}`, { method: 'DELETE' })
    if (convId === activeConversationId) {
      onNewConversation()
    }
  }

  function handleSelect(conv: ConvItem) {
    onSelectConversation(conv.id, conv.title)
    setOpen(false)
  }

  function handleNew() {
    onNewConversation()
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`rounded p-1.5 text-white/50 hover:text-white hover:bg-white/10 transition-colors ${open ? 'bg-white/10 text-white' : ''}`}
        aria-label="Storico conversazioni"
        title="Storico conversazioni"
      >
        <Clock className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-lg border border-white/10 bg-[#1a1a1a] shadow-2xl z-50">
          <button
            onClick={handleNew}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-white hover:bg-white/5 rounded-t-lg border-b border-white/10"
          >
            <Plus className="h-4 w-4 text-primary-400" />
            Nuova conversazione
          </button>

          <div className="max-h-72 overflow-y-auto">
            {loading && (
              <p className="px-3 py-4 text-center text-xs text-white/40 animate-pulse">
                Caricamento...
              </p>
            )}

            {!loading && conversations.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-white/40">
                Nessuna conversazione
              </p>
            )}

            {!loading && conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => handleSelect(conv)}
                className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-white/5 ${
                  conv.id === activeConversationId ? 'bg-white/5' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">
                    {conv.title ?? 'Conversazione'}
                  </p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {formatRelativeDate(conv.updated_at)}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-white/40 hover:text-red-400 hover:bg-white/10 transition-opacity flex-shrink-0"
                  aria-label="Elimina conversazione"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
