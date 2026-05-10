'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, X } from 'lucide-react'
import type { MentionedCardRef } from '@/lib/goblinai/types'

interface GoblinAIComposerProps {
  onSend: (message: string, mentions: MentionedCardRef[]) => void
  disabled?: boolean
  placeholder?: string
}

interface CardResult {
  id: string
  name: string
  type_line: string
}

// Match @ followed by any non-@ chars (including spaces) from cursor position back.
// This lets users type "@sol ring" and search for "sol ring" as one query.
const AT_MENTION_RE = /@([^@]*)$/

// Detect an unresolved @mention — any @ that's not immediately followed by a known card name.
// Used on submit to warn the user.
function hasUnresolvedMention(text: string, mentions: MentionedCardRef[]): boolean {
  const atPattern = /@(\S+)/g
  let match
  while ((match = atPattern.exec(text)) !== null) {
    const name = match[1].replace(/[.,;:!?]$/, '') // strip trailing punctuation
    if (!mentions.some((m) => m.name.startsWith(name) || name.startsWith(m.name))) {
      return true
    }
  }
  return false
}

export function GoblinAIComposer({ onSend, disabled, placeholder }: GoblinAIComposerProps) {
  const [text, setText] = useState('')
  const [mentions, setMentions] = useState<MentionedCardRef[]>([])
  const [mentionResults, setMentionResults] = useState<CardResult[]>([])
  const [showMentionDropdown, setShowMentionDropdown] = useState(false)
  const [mentionCursorIdx, setMentionCursorIdx] = useState(0)
  const [cursorPos, setCursorPos] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      const pos = e.target.selectionStart ?? value.length
      setText(value)
      setCursorPos(pos)

      const beforeCursor = value.slice(0, pos)
      const atMatch = beforeCursor.match(AT_MENTION_RE)

      if (atMatch) {
        const search = atMatch[1].trimEnd()

        // Cancel any in-flight search
        if (abortRef.current) abortRef.current.abort()
        if (searchRef.current) clearTimeout(searchRef.current)

        searchRef.current = setTimeout(async () => {
          if (search.length === 0) {
            // Just typed "@" — show empty state, wait for typing
            setMentionResults([])
            setShowMentionDropdown(true)
            return
          }
          if (search.length < 1) {
            setMentionResults([])
            setShowMentionDropdown(false)
            return
          }

          const controller = new AbortController()
          abortRef.current = controller

          try {
            const res = await fetch(
              `/api/cards/search?q=${encodeURIComponent(search)}&lang=en`,
              { signal: controller.signal },
            )
            if (controller.signal.aborted) return
            const data = await res.json()
            setMentionResults(data.cards?.slice(0, 5) ?? [])
            setShowMentionDropdown(true)
            setMentionCursorIdx(0)
          } catch {
            if (!controller.signal.aborted) setMentionResults([])
          }
        }, 150)
      } else {
        setShowMentionDropdown(false)
        setMentionResults([])
      }
    },
    [],
  )

  function selectMention(card: CardResult) {
    const pos = cursorPos
    const beforeCursor = text.slice(0, pos)
    const afterCursor = text.slice(pos)
    const atMatch = beforeCursor.match(AT_MENTION_RE)

    if (atMatch) {
      const atStart = pos - atMatch[0].length
      // Replace the entire "@searchterm" with "@Full Card Name "
      const newText = beforeCursor.slice(0, atStart) + `@${card.name} ` + afterCursor
      setText(newText)
      setMentions((prev) => {
        // Avoid duplicates
        if (prev.some((m) => m.id === card.id)) return prev
        return [...prev, { id: card.id, name: card.name }]
      })
    }
    setShowMentionDropdown(false)
    // Focus back on textarea after click
    textareaRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!showMentionDropdown) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setMentionCursorIdx((prev) => (prev + 1) % (mentionResults.length || 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setMentionCursorIdx(
        (prev) => (prev - 1 + (mentionResults.length || 1)) % (mentionResults.length || 1),
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (mentionResults[mentionCursorIdx]) {
        selectMention(mentionResults[mentionCursorIdx])
      }
    } else if (e.key === 'Escape') {
      setShowMentionDropdown(false)
    }
  }

  function removeMention(cardId: string) {
    const card = mentions.find((m) => m.id === cardId)
    if (card) {
      setText((prev) =>
        prev
          .replace(new RegExp(`@${card.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'g'), '')
          .replace(/\s{2,}/g, ' ')
          .trim(),
      )
    }
    setMentions((prev) => prev.filter((m) => m.id !== cardId))
  }

  function handleSubmit() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return

    if (mentions.length === 0 && /@\w/.test(trimmed)) {
      // Has @mentions in text but none resolved — warn silently (don't send)
      return
    }

    onSend(trimmed, mentions)
    setText('')
    setMentions([])
    setShowMentionDropdown(false)
    setMentionResults([])
  }

  useEffect(() => {
    return () => {
      if (searchRef.current) clearTimeout(searchRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  return (
    <div className="border-t border-white/10 p-3 relative">
      {/* Mention autocomplete dropdown */}
      {showMentionDropdown && (
        <div className="absolute bottom-full left-3 right-3 mb-1 rounded border border-white/20 bg-bg-dark shadow-xl max-h-48 overflow-y-auto">
          {mentionResults.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-white/40">
              {text.slice(0, cursorPos).match(AT_MENTION_RE)?.[1]?.trimEnd().length === 0
                ? 'Scrivi il nome della carta...'
                : 'Nessuna carta trovata'}
            </div>
          ) : (
            mentionResults.map((card, i) => (
              <button
                key={card.id}
                onClick={() => selectMention(card)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 ${
                  i === mentionCursorIdx ? 'bg-white/10' : ''
                }`}
              >
                <span className="text-white">{card.name}</span>
                <span className="text-white/40 ml-2">{card.type_line}</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Selected card chips */}
      {mentions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {mentions.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1 rounded-full bg-orange-600/30 border border-orange-500/40 px-2.5 py-1 text-xs text-orange-200"
            >
              @{m.name}
              <button
                onClick={() => removeMention(m.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-orange-500/30"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setShowMentionDropdown(false), 150)}
          placeholder={placeholder ?? 'Chiedi una regola... (@ per citare carte)'}
          disabled={disabled}
          rows={2}
          className="flex-1 resize-none rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary-500"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || text.trim().length === 0}
          className="rounded bg-primary-600 p-2 text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
