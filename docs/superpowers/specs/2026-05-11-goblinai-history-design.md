# GoblinAI — Storico Conversazioni

**Date:** 2026-05-11  
**Scope:** `GoblinAIStandalone` only. `GoblinAIPanel` (in-game) unchanged.

---

## Overview

Users can access past GoblinAI conversations via a header dropdown, resume any conversation with an active composer, and delete conversations they no longer need. Titles are auto-generated from the first user message.

---

## DB Changes

No new migration required. `goblinai_conversations` already has `title` and `updated_at`.

**Title population** — in `simple/route.ts` and `restatement/route.ts`, after creating a new conversation:

```sql
UPDATE goblinai_conversations
SET title = left($message, 50), updated_at = now()
WHERE id = $convId AND title IS NULL
```

**updated_at tracking** — every time a new message is inserted into an existing conversation, also run:

```sql
UPDATE goblinai_conversations SET updated_at = now() WHERE id = $convId
```

This keeps the list sorted by most recently active.

---

## New API Routes

### `GET /api/assistant/conversations`

Returns the authenticated user's conversations, ordered by `updated_at DESC`, limit 50.

Response:
```json
{
  "conversations": [
    { "id": "uuid", "title": "Come funziona trample", "updated_at": "2026-05-11T..." }
  ]
}
```

### `GET /api/assistant/conversations/[id]/messages`

Returns all messages for a conversation, ordered by `created_at ASC`. Auth required; returns 404 if conv doesn't belong to user.

Response:
```json
{
  "messages": [
    { "id": "uuid", "role": "user", "content": "...", "created_at": "...", "restatement_status": "none" }
  ]
}
```

### `DELETE /api/assistant/conversations/[id]`

Deletes conversation and all messages (FK cascade). Auth required; 404 if not owner.

Response: `204 No Content`

All three routes protected by existing auth pattern (`createClient` + `getUser`). RLS on both tables scopes all queries to `user_id = auth.uid()` automatically.

---

## Frontend

### New component: `GoblinAIHistoryDropdown`

Props: `onSelectConversation(id: string): void`, `onNewConversation(): void`

Behavior:
- Renders a popover anchored to a `Clock` icon in the header
- Fetch `/api/assistant/conversations` only when opened (lazy)
- Shows loading spinner while fetching
- List: title + relative date (e.g. "ieri", "3 giorni fa") + trash icon per row
- Click row → calls `onSelectConversation(id)` → closes popover
- Trash icon → `DELETE` call → removes row from local list (optimistic)
- "Nuova conversazione" button at top → calls `onNewConversation()` → closes popover

### Changes to `GoblinAIStandalone`

**State additions:**
- `historyOpen: boolean` — controls dropdown visibility
- Rename `conversationId` → `activeConversationId` for clarity (internal only)

**Header:** add `Clock` icon button that sets `historyOpen = true`.

**`activeConversationTitle: string | null`** — additional state. Set to `left(message, 50)` client-side when first message of new conv is sent. Set from history list item when resuming. Shown truncated in header subtitle. Cleared on new conversation.

**`handleNewConversation()`:** resets `messages`, `activeConversationId`, `pendingRestatement` to initial state. Closes dropdown.

**`handleSelectConversation(id)`:**
1. Close dropdown
2. Fetch `/api/assistant/conversations/[id]/messages`
3. Map DB messages to local `Message[]` shape (preserve `serverMessageId` from `id`, `pendingConfirmation` from `restatement_status === 'pending_confirmation'`)
4. Set `messages`, `activeConversationId = id`
5. If the last assistant message has `restatement_status === 'pending_confirmation'`, re-populate `pendingRestatement`: `{ conversationId: id, restatementMessageId: lastAssistantMsg.id, restatement: lastAssistantMsg.content }` — this restores the confirm/correct UI for interrupted sessions

**Continuing a resumed conversation:** no special handling needed — `activeConversationId` is already sent in `handleSend`. Routes already accept `conversationId` and append to existing conv. Title update is gated on `title IS NULL` so it won't overwrite.

### `GoblinAIPanel`

No changes.

---

## Data Flow Summary

```
New conversation:
  handleSend() → POST /api/.../simple or restatement
    → server creates conv row, sets title, inserts messages
    → returns conversationId → stored in activeConversationId

Resume conversation:
  handleSelectConversation(id)
    → GET /api/assistant/conversations/[id]/messages
    → populate messages state + set activeConversationId
    → handleSend() picks up activeConversationId and appends

Delete:
  GoblinAIHistoryDropdown trash icon
    → DELETE /api/assistant/conversations/[id]
    → remove from local list
    → if deleted conv was active: handleNewConversation()
```

---

## Out of Scope

- Conversation search/filter
- Manual rename
- Pagination beyond limit 50
- GoblinAIPanel history
