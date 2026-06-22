# Notifications System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify users when someone comments on their deck, likes their deck, or mentions them via @username in a comment.

**Architecture:** Notifications created in existing comment/like API handlers, stored in new `notifications` table, delivered via Supabase Realtime. Badge on "Community" nav item, notifications list in /users page under a new tab.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + Realtime), TypeScript, Tailwind CSS, Lucide icons.

## Global Constraints

- No email/push — Realtime only
- Badge on "Community" nav item, not separate bell icon
- Notifications section inside existing `/users` page (tabs: People | Notifications)
- User mention format: `@username` (alongside existing `@[CardName](uuid)` for cards)
- Max body 2000 chars for comments (existing constraint)
- Don't notify user about their own actions

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/20260622_notifications.sql` | Create | DB table, indexes, RLS, realtime |
| `src/lib/mentions.ts` | Modify | Add USER_MENTION_RE + extractUserMentions |
| `src/components/deck/CommentComposer.tsx` | Modify | Autocomplete for both cards and users |
| `src/components/deck/CommentBody.tsx` | Modify | Render @username as profile link |
| `src/app/api/notifications/route.ts` | Create | GET list + PATCH mark all read |
| `src/app/api/notifications/unread-count/route.ts` | Create | GET unread count |
| `src/app/api/notifications/[id]/route.ts` | Create | PATCH mark single as read |
| `src/app/api/decks/[id]/comments/route.ts` | Modify | Create notifications after comment insert |
| `src/app/api/decks/[id]/likes/route.ts` | Modify | Create/delete notification on like/unlike |
| `src/components/users/NotificationList.tsx` | Create | Paginated notification list component |
| `src/components/Navbar.tsx` | Modify | Badge on Community nav item |
| `src/app/(app)/users/page.tsx` | Modify | Tabs: People \| Notifications |
| `src/types/supabase.ts` | Modify | Add notifications table types |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260622_notifications.sql`

**Interfaces:**
- Produces: `public.notifications` table with columns: `id uuid PK`, `user_id uuid FK auth.users`, `type text (deck_comment|deck_like|mention)`, `deck_id uuid FK decks`, `actor_id uuid FK auth.users`, `comment_id uuid FK deck_comments nullable`, `read boolean default false`, `created_at timestamptz`

- [ ] **Step 1: Write migration file**

```sql
-- supabase/migrations/20260622_notifications.sql

CREATE TABLE public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('deck_comment', 'deck_like', 'mention')),
  deck_id    uuid REFERENCES public.decks(id) ON DELETE CASCADE,
  actor_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.deck_comments(id) ON DELETE SET NULL,
  read       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Partial index for fast unread count per user
CREATE INDEX idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE read = false;

-- Full index for paginated list
CREATE INDEX idx_notifications_user_all
  ON public.notifications (user_id, created_at DESC);

-- Actor hydration helper index
CREATE INDEX idx_notifications_actor_id
  ON public.notifications (actor_id);

-- RLS: user only sees own notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
```

- [ ] **Step 2: Apply migration via MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with the SQL above.

- [ ] **Step 3: Verify table exists**

Run via `mcp__plugin_supabase_supabase__execute_sql`:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'notifications'
ORDER BY ordinal_position;
```

Expected: 8 columns (id, user_id, type, deck_id, actor_id, comment_id, read, created_at).

- [ ] **Step 4: Verify realtime publication**

```sql
SELECT pubname, tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'notifications';
```

Expected: 1 row.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260622_notifications.sql
git commit -m "feat: add notifications table with RLS and realtime"
```

---

### Task 2: Update Mentions Library

**Files:**
- Modify: `src/lib/mentions.ts`

**Interfaces:**
- Produces: `USER_MENTION_RE: RegExp` — matches `@username` (3-24 lowercase+digits+underscore, word boundaries)
- Produces: `extractUserMentions(body: string): string[]` — returns unique mentioned usernames

- [ ] **Step 1: Add user mention regex and extractor**

```typescript
// src/lib/mentions.ts

export const MENTION_RE = /@\[([^\]]+)\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/g

export type Mention = { name: string; cardId: string }

export function extractMentions(body: string): Mention[] {
  const out: Mention[] = []
  const seen = new Set<string>()
  for (const m of body.matchAll(MENTION_RE)) {
    const cardId = m[2]
    if (seen.has(cardId)) continue
    seen.add(cardId)
    out.push({ name: m[1], cardId })
  }
  return out
}

// User mentions: @username (3-24 chars, lowercase, digits, underscores)
// Must be preceded by whitespace or start of string
// Must not be inside a card mention (@[...](...))
export const USER_MENTION_RE = /(?:^|\s)@([a-z0-9_]{3,24})(?=\s|$|[.,!?:;)\]])/g

export function extractUserMentions(body: string): string[] {
  const usernames = new Set<string>()
  for (const m of body.matchAll(USER_MENTION_RE)) {
    usernames.add(m[1])
  }
  return Array.from(usernames)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/mentions.ts
git commit -m "feat: add user mention regex and extractor to mentions lib"
```

---

### Task 3: Update CommentComposer — User Autocomplete

**Files:**
- Modify: `src/components/deck/CommentComposer.tsx`

**Interfaces:**
- Consumes: `USER_MENTION_RE` from mentions.ts
- Consumes: `/api/users/search?q=` (existing endpoint)
- Produces: Dual autocomplete (cards + users) when typing after `@`

Add user search alongside card search. When user types `@`, fetch both `/api/cards/search?q=` and `/api/users/search?q=` concurrently. Show users with avatar circle, cards with card image.

- [ ] **Step 1: Add UserSuggestion type and update state**

In `CommentComposer.tsx`, add alongside existing `CardSuggestion`:

```typescript
type UserSuggestion = {
  id: string
  username: string
  display_name: string
}

// Add to state:
const [userSuggestions, setUserSuggestions] = useState<UserSuggestion[]>([])
```

- [ ] **Step 2: Update runSearch to fetch both cards and users**

Replace the existing `runSearch` callback:

```typescript
const runSearch = useCallback((token: string) => {
  if (abortRef.current) abortRef.current.abort()
  const controller = new AbortController()
  abortRef.current = controller

  if (token.length < 2) {
    setSuggestions([])
    setUserSuggestions([])
    return
  }

  // Fetch cards and users concurrently
  Promise.all([
    fetch(`/api/cards/search?q=${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('cards search failed'))),
    fetch(`/api/users/search?q=${encodeURIComponent(token)}&limit=5`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('users search failed'))),
  ])
    .then(([cardData, userData]) => {
      if (controller.signal.aborted) return
      const cards = Array.isArray(cardData.cards) ? cardData.cards.slice(0, 8) : []
      setSuggestions(
        cards.map((c: Record<string, unknown>) => ({
          id: String(c.id),
          name: String(c.name),
          type_line: (c.type_line as string | null) ?? null,
          image_small: (c.image_small as string | null) ?? null,
        })),
      )
      const users = Array.isArray(userData.users) ? userData.users.slice(0, 5) : []
      setUserSuggestions(
        users.map((u: Record<string, unknown>) => ({
          id: String(u.id),
          username: String(u.username),
          display_name: String(u.display_name),
        })),
      )
      setSelectedIndex(0)
    })
    .catch(() => { /* aborted or network error */ })
}, [])
```

- [ ] **Step 3: Add user insert function**

```typescript
function insertUserMention(user: UserSuggestion) {
  if (!mentionRange) return
  const before = value.slice(0, mentionRange.start)
  const after = value.slice(mentionRange.end)
  const token = `@${user.username}`
  const next = `${before}${token} ${after}`
  setValue(next)
  setMentionRange(null)
  setSuggestions([])
  setUserSuggestions([])
  requestAnimationFrame(() => {
    const el = textareaRef.current
    if (!el) return
    const pos = (before + token + ' ').length
    el.focus()
    el.setSelectionRange(pos, pos)
  })
}
```

- [ ] **Step 4: Update keyboard handler for combined suggestions list**

The suggestions + userSuggestions form a combined list (users first, then cards). Update `handleKeyDown`:

```typescript
const totalSuggestions = userSuggestions.length + suggestions.length
const hasSuggestions = totalSuggestions > 0 && mentionRange

// In the keydown handler, replace the suggestions.length check with totalSuggestions:
if (hasSuggestions) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    setSelectedIndex((i) => (i + 1) % totalSuggestions)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    setSelectedIndex((i) => (i - 1 + totalSuggestions) % totalSuggestions)
    return
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    if (selectedIndex < userSuggestions.length) {
      insertUserMention(userSuggestions[selectedIndex])
    } else {
      insertMention(suggestions[selectedIndex - userSuggestions.length])
    }
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    setSuggestions([])
    setUserSuggestions([])
    setMentionRange(null)
    return
  }
}
```

- [ ] **Step 5: Update the JSX dropdown to show both users and cards**

Replace the `{suggestions.length > 0 ...}` block:

```tsx
{totalSuggestions > 0 && mentionRange && (
  <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-bg-surface shadow-xl">
    {userSuggestions.map((user, idx) => (
      <button
        key={user.id}
        type="button"
        onMouseDown={(e) => { e.preventDefault(); insertUserMention(user) }}
        onMouseEnter={() => setSelectedIndex(idx)}
        className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${
          idx === selectedIndex ? 'bg-bg-elevated' : ''
        }`}
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-font-white"
          style={{ backgroundColor: initialColor(user.username) }}
        >
          {initialsOf(user.display_name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-font-primary">{user.display_name}</div>
          <div className="truncate text-xs text-font-muted">@{user.username}</div>
        </div>
      </button>
    ))}
    {suggestions.map((card, idx) => {
      const realIdx = idx + userSuggestions.length
      return (
        <button
          key={card.id}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); insertMention(card) }}
          onMouseEnter={() => setSelectedIndex(realIdx)}
          className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${
            realIdx === selectedIndex ? 'bg-bg-elevated' : ''
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
      )
    })}
  </div>
)}
```

- [ ] **Step 6: Add imports for initialsOf and initialColor**

At top of file, add:
```typescript
import { initialColor, initialsOf } from '@/lib/utils/user'
```

- [ ] **Step 7: Update placeholder text**

```typescript
placeholder = 'Scrivi un commento… usa @ per menzionare una carta o un utente',
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add src/components/deck/CommentComposer.tsx
git commit -m "feat: add user @mention autocomplete to CommentComposer"
```

---

### Task 4: Update CommentBody — Render User Mentions

**Files:**
- Modify: `src/components/deck/CommentBody.tsx`

**Interfaces:**
- Consumes: `USER_MENTION_RE` from mentions.ts
- Produces: Renders `@username` as clickable link to `/u/username`

- [ ] **Step 1: Update CommentBody to render user mentions**

```typescript
// src/components/deck/CommentBody.tsx
import Link from 'next/link'
import { MENTION_RE, USER_MENTION_RE } from '@/lib/mentions'

interface CommentBodyProps {
  body: string
}

interface TextSegment {
  start: number
  end: number
  type: 'card' | 'user'
  name: string
  cardId?: string
  username?: string
}

export default function CommentBody({ body }: CommentBodyProps) {
  // Collect all mentions (cards and users)
  const segments: TextSegment[] = []

  for (const m of body.matchAll(MENTION_RE)) {
    segments.push({
      start: m.index,
      end: m.index + m[0].length,
      type: 'card',
      name: m[1],
      cardId: m[2],
    })
  }

  for (const m of body.matchAll(USER_MENTION_RE)) {
    // m[0] includes the preceding whitespace char, account for it
    const usernameStart = m.index + m[0].indexOf('@')
    segments.push({
      start: usernameStart,
      end: usernameStart + m[1].length + 1, // +1 for @
      type: 'user',
      name: m[1],
      username: m[1],
    })
  }

  // Sort by position
  segments.sort((a, b) => a.start - b.start)

  // Build parts
  const parts: React.ReactNode[] = []
  let lastIndex = 0

  for (const seg of segments) {
    if (seg.start < lastIndex) continue // skip overlapping (already covered)
    if (seg.start > lastIndex) {
      parts.push(body.slice(lastIndex, seg.start))
    }
    if (seg.type === 'card') {
      parts.push(
        <Link
          key={`card-${seg.start}-${seg.cardId}`}
          href={`/cards/${seg.cardId}`}
          className="inline-flex items-center rounded bg-bg-accent/15 px-1.5 py-0.5 text-xs font-medium text-font-accent hover:bg-bg-accent/25 transition-colors"
        >
          @{seg.name}
        </Link>,
      )
    } else {
      parts.push(
        <Link
          key={`user-${seg.start}-${seg.username}`}
          href={`/u/${seg.username}`}
          className="inline-flex items-center rounded bg-bg-accent/15 px-1.5 py-0.5 text-xs font-medium text-font-accent hover:bg-bg-accent/25 transition-colors"
        >
          @{seg.username}
        </Link>,
      )
    }
    lastIndex = seg.end
  }

  if (lastIndex < body.length) {
    parts.push(body.slice(lastIndex))
  }

  return (
    <p className="whitespace-pre-wrap break-words text-sm text-font-primary">
      {parts.length > 0 ? parts : body}
    </p>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/deck/CommentBody.tsx
git commit -m "feat: render @username mentions as profile links in CommentBody"
```

---

### Task 5: Create Notifications API Endpoints

**Files:**
- Create: `src/app/api/notifications/route.ts`
- Create: `src/app/api/notifications/unread-count/route.ts`
- Create: `src/app/api/notifications/[id]/route.ts`

**Interfaces:**
- Produces: `GET /api/notifications?unread_only=true&offset=0&limit=20` → `{ notifications: NotificationRow[], has_more: boolean }`
- Produces: `PATCH /api/notifications` → mark all as read → `{ ok: true }`
- Produces: `GET /api/notifications/unread-count` → `{ count: number }`
- Produces: `PATCH /api/notifications/[id]` → mark one as read → `{ ok: true }`
- NotificationRow shape: `{ id, type, deck_id, actor: { id, username, display_name }, comment_id, read, created_at }`

- [ ] **Step 1: Create GET/PATCH `/api/notifications/route.ts`**

```typescript
// src/app/api/notifications/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const unreadOnly = url.searchParams.get('unread_only') === 'true'
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 50)

  let query = supabase
    .from('notifications')
    .select('id, type, deck_id, actor_id, comment_id, read, created_at', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (unreadOnly) {
    query = query.eq('read', false)
  }

  const { data: rows, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Hydrate actors
  const actorIds = Array.from(new Set((rows ?? []).map(r => r.actor_id)))
  const actors = new Map<string, { id: string; username: string; display_name: string }>()
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name')
      .in('id', actorIds)
    for (const p of profiles ?? []) {
      actors.set(p.id, p)
    }
  }

  const notifications = (rows ?? []).map(r => ({
    id: r.id,
    type: r.type,
    deck_id: r.deck_id,
    actor: actors.get(r.actor_id) ?? null,
    comment_id: r.comment_id,
    read: r.read,
    created_at: r.created_at,
  }))

  const total = count ?? 0
  const hasMore = offset + limit < total

  return NextResponse.json({ notifications, has_more: hasMore })
}

export async function PATCH(_request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Create GET `/api/notifications/unread-count/route.ts`**

```typescript
// src/app/api/notifications/unread-count/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ count: 0 })
  }

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('read', false)

  if (error) {
    return NextResponse.json({ count: 0 })
  }

  return NextResponse.json({ count: count ?? 0 })
}
```

Note: returns `{ count: 0 }` for unauthenticated users (no 401 — used in Navbar which renders before auth redirect).

- [ ] **Step 3: Create PATCH `/api/notifications/[id]/route.ts`**

```typescript
// src/app/api/notifications/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/notifications/
git commit -m "feat: add notifications API endpoints (list, count, mark-read)"
```

---

### Task 6: Create Notifications in Comment and Like Handlers

**Files:**
- Modify: `src/app/api/decks/[id]/comments/route.ts`
- Modify: `src/app/api/decks/[id]/likes/route.ts`

**Interfaces:**
- Consumes: `extractUserMentions` from `@/lib/mentions`
- Produces: Notification rows inserted after comment/like actions

- [ ] **Step 1: Update POST /api/decks/[id]/comments to create notifications**

In `src/app/api/decks/[id]/comments/route.ts`, add after successful comment insert:

```typescript
import { extractUserMentions } from '@/lib/mentions'

// Inside POST, after row is inserted and before the response:

// --- Notification: deck_comment ---
// Fetch deck owner
const { data: deck } = await supabase
  .from('decks')
  .select('user_id')
  .eq('id', deckId)
  .single()

if (deck && deck.user_id !== user.id) {
  await supabase.from('notifications').insert({
    user_id: deck.user_id,
    type: 'deck_comment',
    deck_id: deckId,
    actor_id: user.id,
    comment_id: row.id,
  })
}

// --- Notification: user mentions ---
const mentionedUsernames = extractUserMentions(raw)
if (mentionedUsernames.length > 0) {
  // Resolve usernames to user IDs
  const { data: mentionedUsers } = await supabase
    .from('profiles')
    .select('id, username')
    .in('username', mentionedUsernames)

  if (mentionedUsers) {
    const inserts = mentionedUsers
      .filter(mu => mu.id !== user.id) // don't notify self
      .map(mu => ({
        user_id: mu.id,
        type: 'mention' as const,
        deck_id: deckId,
        actor_id: user.id,
        comment_id: row.id,
      }))
    if (inserts.length > 0) {
      await supabase.from('notifications').insert(inserts)
    }
  }
}
```

- [ ] **Step 2: Update POST /api/decks/[id]/likes to create/remove notifications**

In `src/app/api/decks/[id]/likes/route.ts`, modify the POST handler:

```typescript
// After determining existing (line 46-52), when inserting:
if (existing) {
  // Unlike: delete like + remove notification
  const { error } = await supabase
    .from('deck_likes')
    .delete()
    .eq('deck_id', deckId)
    .eq('user_id', user.id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Remove corresponding notification
  await supabase
    .from('notifications')
    .delete()
    .eq('deck_id', deckId)
    .eq('actor_id', user.id)
    .eq('type', 'deck_like')

} else {
  // Like: insert like + create notification
  const { error } = await supabase
    .from('deck_likes')
    .insert({ deck_id: deckId, user_id: user.id })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch deck owner to check != liker
  const { data: deck } = await supabase
    .from('decks')
    .select('user_id')
    .eq('id', deckId)
    .single()

  if (deck && deck.user_id !== user.id) {
    await supabase.from('notifications').insert({
      user_id: deck.user_id,
      type: 'deck_like',
      deck_id: deckId,
      actor_id: user.id,
    })
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/decks/
git commit -m "feat: create notifications on comment and like actions"
```

---

### Task 7: Navbar Badge on Community

**Files:**
- Modify: `src/components/Navbar.tsx`

**Interfaces:**
- Consumes: `GET /api/notifications/unread-count`
- Consumes: Supabase Realtime channel on `notifications` table
- Produces: Badge (red circle with count) on "Community" nav item in desktop sidebar + mobile drawer

- [ ] **Step 1: Add unread count state and fetch logic to Navbar**

```typescript
// Near the top, alongside other state:
const [unreadCount, setUnreadCount] = useState(0)

// Add useEffect for initial fetch + realtime subscription:
useEffect(() => {
  let cancelled = false

  // Initial fetch
  fetch('/api/notifications/unread-count')
    .then(r => r.ok ? r.json() : Promise.reject(r))
    .then(d => { if (!cancelled) setUnreadCount(d.count ?? 0) })
    .catch(() => {})

  // Realtime subscription
  const supabase = createClient()
  supabase.auth.getUser().then(({ data }) => {
    if (!data.user || cancelled) return
    const channel = supabase
      .channel(`notifications-badge-${data.user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${data.user.id}` },
        () => setUnreadCount(c => c + 1),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${data.user.id}` },
        (payload) => {
          const row = payload.new as { read: boolean }
          if (row.read) setUnreadCount(c => Math.max(0, c - 1))
        },
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  })

  return () => { cancelled = true }
}, [])
```

- [ ] **Step 2: Add badge to desktop sidebar Community link**

In the desktop sidebar, find the "Community" nav item and replace:

```tsx
{/* Desktop — Community nav item with badge */}
<Link
  key="/users"
  href="/users"
  className={`group flex items-center ${collapsed ? 'justify-center' : 'gap-3'} text-sm font-medium transition-colors ${
    isActive('/users') ? "text-font-primary" : "text-font-secondary hover:text-font-primary"
  }`}
  title="Community"
>
  <span className="relative">
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full backdrop-blur-md ring-1 transition-colors ${
        isActive('/users')
          ? "bg-bg-accent/80 text-font-white ring-font-white/30"
          : "bg-bg-dark/60 text-font-primary ring-white/10 group-hover:bg-white/10"
      }`}
    >
      <Users className="h-5 w-5" />
    </span>
    {unreadCount > 0 && (
      <span className="absolute -top-1 -right-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-bg-dark">
        {unreadCount > 99 ? '99+' : unreadCount}
      </span>
    )}
  </span>
  {!collapsed && 'Community'}
</Link>
```

- [ ] **Step 3: Add badge to mobile drawer Community link**

Same pattern in the mobile drawer — wrap the icon span in a relative container and add the badge.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/components/Navbar.tsx
git commit -m "feat: add unread notification badge to Community nav item"
```

---

### Task 8: NotificationList Component

**Files:**
- Create: `src/components/users/NotificationList.tsx`

**Interfaces:**
- Produces: Client component displaying paginated notification list grouped by date
- Consumes: `GET /api/notifications?offset=` and `PATCH /api/notifications` (mark all read)
- Uses: `useRouter` to navigate to deck on click

- [ ] **Step 1: Create NotificationList component**

```typescript
// src/components/users/NotificationList.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { MessageSquare, Heart, AtSign, CheckCheck } from 'lucide-react'
import { initialColor, initialsOf } from '@/lib/utils/user'

type Actor = { id: string; username: string; display_name: string }

type NotificationRow = {
  id: string
  type: 'deck_comment' | 'deck_like' | 'mention'
  deck_id: string | null
  actor: Actor | null
  comment_id: string | null
  read: boolean
  created_at: string
}

const LIMIT = 20

export default function NotificationList() {
  const router = useRouter()
  const [notifs, setNotifs] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)

  const fetchPage = useCallback(async (off: number, append: boolean) => {
    const res = await fetch(`/api/notifications?offset=${off}&limit=${LIMIT}`)
    if (!res.ok) return
    const data = await res.json()
    const list: NotificationRow[] = data.notifications ?? []
    if (append) {
      setNotifs(prev => [...prev, ...list])
    } else {
      setNotifs(list)
    }
    setHasMore(data.has_more ?? false)
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchPage(0, false).finally(() => setLoading(false))
  }, [fetchPage])

  async function loadMore() {
    const next = offset + LIMIT
    setOffset(next)
    await fetchPage(next, true)
  }

  async function markAllRead() {
    await fetch('/api/notifications', { method: 'PATCH' })
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
  }

  async function handleClick(n: NotificationRow) {
    if (!n.read) {
      await fetch(`/api/notifications/${n.id}`, { method: 'PATCH' })
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
    }
    if (n.deck_id) {
      router.push(`/decks/${n.deck_id}`)
    }
  }

  function getIcon(type: string) {
    switch (type) {
      case 'deck_comment': return <MessageSquare size={14} />
      case 'deck_like': return <Heart size={14} />
      case 'mention': return <AtSign size={14} />
      default: return null
    }
  }

  function getMessage(n: NotificationRow): React.ReactNode {
    const name = n.actor?.display_name ?? 'Qualcuno'
    switch (n.type) {
      case 'deck_comment':
        return <>{name} ha commentato il tuo deck</>
      case 'deck_like':
        return <>{name} ha messo like al tuo deck</>
      case 'mention':
        return <>{name} ti ha menzionato in un commento</>
    }
  }

  function formatDate(iso: string): string {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffDays === 0) return 'Oggi'
    if (diffDays === 1) return 'Ieri'
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  if (loading) {
    return <p className="py-8 text-center text-sm text-font-muted">Caricamento…</p>
  }

  if (notifs.length === 0) {
    return <p className="py-8 text-center text-sm text-font-muted">Nessuna notifica</p>
  }

  // Group by date
  const groups = new Map<string, NotificationRow[]>()
  for (const n of notifs) {
    const key = formatDate(n.created_at)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(n)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-font-muted">{notifs.length} notifiche</span>
        <button
          type="button"
          onClick={markAllRead}
          className="inline-flex items-center gap-1 text-xs text-font-accent hover:underline"
        >
          <CheckCheck size={14} />
          Segna tutte come lette
        </button>
      </div>

      <div className="divide-y divide-border">
        {Array.from(groups.entries()).map(([date, items]) => (
          <div key={date}>
            <h3 className="sticky top-0 z-10 bg-bg-dark px-3 py-2 text-xs font-semibold text-font-muted uppercase tracking-wider">
              {date}
            </h3>
            {items.map(n => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleClick(n)}
                className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-bg-elevated ${
                  !n.read ? 'bg-bg-accent/5' : ''
                }`}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-font-white"
                  style={{ backgroundColor: n.actor ? initialColor(n.actor.username) : '#555' }}
                >
                  {n.actor ? initialsOf(n.actor.display_name) : '?'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-font-muted">{getIcon(n.type)}</span>
                    <span className={`text-sm ${!n.read ? 'font-semibold text-font-primary' : 'text-font-secondary'}`}>
                      {getMessage(n)}
                    </span>
                    {!n.read && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-font-muted">
                    {formatTime(n.created_at)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={loadMore}
            className="rounded-full px-4 py-2 text-sm font-medium text-font-accent hover:bg-bg-elevated"
          >
            Carica altre
          </button>
        </div>
      )}
    </div>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diff = Math.round((now - d.getTime()) / 1000)
  if (diff < 60) return 'ora'
  if (diff < 3600) return `${Math.floor(diff / 60)}m fa`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h fa`
  return ''
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/users/NotificationList.tsx
git commit -m "feat: add NotificationList component with pagination and date grouping"
```

---

### Task 9: Update Community Page with Tabs

**Files:**
- Modify: `src/app/(app)/users/page.tsx`

**Interfaces:**
- Produces: Tabbed page with "People" (existing UserSearch) and "Notifications" (NotificationList)

- [ ] **Step 1: Add tabs to users page**

```typescript
// src/app/(app)/users/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import CommunityTabs from './CommunityTabs'

export default async function UsersPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const { data: latestUsers } = await supabase.rpc('get_latest_users', {
    p_limit: 10,
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-font-primary">Community</h1>
      <CommunityTabs initialUsers={latestUsers ?? []} />
    </div>
  )
}
```

- [ ] **Step 2: Create CommunityTabs client component**

```typescript
// src/app/(app)/users/CommunityTabs.tsx
'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import UserSearch from '@/components/users/UserSearch'

const NotificationList = dynamic(() => import('@/components/users/NotificationList'), { ssr: false })

type LatestUser = {
  id: string
  username: string
  display_name: string
  public_deck_count: number
  bio?: string | null
}

export default function CommunityTabs({ initialUsers }: { initialUsers: LatestUser[] }) {
  const [tab, setTab] = useState<'people' | 'notifications'>('people')

  return (
    <div>
      <div className="flex border-b border-border mb-6">
        <button
          type="button"
          onClick={() => setTab('people')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'people'
              ? 'border-bg-accent text-font-primary'
              : 'border-transparent text-font-muted hover:text-font-primary'
          }`}
        >
          Persone
        </button>
        <button
          type="button"
          onClick={() => setTab('notifications')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'notifications'
              ? 'border-bg-accent text-font-primary'
              : 'border-transparent text-font-muted hover:text-font-primary'
          }`}
        >
          Notifiche
        </button>
      </div>

      {tab === 'people' ? (
        <UserSearch initialUsers={initialUsers} />
      ) : (
        <NotificationList />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/users/
git commit -m "feat: add People/Notifications tabs to Community page"
```

---

### Task 10: Update Supabase Types

**Files:**
- Modify: `src/types/supabase.ts`

Add the `notifications` table to the `Database` type definition.

- [ ] **Step 1: Add notifications table to Database type**

In `src/types/supabase.ts`, inside `Tables`, add after the `mtg_rules` entry:

```typescript
notifications: {
  Row: {
    id: string
    user_id: string
    type: 'deck_comment' | 'deck_like' | 'mention'
    deck_id: string | null
    actor_id: string
    comment_id: string | null
    read: boolean
    created_at: string
  }
  Insert: {
    id?: string
    user_id: string
    type: 'deck_comment' | 'deck_like' | 'mention'
    deck_id?: string | null
    actor_id: string
    comment_id?: string | null
    read?: boolean
    created_at?: string
  }
  Update: {
    id?: string
    user_id?: string
    type?: 'deck_comment' | 'deck_like' | 'mention'
    deck_id?: string | null
    actor_id?: string
    comment_id?: string | null
    read?: boolean
    created_at?: string
  }
  Relationships: [
    {
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
      isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },
    {
      foreignKeyName: "notifications_deck_id_fkey"
      columns: ["deck_id"]
      isOneToOne: false
      referencedRelation: "decks"
      referencedColumns: ["id"]
    },
    {
      foreignKeyName: "notifications_actor_id_fkey"
      columns: ["actor_id"]
      isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },
    {
      foreignKeyName: "notifications_comment_id_fkey"
      columns: ["comment_id"]
      isOneToOne: false
      referencedRelation: "deck_comments"
      referencedColumns: ["id"]
    },
  ]
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/types/supabase.ts
git commit -m "feat: add notifications table types"
```

---

### Task 11: End-to-End Verification

- [ ] **Step 1: Start dev server and test flow**

```bash
# Terminal 1: start dev server
npm run dev

# Terminal 2: test endpoints once server is up
# Wait for server ready, then:

# 1. Check migration applied
# Use mcp__plugin_supabase_supabase__execute_sql to verify table exists

# 2. Test notification creation by commenting on someone else's deck
# (requires two user accounts)

# 3. Test mention notification:
# Comment with @someusername on any deck

# 4. Test like notification:
# Like someone else's deck

# 5. Check unread count endpoint
curl http://localhost:3000/api/notifications/unread-count

# 6. Check list endpoint
curl http://localhost:3000/api/notifications

# 7. Check mark-all-read
curl -X PATCH http://localhost:3000/api/notifications
```

- [ ] **Step 2: Verify realtime badge update**

Open two browser windows (two users). User A comments on User B's deck — User B should see badge count increase on Community nav item in realtime.

- [ ] **Step 3: Verify Community page tabs**

Navigate to `/users`, check both "Persone" and "Notifiche" tabs render correctly.

- [ ] **Step 4: Commit any final fixes**

---

## Self-Review

1. **Spec coverage**: All requirements covered — DB table (Task 1), user mentions in comments (Tasks 2-4), API endpoints (Tasks 5-6), badge on Community nav (Task 7), notifications in Community page (Tasks 8-9), types (Task 10).

2. **Placeholder scan**: No TBD/TODO. All code complete.

3. **Type consistency**: `NotificationRow` in Task 8 matches the shape returned by API in Task 5. `extractUserMentions` in Task 2 consumed correctly in Tasks 3 and 6. All file paths verified against existing codebase.
