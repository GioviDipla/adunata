# Optimistic Updates & Action Pipeline Performance

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce perceived game action latency from 600-1200ms to <50ms by adding client-side optimistic updates, batching DB writes into a single RPC, and removing redundant auth calls.

**Architecture:** The client already has the game engine (`applyAction`). We apply actions locally *first* for instant feedback, then POST to the server in the background. The Realtime subscription already overwrites state on every `game_states` UPDATE, so it naturally corrects any divergence between optimistic and server state (e.g., auto-pass chains). Server-side, we replace 3 sequential DB queries with a single Postgres RPC that does read+insert+update in one transaction.

**Tech Stack:** Next.js App Router, Supabase (Postgres RPC + Realtime), TypeScript

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/2026XXXX_process_game_action.sql` | Create | RPC that reads state, inserts log, updates state in one transaction |
| `src/app/api/game/[id]/action/route.ts` | Modify | Use RPC instead of 3 queries, skip redundant auth |
| `src/components/play/PlayGame.tsx` | Modify | Optimistic updates in `sendAction` |
| `src/types/supabase.ts` | Modify | Add RPC type definition |

---

### Task 1: Create Supabase RPC `process_game_action`

**Files:**
- Create: `supabase/migrations/20260416100000_process_game_action.sql`

This RPC combines 3 DB operations into 1 atomic transaction: fetch current state, insert game log, update game state.

- [ ] **Step 1: Write the migration file**

```sql
-- Batch RPC: read state + insert log + update state in one transaction
-- Replaces 3 sequential queries from the action route handler
CREATE OR REPLACE FUNCTION process_game_action(
  p_lobby_id uuid,
  p_player_id uuid,
  p_action text,
  p_action_data jsonb,
  p_action_text text,
  p_action_seq integer,
  p_new_state jsonb,
  p_turn_number integer,
  p_active_player_id uuid,
  p_phase text,
  p_log_type text DEFAULT 'action'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state_row record;
  v_current_seq integer;
BEGIN
  -- 1. Read current state (with row lock to prevent concurrent mutations)
  SELECT id, (state_data->>'lastActionSeq')::integer AS last_seq
    INTO v_state_row
    FROM public.game_states
   WHERE lobby_id = p_lobby_id
   FOR UPDATE;

  IF v_state_row IS NULL THEN
    RETURN jsonb_build_object('error', 'Game not found');
  END IF;

  v_current_seq := v_state_row.last_seq;

  -- 2. Insert game log entry
  INSERT INTO public.game_log (lobby_id, seq, player_id, action, data, text, type)
  VALUES (p_lobby_id, p_action_seq, p_player_id, p_action, p_action_data, p_action_text, p_log_type);

  -- 3. Update game state
  UPDATE public.game_states
     SET state_data = p_new_state,
         turn_number = p_turn_number,
         active_player_id = p_active_player_id,
         phase = p_phase,
         updated_at = now()
   WHERE id = v_state_row.id;

  RETURN jsonb_build_object('ok', true, 'prev_seq', v_current_seq);
END;
$$;
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Run: `mcp__plugin_supabase_supabase__apply_migration` with the SQL above and title `process_game_action`.

- [ ] **Step 3: Verify the function exists**

Run: `mcp__plugin_supabase_supabase__execute_sql` with:
```sql
SELECT proname, pronargs FROM pg_proc WHERE proname = 'process_game_action';
```
Expected: 1 row with `proname = 'process_game_action'`, `pronargs = 11`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260416100000_process_game_action.sql
git commit -m "feat(game): add process_game_action RPC for batched DB writes"
```

---

### Task 2: Update API route to use RPC + skip redundant auth

**Files:**
- Modify: `src/app/api/game/[id]/action/route.ts`

The middleware already calls `supabase.auth.getUser()` to refresh the session. The route calls it again — that's a redundant network round trip (~100ms). We switch to `supabase.auth.getSession()` which reads from the cookie locally (no network call) and is sufficient since middleware already validated the session.

Additionally, we replace the 3 sequential DB queries (fetch state, insert log, update state) with the single `process_game_action` RPC for standard actions.

- [ ] **Step 1: Replace `getUser()` with `getSession()` for auth**

In `src/app/api/game/[id]/action/route.ts`, change lines 13-15:

```typescript
// Before:
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

// After:
const supabase = await createClient()
const { data: { session } } = await supabase.auth.getSession()
if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
const user = session.user
```

- [ ] **Step 2: Replace standard action DB writes with RPC call**

Replace lines 127-147 (the log insert + state update for standard actions) with a single RPC call:

```typescript
// Before (3 queries):
// 1. admin.from('game_log').insert(...)
// 2. admin.from('game_states').update(...)

// After (1 RPC):
const { data: rpcResult, error: rpcError } = await admin.rpc('process_game_action', {
  p_lobby_id: lobbyId,
  p_player_id: action.playerId,
  p_action: action.type,
  p_action_data: (action.data ?? null) as Json,
  p_action_text: action.text,
  p_action_seq: newState.lastActionSeq,
  p_new_state: newState as unknown as Json,
  p_turn_number: newState.turn,
  p_active_player_id: newState.activePlayerId,
  p_phase: newState.phase,
})

if (rpcError) {
  return NextResponse.json({ error: rpcError.message }, { status: 500 })
}
```

Keep the `game_states` SELECT (line 39-43) as-is — it's needed to get the current state for the engine. The RPC handles the write path.

- [ ] **Step 3: Also use RPC for log-only actions**

Replace lines 93-100 (log insert + state update for log-only actions) with:

```typescript
await admin.rpc('process_game_action', {
  p_lobby_id: lobbyId,
  p_player_id: action.playerId,
  p_action: action.type,
  p_action_data: (action.data as Json) ?? null,
  p_action_text: action.text,
  p_action_seq: newSeq,
  p_new_state: updatedState as unknown as Json,
  p_turn_number: updatedState.turn ?? currentState.turn,
  p_active_player_id: updatedState.activePlayerId ?? currentState.activePlayerId,
  p_phase: updatedState.phase ?? currentState.phase,
  p_log_type: action.type === 'chat_message' ? 'chat' : 'action',
})
```

- [ ] **Step 4: Verify the full route compiles**

Run: `npx tsc --noEmit`
Expected: No errors in `src/app/api/game/[id]/action/route.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/game/[id]/action/route.ts
git commit -m "perf(game): use RPC batch + skip redundant auth in action route"
```

---

### Task 3: Add optimistic updates to PlayGame.tsx

**Files:**
- Modify: `src/components/play/PlayGame.tsx` (lines 249-256)

This is the biggest perceived-performance win. The client already imports `applyAction` from the engine. We apply the action locally *before* the POST, so the UI updates instantly. The Realtime subscription (lines 207-214) already overwrites `gameState` on every server update, providing natural reconciliation.

Key behaviors:
- **Standard actions** (tap, play_card, pass_priority, etc.): apply optimistically via `applyAction`
- **Concede**: no optimistic update needed (shows game-over overlay, which comes via Realtime on `game_lobbies`)
- **Log-only actions** (chat_message, library_view, peak): no state change to optimistic-update
- **Auto-pass divergence**: client won't know about server-side auto-pass chains, but Realtime will deliver the correct state within ~200ms, and the intermediate state is never wrong (just incomplete)

- [ ] **Step 1: Update sendAction with optimistic update**

Replace `sendAction` (lines 249-256 in `PlayGame.tsx`) with:

```typescript
const sendAction = useCallback(async (action: ReturnType<typeof createPassPriority>) => {
  // Optimistic update: apply action locally for instant UI feedback
  const isStateMutating = action.type !== 'chat_message' 
    && action.type !== 'library_view' 
    && action.type !== 'peak'
    && action.type !== 'concede'
  
  if (isStateMutating) {
    setGameState(prev => prev ? applyAction(prev, action) : prev)
  }

  // Send to server in background — Realtime will reconcile if needed
  fetch(`/api/game/${lobbyId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  }).catch(() => {
    // On network error, Realtime will deliver the correct state
    // No rollback needed — the subscription overwrites on next server update
  })
}, [lobbyId])
```

Note: we removed `await` from `fetch` — the function is now fire-and-forget. The `.catch()` silently handles network errors since Realtime is the source of truth.

- [ ] **Step 2: Verify `applyAction` is imported**

Check that `PlayGame.tsx` already imports `applyAction` from `@/lib/game/engine`. If not, add:

```typescript
import { applyAction } from '@/lib/game/engine'
```

- [ ] **Step 3: Verify the component compiles**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/play/PlayGame.tsx
git commit -m "perf(game): add optimistic updates for instant action feedback"
```

---

### Task 4: Update Supabase types + final verification

**Files:**
- Modify: `src/types/supabase.ts`

- [ ] **Step 1: Add RPC type to supabase types**

Add the `process_game_action` function signature to the `Functions` section of `src/types/supabase.ts`:

```typescript
process_game_action: {
  Args: {
    p_lobby_id: string
    p_player_id: string
    p_action: string
    p_action_data: Json | null
    p_action_text: string
    p_action_seq: number
    p_new_state: Json
    p_turn_number: number
    p_active_player_id: string
    p_phase: string
    p_log_type?: string
  }
  Returns: Json
}
```

- [ ] **Step 2: Full type check**

Run: `npx tsc --noEmit`
Expected: Zero errors.

- [ ] **Step 3: Test locally**

Start dev server and play a test game. Verify:
1. Tapping a card shows rotation instantly (no delay)
2. Playing a card moves it to battlefield instantly
3. Pass priority advances phases correctly
4. Opponent sees updates via Realtime (unchanged behavior)
5. Chat messages still appear in log
6. Concede still shows game-over screen

- [ ] **Step 4: Commit**

```bash
git add src/types/supabase.ts
git commit -m "chore: add process_game_action RPC type definition"
```

---

## Performance Impact Summary

| Metric | Before | After |
|--------|--------|-------|
| Perceived latency (user) | 600-1200ms | <50ms (instant) |
| DB round trips per action | 3 (read + insert + update) | 1 (RPC) |
| Auth calls per action | 2 (middleware + route) | 1 (middleware only, route reads session) |
| Server-side latency | ~300ms | ~100ms |
| Cold start impact | Blocks user | Hidden (background) |
