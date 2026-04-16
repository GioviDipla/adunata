# Game History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add game history with log viewer, "terminate game" on active lobbies, game renaming, and historical game deletion.

**Architecture:** Add a `name` column to `game_lobbies`. Auto-generate the name when a game finishes. Show finished games in a history section on the play page. A new `/play/[lobbyId]/history` route renders the full game log with clickable card names.

**Tech Stack:** Next.js App Router, Supabase, TypeScript

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260416200000_game_lobby_name.sql` | Create | Add `name` column to game_lobbies |
| `src/types/supabase.ts` | Modify | Add `name` field to game_lobbies types |
| `src/app/api/lobbies/[id]/route.ts` | Modify | Add PATCH for rename, fix DELETE for finished (hard-delete), auto-name on finish |
| `src/app/api/game/[id]/action/route.ts` | Modify | Auto-name on concede |
| `src/components/play/ActiveLobbiesList.tsx` | Modify | "Termina" vs "Elimina" label |
| `src/app/(app)/play/page.tsx` | Modify | Fetch finished lobbies, render GameHistoryList |
| `src/components/play/GameHistoryList.tsx` | Create | List of finished games with rename/delete/view |
| `src/app/(app)/play/[lobbyId]/history/page.tsx` | Create | Server page for log viewer |
| `src/components/play/GameHistoryView.tsx` | Create | Full log viewer with card preview |

---

### Task 1: Migration + types for game name

**Files:**
- Create: `supabase/migrations/20260416200000_game_lobby_name.sql`
- Modify: `src/types/supabase.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260416200000_game_lobby_name.sql`:

```sql
ALTER TABLE public.game_lobbies ADD COLUMN name text;
```

- [ ] **Step 2: Apply via Supabase MCP**

Run: `mcp__plugin_supabase_supabase__apply_migration` with the SQL and title `game_lobby_name`.

- [ ] **Step 3: Add `name` to supabase types**

In `src/types/supabase.ts`, add `name: string | null` to game_lobbies `Row`, `name?: string | null` to `Insert`, and `name?: string | null` to `Update`.

In the `Row` section (after `updated_at: string`):
```typescript
          name: string | null
```

In the `Insert` section (after `updated_at?: string`):
```typescript
          name?: string | null
```

In the `Update` section, add:
```typescript
          name?: string | null
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260416200000_game_lobby_name.sql src/types/supabase.ts
git commit -m "feat(game): add name column to game_lobbies for game history"
```

---

### Task 2: Auto-generate game name on finish + PATCH rename + DELETE finished

**Files:**
- Modify: `src/app/api/lobbies/[id]/route.ts`
- Modify: `src/app/api/game/[id]/action/route.ts`

This task adds:
1. A helper function to generate the game name from player/deck data
2. Auto-name when a game finishes (in both DELETE playing and concede action)
3. PATCH handler for renaming
4. DELETE handler for finished lobbies (hard-delete instead of noop)

- [ ] **Step 1: Add name generation helper and PATCH handler to lobbies route**

In `src/app/api/lobbies/[id]/route.ts`, add a helper function at the top (after imports) and a new PATCH export:

After the imports, add:

```typescript
import { createAdminClient as createAdmin } from '@/lib/supabase/admin'

async function generateGameName(admin: ReturnType<typeof createAdmin>, lobbyId: string): Promise<string> {
  const { data: players } = await admin
    .from('game_players')
    .select('user_id, deck_id, seat_position')
    .eq('lobby_id', lobbyId)
    .order('seat_position')

  if (!players || players.length < 2) return `Game ${lobbyId.slice(0, 6)}`

  const names: string[] = []
  for (const p of players) {
    const { data: userData } = await admin.auth.admin.getUserById(p.user_id)
    const playerName = userData?.user?.email?.split('@')[0] ?? 'Player'
    const { data: deck } = await admin.from('decks').select('name').eq('id', p.deck_id).single()
    const deckName = deck?.name ?? 'Unknown Deck'
    names.push(`${deckName} — ${playerName}`)
  }

  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${names[0]} vs ${names[1]} — ${date}`
}
```

Note: the existing import `import { createAdminClient } from '@/lib/supabase/admin'` is already there. The `createAdmin` alias is just for the type annotation. Actually, just use the existing `createAdminClient` directly. The helper takes the already-created admin client as parameter.

Correct the helper signature to:

```typescript
async function generateGameName(admin: ReturnType<typeof createAdminClient>, lobbyId: string): Promise<string> {
```

Add the PATCH handler after the DELETE handler:

```typescript
/**
 * PATCH /api/lobbies/[id]
 * Rename a game. Only participants can rename.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: myPlayer } = await supabase
    .from('game_players')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!myPlayer) return NextResponse.json({ error: 'Not a participant' }, { status: 403 })

  const { name } = await request.json() as { name: string }
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('game_lobbies')
    .update({ name: name.trim() })
    .eq('id', lobbyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Auto-generate name in DELETE playing handler**

In the DELETE handler, in the `playing` section (around the line `await admin.from('game_lobbies').update({ status: 'finished', winner_id: opponentId })`), add the name generation:

Replace:
```typescript
    // Mark lobby finished with opponent as winner
    const { error: lobbyErr } = await admin
      .from('game_lobbies')
      .update({ status: 'finished', winner_id: opponentId })
      .eq('id', lobbyId)
```

With:
```typescript
    // Mark lobby finished with opponent as winner + auto-generate name
    const gameName = await generateGameName(admin, lobbyId)
    const { error: lobbyErr } = await admin
      .from('game_lobbies')
      .update({ status: 'finished', winner_id: opponentId, name: gameName })
      .eq('id', lobbyId)
```

- [ ] **Step 3: Fix DELETE for finished lobbies — hard-delete instead of noop**

Replace the `finished` noop block:

```typescript
  // Idempotent: already finished → nothing to do.
  if (lobby.status === 'finished') {
    return NextResponse.json({ status: 'finished', noop: true })
  }
```

With:

```typescript
  // Finished → hard-delete (only participants can delete)
  if (lobby.status === 'finished') {
    const { error } = await admin.from('game_lobbies').delete().eq('id', lobbyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: true })
  }
```

Note: `admin` is created after this block currently. Move `const admin = createAdminClient()` to before the `finished` check, i.e. right after the `isHost`/`isPlayer` check.

- [ ] **Step 4: Auto-generate name in concede action route**

In `src/app/api/game/[id]/action/route.ts`, in the concede handler (around line 57-61), add name generation.

Add the import at the top of the file (the `createAdminClient` is already imported):

After the existing imports, add a copy of the `generateGameName` helper. Since it's the same function, extract it to avoid duplication. Actually, for simplicity, inline it:

Replace:
```typescript
    // Update lobby with winner and finished status
    await admin
      .from('game_lobbies')
      .update({ winner_id: winnerId, status: 'finished' })
      .eq('id', lobbyId)
```

With:
```typescript
    // Auto-generate game name
    const { data: gamePlayers } = await admin
      .from('game_players')
      .select('user_id, deck_id, seat_position')
      .eq('lobby_id', lobbyId)
      .order('seat_position')

    let gameName = `Game ${lobbyId.slice(0, 6)}`
    if (gamePlayers && gamePlayers.length >= 2) {
      const parts: string[] = []
      for (const p of gamePlayers) {
        const { data: userData } = await admin.auth.admin.getUserById(p.user_id)
        const pName = userData?.user?.email?.split('@')[0] ?? 'Player'
        const { data: deck } = await admin.from('decks').select('name').eq('id', p.deck_id).single()
        parts.push(`${deck?.name ?? 'Unknown'} — ${pName}`)
      }
      const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      gameName = `${parts[0]} vs ${parts[1]} — ${date}`
    }

    // Update lobby with winner, finished status, and auto-generated name
    await admin
      .from('game_lobbies')
      .update({ winner_id: winnerId, status: 'finished', name: gameName })
      .eq('id', lobbyId)
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/lobbies/[id]/route.ts src/app/api/game/[id]/action/route.ts
git commit -m "feat(game): auto-name on finish, PATCH rename, DELETE finished games"
```

---

### Task 3: Update ActiveLobbiesList with "Termina" vs "Elimina" labels

**Files:**
- Modify: `src/components/play/ActiveLobbiesList.tsx`

- [ ] **Step 1: Change the close button title and confirm button text based on lobby status**

In `src/components/play/ActiveLobbiesList.tsx`, update the button title (line 105) and confirm button text:

Replace the confirm button text `'Confirm'` with a conditional:

Find:
```typescript
                      'Confirm'
```

Replace with:
```typescript
                      lobby.status === 'playing' ? 'Termina' : 'Elimina'
```

Update the X button title (line 105):

Find:
```typescript
                  title={lobby.status === 'playing' ? 'Concede and close' : 'Cancel lobby'}
```

Replace with:
```typescript
                  title={lobby.status === 'playing' ? 'Termina la partita' : 'Elimina lobby'}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/play/ActiveLobbiesList.tsx
git commit -m "feat(play): show Termina/Elimina labels based on lobby status"
```

---

### Task 4: Game History List component + play page integration

**Files:**
- Create: `src/components/play/GameHistoryList.tsx`
- Modify: `src/app/(app)/play/page.tsx`

- [ ] **Step 1: Create GameHistoryList component**

Create `src/components/play/GameHistoryList.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Trash2, Pencil, ScrollText, Check, X, Loader2 } from 'lucide-react'

interface HistoryGame {
  id: string
  name: string | null
  lobby_code: string
  winner_id: string | null
  updated_at: string
}

export default function GameHistoryList({ games, userId }: { games: HistoryGame[]; userId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete(lobbyId: string) {
    setDeleting(lobbyId)
    setError(null)
    try {
      const res = await fetch(`/api/lobbies/${lobbyId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to delete' }))
        setError(data.error ?? 'Failed to delete')
        return
      }
      setConfirmDelete(null)
      startTransition(() => router.refresh())
    } finally {
      setDeleting(null)
    }
  }

  async function handleRename(lobbyId: string) {
    if (!editName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/lobbies/${lobbyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to rename' }))
        setError(data.error ?? 'Failed to rename')
        return
      }
      setEditing(null)
      startTransition(() => router.refresh())
    } finally {
      setSaving(false)
    }
  }

  if (games.length === 0) return null

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-font-secondary">Game History</h2>
      <div className="flex flex-col gap-2">
        {games.map((game) => {
          const won = game.winner_id === userId
          const isEditing = editing === game.id
          const isConfirmingDelete = confirmDelete === game.id

          return (
            <div key={game.id} className="rounded-xl border border-border bg-bg-card px-4 py-3">
              <div className="flex items-center gap-2">
                {/* Name / edit */}
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(game.id)
                          if (e.key === 'Escape') setEditing(null)
                        }}
                        className="flex-1 rounded bg-bg-cell px-2 py-1 text-xs text-font-primary outline-none"
                        autoFocus
                      />
                      <button onClick={() => handleRename(game.id)} disabled={saving}
                        className="flex h-6 w-6 items-center justify-center rounded bg-bg-green text-font-white">
                        {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={12} />}
                      </button>
                      <button onClick={() => setEditing(null)} className="flex h-6 w-6 items-center justify-center rounded bg-bg-cell text-font-muted">
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium text-font-primary truncate">
                        {game.name ?? game.lobby_code}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-font-muted">
                          {new Date(game.updated_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                          won ? 'bg-bg-green/20 text-bg-green' : 'bg-bg-red/20 text-bg-red'
                        }`}>
                          {won ? 'Won' : 'Lost'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                {!isEditing && !isConfirmingDelete && (
                  <div className="flex items-center gap-1">
                    <Link href={`/play/${game.id}/history`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-font-muted hover:bg-bg-hover hover:text-font-accent"
                      title="View log">
                      <ScrollText size={14} />
                    </Link>
                    <button onClick={() => { setEditing(game.id); setEditName(game.name ?? game.lobby_code) }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-font-muted hover:bg-bg-hover hover:text-font-accent"
                      title="Rename">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setConfirmDelete(game.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-font-muted hover:bg-bg-red/10 hover:text-bg-red"
                      title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}

                {/* Delete confirmation */}
                {isConfirmingDelete && (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => handleDelete(game.id)} disabled={deleting === game.id || isPending}
                      className="rounded-md bg-bg-red px-2 py-1 text-[10px] font-bold text-font-white disabled:opacity-40">
                      {deleting === game.id ? <Loader2 size={11} className="animate-spin" /> : 'Elimina'}
                    </button>
                    <button onClick={() => setConfirmDelete(null)} disabled={deleting === game.id}
                      className="rounded-md bg-bg-cell px-2 py-1 text-[10px] font-bold text-font-secondary disabled:opacity-40">
                      Annulla
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {error && <p className="mt-2 text-xs text-bg-red">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Update play page to fetch finished lobbies and render GameHistoryList**

In `src/app/(app)/play/page.tsx`, add the import and query:

Add import:
```typescript
import GameHistoryList from '@/components/play/GameHistoryList'
```

After the `activeLobbies` query (around line 38), add:

```typescript
  const finishedLobbies = lobbyIds.length > 0
    ? (await supabase
        .from('game_lobbies')
        .select('id, name, lobby_code, winner_id, updated_at')
        .in('id', lobbyIds)
        .eq('status', 'finished')
        .order('updated_at', { ascending: false })
        .limit(50)
      ).data ?? []
    : []
```

In the JSX, after the `<div className="grid gap-4 sm:grid-cols-2">` block (after the CreateLobby/JoinLobby section), add:

```typescript
      {/* Game history */}
      <GameHistoryList games={finishedLobbies} userId={user.id} />
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/play/GameHistoryList.tsx src/app/(app)/play/page.tsx
git commit -m "feat(play): add game history list with rename/delete/view actions"
```

---

### Task 5: Game History Viewer page + component

**Files:**
- Create: `src/app/(app)/play/[lobbyId]/history/page.tsx`
- Create: `src/components/play/GameHistoryView.tsx`

- [ ] **Step 1: Create the history page (server component)**

Create `src/app/(app)/play/[lobbyId]/history/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import GameHistoryView from '@/components/play/GameHistoryView'
import type { CardMap, LogEntry } from '@/lib/game/types'

export default async function GameHistoryPage({
  params,
}: {
  params: Promise<{ lobbyId: string }>
}) {
  const { lobbyId } = await params
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const admin = createAdminClient()

  // Verify user is participant
  const { data: myPlayer } = await supabase
    .from('game_players')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!myPlayer) redirect('/play')

  // Fetch lobby metadata
  const { data: lobby } = await supabase
    .from('game_lobbies')
    .select('id, name, lobby_code, status, winner_id, started_at, updated_at')
    .eq('id', lobbyId)
    .single()

  if (!lobby || lobby.status !== 'finished') redirect('/play')

  // Fetch players
  const { data: players } = await supabase
    .from('game_players')
    .select('user_id, deck_id, seat_position, is_first')
    .eq('lobby_id', lobbyId)
    .order('seat_position')

  // Build player names
  const playerNames: Record<string, string> = {}
  for (const p of players ?? []) {
    const { data: userData } = await admin.auth.admin.getUserById(p.user_id)
    playerNames[p.user_id] = userData?.user?.email?.split('@')[0] ?? 'Player'
  }

  // Build cardMap (same logic as GET /api/game/[id])
  const cardMap: CardMap = {}
  let globalCounter = 0

  for (const player of players ?? []) {
    const { data: deckCards } = await admin
      .from('deck_cards')
      .select('card_id, quantity, board, card:cards!card_id(*)')
      .eq('deck_id', player.deck_id)

    if (!deckCards) continue

    const commanderCardIds = new Set<number>()
    for (const dc of deckCards) {
      if (dc.board === 'commander' && dc.card) commanderCardIds.add((dc.card as unknown as { id: number }).id)
    }

    for (const dc of deckCards) {
      if (!dc.card) continue
      const card = dc.card as unknown as {
        id: number; name: string; image_small: string | null; image_normal: string | null
        type_line: string; mana_cost: string | null; power: string | null; toughness: string | null
        oracle_text: string | null
      }

      if (dc.board === 'commander') {
        const iid = `ci-${++globalCounter}`
        cardMap[iid] = {
          cardId: card.id, name: card.name, imageSmall: card.image_small, imageNormal: card.image_normal,
          typeLine: card.type_line, manaCost: card.mana_cost, power: card.power, toughness: card.toughness,
          oracleText: card.oracle_text, isCommander: true, isToken: false,
        }
      } else if (dc.board === 'main') {
        for (let i = 0; i < dc.quantity; i++) {
          const iid = `ci-${++globalCounter}`
          cardMap[iid] = {
            cardId: card.id, name: card.name, imageSmall: card.image_small, imageNormal: card.image_normal,
            typeLine: card.type_line, manaCost: card.mana_cost, power: card.power, toughness: card.toughness,
            oracleText: card.oracle_text, isCommander: commanderCardIds.has(card.id), isToken: false,
          }
        }
      }
    }
  }

  // Fetch full game log
  const { data: logRows } = await supabase
    .from('game_log')
    .select('*')
    .eq('lobby_id', lobbyId)
    .order('seq', { ascending: true })

  const log: LogEntry[] = (logRows ?? []).map((row) => ({
    id: row.id,
    seq: row.seq,
    playerId: row.player_id,
    action: row.action,
    data: row.data as Record<string, unknown> | null,
    text: row.text,
    createdAt: row.created_at,
  }))

  return (
    <GameHistoryView
      gameName={lobby.name ?? lobby.lobby_code}
      winnerId={lobby.winner_id}
      playerNames={playerNames}
      userId={user.id}
      log={log}
      cardMap={cardMap}
      startedAt={lobby.started_at}
      finishedAt={lobby.updated_at}
    />
  )
}
```

- [ ] **Step 2: Create the GameHistoryView client component**

Create `src/components/play/GameHistoryView.tsx`:

```typescript
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useLongPress } from '@/lib/hooks/useLongPress'
import CardPreviewOverlay from '@/components/game/CardPreviewOverlay'
import type { PreviewState } from '@/components/game/CardPreviewOverlay'
import type { LogEntry, CardMap } from '@/lib/game/types'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

function toCardRow(cardId: number, data: CardMap[string]): CardRow {
  return {
    id: cardId, scryfall_id: '', name: data.name, mana_cost: data.manaCost ?? null,
    cmc: 0, type_line: data.typeLine, oracle_text: data.oracleText ?? null,
    colors: null, color_identity: [], rarity: '', set_code: '', set_name: '',
    collector_number: '', image_small: data.imageSmall ?? null, image_normal: data.imageNormal ?? null,
    image_art_crop: null, prices_usd: null, prices_usd_foil: null, prices_eur: null,
    prices_eur_foil: null, released_at: null, legalities: null, power: data.power ?? null,
    toughness: data.toughness ?? null, keywords: null, produced_mana: null, layout: null,
    card_faces: null, search_vector: null, created_at: '', updated_at: '',
  }
}

function LogEntryRow({ entry, cardMap, userId, playerNames, onCardPreview }: {
  entry: LogEntry
  cardMap: CardMap
  userId: string
  playerNames: Record<string, string>
  onCardPreview: (card: CardRow) => void
}) {
  const longPress = useLongPress({
    onLongPress: () => {
      const instanceId = (entry.data as Record<string, unknown>)?.instanceId as string | undefined
      if (instanceId && cardMap[instanceId]) {
        const d = cardMap[instanceId]
        onCardPreview(toCardRow(d.cardId, d))
      }
    },
    delay: 400,
  })

  const handleClick = () => {
    if (longPress.wasLongPress()) return
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const instanceId = (entry.data as Record<string, unknown>)?.instanceId as string | undefined
    if (instanceId && cardMap[instanceId]) {
      const d = cardMap[instanceId]
      onCardPreview(toCardRow(d.cardId, d))
    }
  }

  const hasCard = !!(entry.data as Record<string, unknown>)?.instanceId &&
    !!cardMap[(entry.data as Record<string, unknown>).instanceId as string]

  return (
    <div
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      {...longPress}
      className={`flex gap-2 py-1 text-xs ${hasCard ? 'cursor-pointer active:bg-bg-hover rounded' : ''}`}
      style={{ touchAction: 'manipulation' }}
    >
      <span className="shrink-0 text-font-muted w-16 text-right">
        {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <span className={
        entry.type === 'chat' || entry.action === 'chat_message'
          ? 'italic text-yellow-400'
          : entry.playerId === userId ? 'text-font-accent' : 'text-font-primary'
      }>
        {entry.text}
      </span>
    </div>
  )
}

export default function GameHistoryView({
  gameName, winnerId, playerNames, userId, log, cardMap, startedAt, finishedAt,
}: {
  gameName: string
  winnerId: string | null
  playerNames: Record<string, string>
  userId: string
  log: LogEntry[]
  cardMap: CardMap
  startedAt: string | null
  finishedAt: string
}) {
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const won = winnerId === userId
  const winnerName = winnerId ? (playerNames[winnerId] ?? 'Unknown') : null

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <Link href="/play" className="flex items-center gap-1 text-font-secondary mb-3">
          <ChevronLeft size={16} /><span className="text-xs font-medium">Back to Play</span>
        </Link>
        <h1 className="text-lg font-bold text-font-primary">{gameName}</h1>
        <div className="flex items-center gap-3 mt-1">
          {startedAt && (
            <span className="text-[10px] text-font-muted">
              {new Date(startedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {winnerName && (
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
              won ? 'bg-bg-green/20 text-bg-green' : 'bg-bg-red/20 text-bg-red'
            }`}>
              {won ? 'Victory' : `${winnerName} wins`}
            </span>
          )}
          <span className="text-[10px] text-font-muted">{log.length} actions</span>
        </div>
      </div>

      {/* Log */}
      <div className="rounded-xl border border-border bg-bg-card p-4">
        <div className="flex flex-col">
          {log.map((entry) => (
            <LogEntryRow
              key={entry.id}
              entry={entry}
              cardMap={cardMap}
              userId={userId}
              playerNames={playerNames}
              onCardPreview={(card) => setPreview({ card })}
            />
          ))}
        </div>
      </div>

      {/* Card preview overlay (read-only) */}
      <CardPreviewOverlay
        preview={preview}
        onClose={() => setPreview(null)}
        readOnly
      />
    </div>
  )
}
```

- [ ] **Step 3: Create loading.tsx for the history route**

Create `src/app/(app)/play/[lobbyId]/history/loading.tsx`:

```typescript
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-dark">
      <span className="text-sm text-font-muted">Loading game history...</span>
    </div>
  )
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/play/[lobbyId]/history/page.tsx src/app/(app)/play/[lobbyId]/history/loading.tsx src/components/play/GameHistoryView.tsx
git commit -m "feat(play): add game history viewer with clickable card names"
```

---

### Task 6: Manual testing and deploy

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`

- [ ] **Step 2: Test flow**

1. Start dev server
2. Create a lobby, start a game, concede → verify it appears in Game History with auto-generated name
3. Rename the game → verify name updates
4. Click log icon → verify history page shows full log
5. Long-press a log entry with a card → verify card preview appears
6. Delete the historical game → verify it disappears
7. On an active `playing` lobby, verify "Termina" label shows, and terminating works
8. On a `waiting` lobby, verify "Elimina" label shows

- [ ] **Step 3: Push and deploy**

```bash
git push
vercel --prod
```
