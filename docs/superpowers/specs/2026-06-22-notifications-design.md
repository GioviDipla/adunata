# Notifications System — Design Spec

## Overview
Notify users when someone interacts with their content or mentions them in comments.

## Notification Types
1. **deck_comment** — someone comments on my deck
2. **deck_like** — someone likes my deck  
3. **mention** — someone tags me via @username in a comment

## Database

```sql
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
```

Indexes: partial index on unread notifications, full index on user_id+created_at.
RLS: user can only view/update own notifications.
Realtime: add to supabase_realtime publication.

## User Mentions in Comments
- Current: `@[CardName](uuid)` for card mentions
- New: `@username` for user mentions (3-24 chars, matches profile username)
- Autocomplete shows both cards and users when typing after `@`
- `CommentComposer` searches `/api/users/search` + `/api/cards/search` concurrently

## Notifications Creation (API side)
- `POST /api/decks/[id]/comments` → after insert: if commenter ≠ deck owner → `deck_comment` notif. Extract @username mentions → `mention` notif for each.
- `POST /api/decks/[id]/likes` → after like insert: if liker ≠ deck owner → `deck_like` notif. On unlike, delete corresponding notif.

## API Endpoints
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/notifications` | List notifications (?unread_only=true, ?offset=) |
| GET | `/api/notifications/unread-count` | Count only (for badge) |
| PATCH | `/api/notifications/[id]` | Mark as read |
| PATCH | `/api/notifications/mark-all-read` | Mark all as read |

## Frontend

### Badge on "Community" nav item
- Badge (red circle with count) on "Community" in desktop sidebar + mobile drawer
- Fetched via GET `/api/notifications/unread-count`
- Realtime subscription to `notifications` table for live updates

### Community page (`/users`)
- Tabbed interface: "People" | "Notifications"
- "People" tab: existing UserSearch component
- "Notifications" tab: paginated list, grouped by date (Today, Yesterday, Earlier)
- Click notification → navigates to deck (and marks read)
- "Mark all read" button
