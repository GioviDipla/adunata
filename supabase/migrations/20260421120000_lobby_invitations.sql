-- ============================================================
-- Lobby invitations — direct 1v1 challenges from community
-- ============================================================
-- Companion to `game_lobbies`. When a user wants to play a 1v1
-- against a specific other user (from /play or from that user's
-- profile), we create a normal `game_lobbies` row with the sender
-- as host (already sitting in `game_players` with a deck) AND a
-- row here addressed to the recipient. The recipient sees a
-- realtime-driven notification in /play and either accepts (joins
-- the lobby with a deck of their choice) or declines.

create table public.lobby_invitations (
  id             uuid primary key default gen_random_uuid(),
  lobby_id       uuid not null references public.game_lobbies (id) on delete cascade,
  -- FKs point at `profiles` so PostgREST resolves the embedded
  -- `sender:profiles!from_user_id(username, display_name)` select
  -- without an intermediate auth.users join. profiles.id itself
  -- references auth.users(id), so the cascade chain is preserved
  -- (user deletion → profile deletion → invitation deletion).
  from_user_id   uuid not null references public.profiles (id) on delete cascade,
  to_user_id     uuid not null references public.profiles (id) on delete cascade,
  status         text not null default 'pending'
                   check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at     timestamptz not null default now(),
  responded_at   timestamptz,
  -- Anti-duplication: at most one active invite per (lobby, recipient).
  unique (lobby_id, to_user_id)
);

-- Hot path: recipient pulls their pending invites on /play mount
-- and listens for new ones via Realtime. Partial index keeps it
-- tight and matches the SELECT filter exactly.
create index idx_lobby_invitations_pending_to_user
  on public.lobby_invitations (to_user_id, created_at desc)
  where status = 'pending';

-- Secondary path: sender inspects their outbox / cancels duplicates.
create index idx_lobby_invitations_from_user
  on public.lobby_invitations (from_user_id, created_at desc);

alter table public.lobby_invitations enable row level security;

-- Read: sender or recipient.
create policy "lobby_invitations_select_participants"
  on public.lobby_invitations
  for select
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

-- Insert: only as the sender, and only for someone else.
create policy "lobby_invitations_insert_self_as_sender"
  on public.lobby_invitations
  for insert
  with check (
    auth.uid() = from_user_id
    and from_user_id <> to_user_id
  );

-- Update:
--   - recipient flips pending → accepted/declined
--   - sender flips pending → cancelled
-- All other transitions are forbidden by the application layer;
-- RLS only gates who can even attempt an UPDATE.
create policy "lobby_invitations_update_participants"
  on public.lobby_invitations
  for update
  using (auth.uid() = from_user_id or auth.uid() = to_user_id)
  with check (auth.uid() = from_user_id or auth.uid() = to_user_id);

-- Realtime publication — lesson from 2026-04-09 in CLAUDE.md:
-- adding a table to the schema does NOT automatically enable it
-- for Supabase Realtime. Without this line the /play component
-- won't receive INSERT events and incoming invites stay silent.
alter publication supabase_realtime add table public.lobby_invitations;
