# Game History System — Design Spec

## Goal

Add game history, "terminate game" action on active lobbies, and a log viewer for finished games. Allow renaming and deleting historical games.

## Database Changes

### `game_lobbies` table — add `name` column

```sql
ALTER TABLE public.game_lobbies ADD COLUMN name text;
```

- Nullable. Auto-generated on game finish if null.
- Format: `"[deck1 name] — Player1 vs Player2 [deck2 name] — 16 Apr 2026"`
- User can rename after.

No new tables. `game_log` already stores the full log per `lobby_id`. Finished games = `game_lobbies.status = 'finished'`.

## Feature 1: "Terminate Game" on Active Lobbies

In `ActiveLobbiesList`, lobbies with status `playing` currently only have "Delete" (which internally concedes). Change to show two distinct actions:

- **"Termina"** (for `playing` lobbies) — calls DELETE `/api/lobbies/[id]` which already marks finished + opponent wins. Same backend logic, just a clearer UI label.
- **"Elimina"** (for `waiting` lobbies) — existing delete behavior (hard-delete).

The DELETE endpoint already handles both cases based on status. This is purely a UI label change.

## Feature 2: Auto-generate Game Name on Finish

When a game transitions to `finished` (via concede action, DELETE on playing lobby, or any future mechanism), if `name` is null, auto-generate it.

The name generation needs deck names and player display names. Two places currently set `status = 'finished'`:

1. **`POST /api/game/[id]/action`** — concede handler (line 52-87)
2. **`DELETE /api/lobbies/[id]`** — playing status handler (line 88-134)

Both need to: query deck names + player emails, build the name string, include it in the lobby update.

Format: `"[deck1] — Player1 vs Player2 [deck2] — 16 Apr 2026"`

Example: `"Elves Aggro — giovanni vs marco Dimir Control — 16 Apr 2026"`

## Feature 3: Game History List

On the play page (`/play`), below the active lobbies, add a **"Game History"** section showing `finished` lobbies where the user is a participant, ordered by `updated_at DESC`.

Each entry displays:
- Game name (or fallback to lobby code if name is null somehow)
- Date finished
- Winner indicator (won/lost)
- Actions: **Rinomina** (inline text edit), **Log** (navigate to history view), **Elimina** (hard-delete)

### API: Fetch finished lobbies

New GET endpoint or extend existing: `/api/lobbies?status=finished` — returns finished lobbies for the current user with winner info.

Actually simpler: the play page is a server component. Query directly in the page:

```sql
SELECT gl.*, gp.user_id
FROM game_lobbies gl
JOIN game_players gp ON gp.lobby_id = gl.id
WHERE gp.user_id = $userId AND gl.status = 'finished'
ORDER BY gl.updated_at DESC
LIMIT 50
```

### API: Rename game

New PATCH endpoint: `/api/lobbies/[id]` — accepts `{ name: string }`. Only the participants can rename. Updates `game_lobbies.name`.

### API: Delete historical game

Existing DELETE `/api/lobbies/[id]` — for `finished` lobbies currently returns a no-op 200. Change to hard-delete (same as waiting+host behavior). Only participants can delete.

## Feature 4: Game Log History Viewer

### Route: `/play/[lobbyId]/history`

Server component page that:

1. Verifies user is a participant of this lobby
2. Fetches lobby metadata (name, winner, players)
3. Fetches full `game_log` ordered by `seq ASC`
4. Fetches cardMap (same logic as GET `/api/game/[id]` — replicate instanceId assignment from deck data)
5. Renders a dedicated `GameHistoryView` client component

### `GameHistoryView` Component

- Header: game name, date, result (winner/loser), back button to `/play`
- Full scrollable log list — every entry rendered as text
- Card names in log text are wrapped in clickable spans
- Long-press / right-click on a card name opens `CardPreviewOverlay` with the card image (read-only, no actions)
- The card name detection: parse `action.data` for `instanceId` fields, resolve via cardMap to get card info

### Card Name Resolution in Log

Log entries have `action.data` which often contains `instanceId`. The `cardMap` maps instanceId → card data. For displaying card names as clickable:

- The `text` field already contains card names as plain text (e.g., "giovanni plays Llanowar Elves")
- For card preview: when user taps a log entry, check `data.instanceId` (or `data.cardIds`) → look up in cardMap → show preview
- Simpler approach: make each log entry that has an instanceId in its data clickable as a whole row → opens the card preview

## Component Structure

| Component | File | Purpose |
|-----------|------|---------|
| `GameHistoryList` | `src/components/play/GameHistoryList.tsx` | Create — List of finished games with rename/delete/view actions |
| `GameHistoryView` | `src/components/play/GameHistoryView.tsx` | Create — Full log viewer with card preview |
| `ActiveLobbiesList` | `src/components/play/ActiveLobbiesList.tsx` | Modify — "Termina" label for playing lobbies |
| Play page | `src/app/(app)/play/page.tsx` | Modify — Add history query + render GameHistoryList |
| History page | `src/app/(app)/play/[lobbyId]/history/page.tsx` | Create — Server page for log viewer |
| Lobbies API | `src/app/api/lobbies/[id]/route.ts` | Modify — Add PATCH for rename, fix DELETE for finished, auto-generate name |
| Action route | `src/app/api/game/[id]/action/route.ts` | Modify — Auto-generate name on concede |
| Migration | `supabase/migrations/XXXX_game_name.sql` | Create — Add name column to game_lobbies |
| Supabase types | `src/types/supabase.ts` | Modify — Add name field to game_lobbies type |

## Out of Scope

- Replay/playback of games (just log viewing)
- Statistics/win rate tracking
- Sharing game history with non-participants
- Goldfish history (local-only, no persistence)
