-- supabase/migrations/20260622_notifications.sql
-- Creates notifications table with RLS and realtime for the notification system.

CREATE TABLE IF NOT EXISTS public.notifications (
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
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE read = false;

-- Full index for paginated list
CREATE INDEX IF NOT EXISTS idx_notifications_user_all
  ON public.notifications (user_id, created_at DESC);

-- Actor hydration helper index
CREATE INDEX IF NOT EXISTS idx_notifications_actor_id
  ON public.notifications (actor_id);

-- RLS: user only sees own notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Realtime (idempotent via DO block since ALTER PUBLICATION ... IF NOT EXISTS requires PG 15+)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
