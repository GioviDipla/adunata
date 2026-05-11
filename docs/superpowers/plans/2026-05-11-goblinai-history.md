# GoblinAI Conversation History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add conversation history to GoblinAIStandalone — header Clock icon opens a dropdown listing past conversations; user can resume or delete them.

**Architecture:** Three new API routes (list, get messages, delete) backed by existing Supabase tables. Existing message-insert routes updated to populate `title` and `updated_at`. New `GoblinAIHistoryDropdown` component self-manages its open state and lazy-fetches conversations. `GoblinAIStandalone` gains resume/new-conversation logic.

**Tech Stack:** Next.js 15 App Router, Supabase JS v2, Tailwind CSS, lucide-react

---

## File Map

| Action | Path |
|--------|------|
| Create | `src/app/api/assistant/conversations/route.ts` |
| Create | `src/app/api/assistant/conversations/[id]/route.ts` |
| Create | `src/app/api/assistant/conversations/[id]/messages/route.ts` |
| Modify | `src/app/api/assistant/rules/simple/route.ts` |
| Modify | `src/app/api/assistant/rules/restatement/route.ts` |
| Modify | `src/app/api/assistant/rules/answer/route.ts` |
| Create | `src/components/goblinai/GoblinAIHistoryDropdown.tsx` |
| Modify | `src/components/goblinai/GoblinAIStandalone.tsx` |

---

### Task 1: API routes — list, messages, delete

**Files:**
- Create: `src/app/api/assistant/conversations/route.ts`
- Create: `src/app/api/assistant/conversations/[id]/route.ts`
- Create: `src/app/api/assistant/conversations/[id]/messages/route.ts`

- [ ] **Step 1: Create GET /api/assistant/conversations**

Create `src/app/api/assistant/conversations/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const { data: conversations } = await supabase
    .from('goblinai_conversations')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ conversations: conversations ?? [] })
}
```

Note: no `.eq('user_id', user.id)` needed — RLS policy `goblinai_conversations_owner_all` already scopes to the authenticated user.

- [ ] **Step 2: Create DELETE /api/assistant/conversations/[id]**

Create `src/app/api/assistant/conversations/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const { data: conv } = await supabase
    .from('goblinai_conversations')
    .select('id')
    .eq('id', id)
    .single()

  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabase.from('goblinai_conversations').delete().eq('id', id)

  return new NextResponse(null, { status: 204 })
}
```

Messages are deleted automatically via `ON DELETE CASCADE` on the FK.

- [ ] **Step 3: Create GET /api/assistant/conversations/[id]/messages**

Create `src/app/api/assistant/conversations/[id]/messages/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  // RLS already gates access; check conv exists for the user
  const { data: conv } = await supabase
    .from('goblinai_conversations')
    .select('id')
    .eq('id', id)
    .single()

  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: messages } = await supabase
    .from('goblinai_messages')
    .select('id, role, content, restatement_status, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({ messages: messages ?? [] })
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/assistant/conversations/
git commit -m "feat(goblinai): add conversations list, messages, and delete API routes"
```

---

### Task 2: Populate title and updated_at in existing routes

Every route that writes messages must keep `goblinai_conversations.updated_at` current (for sort order) and set `title` on the first message.

**Files:**
- Modify: `src/app/api/assistant/rules/simple/route.ts`
- Modify: `src/app/api/assistant/rules/restatement/route.ts`
- Modify: `src/app/api/assistant/rules/answer/route.ts`

- [ ] **Step 1: Patch simple/route.ts**

In `src/app/api/assistant/rules/simple/route.ts`, find the block that inserts messages:

```typescript
    if (convId) {
      await adminClient.from('goblinai_messages').insert([
        {
          conversation_id: convId,
          user_id: user.id,
          role: 'user',
          content: body.message,
        },
        {
          conversation_id: convId,
          user_id: user.id,
          role: 'assistant',
          content: result.text,
          model: 'deepseek-v4-flash',
          prompt_tokens: result.promptTokens,
          completion_tokens: result.completionTokens,
        },
      ])
    }
```

Add the conversation update **immediately after** that block (still inside the `if (convId)` block):

```typescript
    if (convId) {
      await adminClient.from('goblinai_messages').insert([
        {
          conversation_id: convId,
          user_id: user.id,
          role: 'user',
          content: body.message,
        },
        {
          conversation_id: convId,
          user_id: user.id,
          role: 'assistant',
          content: result.text,
          model: 'deepseek-v4-flash',
          prompt_tokens: result.promptTokens,
          completion_tokens: result.completionTokens,
        },
      ])
      await adminClient
        .from('goblinai_conversations')
        .update({
          title: body.message.slice(0, 50),
          updated_at: new Date().toISOString(),
        })
        .eq('id', convId)
    }
```

`simple/route.ts` always creates a new conversation, so `title` is always null — no COALESCE guard needed here.

- [ ] **Step 2: Patch restatement/route.ts**

`restatement/route.ts` has two code paths that insert messages. Both need the conversation update. The conv may already have a title if `conversationId` was passed from client, so guard with `.is('title', null)` for the title update.

**Path 1 (direct answer, no confirmation required):** Find the block:

```typescript
      await adminClient
        .from('goblinai_messages')
        .insert({
          conversation_id: convId,
          user_id: user.id,
          role: 'assistant',
          content: result.text,
          interaction_keywords: ctx.interactionKeywords,
          model: 'deepseek-v4-flash',
          prompt_tokens: result.promptTokens,
          completion_tokens: result.completionTokens,
        })

      return NextResponse.json({
```

Add after the assistant message insert:

```typescript
      await adminClient
        .from('goblinai_conversations')
        .update({ title: message.slice(0, 50) })
        .eq('id', convId)
        .is('title', null)
      await adminClient
        .from('goblinai_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', convId)

      return NextResponse.json({
```

**Path 2 (restatement for confirmation):** Find the block after inserting `restMsg`:

```typescript
    return NextResponse.json({
      conversationId: convId,
      messageId: restMsg?.id ?? null,
      requiresConfirmation: true,
```

Add before the return:

```typescript
    await adminClient
      .from('goblinai_conversations')
      .update({ title: message.slice(0, 50) })
      .eq('id', convId)
      .is('title', null)
    await adminClient
      .from('goblinai_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', convId)

    return NextResponse.json({
      conversationId: convId,
      messageId: restMsg?.id ?? null,
      requiresConfirmation: true,
```

- [ ] **Step 3: Patch answer/route.ts**

`answer/route.ts` appends messages to an existing conv. Only bump `updated_at`. Find the block that inserts `answerMsg`:

```typescript
    const { data: answerMsg } = await adminClient
      .from('goblinai_messages')
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: 'assistant',
        content: result.text,
        interaction_keywords: ctx.interactionKeywords,
        retrieved_rule_numbers: familyNumbers,
        retrieved_ruling_ids: ctx.rulings.map((r) => r.id),
        restatement_status: 'confirmed',
        model: 'deepseek-v4-flash',
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
      })
      .select('id')
      .single()

    return NextResponse.json({
```

Add after that insert:

```typescript
    await adminClient
      .from('goblinai_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId)

    return NextResponse.json({
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/assistant/rules/
git commit -m "feat(goblinai): populate conversation title and updated_at on message insert"
```

---

### Task 3: GoblinAIHistoryDropdown component

**Files:**
- Create: `src/components/goblinai/GoblinAIHistoryDropdown.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/goblinai/GoblinAIHistoryDropdown.tsx`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/goblinai/GoblinAIHistoryDropdown.tsx
git commit -m "feat(goblinai): add GoblinAIHistoryDropdown component"
```

---

### Task 4: Update GoblinAIStandalone

**Files:**
- Modify: `src/components/goblinai/GoblinAIStandalone.tsx`

- [ ] **Step 1: Rewrite GoblinAIStandalone with history support**

Replace the entire file `src/components/goblinai/GoblinAIStandalone.tsx` with:

```typescript
'use client'

import { useState, useRef, useEffect } from 'react'
import { GoblinAIMessage } from './GoblinAIMessage'
import { GoblinAIComposer } from './GoblinAIComposer'
import { GoblinAIHistoryDropdown } from './GoblinAIHistoryDropdown'
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

interface DbMessage {
  id: string
  role: string
  content: string
  restatement_status: 'none' | 'pending_confirmation' | 'confirmed'
  created_at: string
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
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [activeConversationTitle, setActiveConversationTitle] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function handleNewConversation() {
    setMessages([])
    setActiveConversationId(null)
    setActiveConversationTitle(null)
    setPendingRestatement(null)
    setError(null)
  }

  async function handleSelectConversation(id: string, title: string | null) {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/assistant/conversations/${id}/messages`)
      if (!res.ok) throw new Error('Failed to load conversation')
      const data: { messages: DbMessage[] } = await res.json()

      const mapped: Message[] = data.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          id: crypto.randomUUID(),
          role: m.role as 'user' | 'assistant',
          content: m.content,
          serverMessageId: m.id,
          pendingConfirmation: m.role === 'assistant' && m.restatement_status === 'pending_confirmation',
        }))

      setMessages(mapped)
      setActiveConversationId(id)
      setActiveConversationTitle(title)

      // Restore pending restatement if the conversation was interrupted mid-confirmation
      const lastAssistant = [...data.messages]
        .reverse()
        .find((m) => m.role === 'assistant' && m.restatement_status === 'pending_confirmation')
      if (lastAssistant) {
        setPendingRestatement({
          conversationId: id,
          restatementMessageId: lastAssistant.id,
          restatement: lastAssistant.content,
        })
      } else {
        setPendingRestatement(null)
      }
    } catch {
      setError('Impossibile caricare la conversazione')
    } finally {
      setLoading(false)
    }
  }

  async function handleSend(message: string, mentions: MentionedCardRef[]) {
    setError(null)
    setLoading(true)

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
    }
    setMessages((prev) => [...prev, userMsg])

    // Set title client-side on first message of a new conversation
    if (!activeConversationId) {
      setActiveConversationTitle(message.slice(0, 50))
    }

    try {
      if (mentions.length === 0) {
        const res = await fetch('/api/assistant/rules/simple', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Request failed')
        }

        const data = await res.json()
        setActiveConversationId(data.conversationId)
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: data.answer }])
      } else {
        const res = await fetch('/api/assistant/rules/restatement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, mentions, conversationId: activeConversationId }),
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Request failed')
        }

        const data: RestatementResponse = await res.json()
        setActiveConversationId(data.conversationId)

        if (!data.requiresConfirmation && data.answer) {
          setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: data.answer! }])
        } else if (data.requiresConfirmation && data.messageId) {
          setPendingRestatement({
            conversationId: data.conversationId,
            restatementMessageId: data.messageId,
            restatement: data.restatement,
          })
          setMessages((prev) => [...prev, {
            id: data.messageId as string,
            role: 'assistant',
            content: data.restatement,
            pendingConfirmation: true,
            serverMessageId: data.messageId as string,
          }])
        }
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
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-bold">GoblinAI</h1>
          <p className="text-xs text-white/40 truncate">
            {activeConversationTitle ?? 'MTG Rules Assistant'}
          </p>
        </div>
        <GoblinAIHistoryDropdown
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
        />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && !loading && (
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/giovannidiplacido/MBPro/CursorProject/TheGathering && npx tsc --noEmit
```

Expected: no errors. If errors appear, fix before committing.

- [ ] **Step 3: Commit**

```bash
git add src/components/goblinai/GoblinAIStandalone.tsx
git commit -m "feat(goblinai): add conversation history with resume and new conversation support"
```

---

### Task 5: Push

- [ ] **Step 1: Push to origin/dev**

```bash
git push origin dev
```
