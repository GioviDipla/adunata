# Social Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MVP social layer — user profiles, public/private deck visibility, Community page with user search — all behind the existing auth gate.

**Architecture:** New `profiles` table (1:1 with `auth.users`) maintained by a Postgres trigger, new `decks.visibility` column, three SQL functions (`get_profile_stats`, `search_users`, `get_latest_users`). Same URL `/decks/[id]` serves owner edit mode and visitor read-only view. RLS is the source of truth for access control. Stats are computed live, no materialization.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + Auth + RLS), TypeScript, Tailwind CSS v4, Lucide React icons, the Supabase MCP for applying migrations directly to prod.

**Reference spec:** `docs/superpowers/specs/2026-04-10-social-foundation-design.md` — always consult this for rationale and edge cases.

**Commit pattern:** All commits go to `main` (this project uses direct-to-main, auto-deploy via Vercel from GitHub `GioviDipla/the-gathering`). Each task ends with a commit step. The DB migration (Task 1 + 2) is applied to prod via MCP before any code reaches users, so schema changes are always in place before the code that relies on them.

---

## Task 1: Write the social foundation migration

**Files:**
- Create: `supabase/migrations/20260410130000_social_foundation.sql`

- [ ] **Step 1: Create the migration file with the full schema + triggers + RLS + RPCs + backfill**

```sql
-- supabase/migrations/20260410130000_social_foundation.sql

-- =====================================================================
-- 1. Extensions
-- =====================================================================
create extension if not exists pg_trgm;

-- =====================================================================
-- 2. profiles table
-- =====================================================================
create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  username            text unique not null,
  display_name        text not null,
  bio                 text,
  username_changed_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint username_format check (username ~ '^[a-z0-9_]{3,24}$'),
  constraint display_name_length check (char_length(display_name) between 1 and 40),
  constraint bio_length check (bio is null or char_length(bio) <= 240)
);

create index idx_profiles_username_trgm on public.profiles
  using gin (username gin_trgm_ops);
create index idx_profiles_display_name_trgm on public.profiles
  using gin (lower(display_name) gin_trgm_ops);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- =====================================================================
-- 3. decks.visibility column
-- =====================================================================
alter table public.decks
  add column visibility text not null default 'private'
    check (visibility in ('private', 'public'));

create index idx_decks_visibility on public.decks (visibility)
  where visibility = 'public';

-- =====================================================================
-- 4. Auto-create profile trigger
-- =====================================================================
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

-- =====================================================================
-- 5. Username cooldown trigger
-- =====================================================================
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

-- =====================================================================
-- 6. RLS policies
-- =====================================================================
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

-- Update decks SELECT policy for visibility
drop policy if exists "Users can view their own decks" on public.decks;

create policy "Users can view own or public decks"
  on public.decks for select
  to authenticated
  using (user_id = auth.uid() or visibility = 'public');

-- Update deck_cards SELECT policy for visibility cascade
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

-- =====================================================================
-- 7. SQL functions: get_profile_stats
-- =====================================================================
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

-- =====================================================================
-- 8. SQL functions: search_users
-- =====================================================================
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

-- =====================================================================
-- 9. SQL functions: get_latest_users
-- =====================================================================
create or replace function public.get_latest_users(p_limit int default 10)
returns table (
  id uuid,
  username text,
  display_name text,
  public_deck_count int
)
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

-- =====================================================================
-- 10. Backfill profiles for existing auth.users
-- =====================================================================
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
  select
    case
      when char_length(substring(lower(regexp_replace(split_part(u.email, '@', 1), '[^a-z0-9_]', '_', 'g')) from 1 for 20)) < 3
        then substring(lower(regexp_replace(split_part(u.email, '@', 1), '[^a-z0-9_]', '_', 'g')) from 1 for 20) || 'usr'
      else substring(lower(regexp_replace(split_part(u.email, '@', 1), '[^a-z0-9_]', '_', 'g')) from 1 for 20)
    end as username_base
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

- [ ] **Step 2: Commit the migration file (not yet applied)**

```bash
git add supabase/migrations/20260410130000_social_foundation.sql
git commit -m "$(cat <<'EOF'
feat(db): add social foundation migration

Migration adds profiles table (1:1 with auth.users, auto-created via
trigger), decks.visibility column, 15-day username cooldown trigger,
RLS policies for public/private deck access, and SQL functions
get_profile_stats/search_users/get_latest_users. Includes an
idempotent backfill of profiles for existing auth.users.
EOF
)"
```

---

## Task 2: Apply the migration to prod via MCP

**Files:**
- None (database operation)

- [ ] **Step 1: Apply the migration via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with:
- `project_id`: `wyujskkzqeexvmrwudup`
- `name`: `social_foundation`
- `query`: the full SQL from `supabase/migrations/20260410130000_social_foundation.sql` (excluding the `-- =====` comment separators if they cause issues)

Expected: `{"success":true}`

- [ ] **Step 2: Verify profiles were backfilled**

Use `mcp__plugin_supabase_supabase__execute_sql` with:

```sql
select username, display_name, created_at from public.profiles order by created_at;
```

Expected: one row per existing `auth.users` entry (at minimum Giovanni's account).

- [ ] **Step 3: Verify the trigger prevents back-to-back username changes**

```sql
-- This should fail with error P0001 on the second update
-- (we're just reading, not actually doing this — skip this check if risky)
-- Actual verification: confirm the trigger function exists:
select proname, proowner from pg_proc where proname = 'enforce_username_cooldown';
```

Expected: one row.

- [ ] **Step 4: Verify get_profile_stats runs without error**

```sql
select * from public.get_profile_stats((select username from public.profiles limit 1));
```

Expected: one row with counts (may be null or 0 for stats depending on deck state).

- [ ] **Step 5: No commit — this task has no file changes**

---

## Task 3: Update TypeScript types for new tables and RPCs

**Files:**
- Modify: `src/types/supabase.ts`

- [ ] **Step 1: Read current Tables and Functions sections**

Locate:
- The `Tables:` block for `profiles` (doesn't exist yet — need to add)
- The `Tables:` block for `decks` (needs `visibility: string` added to `Row`, `Insert`, `Update`)
- The `Functions:` block (needs 3 new entries)

- [ ] **Step 2: Add the profiles table type**

Add this inside `Database['public']['Tables']` (alphabetically between the others, e.g. after `game_states` and before whatever is next, or at the end — doesn't matter functionally):

```ts
profiles: {
  Row: {
    id: string
    username: string
    display_name: string
    bio: string | null
    username_changed_at: string | null
    created_at: string
    updated_at: string
  }
  Insert: {
    id: string
    username: string
    display_name: string
    bio?: string | null
    username_changed_at?: string | null
    created_at?: string
    updated_at?: string
  }
  Update: {
    id?: string
    username?: string
    display_name?: string
    bio?: string | null
    username_changed_at?: string | null
    created_at?: string
    updated_at?: string
  }
  Relationships: []
}
```

- [ ] **Step 3: Add `visibility` to the decks table type**

In the existing `decks:` Table block, add `visibility: string` to `Row`, `Insert` (as optional), and `Update` (as optional):

```ts
// In decks.Row:
visibility: string

// In decks.Insert:
visibility?: string

// In decks.Update:
visibility?: string
```

- [ ] **Step 4: Add the 3 new RPC signatures in Functions**

Extend the existing `Functions:` block (which already has `lookup_cards_by_names` and `get_deck_covers` from prior sessions) with:

```ts
get_profile_stats: {
  Args: { p_username: string }
  Returns: {
    public_deck_count: number
    total_deck_count: number
    favorite_format: string | null
    color_frequencies: Record<string, number>
    latest_commander: { id: string; name: string; image_small: string | null; image_normal: string | null } | null
    most_used_card: { id: string; name: string; image_small: string | null } | null
    unique_cards_count: number
  }[]
}
search_users: {
  Args: { p_query: string; p_limit?: number }
  Returns: {
    id: string
    username: string
    display_name: string
    bio: string | null
    public_deck_count: number
  }[]
}
get_latest_users: {
  Args: { p_limit?: number }
  Returns: {
    id: string
    username: string
    display_name: string
    public_deck_count: number
  }[]
}
```

- [ ] **Step 5: Verify typecheck passes**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/types/supabase.ts
git commit -m "feat(types): add profiles table and social RPC types"
```

---

## Task 4: Extract `<DeckContent>` shared pure-render component

**Files:**
- Create: `src/components/deck/DeckContent.tsx`
- Modify: `src/components/deck/DeckEditor.tsx`

**Context:** `DeckEditor.tsx` is currently ~640 lines. The sort/filter state and the list/grid/text view rendering logic (including the commander section) need to be extracted into a shared component so the new read-only `<DeckView>` can reuse them. The editor keeps handlers for name editing, delete, import/export, commander toggle, and quantity changes.

- [ ] **Step 1: Read `src/components/deck/DeckEditor.tsx` to understand what's there**

Familiarize yourself with the imports, state, and JSX structure. The pieces moving into `DeckContent` are:
- State: `sortMode`, `typeFilter`, `showFilterPanel`, `viewMode`
- Memos: `visibleCards`, `groupedCards`, `flatSortedCards`, `typeCounts`
- Helpers: `toggleTypeFilter`, `clearTypeFilter`
- Toolbar JSX: view mode toggle + sort dropdown + filter button + filter panel
- Commander section JSX
- List/grid/text view rendering JSX

The pieces staying in `DeckEditor`:
- `cards` state (fetched from server, mutated by editor actions)
- `activeTab` state and board tabs toolbar
- Handlers: `handleQuantityChange`, `handleRemove`, `handleToggleCommander`, `handlePrintingSelect`, `handleCardAdded`
- Deck metadata: name editing, delete, import, export
- `<AddCardSearch>`, `<CardDetail>`, `<DeckStats>`, `<DeckExport>`, `<ImportCardsModal>`

- [ ] **Step 2: Create `src/components/deck/DeckContent.tsx`**

```tsx
'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  Crown,
  List,
  LayoutGrid,
  AlignLeft,
  ArrowUpDown,
  Filter,
} from 'lucide-react'
import DeckCard from './DeckCard'
import DeckGridView from './DeckGridView'
import DeckTextView from './DeckTextView'
import { getCardTypeCategory, TYPE_ORDER } from '@/lib/utils/card'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

export interface DeckCardEntry {
  id: string
  card: CardRow
  quantity: number
  board: string
}

type ViewMode = 'list' | 'grid' | 'text'
type SortMode = 'type' | 'name' | 'cmc'

const SORT_LABELS: Record<SortMode, string> = {
  type: 'Type',
  name: 'Name',
  cmc: 'Mana Cost',
}

const VIEW_MODE_OPTIONS: { mode: ViewMode; icon: typeof List; label: string }[] = [
  { mode: 'list', icon: List, label: 'List view' },
  { mode: 'grid', icon: LayoutGrid, label: 'Grid view' },
  { mode: 'text', icon: AlignLeft, label: 'Text view' },
]

interface DeckContentProps {
  /** Cards for the currently-selected board (already filtered by activeTab) */
  cards: DeckCardEntry[]
  /** Commander cards (rendered in their own section above the main list) */
  commanderCards: DeckCardEntry[]
  /** When called with a card, opens the CardDetail modal or navigates to card info */
  onCardClick?: (card: CardRow) => void
  /** Returns true if the given cardId is a commander — passed to renderers */
  isCommander?: (cardId: number) => boolean

  // Edit handlers — when undefined, the edit UI is hidden (read-only mode)
  onQuantityChange?: (cardId: number, quantity: number, board: string) => void
  onRemove?: (cardId: number, board: string) => void
  onToggleCommander?: (cardId: number, board: string) => void
}

export default function DeckContent({
  cards,
  commanderCards,
  onCardClick,
  isCommander,
  onQuantityChange,
  onRemove,
  onToggleCommander,
}: DeckContentProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [sortMode, setSortMode] = useState<SortMode>('type')
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set())
  const [showFilterPanel, setShowFilterPanel] = useState(false)

  const visibleCards = useMemo(() => {
    if (typeFilter.size === 0) return cards
    return cards.filter((c) => {
      if (!c.card) return false
      return typeFilter.has(getCardTypeCategory(c.card.type_line))
    })
  }, [cards, typeFilter])

  const groupedCards = useMemo<[string, DeckCardEntry[]][]>(() => {
    if (sortMode === 'type') {
      const groups: Record<string, DeckCardEntry[]> = {}
      visibleCards.forEach((entry) => {
        if (!entry.card) return
        const cat = getCardTypeCategory(entry.card.type_line)
        if (!groups[cat]) groups[cat] = []
        groups[cat].push(entry)
      })
      const sorted: [string, DeckCardEntry[]][] = []
      TYPE_ORDER.forEach((type) => {
        if (groups[type]) {
          sorted.push([
            type,
            groups[type].sort(
              (a, b) =>
                a.card.cmc - b.card.cmc ||
                a.card.name.localeCompare(b.card.name),
            ),
          ])
        }
      })
      return sorted
    }

    const sortFn =
      sortMode === 'name'
        ? (a: DeckCardEntry, b: DeckCardEntry) =>
            a.card.name.localeCompare(b.card.name)
        : (a: DeckCardEntry, b: DeckCardEntry) =>
            a.card.cmc - b.card.cmc ||
            a.card.name.localeCompare(b.card.name)

    const flat = [...visibleCards].sort(sortFn)
    return flat.length > 0 ? [['All Cards', flat]] : []
  }, [visibleCards, sortMode])

  const flatSortedCards = useMemo(
    () => groupedCards.flatMap(([, entries]) => entries),
    [groupedCards],
  )

  const toggleTypeFilter = useCallback((type: string) => {
    setTypeFilter((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }, [])

  const clearTypeFilter = useCallback(() => setTypeFilter(new Set()), [])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const entry of cards) {
      if (!entry.card) continue
      const cat = getCardTypeCategory(entry.card.type_line)
      counts[cat] = (counts[cat] ?? 0) + entry.quantity
    }
    return counts
  }, [cards])

  // Read-only mode: all edit handlers are undefined
  const readOnly =
    onQuantityChange === undefined &&
    onRemove === undefined &&
    onToggleCommander === undefined

  // Noop handlers so grid/list/text views can be passed something
  const noopQty = useCallback(() => {}, [])
  const noopRemove = useCallback(() => {}, [])

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-0.5 rounded-lg bg-bg-cell p-1">
          {VIEW_MODE_OPTIONS.map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                viewMode === mode
                  ? 'bg-bg-surface text-font-primary shadow-sm'
                  : 'text-font-muted hover:text-font-primary'
              }`}
              title={label}
              aria-label={label}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 rounded-lg bg-bg-cell px-2 py-1 text-xs text-font-secondary">
          <ArrowUpDown className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Sort:</span>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="bg-transparent text-font-primary focus:outline-none"
            aria-label="Sort cards by"
          >
            {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
              <option key={mode} value={mode} className="bg-bg-surface">
                {SORT_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={() => setShowFilterPanel((prev) => !prev)}
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors ${
            typeFilter.size > 0 || showFilterPanel
              ? 'bg-bg-accent/20 text-font-accent'
              : 'bg-bg-cell text-font-secondary hover:text-font-primary'
          }`}
          aria-label="Filter by type"
        >
          <Filter className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Filter</span>
          {typeFilter.size > 0 && (
            <span className="rounded-full bg-bg-accent px-1.5 py-0.5 text-[9px] font-bold text-font-white">
              {typeFilter.size}
            </span>
          )}
        </button>
      </div>

      {showFilterPanel && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-bg-surface px-3 py-2">
          {TYPE_ORDER.map((type) => {
            const count = typeCounts[type] ?? 0
            if (count === 0) return null
            const active = typeFilter.has(type)
            return (
              <button
                key={type}
                onClick={() => toggleTypeFilter(type)}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? 'bg-bg-accent text-font-white'
                    : 'bg-bg-cell text-font-secondary hover:text-font-primary'
                }`}
              >
                {type} ({count})
              </button>
            )
          })}
          {typeFilter.size > 0 && (
            <button
              onClick={clearTypeFilter}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-font-muted hover:text-font-primary"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Commander section */}
      {commanderCards.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-bg-yellow">
            <Crown className="h-4 w-4" />
            Commander
          </h3>
          {viewMode === 'grid' ? (
            <DeckGridView
              cards={commanderCards}
              onQuantityChange={onQuantityChange ?? noopQty}
              onRemove={onRemove ?? noopRemove}
              isCommander={() => true}
              onToggleCommander={onToggleCommander}
              onCardClick={onCardClick}
              readOnly={readOnly}
            />
          ) : viewMode === 'text' ? (
            <DeckTextView
              cards={commanderCards}
              isCommander={() => true}
              onToggleCommander={onToggleCommander}
              onCardClick={onCardClick}
            />
          ) : (
            <div className="flex flex-col gap-1">
              {commanderCards.map((entry) => (
                <DeckCard
                  key={`${entry.card.id}-${entry.board}`}
                  card={entry.card}
                  quantity={entry.quantity}
                  board={entry.board}
                  isCommander
                  onQuantityChange={onQuantityChange}
                  onRemove={onRemove}
                  onToggleCommander={onToggleCommander}
                  onCardClick={onCardClick}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main list */}
      {viewMode === 'list' && (
        <>
          {groupedCards.length === 0 ? (
            <div className="rounded-xl border border-border-light border-dashed bg-bg-surface p-8 text-center">
              <p className="text-font-muted">No cards here.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {groupedCards.map(([type, entries]) => (
                <div key={type}>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-font-secondary">
                    {type}
                    <span className="text-xs text-font-muted">
                      ({entries.reduce((s, e) => s + e.quantity, 0)})
                    </span>
                  </h3>
                  <div className="flex flex-col gap-1">
                    {entries.map((entry) => (
                      <DeckCard
                        key={`${entry.card.id}-${entry.board}`}
                        card={entry.card}
                        quantity={entry.quantity}
                        board={entry.board}
                        isCommander={isCommander?.(entry.card.id) ?? false}
                        onQuantityChange={onQuantityChange}
                        onRemove={onRemove}
                        onToggleCommander={onToggleCommander}
                        onCardClick={onCardClick}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {viewMode === 'grid' && (
        <DeckGridView
          cards={flatSortedCards}
          onQuantityChange={onQuantityChange ?? noopQty}
          onRemove={onRemove ?? noopRemove}
          isCommander={isCommander}
          onToggleCommander={onToggleCommander}
          onCardClick={onCardClick}
          readOnly={readOnly}
        />
      )}

      {viewMode === 'text' && (
        <DeckTextView
          cards={flatSortedCards}
          groups={groupedCards}
          isCommander={isCommander}
          onToggleCommander={onToggleCommander}
          onCardClick={onCardClick}
        />
      )}
    </div>
  )
}
```

Note: this component passes `readOnly` to `DeckGridView` and makes `DeckCard`'s edit handlers optional. If `DeckCard` and `DeckGridView` don't already support `readOnly` / optional handlers, you'll need to thread them through in Step 3.

- [ ] **Step 3: Make `DeckCard` edit handlers optional**

Open `src/components/deck/DeckCard.tsx`. The handlers `onQuantityChange`, `onRemove`, `onToggleCommander` should be typed as `| undefined`. When any one is undefined, the corresponding button should not render.

Change the prop types to `?:` optional and wrap each edit button in `{onQuantityChange && (...)}` / `{onRemove && (...)}` / `{onToggleCommander && (...)}`. Keep `onCardClick` always valid (it's fine to view cards in read-only mode).

- [ ] **Step 4: Make `DeckGridView` edit handlers optional + add `readOnly`**

Open `src/components/deck/DeckGridView.tsx`. Add `readOnly?: boolean` to props. When `readOnly === true`, the hover overlay with quantity buttons + delete button + commander toggle should not render. The card image click should still fire `onCardClick`.

- [ ] **Step 5: Replace the inline rendering in `DeckEditor` with `<DeckContent>`**

In `src/components/deck/DeckEditor.tsx`:
- Remove the state: `sortMode`, `typeFilter`, `showFilterPanel`, `viewMode`
- Remove the memos: `visibleCards`, `groupedCards`, `flatSortedCards`, `typeCounts`
- Remove the callbacks: `toggleTypeFilter`, `clearTypeFilter`
- Remove the imports: `ArrowUpDown`, `Filter`, `List`, `LayoutGrid`, `AlignLeft`, `DeckCard`, `DeckGridView`, `DeckTextView` (all now inside DeckContent)
- Remove the view mode / sort / filter toolbar JSX, the type filter panel JSX, the commander section JSX, and the three `viewMode === ...` rendering branches
- Import `DeckContent`
- Replace the removed JSX with `<DeckContent cards={filteredCards} commanderCards={commanderCards} isCommander={isCommander} onCardClick={setSelectedDetailCard} onQuantityChange={handleQuantityChange} onRemove={handleRemove} onToggleCommander={handleToggleCommander} />`

Keep in `DeckEditor`:
- `cards`, `activeTab` state
- `filteredCards`, `commanderCards` memos
- All the deck-level handlers and UI (name edit, tabs, import/export/delete)

- [ ] **Step 6: Typecheck + build**

```bash
npx tsc --noEmit 2>&1 | head -20
npm run build 2>&1 | tail -5
```

Expected: both pass cleanly.

- [ ] **Step 7: Smoke test in browser manually (owner path)**

Open `the-gathering-eight.vercel.app/decks` locally via `npm run dev`, pick a deck, verify:
- List/grid/text view toggle works
- Sort dropdown (Type/Name/Mana Cost) works
- Filter panel opens and filters work
- Commander section shows up for commander decks
- Quantity +/- and Remove still work
- Click on card opens the CardDetail modal

- [ ] **Step 8: Commit**

```bash
git add src/components/deck/DeckContent.tsx src/components/deck/DeckEditor.tsx src/components/deck/DeckCard.tsx src/components/deck/DeckGridView.tsx
git commit -m "refactor(deck): extract DeckContent shared pure-render component

Extracted sort/filter/view mode state and the list/grid/text rendering
from DeckEditor into a new DeckContent component. DeckEditor keeps the
deck metadata handlers (name, delete, import/export) and passes its
handlers down. DeckContent can now be reused by the upcoming read-only
DeckView when handlers are omitted.

DeckCard and DeckGridView now accept optional edit handlers and a
readOnly flag so the same components render correctly in both modes."
```

---

## Task 5: Create `/api/decks/[id]/visibility` PATCH route

**Files:**
- Create: `src/app/api/decks/[id]/visibility/route.ts`

- [ ] **Step 1: Create the route handler**

```ts
// src/app/api/decks/[id]/visibility/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: deckId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as { visibility?: string }
  const visibility = body.visibility

  if (visibility !== 'private' && visibility !== 'public') {
    return NextResponse.json(
      { error: 'visibility must be "private" or "public"' },
      { status: 400 },
    )
  }

  // RLS ensures we can only update our own decks; filter by user_id defensively
  const { data, error } = await supabase
    .from('decks')
    .update({ visibility })
    .eq('id', deckId)
    .eq('user_id', user.id)
    .select('id, visibility')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
  }

  return NextResponse.json({ visibility: data.visibility })
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/decks/[id]/visibility/route.ts"
git commit -m "feat(api): add PATCH /api/decks/[id]/visibility"
```

---

## Task 6: Add `<VisibilityToggle>` to DeckEditor

**Files:**
- Create: `src/components/deck/VisibilityToggle.tsx`
- Modify: `src/components/deck/DeckEditor.tsx`

- [ ] **Step 1: Create the toggle component**

```tsx
// src/components/deck/VisibilityToggle.tsx
'use client'

import { useState, useTransition } from 'react'
import { Lock, Globe, Loader2 } from 'lucide-react'

interface VisibilityToggleProps {
  deckId: string
  initialVisibility: 'private' | 'public'
}

export default function VisibilityToggle({
  deckId,
  initialVisibility,
}: VisibilityToggleProps) {
  const [visibility, setVisibility] = useState(initialVisibility)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function setTo(next: 'private' | 'public') {
    if (next === visibility) return
    const previous = visibility
    setVisibility(next)
    setError(null)

    startTransition(async () => {
      try {
        const res = await fetch(`/api/decks/${deckId}/visibility`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visibility: next }),
        })
        if (!res.ok) {
          setVisibility(previous)
          const data = await res.json().catch(() => ({ error: 'Update failed' }))
          setError(data.error ?? 'Update failed')
          return
        }
      } catch (e) {
        setVisibility(previous)
        setError(e instanceof Error ? e.message : 'Network error')
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5 rounded-lg bg-bg-cell p-1">
        <button
          onClick={() => setTo('private')}
          disabled={pending}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            visibility === 'private'
              ? 'bg-bg-surface text-font-primary shadow-sm'
              : 'text-font-muted hover:text-font-primary'
          }`}
        >
          <Lock className="h-3.5 w-3.5" />
          Private
        </button>
        <button
          onClick={() => setTo('public')}
          disabled={pending}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            visibility === 'public'
              ? 'bg-bg-green/20 text-bg-green'
              : 'text-font-muted hover:text-font-primary'
          }`}
        >
          <Globe className="h-3.5 w-3.5" />
          Public
        </button>
      </div>
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-font-muted" />}
      {error && <span className="text-[10px] text-bg-red">{error}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Wire into DeckEditor**

In `src/components/deck/DeckEditor.tsx`:

1. Import:

```tsx
import VisibilityToggle from './VisibilityToggle'
```

2. Update the `deck` prop type to include `visibility`:

```tsx
// Near the top of DeckEditor, the deck type already comes from Database types.
// The DeckRow type should now include `visibility: string` since we added it to supabase.ts in Task 3.
```

3. Add the toggle to the action-row JSX next to the import/export/delete buttons:

```tsx
<VisibilityToggle
  deckId={deck.id}
  initialVisibility={(deck.visibility as 'private' | 'public') ?? 'private'}
/>
```

Place it right after the `<Fish/>` Goldfish link and before the Import button.

- [ ] **Step 3: Typecheck + build**

```bash
npx tsc --noEmit 2>&1 | head -10
npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/deck/VisibilityToggle.tsx src/components/deck/DeckEditor.tsx
git commit -m "feat(deck): visibility toggle in deck editor"
```

---

## Task 7: Create `<DeckView>` read-only component + wire into `/decks/[id]` page

**Files:**
- Create: `src/components/deck/DeckView.tsx`
- Modify: `src/app/(app)/decks/[id]/page.tsx`

- [ ] **Step 1: Create `src/components/deck/DeckView.tsx`**

```tsx
// src/components/deck/DeckView.tsx
'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { Crown, Copy, Check, Lock, Globe } from 'lucide-react'
import DeckContent, { type DeckCardEntry } from './DeckContent'
import DeckStats from './DeckStats'
import CardDetail from '@/components/cards/CardDetail'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']
type DeckRow = Database['public']['Tables']['decks']['Row']

interface DeckViewProps {
  deck: DeckRow
  cards: DeckCardEntry[]
  ownerUsername: string
  ownerDisplayName: string
}

export default function DeckView({
  deck,
  cards,
  ownerUsername,
  ownerDisplayName,
}: DeckViewProps) {
  const [selectedDetailCard, setSelectedDetailCard] = useState<CardRow | null>(null)
  const [copied, setCopied] = useState(false)

  const commanderCards = useMemo(
    () => cards.filter((c) => c.board === 'commander'),
    [cards],
  )
  const mainCards = useMemo(
    () => cards.filter((c) => c.board === 'main'),
    [cards],
  )

  const isCommander = useCallback(
    (cardId: number) => commanderCards.some((c) => c.card.id === cardId),
    [commanderCards],
  )

  const statsCards = useMemo(
    () => cards.map((c) => ({ card: c.card, quantity: c.quantity, board: c.board })),
    [cards],
  )

  async function copyDeckList() {
    const lines = cards.map((c) => `${c.quantity} ${c.card.name}`).join('\n')
    try {
      await navigator.clipboard.writeText(lines)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // silently fail
    }
  }

  const visibility = (deck.visibility as 'private' | 'public') ?? 'private'

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <h1 className="text-xl font-bold text-font-primary sm:text-2xl">
            {deck.name}
          </h1>
          <span className="shrink-0 rounded-full bg-bg-cell px-2 py-0.5 text-[10px] sm:px-3 sm:py-1 sm:text-xs font-medium text-font-secondary">
            {deck.format}
          </span>
          {visibility === 'public' ? (
            <span className="flex items-center gap-1 rounded-full bg-bg-green/20 px-2 py-0.5 text-[10px] font-bold text-bg-green">
              <Globe className="h-3 w-3" /> Public
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-bg-cell px-2 py-0.5 text-[10px] font-bold text-font-muted">
              <Lock className="h-3 w-3" /> Private
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link
            href={`/u/${ownerUsername}`}
            className="flex items-center gap-2 text-sm text-font-secondary transition-colors hover:text-font-accent"
          >
            <span>
              by <span className="font-semibold">{ownerDisplayName}</span>
            </span>
            <span className="text-font-muted">@{ownerUsername}</span>
          </Link>

          <button
            onClick={copyDeckList}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-surface px-3 py-1.5 text-xs font-medium text-font-secondary transition-colors hover:bg-bg-hover"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-bg-green" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" /> Copy list
              </>
            )}
          </button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-col gap-4 sm:gap-6 lg:flex-row">
        {/* Left: card list */}
        <div className="flex-1">
          {commanderCards.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-bg-yellow">
                <Crown className="h-4 w-4" /> Commander
              </h3>
            </div>
          )}
          <DeckContent
            cards={mainCards}
            commanderCards={commanderCards}
            isCommander={isCommander}
            onCardClick={setSelectedDetailCard}
          />
        </div>

        {/* Right: stats */}
        <div className="w-full shrink-0 lg:w-80">
          <div className="sticky top-6 rounded-xl border border-border bg-bg-surface p-4">
            <h2 className="mb-4 text-sm font-semibold text-font-secondary">
              Deck Statistics
            </h2>
            <DeckStats cards={statsCards} />
          </div>
        </div>
      </div>

      {selectedDetailCard && (
        <CardDetail
          card={selectedDetailCard}
          onClose={() => setSelectedDetailCard(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update `/decks/[id]/page.tsx` to branch between owner and visitor**

```tsx
// src/app/(app)/decks/[id]/page.tsx
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import DeckEditor from '@/components/deck/DeckEditor'
import DeckView from '@/components/deck/DeckView'
import type { Database } from '@/types/supabase'

type CardRow = Database['public']['Tables']['cards']['Row']

interface DeckCardFromDB {
  id: string
  card_id: number
  quantity: number
  board: string
  created_at: string
  card: CardRow
}

export default async function DeckDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const [{ data: deck, error: deckError }, { data: deckCards }] = await Promise.all([
    supabase.from('decks').select('*').eq('id', id).single(),
    supabase
      .from('deck_cards')
      .select(`
        id,
        card_id,
        quantity,
        board,
        created_at,
        card:cards!card_id(*)
      `)
      .eq('deck_id', id),
  ])

  if (deckError || !deck) notFound()

  const isOwner = deck.user_id === user.id
  const visibility = (deck.visibility as 'private' | 'public') ?? 'private'

  // Non-owner + private → hide existence
  if (!isOwner && visibility !== 'public') notFound()

  const formattedCards = ((deckCards ?? []) as unknown as DeckCardFromDB[])
    .filter((dc) => dc.card != null)
    .map((dc) => ({
      id: dc.id,
      card: dc.card,
      quantity: dc.quantity,
      board: dc.board,
    }))

  if (isOwner) {
    return <DeckEditor deck={deck} initialCards={formattedCards} />
  }

  // Visitor view: fetch owner profile to render the "by @username" pill
  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('username, display_name')
    .eq('id', deck.user_id)
    .single()

  if (!ownerProfile) notFound()

  return (
    <DeckView
      deck={deck}
      cards={formattedCards}
      ownerUsername={ownerProfile.username}
      ownerDisplayName={ownerProfile.display_name}
    />
  )
}
```

- [ ] **Step 3: Typecheck + build**

```bash
npx tsc --noEmit 2>&1 | head -20
npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/deck/DeckView.tsx "src/app/(app)/decks/[id]/page.tsx"
git commit -m "feat(deck): DeckView read-only component + owner/visitor branching"
```

---

## Task 8: Create `/api/profile` PATCH route

**Files:**
- Create: `src/app/api/profile/route.ts`

- [ ] **Step 1: Create the route**

```ts
// src/app/api/profile/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface ProfileUpdateBody {
  username?: string
  display_name?: string
  bio?: string | null
}

const USERNAME_REGEX = /^[a-z0-9_]{3,24}$/
const DISPLAY_NAME_MAX = 40
const BIO_MAX = 240

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as ProfileUpdateBody

  // Validate client-side before hitting DB — gives friendly errors
  const updates: Record<string, unknown> = {}

  if (body.username !== undefined) {
    const username = body.username.trim().toLowerCase()
    if (!USERNAME_REGEX.test(username)) {
      return NextResponse.json(
        { error: 'Username must be 3-24 characters, lowercase letters, numbers, or underscores' },
        { status: 400 },
      )
    }
    updates.username = username
  }

  if (body.display_name !== undefined) {
    const displayName = body.display_name.trim()
    if (displayName.length < 1 || displayName.length > DISPLAY_NAME_MAX) {
      return NextResponse.json(
        { error: `Display name must be 1-${DISPLAY_NAME_MAX} characters` },
        { status: 400 },
      )
    }
    updates.display_name = displayName
  }

  if (body.bio !== undefined) {
    const bio = body.bio === null ? null : body.bio.trim()
    if (bio !== null && bio.length > BIO_MAX) {
      return NextResponse.json(
        { error: `Bio must be at most ${BIO_MAX} characters` },
        { status: 400 },
      )
    }
    updates.bio = bio
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
  }

  // Soft pre-check of the 15-day cooldown if username is changing
  if (updates.username !== undefined) {
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('username, username_changed_at')
      .eq('id', user.id)
      .single()

    if (currentProfile && currentProfile.username !== updates.username) {
      if (currentProfile.username_changed_at) {
        const lastChange = new Date(currentProfile.username_changed_at)
        const daysSince = (Date.now() - lastChange.getTime()) / (1000 * 60 * 60 * 24)
        if (daysSince < 15) {
          const nextAllowed = new Date(lastChange.getTime() + 15 * 24 * 60 * 60 * 1000)
          return NextResponse.json(
            {
              error: `You can change your username again on ${nextAllowed.toLocaleDateString()}`,
              next_change_allowed_at: nextAllowed.toISOString(),
            },
            { status: 429 },
          )
        }
      }
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select('username, display_name, bio, username_changed_at')
    .single()

  if (error) {
    // Unique constraint violation on username
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'That username is already taken' },
        { status: 409 },
      )
    }
    // Cooldown trigger raised P0001 (safety net)
    if (error.code === 'P0001') {
      return NextResponse.json(
        { error: 'Username can only be changed once every 15 days' },
        { status: 429 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ profile: data })
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/profile/route.ts
git commit -m "feat(api): PATCH /api/profile with username cooldown"
```

---

## Task 9: Add Public Profile editing section to `/profile` page

**Files:**
- Modify: `src/app/(app)/profile/page.tsx`

- [ ] **Step 1: Add state for the new fields**

Near the top of the `ProfilePage` component, add:

```tsx
const [username, setUsername] = useState('')
const [displayName, setDisplayName] = useState('')
const [bio, setBio] = useState('')
const [usernameChangedAt, setUsernameChangedAt] = useState<string | null>(null)
const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
const [profileLoading, setProfileLoading] = useState(false)
const [usernameDirty, setUsernameDirty] = useState(false)
```

- [ ] **Step 2: Load the profile in the existing `loadProfile` useEffect**

Extend the existing `useEffect` to also fetch the profile row:

```tsx
const { data: profile } = await supabase
  .from('profiles')
  .select('username, display_name, bio, username_changed_at')
  .eq('id', user.id)
  .single()

if (profile) {
  setUsername(profile.username)
  setDisplayName(profile.display_name)
  setBio(profile.bio ?? '')
  setUsernameChangedAt(profile.username_changed_at)
}
```

- [ ] **Step 3: Compute the cooldown status**

```tsx
const cooldownDaysLeft = useMemo(() => {
  if (!usernameChangedAt) return 0
  const last = new Date(usernameChangedAt).getTime()
  const days = (Date.now() - last) / (1000 * 60 * 60 * 24)
  return Math.max(0, Math.ceil(15 - days))
}, [usernameChangedAt])

const canChangeUsername = cooldownDaysLeft === 0
```

- [ ] **Step 4: Add the save handler**

```tsx
const handleSaveProfile = async (e: React.FormEvent) => {
  e.preventDefault()
  setProfileMsg(null)
  setProfileLoading(true)

  const body: Record<string, string | null> = {
    display_name: displayName,
    bio: bio.length > 0 ? bio : null,
  }
  if (usernameDirty) {
    body.username = username
  }

  const res = await fetch('/api/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    setProfileMsg({ type: 'error', text: data.error ?? 'Update failed' })
  } else {
    setProfileMsg({ type: 'success', text: 'Profile updated' })
    setUsernameDirty(false)
    if (data.profile?.username_changed_at) {
      setUsernameChangedAt(data.profile.username_changed_at)
    }
  }
  setProfileLoading(false)
}
```

- [ ] **Step 5: Add the public profile section JSX**

Insert a new `<section>` above the "Change Password" section:

```tsx
<section className="rounded-xl border border-border bg-bg-surface p-5">
  <h2 className="mb-4 text-lg font-semibold text-font-primary">
    Public Profile
  </h2>
  <form onSubmit={handleSaveProfile} className="space-y-3">
    <div>
      <label className="mb-1 block text-sm text-font-secondary">Username</label>
      <div className="flex items-center gap-2">
        <span className="text-font-muted">@</span>
        <input
          type="text"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
            setUsernameDirty(true)
          }}
          disabled={!canChangeUsername}
          pattern="^[a-z0-9_]{3,24}$"
          className="w-full rounded-lg border border-border bg-bg-card px-3 py-2 text-font-primary placeholder:text-font-muted focus:border-bg-accent focus:outline-none disabled:opacity-60"
        />
      </div>
      {!canChangeUsername && (
        <p className="mt-1 text-xs text-font-muted">
          You can change your username again in {cooldownDaysLeft} day{cooldownDaysLeft === 1 ? '' : 's'}.
        </p>
      )}
    </div>

    <div>
      <label className="mb-1 block text-sm text-font-secondary">Display name</label>
      <input
        type="text"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        maxLength={40}
        className="w-full rounded-lg border border-border bg-bg-card px-3 py-2 text-font-primary placeholder:text-font-muted focus:border-bg-accent focus:outline-none"
      />
    </div>

    <div>
      <label className="mb-1 block text-sm text-font-secondary">Bio</label>
      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        maxLength={240}
        rows={3}
        className="w-full resize-none rounded-lg border border-border bg-bg-card px-3 py-2 text-font-primary placeholder:text-font-muted focus:border-bg-accent focus:outline-none"
      />
      <p className="mt-1 text-right text-xs text-font-muted">
        {bio.length}/240
      </p>
    </div>

    {profileMsg && (
      <p
        className={`text-sm ${
          profileMsg.type === 'error' ? 'text-bg-red' : 'text-bg-green'
        }`}
      >
        {profileMsg.text}
      </p>
    )}

    <button
      type="submit"
      disabled={profileLoading}
      className="w-full rounded-lg bg-bg-accent px-4 py-2.5 text-sm font-medium text-font-white transition-colors hover:bg-bg-accent-dark disabled:opacity-50"
    >
      {profileLoading ? 'Saving...' : 'Save'}
    </button>
  </form>
</section>
```

Don't forget the `useMemo` import at the top of the file.

- [ ] **Step 6: Typecheck + build**

```bash
npx tsc --noEmit 2>&1 | head -10
npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/profile/page.tsx"
git commit -m "feat(profile): public profile editing (username, display name, bio)"
```

---

## Task 10: Create `/api/users/search` GET route

**Files:**
- Create: `src/app/api/users/search/route.ts`

- [ ] **Step 1: Create the route**

```ts
// src/app/api/users/search/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const query = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10) || 20,
    50,
  )

  if (query.length < 1) {
    return NextResponse.json({ users: [] })
  }

  const { data, error } = await supabase.rpc('search_users', {
    p_query: query,
    p_limit: limit,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ users: data ?? [] })
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/users/search/route.ts
git commit -m "feat(api): GET /api/users/search via search_users RPC"
```

---

## Task 11: Create `<UserSearch>` + `<UserCard>` client components

**Files:**
- Create: `src/components/users/UserCard.tsx`
- Create: `src/components/users/UserSearch.tsx`

- [ ] **Step 1: Create `UserCard.tsx`**

```tsx
// src/components/users/UserCard.tsx
'use client'

import Link from 'next/link'
import { Layers } from 'lucide-react'

interface UserCardProps {
  username: string
  displayName: string
  bio?: string | null
  publicDeckCount: number
}

// Deterministic colored initials based on the username hash
function initialColor(username: string): string {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) >>> 0
  }
  const hue = hash % 360
  return `hsl(${hue}, 60%, 45%)`
}

function initialsOf(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function UserCard({
  username,
  displayName,
  bio,
  publicDeckCount,
}: UserCardProps) {
  return (
    <Link
      href={`/u/${username}`}
      className="flex items-start gap-3 rounded-xl border border-border bg-bg-surface p-4 transition-colors hover:border-border-light hover:bg-bg-hover"
    >
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-font-white"
        style={{ backgroundColor: initialColor(username) }}
      >
        {initialsOf(displayName)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-font-primary">
          {displayName}
        </p>
        <p className="truncate text-xs text-font-muted">@{username}</p>
        {bio && (
          <p className="mt-1 line-clamp-2 text-xs text-font-secondary">{bio}</p>
        )}
        <div className="mt-2 flex items-center gap-1 text-[11px] text-font-muted">
          <Layers className="h-3 w-3" />
          {publicDeckCount} public deck{publicDeckCount === 1 ? '' : 's'}
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Create `UserSearch.tsx`**

```tsx
// src/components/users/UserSearch.tsx
'use client'

import { useState, useEffect } from 'react'
import { Search, Loader2 } from 'lucide-react'
import UserCard from './UserCard'

interface SearchResult {
  id: string
  username: string
  display_name: string
  bio: string | null
  public_deck_count: number
}

interface InitialUser {
  id: string
  username: string
  display_name: string
  public_deck_count: number
}

interface UserSearchProps {
  initialUsers: InitialUser[]
}

export default function UserSearch({ initialUsers }: UserSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)

  // Debounced search
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length === 0) {
      setResults(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(trimmed)}`)
        if (res.ok) {
          const data = await res.json()
          setResults(data.users ?? [])
        } else {
          setResults([])
        }
      } catch {
        setResults([])
      }
      setLoading(false)
    }, 300)

    return () => clearTimeout(handle)
  }, [query])

  const showEmptyState = results === null
  const usersToRender = showEmptyState
    ? initialUsers.map((u) => ({
        id: u.id,
        username: u.username,
        display_name: u.display_name,
        bio: null,
        public_deck_count: u.public_deck_count,
      }))
    : results

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-font-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players by username or name..."
          className="w-full rounded-lg border border-border bg-bg-card px-10 py-2.5 text-sm text-font-primary placeholder:text-font-muted focus:border-bg-accent focus:outline-none focus:ring-2 focus:ring-bg-accent/20"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-font-muted" />
        )}
      </div>

      {showEmptyState && (
        <h2 className="text-sm font-semibold text-font-secondary">Latest joiners</h2>
      )}

      {usersToRender.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-bg-card p-8 text-center">
          <p className="text-sm text-font-muted">
            {showEmptyState ? 'No one is here yet.' : `No players match "${query}"`}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {usersToRender.map((u) => (
            <UserCard
              key={u.id}
              username={u.username}
              displayName={u.display_name}
              bio={u.bio}
              publicDeckCount={u.public_deck_count}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/users/
git commit -m "feat(users): UserSearch and UserCard components"
```

---

## Task 12: Create `/users` page + loading.tsx

**Files:**
- Create: `src/app/(app)/users/page.tsx`
- Create: `src/app/(app)/users/loading.tsx`

- [ ] **Step 1: Create the page**

```tsx
// src/app/(app)/users/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import UserSearch from '@/components/users/UserSearch'

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
      <UserSearch initialUsers={latestUsers ?? []} />
    </div>
  )
}
```

- [ ] **Step 2: Create the loading skeleton**

```tsx
// src/app/(app)/users/loading.tsx
export default function UsersLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 animate-pulse">
      <div className="mb-6 h-8 w-40 rounded bg-bg-cell" />
      <div className="mb-4 h-11 rounded-lg bg-bg-cell/60" />
      <div className="mb-3 h-4 w-32 rounded bg-bg-cell/60" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-border bg-bg-surface" />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck + build**

```bash
npx tsc --noEmit 2>&1 | head -10
npm run build 2>&1 | tail -5
```

Expected: clean, `/users` should appear in the build output.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/users/"
git commit -m "feat(users): /users Community page with latest joiners empty state"
```

---

## Task 13: Add Community entry to Navbar

**Files:**
- Modify: `src/components/Navbar.tsx`

- [ ] **Step 1: Add `Users` icon to the Lucide import**

```tsx
import {
  LayoutDashboard,
  Search,
  Layers,
  Swords,
  User,
  Users,     // <-- add this
  LogOut,
  Sparkles,
} from "lucide-react";
```

- [ ] **Step 2: Add Community entry to the `navItems` array between Play and Profile**

```tsx
const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/cards", label: "Cards", icon: Search },
  { href: "/decks", label: "Decks", icon: Layers },
  { href: "/play", label: "Play", icon: Swords },
  { href: "/users", label: "Community", icon: Users },    // <-- add this
  { href: "/profile", label: "Profile", icon: User },
];
```

- [ ] **Step 3: Visual check — the mobile bottom bar now has 6 slots**

Verify in the browser that the bottom bar is still usable on a ~375px viewport. Each slot will be slightly narrower (~55-60px) but still tappable.

- [ ] **Step 4: Typecheck + build**

```bash
npx tsc --noEmit 2>&1 | head -10
npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/Navbar.tsx
git commit -m "feat(navbar): add Community entry"
```

---

## Task 14: Create `<ProfileStats>` component

**Files:**
- Create: `src/components/users/ProfileStats.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/users/ProfileStats.tsx
'use client'

import Image from 'next/image'
import { Layers, Swords, Crown, Star } from 'lucide-react'

interface ProfileStatsProps {
  publicDeckCount: number
  totalDeckCount: number   // equals publicDeckCount for visitors
  favoriteFormat: string | null
  colorFrequencies: Record<string, number>   // e.g. {W: 3, U: 1, ...}
  latestCommander: { id: string; name: string; image_small: string | null; image_normal: string | null } | null
  mostUsedCard: { id: string; name: string; image_small: string | null } | null
  uniqueCardsCount: number
  isSelf: boolean
}

const COLOR_LABELS: Record<string, { symbol: string; bg: string }> = {
  W: { symbol: 'W', bg: '#fffbd5' },
  U: { symbol: 'U', bg: '#0e68ab' },
  B: { symbol: 'B', bg: '#150b00' },
  R: { symbol: 'R', bg: '#d3202a' },
  G: { symbol: 'G', bg: '#00733e' },
}

export default function ProfileStats({
  publicDeckCount,
  totalDeckCount,
  favoriteFormat,
  colorFrequencies,
  latestCommander,
  mostUsedCard,
  uniqueCardsCount,
  isSelf,
}: ProfileStatsProps) {
  const sortedColors = Object.entries(colorFrequencies)
    .filter(([, cnt]) => cnt > 0)
    .sort(([, a], [, b]) => b - a)

  const hasStats = publicDeckCount > 0 || (isSelf && totalDeckCount > 0)

  if (!hasStats) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-bg-card p-8 text-center">
        <p className="text-sm text-font-muted">
          {isSelf ? 'No decks yet. Create one to see your stats.' : 'No public decks yet.'}
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {/* Public decks */}
      <div className="rounded-xl border border-border bg-bg-surface p-4">
        <div className="flex items-center gap-2 text-xs text-font-muted">
          <Layers className="h-3.5 w-3.5" /> Public decks
        </div>
        <p className="mt-2 text-2xl font-bold text-font-primary">{publicDeckCount}</p>
        {isSelf && totalDeckCount > publicDeckCount && (
          <p className="text-[11px] text-font-muted">
            {totalDeckCount - publicDeckCount} private (only you can see)
          </p>
        )}
      </div>

      {/* Favorite format */}
      <div className="rounded-xl border border-border bg-bg-surface p-4">
        <div className="flex items-center gap-2 text-xs text-font-muted">
          <Swords className="h-3.5 w-3.5" /> Favorite format
        </div>
        <p className="mt-2 text-lg font-bold capitalize text-font-primary">
          {favoriteFormat ?? '—'}
        </p>
      </div>

      {/* Color identity */}
      <div className="rounded-xl border border-border bg-bg-surface p-4 sm:col-span-1">
        <div className="flex items-center gap-2 text-xs text-font-muted">
          <Star className="h-3.5 w-3.5" /> Colors
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {sortedColors.length > 0 ? (
            sortedColors.map(([letter, cnt]) => {
              const meta = COLOR_LABELS[letter]
              if (!meta) return null
              return (
                <div
                  key={letter}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{
                    backgroundColor: meta.bg,
                    color: letter === 'W' ? '#000' : '#fff',
                  }}
                  title={`${letter}: ${cnt} deck${cnt === 1 ? '' : 's'}`}
                >
                  {meta.symbol}
                </div>
              )
            })
          ) : (
            <span className="text-sm text-font-muted">—</span>
          )}
        </div>
      </div>

      {/* Latest commander */}
      {latestCommander && (
        <div className="rounded-xl border border-border bg-bg-surface p-4 sm:col-span-2">
          <div className="flex items-center gap-2 text-xs text-font-muted">
            <Crown className="h-3.5 w-3.5" /> Latest commander
          </div>
          <div className="mt-2 flex items-center gap-3">
            {latestCommander.image_small && (
              <Image
                src={latestCommander.image_small}
                alt={latestCommander.name}
                width={48}
                height={67}
                className="rounded"
                unoptimized
              />
            )}
            <p className="text-sm font-semibold text-font-primary">
              {latestCommander.name}
            </p>
          </div>
        </div>
      )}

      {/* Most used card */}
      {mostUsedCard && (
        <div className="rounded-xl border border-border bg-bg-surface p-4">
          <div className="flex items-center gap-2 text-xs text-font-muted">
            <Star className="h-3.5 w-3.5" /> Most-used card
          </div>
          <div className="mt-2 flex items-center gap-2">
            {mostUsedCard.image_small && (
              <Image
                src={mostUsedCard.image_small}
                alt={mostUsedCard.name}
                width={32}
                height={45}
                className="rounded"
                unoptimized
              />
            )}
            <p className="text-xs font-semibold text-font-primary">
              {mostUsedCard.name}
            </p>
          </div>
        </div>
      )}

      {/* Unique cards */}
      <div className="rounded-xl border border-border bg-bg-surface p-4">
        <div className="flex items-center gap-2 text-xs text-font-muted">
          <Layers className="h-3.5 w-3.5" /> Unique cards
        </div>
        <p className="mt-2 text-2xl font-bold text-font-primary">{uniqueCardsCount}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/users/ProfileStats.tsx
git commit -m "feat(users): ProfileStats component"
```

---

## Task 15: Create `/u/[username]` profile page + loading.tsx

**Files:**
- Create: `src/app/(app)/u/[username]/page.tsx`
- Create: `src/app/(app)/u/[username]/loading.tsx`

- [ ] **Step 1: Create the page**

```tsx
// src/app/(app)/u/[username]/page.tsx
import Link from 'next/link'
import Image from 'next/image'
import { notFound, redirect } from 'next/navigation'
import { Layers } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import ProfileStats from '@/components/users/ProfileStats'

interface ProfileStatsRow {
  public_deck_count: number
  total_deck_count: number
  favorite_format: string | null
  color_frequencies: Record<string, number>
  latest_commander: { id: string; name: string; image_small: string | null; image_normal: string | null } | null
  most_used_card: { id: string; name: string; image_small: string | null } | null
  unique_cards_count: number
}

function initialColor(username: string): string {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) >>> 0
  }
  const hue = hash % 360
  return `hsl(${hue}, 60%, 45%)`
}

function initialsOf(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, created_at')
    .eq('username', username)
    .single()

  if (!profile) notFound()

  const isSelf = profile.id === user.id

  // Fetch stats + public decks in parallel
  const [{ data: statsRows }, { data: publicDecks }] = await Promise.all([
    supabase.rpc('get_profile_stats', { p_username: username }),
    supabase
      .from('decks')
      .select('id, name, format, updated_at, visibility')
      .eq('user_id', profile.id)
      .eq('visibility', 'public')
      .order('updated_at', { ascending: false }),
  ])

  const stats = ((statsRows ?? []) as ProfileStatsRow[])[0] ?? {
    public_deck_count: 0,
    total_deck_count: 0,
    favorite_format: null,
    color_frequencies: {},
    latest_commander: null,
    most_used_card: null,
    unique_cards_count: 0,
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-font-white"
          style={{ backgroundColor: initialColor(profile.username) }}
        >
          {initialsOf(profile.display_name)}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-font-primary">
            {profile.display_name}
          </h1>
          <p className="text-sm text-font-muted">@{profile.username}</p>
          {profile.bio && (
            <p className="mt-2 text-sm text-font-secondary">{profile.bio}</p>
          )}
          <p className="mt-2 text-xs text-font-muted">
            Joined {new Date(profile.created_at).toLocaleDateString()}
          </p>
        </div>
        {isSelf && (
          <Link
            href="/profile"
            className="self-start rounded-lg border border-border bg-bg-surface px-3 py-1.5 text-xs font-medium text-font-secondary transition-colors hover:bg-bg-hover"
          >
            Edit profile
          </Link>
        )}
      </div>

      {/* Stats */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-font-secondary">
          Statistics
        </h2>
        <ProfileStats
          publicDeckCount={stats.public_deck_count}
          totalDeckCount={stats.total_deck_count}
          favoriteFormat={stats.favorite_format}
          colorFrequencies={stats.color_frequencies}
          latestCommander={stats.latest_commander}
          mostUsedCard={stats.most_used_card}
          uniqueCardsCount={stats.unique_cards_count}
          isSelf={isSelf}
        />
      </section>

      {/* Public decks */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-font-secondary">
          Public decks ({publicDecks?.length ?? 0})
        </h2>
        {!publicDecks || publicDecks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-bg-card p-8 text-center">
            <Layers className="mx-auto h-10 w-10 text-font-muted" />
            <p className="mt-3 text-sm text-font-muted">
              {isSelf ? 'Toggle one of your decks to public to see it here.' : 'No public decks yet.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {publicDecks.map((deck) => (
              <Link
                key={deck.id}
                href={`/decks/${deck.id}`}
                className="rounded-xl border border-border bg-bg-surface p-4 transition-colors hover:border-border-light hover:bg-bg-hover"
              >
                <p className="truncate text-sm font-semibold text-font-primary">
                  {deck.name}
                </p>
                <p className="text-xs text-font-muted">
                  {deck.format} · Updated{' '}
                  {new Date(deck.updated_at).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Create the loading skeleton**

```tsx
// src/app/(app)/u/[username]/loading.tsx
export default function PublicProfileLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 animate-pulse">
      {/* Header skeleton */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="h-20 w-20 rounded-full bg-bg-cell" />
        <div className="flex-1 space-y-2">
          <div className="h-6 w-48 rounded bg-bg-cell" />
          <div className="h-4 w-32 rounded bg-bg-cell/70" />
          <div className="h-4 w-64 rounded bg-bg-cell/60" />
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-border bg-bg-surface" />
        ))}
      </div>

      {/* Decks skeleton */}
      <div className="mb-3 h-5 w-40 rounded bg-bg-cell/60" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border border-border bg-bg-surface" />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck + build**

```bash
npx tsc --noEmit 2>&1 | head -10
npm run build 2>&1 | tail -5
```

Expected: clean, `/u/[username]` should appear in build output.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/u/"
git commit -m "feat(users): /u/[username] public profile page with stats and decks"
```

---

## Task 16: Push + deploy + smoke test

**Files:**
- None (deployment)

- [ ] **Step 1: Push all commits to origin/main**

```bash
git push origin main
```

Expected: all commits from Tasks 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 delivered.

- [ ] **Step 2: Poll Vercel deploy status**

```bash
sleep 50 && vercel ls --yes 2>&1 | grep -E "Building|Ready|Error" | head -3
```

Expected: most recent deploy eventually shows `● Ready` (usually 30–40s).

- [ ] **Step 3: Smoke test — self profile editing**

1. Open `the-gathering-eight.vercel.app/profile`
2. Verify username, display name, bio are populated (auto-generated for existing user)
3. Edit display name → Save → verify green "Profile updated" message
4. Verify Community entry exists in navbar

- [ ] **Step 4: Smoke test — deck visibility toggle**

1. Open a deck from `/decks`
2. Verify VisibilityToggle appears in the toolbar next to Import/Export
3. Click `Public` → button state updates optimistically
4. Hard-refresh the page → toggle still shows Public

- [ ] **Step 5: Smoke test — Community search**

1. Open `/users`
2. Verify "Latest joiners" empty state shows your own account
3. Type your username in the search → result appears
4. Click the card → `/u/{your-username}` loads

- [ ] **Step 6: Smoke test — public profile + stats**

1. On `/u/{your-username}`, verify header shows colored initials + display name + `@username` + join date + bio
2. Verify stats card shows public deck count, favorite format, colors, latest commander, most used card, unique cards count
3. Verify the public deck you toggled in Step 4 appears in the Public Decks list

- [ ] **Step 7: Smoke test — privacy check**

1. Create a temporary second account (sign up at `/register` with a test email)
2. Navigate to `/u/{your-first-account-username}`
3. Verify only your public deck appears (not any private decks)
4. Try to visit `/decks/{private-deck-id}` directly from the URL → should return 404
5. Sign back into the main account, delete the test account from `/profile`

- [ ] **Step 8: Smoke test — username cooldown**

1. On `/profile`, change your username from the auto-generated one → Save → success
2. Immediately try to change it again → verify error "You can change your username again on {date}"

- [ ] **Step 9: No commit — this task is smoke test only**

If any step fails, file an issue in a follow-up task and fix before marking the plan complete.

---

## Self-review checklist (run before handing off for execution)

- [x] **Spec coverage:** every numbered decision in the spec maps to a task
  - Decision 1-3 (registered-only, 2-state visibility, private default) → Task 1 (migration) + Task 5/6 (toggle)
  - Decision 4 (username auto-gen + 15d cooldown) → Task 1 (trigger) + Task 8 (API) + Task 9 (UI)
  - Decision 5 (no avatars) → Task 11 (UserCard initial colors), Task 15 (profile header initial colors)
  - Decision 6 (stats live, YAGNI on materialization) → Task 1 (RPC) + Task 14/15 (UI)
  - Decision 7 (RLS filters stats invisibly) → Task 1 (RLS policies) — no app-level code needed
  - Decision 8 (same URL for owner/visitor) → Task 7 (branching page)
  - Decision 9 (RLS source of truth) → Task 1 (policies) — defense in depth
  - Decision 10 (deck-level distinct colors) → Task 1 (SQL function)
- [x] **Placeholder scan:** no TBD / TODO / "add appropriate" in any step — every code block is complete
- [x] **Type consistency:** `DeckCardEntry` type exported from DeckContent and reused by DeckView; `ProfileStatsRow` defined once in the page file; `search_users` / `get_profile_stats` signatures match supabase.ts types
- [x] **Migration idempotent:** `on conflict do nothing` on backfill; `create or replace function` for all functions
- [x] **Rollback path:** drop table profiles cascade + drop column visibility documented in spec
- [x] **No TDD test framework:** this project has no test runner, so tasks use typecheck + build + manual smoke test as verification gates. Future work: add a test runner and backfill unit tests for the RPCs.
