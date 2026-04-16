# Social Foundation — Design Spec

## Overview

Introduces the minimum viable "social layer" for Adunata: user profiles with stable usernames, per-deck public/private visibility, and a Community page with user search. Everything remains behind the existing auth gate — "public" means "visible to other registered users of this app", never to the open internet. No follows, likes, comments, clones, or activity feeds in this iteration.

## Scope

**In scope**
- **A. Foundation** — `profiles` table (1:1 with `auth.users`), auto-generated username with 15-day edit cooldown, display name, bio, statistical MTG-flavored profile stats derived from deck data.
- **B. Public decks** — per-deck `visibility` column (`private` | `public`, default `private`), owner toggle in the deck editor, read-only view for non-owners of public decks at the existing `/decks/[id]` URL.
- **C. Community page + public profile** — new nav entry `Community` → `/users` page with fuzzy search and "latest joiners" empty state, plus `/u/[username]` public profile pages with derived stats and public deck list.

**Out of scope** (deliberately YAGNI for this iteration)
- Follows, activity feed, notifications
- Likes, favorites, comments on decks
- Deck cloning / forking
- Browse-popular-decks feed
- Avatar uploads (colored initials instead)
- External profile links (twitch/youtube/website)
- Open-internet access to decks (OpenGraph, SEO)
- Unlisted deck state (only private and public)

## Key decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Registered-users-only | Keeps all routes under `(app)` auth gate, no SEO concerns, simpler RLS |
| 2 | Two-state visibility (private/public) | Since every viewer is authenticated, "unlisted" adds no value |
| 3 | Private default on deck creation | Safe default, matches existing user expectations, zero leaks on deploy |
| 4 | Username auto-generated from email, editable once every 15 days | Zero onboarding friction, URL stability, limited churn |
| 5 | No avatar uploads | Colored initials (deterministic hash of username), zero storage/moderation |
| 6 | Stats computed live via SQL function | YAGNI — dataset is small; upgrade to materialization only if slow |
| 7 | Stats aggregate only from deck_cards the caller can see via RLS | Same SQL function works for self-view (all decks) and visitor-view (public only) |
| 8 | Same URL `/decks/[id]` for owner and visitor | One URL per resource; server decides edit mode vs view mode based on ownership |
| 9 | RLS Postgres is source of truth for access control | App code can have bugs but DB won't leak private data |
| 10 | Deck-level distinct color frequency | "How many of your decks play color X" — intuitive, unbiased by card counts |

## Architecture overview

**New tables**: `profiles` (1:1 with `auth.users`)
**Modified tables**: `decks` (add `visibility` column)
**New SQL functions**: `handle_new_user()`, `enforce_username_cooldown()`, `get_profile_stats()`, `search_users()`, `get_latest_users()`
**New routes**: `/users`, `/u/[username]`, `/api/users/search`, `/api/profile`, `/api/decks/[id]/visibility`
**Modified routes**: `/decks/[id]` (owner vs visitor rendering), `/profile` (add public profile editing section)
**New components**: `DeckContent` (shared pure-render extracted from `DeckEditor`), `DeckView` (read-only page), `UserSearch`, `ProfileStats`, `VisibilityToggle`
**Navbar**: add `Community` entry (5th slot) between Play and Profile

Nothing existing breaks. All changes are additive.

## Data model

### `profiles` table (new)

```sql
create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  username            text unique not null,
  display_name        text not null,
  bio                 text,
  username_changed_at timestamptz,   -- null = never changed, ok to change immediately
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint username_format check (username ~ '^[a-z0-9_]{3,24}$'),
  constraint display_name_length check (char_length(display_name) between 1 and 40),
  constraint bio_length check (bio is null or char_length(bio) <= 240)
);

create extension if not exists pg_trgm;

create index idx_profiles_username_trgm on public.profiles
  using gin (username gin_trgm_ops);
create index idx_profiles_display_name_trgm on public.profiles
  using gin (lower(display_name) gin_trgm_ops);

-- updated_at trigger: reuse existing helper from 20240101000000_initial_schema.sql
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();
```

**Constraint rationale**:
- `username_format`: lowercase alphanumeric + underscore, 3–24 chars. Strict enough to produce clean URLs (`/u/giovanni`) and avoid display/display-name collision with funky Unicode.
- `display_name` 1–40: the "nice" name that can contain spaces and accents.
- `bio` max 240: Twitter-length, keeps profile clean.
- `username_changed_at = null`: means the profile was just created and has never been edited. First edit is always allowed. The trigger sets `username_changed_at = now()` on the first change, locking the 15-day cooldown afterwards.

### `decks.visibility` column (modified)

```sql
alter table public.decks
  add column visibility text not null default 'private'
    check (visibility in ('private', 'public'));

create index idx_decks_visibility on public.decks (visibility)
  where visibility = 'public';
```

Partial index: only public rows, since the majority will be private. Keeps the index tiny.

### Auto-create profile trigger

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  base_username text;
  final_username text;
  counter int := 0;
begin
  base_username := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '_', 'g'));
  base_username := substring(base_username from 1 for 20);

  if char_length(base_username) < 3 then
    base_username := base_username || 'usr';
  end if;

  final_username := base_username;
  while exists(select 1 from public.profiles where username = final_username) loop
    counter := counter + 1;
    final_username := base_username || counter::text;
  end loop;

  insert into public.profiles (id, username, display_name)
  values (new.id, final_username, split_part(new.email, '@', 1));

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

Runs `security definer` so the trigger bypasses RLS on `profiles` to insert. A single row per signup.

### Username cooldown trigger

```sql
create or replace function public.enforce_username_cooldown()
returns trigger
language plpgsql
as $$
begin
  if old.username is distinct from new.username then
    if old.username_changed_at is not null
       and now() - old.username_changed_at < interval '15 days' then
      raise exception 'Username can only be changed once every 15 days'
        using errcode = 'P0001',
              hint = 'next_change_allowed_at=' || (old.username_changed_at + interval '15 days')::text;
    end if;
    new.username_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_profiles_username_cooldown
  before update on public.profiles
  for each row execute function public.enforce_username_cooldown();
```

The app route `PATCH /api/profile` does a soft pre-check of the cooldown to return a friendly message ("you can change your username in 12 days"). The trigger is the safety net that enforces the rule at the DB level regardless of client bugs.

## Access control (RLS)

### `profiles` policies

```sql
alter table public.profiles enable row level security;

create policy "Authenticated users can view all profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No INSERT policy: profiles are created exclusively by the security-definer trigger.
-- No DELETE policy: row is cascade-deleted when auth.users row is deleted.
```

### `decks` policies (updated)

```sql
drop policy if exists "Users can view their own decks" on public.decks;

create policy "Users can view own or public decks"
  on public.decks for select
  to authenticated
  using (user_id = auth.uid() or visibility = 'public');

-- Insert/update/delete policies are unchanged: owner only.
```

### `deck_cards` policies (updated)

```sql
drop policy if exists "Users can view cards in their own decks" on public.deck_cards;

create policy "Users can view cards in own or public decks"
  on public.deck_cards for select
  to authenticated
  using (
    deck_id in (
      select id from public.decks
      where user_id = auth.uid() or visibility = 'public'
    )
  );

-- Insert/update/delete policies are unchanged: owner only.
```

## SQL functions

All functions use `security invoker` so they respect the caller's RLS. This means `get_profile_stats` automatically filters deck_cards to the visible subset for the caller (self = all, visitor = public only) with zero duplicated logic.

### `get_profile_stats(p_username text)`

Returns a single row of aggregated stats for the given profile:

- `public_deck_count`: count of decks with `visibility = 'public'`
- `total_deck_count`: count of all visible decks (equals `public_deck_count` for visitors; equals all for self)
- `favorite_format`: the `format` value with the most decks
- `color_frequencies`: `jsonb` map `{W, U, B, R, G}` → count of **distinct visible decks** that contain at least one card with that color in its color_identity
- `latest_commander`: `jsonb` `{id, name, image_small, image_normal}` of the commander from the most recently updated deck that has one; null otherwise
- `most_used_card`: `jsonb` `{id, name, image_small}` of the non-land card that appears in the largest number of distinct visible decks; null if none
- `unique_cards_count`: count of distinct `card_id` across all visible deck_cards

Implemented as CTEs in a single `select`:

```sql
create or replace function public.get_profile_stats(p_username text)
returns table (
  public_deck_count int,
  total_deck_count int,
  favorite_format text,
  color_frequencies jsonb,
  latest_commander jsonb,
  most_used_card jsonb,
  unique_cards_count int
)
language sql stable security invoker as $$
  with target as (
    select id from public.profiles where username = p_username
  ),
  visible_decks as (
    select d.* from public.decks d
    join target t on d.user_id = t.id
  ),
  deck_count as (
    select
      count(*) filter (where visibility = 'public')::int as public_count,
      count(*)::int as total_count
    from visible_decks
  ),
  top_format as (
    select format from visible_decks
    group by format
    order by count(*) desc
    limit 1
  ),
  color_agg as (
    select jsonb_object_agg(letter, cnt) as colors
    from (
      select ci as letter, count(distinct vd.id) as cnt
      from visible_decks vd
      join public.deck_cards dc on dc.deck_id = vd.id
      join public.cards c on c.id = dc.card_id
      cross join unnest(coalesce(c.color_identity, array[]::text[])) as ci
      group by ci
    ) t
  ),
  latest_cmd as (
    select jsonb_build_object(
      'id', c.id, 'name', c.name,
      'image_small', c.image_small, 'image_normal', c.image_normal
    ) as cmd
    from visible_decks vd
    join public.deck_cards dc on dc.deck_id = vd.id and dc.board = 'commander'
    join public.cards c on c.id = dc.card_id
    order by vd.updated_at desc
    limit 1
  ),
  most_used as (
    select jsonb_build_object('id', c.id, 'name', c.name, 'image_small', c.image_small) as card
    from public.deck_cards dc
    join visible_decks vd on vd.id = dc.deck_id
    join public.cards c on c.id = dc.card_id
    where c.type_line not ilike '%land%' and dc.board = 'main'
    group by c.id, c.name, c.image_small
    order by count(distinct vd.id) desc
    limit 1
  ),
  unique_count as (
    select count(distinct dc.card_id)::int as cnt
    from public.deck_cards dc
    join visible_decks vd on vd.id = dc.deck_id
  )
  select
    deck_count.public_count,
    deck_count.total_count,
    (select format from top_format),
    coalesce((select colors from color_agg), '{}'::jsonb),
    (select cmd from latest_cmd),
    (select card from most_used),
    (select cnt from unique_count)
  from deck_count;
$$;

grant execute on function public.get_profile_stats(text) to authenticated;
```

### `search_users(p_query text, p_limit int default 20)`

Returns profiles whose `username` or `display_name` matches the query, ordered by relevance (exact match > prefix match > fuzzy). Uses `ilike '%q%'` over the trigram GIN indices for performance on large datasets.

```sql
create or replace function public.search_users(p_query text, p_limit int default 20)
returns table (
  id uuid,
  username text,
  display_name text,
  bio text,
  public_deck_count int
)
language sql stable security invoker as $$
  select
    p.id, p.username, p.display_name, p.bio,
    (select count(*)::int from public.decks d
     where d.user_id = p.id and d.visibility = 'public') as public_deck_count
  from public.profiles p
  where
    p.username ilike '%' || p_query || '%'
    or lower(p.display_name) ilike '%' || lower(p_query) || '%'
  order by
    (case when p.username = lower(p_query) then 0
          when p.username like lower(p_query) || '%' then 1
          else 2 end),
    similarity(p.username, p_query) desc
  limit p_limit;
$$;

grant execute on function public.search_users(text, int) to authenticated;
```

### `get_latest_users(p_limit int default 10)`

Returns the most recently created profiles for the `/users` empty state.

```sql
create or replace function public.get_latest_users(p_limit int default 10)
returns table (id uuid, username text, display_name text, public_deck_count int)
language sql stable security invoker as $$
  select
    p.id, p.username, p.display_name,
    (select count(*)::int from public.decks d
     where d.user_id = p.id and d.visibility = 'public') as public_deck_count
  from public.profiles p
  order by p.created_at desc
  limit p_limit;
$$;

grant execute on function public.get_latest_users(int) to authenticated;
```

## Routes & components

### New routes

| Route | Kind | Purpose |
|---|---|---|
| `/users` | Server Component | Community page; server-fetches `get_latest_users` for the empty state, embeds the `<UserSearch>` client component |
| `/u/[username]` | Server Component | Public profile; parallel fetch of profile + stats + public decks via `Promise.all`; `notFound()` if username doesn't exist |
| `/api/users/search` | GET route handler | Thin wrapper over `search_users` RPC |
| `/api/profile` | PATCH route handler | Update username / display_name / bio with soft cooldown check; catches Postgres error code `P0001` from the trigger for user-friendly messaging |
| `/api/decks/[id]/visibility` | PATCH route handler | Toggle `decks.visibility` with owner check (RLS is also enforced by DB) |

### Modified routes

**`/decks/[id]`** (server component)
- Load deck + deck_cards + owner profile in parallel.
- Branching:
  - `deck.user_id === user.id` → render `<DeckEditor>` (current behavior, unchanged)
  - `deck.user_id !== user.id && deck.visibility === 'public'` → render `<DeckView>` (new read-only page)
  - `deck.user_id !== user.id && deck.visibility === 'private'` → `notFound()` (RLS would also block, but this gives a cleaner UX)

**`/profile`** (client component, already exists)
Adds a new "Public Profile" section with inline-editable fields for `username`, `display_name`, and `bio`, save button calling `PATCH /api/profile`. Shows the cooldown countdown next to the username field if the user has recently changed it.

### New components

**`<DeckContent>`** — shared pure-render
- Extracted from the current `DeckEditor` JSX.
- Renders the grouped list / grid / text views of a deck's cards with sort and filter controls.
- Accepts optional handler props (`onQuantityChange`, `onRemove`, `onToggleCommander`, `onCardClick`); when handlers are absent, the corresponding edit UI is hidden.
- Both `<DeckEditor>` and `<DeckView>` consume it.
- **Refactor benefit**: `DeckEditor` is currently ~640 lines mixing state management with rendering. Extracting `<DeckContent>` shrinks it by ~200 lines and lets the new read-only view reuse all the sort/filter work without duplication.

**`<DeckView>`** — new read-only page
- Header: deck name, format badge, "by @username" pill linking to the profile
- `<DeckStats>` (reused from editor)
- `<DeckContent>` with no edit handlers (card click → `<CardDetail>` modal only)
- Secondary CTA: "Copy deck list" (text export). No edit, no clone, no like (all out of scope).

**`<UserSearch>`** — client component
- Debounced input (300 ms) → fetch `/api/users/search?q=...` → render list of `<UserCard>`
- Empty query state: defer to the server-rendered "latest joiners" list above
- Each `<UserCard>`: colored initials avatar, display name, `@username`, public deck count, link to `/u/{username}`

**`<ProfileStats>`** — pure-render
- Icon row: favorite format, color identity (mini mana pips ordered by frequency), latest commander (image preview), most used card, unique cards count
- Graceful empty state ("No public decks yet") when stats fields are null

**`<VisibilityToggle>`** — client component inside `DeckEditor`
- Two-option toggle (Private / Public)
- Optimistic update → `PATCH /api/decks/[id]/visibility` → rollback on error
- Badge visible in the deck editor header alongside the format badge

### Navbar

Add "Community" entry with `Users` lucide icon between "Play" and "Profile". Bottom-bar mobile gets the entry as the 5th slot. Desktop sidebar gets it as a new row.

### Loading states

New `loading.tsx` files with skeleton placeholders:
- `src/app/(app)/users/loading.tsx` — search input skeleton + 6 user card placeholders
- `src/app/(app)/u/[username]/loading.tsx` — profile header skeleton + stats card skeleton + public deck grid skeleton

## Migration & rollout

### Single migration file

File: `supabase/migrations/20260410130000_social_foundation.sql`. Contains, in order:

1. `create extension if not exists pg_trgm`
2. `create table public.profiles` + constraints + indices
3. `alter table public.decks add column visibility` + partial index
4. `create function handle_new_user` + trigger `on_auth_user_created`
5. `create function enforce_username_cooldown` + trigger `trg_profiles_username_cooldown`
6. RLS policies: profiles (enable + select/update) + decks drop-and-recreate + deck_cards drop-and-recreate
7. SQL functions: `get_profile_stats`, `search_users`, `get_latest_users` + grants
8. One-shot idempotent backfill for existing `auth.users`

### Backfill SQL

```sql
insert into public.profiles (id, username, display_name)
select
  u.id,
  case
    when cnt.n = 1 then base.username_base
    else base.username_base || cnt.n::text
  end,
  split_part(u.email, '@', 1)
from auth.users u
cross join lateral (
  select greatest(
    substring(lower(regexp_replace(split_part(u.email, '@', 1), '[^a-z0-9_]', '_', 'g')) from 1 for 20),
    ''
  ) as username_base
) base
cross join lateral (
  select coalesce(
    (select count(*) + 1 from public.profiles p
     where p.username = base.username_base or p.username like base.username_base || '%'),
    1
  ) as n
) cnt
on conflict (id) do nothing;
```

Idempotent: rerunning the migration after a profile already exists is a no-op for that row.

### Deploy sequence

1. **Apply migration via MCP** (pattern already established — `mcp__plugin_supabase_supabase__apply_migration`). Schema, triggers, policies, RPCs, and backfill all go live together in a single transaction.
2. **Push code commit(s)** → Vercel auto-deploys. First render after deploy:
   - Existing users see the new "Community" entry in the navbar.
   - `/users` shows the backfilled profiles as "latest joiners".
   - Each user's `/profile` shows their auto-generated username, ready to edit.
   - Every existing deck has `visibility = 'private'` (no data leaks).
   - Each user can open their deck editor and toggle a deck to public.
3. **No downtime, no breaking change**: existing routes and queries behave identically for owner-only flows.

### Rollback plan

- **Code-only rollback**: redeploy the previous Vercel commit. The DB schema remains but is unused. No corruption.
- **Full rollback**: `drop table public.profiles cascade; alter table public.decks drop column visibility;` reverses the migration. No deck data is lost.

### Testing strategy

Manual smoke test post-deploy (no automated test runner in the project yet):

1. **Self-profile**: `/profile` shows auto-generated username. Edit bio → save → verify persisted.
2. **Visibility toggle**: open a deck → toggle to public → badge updates.
3. **Community search**: `/users` shows latest profiles. Search by username → filtered.
4. **Public profile**: click a user → `/u/{username}` shows profile + public decks only.
5. **Privacy**: create a second test account → verify it cannot see the first account's private decks via URL guessing.
6. **Cooldown**: change username once → second change attempt fails with friendly message.
7. **Stats**: create deck with commander + a few cards → publish → stats on profile reflect it.

Future automation: add `supabase execute_sql` unit tests for the RPCs once the project adopts a test runner.

## Edge cases

- **Signup races with migration**: if a user signs up while the migration is mid-application, the `handle_new_user` trigger runs only after `public.profiles` exists, so the insert succeeds normally.
- **Username collisions during backfill**: handled by `cnt.n` counter which appends a numeric suffix.
- **Empty email user**: `split_part(email, '@', 1)` returns empty string → caught by the `if char_length(base_username) < 3` branch which adds `usr` suffix. Username becomes `usr`, `usr1`, etc.
- **Unicode in email localpart**: `regexp_replace` with `[^a-z0-9_]` strips non-ASCII characters, producing valid usernames.
- **Profile stats for a user with zero public decks and visitor view**: RLS returns zero `visible_decks`, all aggregates are null / 0. Frontend shows "No public decks yet" empty state.
- **Deck toggled back to private while someone is viewing it**: the viewer keeps the cached page open but the next refresh shows `notFound()`. Acceptable — we don't need real-time revocation.
- **User deletes account**: cascade removes profile + all decks + all deck_cards + all game data (already handled by existing FKs).
