'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { Send } from 'lucide-react'

type CardSuggestion = {
  id: string
  name: string
  type_line: string | null
  image_small: string | null
}

interface CommentComposerProps {
  initialBody?: string
  placeholder?: string
  submitLabel?: string
  autoFocus?: boolean
  disabled?: boolean
  onSubmit: (body: string) => Promise<void> | void
  onCancel?: () => void
}

const MAX_BODY = 2000

export default function CommentComposer({
  initialBody = '',
  placeholder = 'Scrivi un commento… usa @ per menzionare una carta',
  submitLabel = 'Commenta',
  autoFocus = false,
  disabled = false,
  onSubmit,
  onCancel,
}: CommentComposerProps) {
  const [value, setValue] = useState(initialBody)
  const [suggestions, setSuggestions] = useState<CardSuggestion[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number; token: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (!textareaRef.current) return
    const el = textareaRef.current
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  }, [value])

  const findMention = useCallback((text: string, caret: number) => {
    let i = caret - 1
    while (i >= 0) {
      const ch = text[i]
      if (ch === '@') {
        const before = i === 0 ? ' ' : text[i - 1]
        if (/\s/.test(before) || i === 0) {
          const token = text.slice(i + 1, caret)
          if (/^[^\s@\]\(\)]*$/.test(token)) {
            return { start: i, end: caret, token }
          }
        }
        return null
      }
      if (/\s/.test(ch)) return null
      i -= 1
    }
    return null
  }, [])

  const runSearch = useCallback((token: string) => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    if (token.length < 2) {
      setSuggestions([])
      return
    }

    fetch(`/api/cards/search?q=${encodeURIComponent(token)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('search failed'))))
      .then((data) => {
        if (controller.signal.aborted) return
        const cards = Array.isArray(data.cards) ? data.cards.slice(0, 8) : []
        setSuggestions(
          cards.map((c: Record<string, unknown>) => ({
            id: String(c.id),
            name: String(c.name),
            type_line: (c.type_line as string | null) ?? null,
            image_small: (c.image_small as string | null) ?? null,
          })),
        )
        setSelectedIndex(0)
      })
      .catch(() => {
        /* aborted or network error — ignored */
      })
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value
    const caret = e.target.selectionStart
    setValue(next)
    const m = findMention(next, caret)
    setMentionRange(m)
    if (m) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => runSearch(m.token), 200)
    } else {
      setSuggestions([])
    }
  }

  function handleSelectionChange() {
    const el = textareaRef.current
    if (!el) return
    const m = findMention(el.value, el.selectionStart)
    setMentionRange(m)
    if (!m) setSuggestions([])
  }

  function insertMention(card: CardSuggestion) {
    if (!mentionRange) return
    const before = value.slice(0, mentionRange.start)
    const after = value.slice(mentionRange.end)
    const token = `@[${card.name}](${card.id})`
    const next = `${before}${token} ${after}`
    setValue(next)
    setMentionRange(null)
    setSuggestions([])
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      const pos = (before + token + ' ').length
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length > 0 && mentionRange) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => (i + 1) % suggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => (i - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(suggestions[selectedIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSuggestions([])
        setMentionRange(null)
        return
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void submit()
    }
  }

  async function submit() {
    const trimmed = value.trim()
    if (!trimmed || submitting || disabled) return
    setSubmitting(true)
    try {
      await onSubmit(trimmed)
      setValue('')
      setSuggestions([])
      setMentionRange(null)
    } finally {
      setSubmitting(false)
    }
  }

  const over = value.length > MAX_BODY
  const canSubmit = value.trim().length > 0 && !over && !submitting && !disabled

  return (
    <div className="relative">
      <div className="rounded-lg border border-border bg-bg-surface focus-within:border-bg-accent transition-colors">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onKeyUp={handleSelectionChange}
          onClick={handleSelectionChange}
          placeholder={placeholder}
          rows={2}
          disabled={disabled}
          className="w-full resize-none bg-transparent px-3 py-2 text-sm text-font-primary placeholder:text-font-muted outline-none"
        />
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border">
          <span className={`text-xs ${over ? 'text-red-500' : 'text-font-muted'}`}>
            {value.length}/{MAX_BODY}
          </span>
          <div className="flex items-center gap-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-md px-3 py-1 text-xs text-font-muted hover:text-font-primary"
              >
                Annulla
              </button>
            )}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 rounded-md bg-bg-accent px-3 py-1.5 text-xs font-medium text-font-white hover:bg-bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={12} />
              {submitLabel}
            </button>
          </div>
        </div>
      </div>

      {suggestions.length > 0 && mentionRange && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-bg-surface shadow-xl">
          {suggestions.map((card, idx) => (
            <button
              key={card.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                insertMention(card)
              }}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${
                idx === selectedIndex ? 'bg-bg-elevated' : ''
              }`}
            >
              {card.image_small ? (
                <Image
                  src={card.image_small}
                  alt=""
                  width={28}
                  height={40}
                  className="h-10 w-7 rounded-sm object-cover"
                  unoptimized
                />
              ) : (
                <div className="h-10 w-7 rounded-sm bg-bg-elevated" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-font-primary">{card.name}</div>
                {card.type_line && (
                  <div className="truncate text-xs text-font-muted">{card.type_line}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
