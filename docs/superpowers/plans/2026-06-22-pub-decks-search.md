# Pub Decks Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Pub Decks" page (`/decks/public`) that lists all `visibility='public'` decks with a rich filter panel and "carica altri" pagination; rename the navbar "Decks" entry to "My Decks".

**Architecture:** PL/pgSQL RPC `search_public_decks` does all filtering server-side (name, creator, commander, color, color identity, card-list AND/OR, format) with limit/offset pagination. A Next.js API route wraps it; a server page renders the first page; a client `PublicDeckBrowser` owns filter state + debounced search + "carica altri". Navbar gets two entries; dashboard "Latest public decks" gets a "View all" link.

**Tech Stack:** Next.js 16 App Router, Supabase (PL/pgSQL RPC + server client), TypeScript, Tailwind, lucide-react.

## Global Constraints

- Branch: `dev` (GitFlow — commit + push `origin/dev` after each task).
- No test runner — verify via `supabase db query --linked`, `npx tsc --noEmit`, `npx eslint <files>`.
- Migration applied to remote via `supabase db query --linked -f <file>` (project does NOT use `supabase db push` — 45 remote migrations have no local file). Record in `supabase_migrations.schema_migrations` after apply.
- Caveman mode for prose; code/commits normal. No Claude/Anthropic mentions in commits.
- `PAGE_SIZE = 10` everywhere (RPC default, API, client `hasMore` check).
- Filter params for multi-value (colors, ci, cards) travel as comma-separated strings; RPC uses `string_to_array(x, ',')`.
- Spec: `docs/superpowers/specs/2026-06-22-pub-decks-search-design.md`.

---

## File Structure

**Create:**
- `supabase/migrations/<ts>_pub_decks_search.sql` — RPC + index
- `src/app/api/decks/public/search/route.ts` — GET wrapper
- `src/app/(app)/decks/public/page.tsx` — server page, first page
- `src/components/decks/PublicDeckBrowser.tsx` — client orchestrator (state + fetch + pagination + results)
- `src/components/decks/DeckFilters.tsx` — filter panel
- `src/components/decks/CardListFilter.tsx` — card picker (search + chips + AND/OR)

**Modify:**
- `src/components/Navbar.tsx` — rename "Decks"→"My Decks", add "Pub Decks" entry
- `src/app/(app)/dashboard/page.tsx` — add "View all" link to "Latest public decks" header
- `DECISIONS.md` — append pub-decks design decision

---

### Task 1: Migration — `search_public_decks` RPC + `deck_cards(card_id)` index

**Files:**
- Create: `supabase/migrations/<ts>_pub_decks_search.sql`

**Interfaces:**
- Produces: RPC `search_public_decks(p_name text, p_creator text, p_commander text, p_colors text, p_color_identity text, p_cards text, p_card_mode text, p_format text, p_limit int, p_offset int)` returning the row shape below. All params default null/0/10 so omitted params = no filter. `security invoker`, `stable`.

- [ ] **Step 1: Create migration file**

```bash
supabase migration new pub_decks_search
```

- [ ] **Step 2: Write the SQL**

```sql
-- Index for the card-list filter: "deck contains card X" lookups by card_id.
-- Currently absent; needed as public-deck volume + filter usage grows.
create index if not exists idx_deck_cards_card_id on public.deck_cards(card_id);

-- Public deck search. All filters server-side. security invoker → RLS applies
-- (caller sees only decks/profiles/cards their role can read). Multi-value
-- params (p_colors, p_color_identity, p_cards) are comma-separated strings;
-- empty string or NULL = no filter for that field.
--
-- Color (p_colors):       deck has a card of EACH selected mana color (cards.colors).
-- Color identity (p_ci):  deck CI (union of cards.color_identity, boards main+commander)
--                         includes ALL selected.
-- Card list (p_cards):    p_card_mode='and' → deck contains ALL listed card_ids (any board);
--                         'or' → at least one present.
create or replace function public.search_public_decks(
  p_name text default null,
  p_creator text default null,
  p_commander text default null,
  p_colors text default null,
  p_color_identity text default null,
  p_cards text default null,
  p_card_mode text default 'and',
  p_format text default null,
  p_limit int default 10,
  p_offset int default 0
)
returns table (
  id uuid,
  name text,
  description text,
  format text,
  card_count int,
  updated_at timestamptz,
  user_id uuid,
  creator_username text,
  creator_display_name text,
  commander_card_id uuid,
  commander_name text,
  cover_card_id uuid,
  cover_image_art_crop text,
  cover_image_normal text
)
language sql stable security invoker as $$
  select
    d.id, d.name, d.description, d.format, d.card_count, d.updated_at,
    d.user_id,
    pr.username as creator_username,
    pr.display_name as creator_display_name,
    cmd.card_id as commander_card_id,
    cmd_card.name as commander_name,
    d.cover_card_id,
    cov.image_art_crop as cover_image_art_crop,
    cov.image_normal as cover_image_normal
  from public.decks d
  join public.profiles pr on pr.id = d.user_id
  left join lateral (
    select dc.card_id
    from public.deck_cards dc
    where dc.deck_id = d.id and dc.board = 'commander'
    order by dc.created_at
    limit 1
  ) cmd on true
  left join public.cards cmd_card on cmd_card.id = cmd.card_id
  left join public.cards cov on cov.id = d.cover_card_id
  where d.visibility = 'public'
    and (p_name is null or p_name = '' or d.name ilike '%' || p_name || '%')
    and (
      p_creator is null or p_creator = ''
      or pr.username ilike '%' || p_creator || '%'
      or pr.display_name ilike '%' || p_creator || '%'
    )
    and (p_commander is null or p_commander = '' or cmd_card.name ilike '%' || p_commander || '%')
    and (p_format is null or p_format = '' or d.format = p_format)
    and (
      p_colors is null or p_colors = '' or (
        select count(distinct col) from (
          select distinct unnest(c.colors) as col
          from public.deck_cards dc
          join public.cards c on c.id = dc.card_id
          where dc.deck_id = d.id and dc.board in ('main','commander')
        ) s
        where col = any(string_to_array(p_colors, ','))
      ) = array_length(string_to_array(p_colors, ','), 1)
    )
    and (
      p_color_identity is null or p_color_identity = '' or (
        select count(distinct ci) from (
          select distinct unnest(c.color_identity) as ci
          from public.deck_cards dc
          join public.cards c on c.id = dc.card_id
          where dc.deck_id = d.id and dc.board in ('main','commander')
        ) s
        where ci = any(string_to_array(p_color_identity, ','))
      ) = array_length(string_to_array(p_color_identity, ','), 1)
    )
    and (
      p_cards is null or p_cards = '' or (
        case when p_card_mode = 'or' then
          exists(
            select 1 from public.deck_cards dc
            where dc.deck_id = d.id
              and dc.card_id::text = any(string_to_array(p_cards, ','))
          )
        else
          (
            select count(distinct dc.card_id) from public.deck_cards dc
            where dc.deck_id = d.id
              and dc.card_id::text = any(string_to_array(p_cards, ','))
          ) = array_length(string_to_array(p_cards, ','), 1)
        end
      )
    )
  order by d.updated_at desc
  limit p_limit offset p_offset;
$$;

grant execute on function public.search_public_decks(
  text, text, text, text, text, text, text, text, int, int
) to authenticated;

alter function public.search_public_decks(
  text, text, text, text, text, text, text, text, int, int
) set search_path = public, pg_catalog;
```

- [ ] **Step 3: Apply to remote**

```bash
supabase db query --linked -f supabase/migrations/<ts>_pub_decks_search.sql
```
Expected: empty `rows: []` (DDL), no error.

- [ ] **Step 4: Verify signature + behavior**

```bash
supabase db query --linked "select pg_get_function_arguments(oid) from pg_proc where proname='search_public_decks';"
supabase db query --linked "select count(*) from search_public_decks(null,null,null,null,null,null,null,null,10,0);"
supabase db query --linked "select name, format from search_public_decks(null,null,null,null,null,null,null,'Commander',10,0);"
supabase db query --linked "select name from search_public_decks('a',null,null,null,null,null,null,null,10,0);"
```
Expected: signature with all 10 params; count ≤ 10; format filter returns only Commander decks; name filter narrows.

- [ ] **Step 5: Record in migration history**

```bash
supabase db query --linked "insert into supabase_migrations.schema_migrations(version, name, statements) values ('<ts>', 'pub_decks_search', array['search_public_decks RPC + idx_deck_cards_card_id']) on conflict do nothing;"
supabase db query --linked "select version from supabase_migrations.schema_migrations where version='<ts>';"
```

- [ ] **Step 6: Commit + push**

```bash
git add supabase/migrations/<ts>_pub_decks_search.sql
git commit -m "feat(decks): search_public_decks RPC + deck_cards(card_id) index

PL/pgSQL RPC for Pub Decks filter search: name, creator, commander,
color (cards.colors), color identity (union of cards.color_identity),
card-list AND/OR, format. security invoker, stable. limit/offset pagination.
Index on deck_cards(card_id) backs the card-list lookup."
git push origin dev
```

---

### Task 2: API route `GET /api/decks/public/search`

**Files:**
- Create: `src/app/api/decks/public/search/route.ts`

**Interfaces:**
- Consumes: RPC `search_public_decks` (Task 1).
- Produces: `GET /api/decks/public/search?name=&creator=&commander=&colors=W,U&ci=&cards=<uuid>,<uuid>&cardMode=and&format=&offset=0` → `{ decks: PublicDeckResult[] }`. `PublicDeckResult` matches the RPC return columns.

- [ ] **Step 1: Create route file**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PAGE_SIZE = 10
const MAX_OFFSET = 1000

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sp = request.nextUrl.searchParams
  const rawOffset = parseInt(sp.get('offset') ?? '0', 10)
  const offset = Number.isFinite(rawOffset)
    ? Math.max(0, Math.min(rawOffset, MAX_OFFSET))
    : 0
  const cardMode = sp.get('cardMode') === 'or' ? 'or' : 'and'

  const { data, error } = await supabase.rpc('search_public_decks', {
    p_name: sp.get('name') ?? '',
    p_creator: sp.get('creator') ?? '',
    p_commander: sp.get('commander') ?? '',
    p_colors: sp.get('colors') ?? '',
    p_color_identity: sp.get('ci') ?? '',
    p_cards: sp.get('cards') ?? '',
    p_card_mode: cardMode,
    p_format: sp.get('format') ?? '',
    p_limit: PAGE_SIZE,
    p_offset: offset,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ decks: data ?? [] })
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit + push**

```bash
git add src/app/api/decks/public/search/route.ts
git commit -m "feat(api): GET /api/decks/public/search wrapper for search_public_decks

Auth-gated. Parses filter query params (name, creator, commander, colors,
ci, cards, cardMode, format, offset) and calls the RPC. Returns {decks}.
PAGE_SIZE 10, offset capped at 1000."
git push origin dev
```

---

### Task 3: Navbar rename + dashboard "View all" link

**Files:**
- Modify: `src/components/Navbar.tsx` (navItems array, ~line 29)
- Modify: `src/app/(app)/dashboard/page.tsx` ("Latest public decks" header, ~line 358-364)

**Interfaces:**
- Produces: navbar entry `{ href: "/decks/public", label: "Pub Decks", icon: Globe }`; "My Decks" label on `/decks` entry; dashboard "View all" link → `/decks/public`.

- [ ] **Step 1: Edit Navbar**

In `src/components/Navbar.tsx`:
- Add `Globe` to the lucide-react import.
- Change the decks entry and add Pub Decks:

```ts
  { href: "/decks", label: "My Decks", icon: Layers },
  { href: "/decks/public", label: "Pub Decks", icon: Globe },
```

Note: `isActive('/decks')` would also match `/decks/public` (startsWith). Fix `isActive` so `/decks` is exact-ish: `/decks` active only when `pathname === '/decks' || /^\/decks\/[^/]+$/.test(pathname)` (deck detail), NOT `/decks/public`. `/decks/public` gets its own active state. Simplest: reorder so Pub Decks entry is checked first, or special-case. Implement: change `isActive` to treat `/decks` as not matching `/decks/public`:

```ts
  function isActive(href: string) {
    if (href === '/decks') {
      return pathname === '/decks' || /^\/decks\/[0-9a-f-]+$/.test(pathname)
    }
    return pathname === href || pathname.startsWith(href + '/')
  }
```

- [ ] **Step 2: Edit dashboard "Latest public decks" header**

In `src/app/(app)/dashboard/page.tsx`, the "Latest public decks" section header (currently no "View all" link). Add one mirroring "Active games":

```tsx
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-font-primary">
            Latest public decks
          </h2>
          <Link
            href="/decks/public"
            className="flex items-center gap-1 text-sm text-font-accent hover:underline"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
```

(`Link` + `ArrowRight` already imported in dashboard.)

- [ ] **Step 3: Type check + lint**

```bash
npx tsc --noEmit
npx eslint src/components/Navbar.tsx "src/app/(app)/dashboard/page.tsx"
```
Expected: clean.

- [ ] **Step 4: Commit + push**

```bash
git add src/components/Navbar.tsx "src/app/(app)/dashboard/page.tsx"
git commit -m "feat(nav): rename Decks -> My Decks, add Pub Decks entry + dashboard View all

Navbar: /decks label 'My Decks', new /decks/public 'Pub Decks' (Globe icon).
isActive special-cases /decks so it doesn't shadow /decks/public. Dashboard
'Latest public decks' header gets a 'View all' link to /decks/public."
git push origin dev
```

---

### Task 4: `CardListFilter` — card picker for the card-list filter

**Files:**
- Create: `src/components/decks/CardListFilter.tsx`

**Interfaces:**
- Consumes: `GET /api/cards/search?q=` (existing, returns cards with `id`, `name`, `image_small`).
- Produces: controlled component `{ cards: {id:string;name:string}[], mode: 'and'|'or', onChange: (cards, mode) => void }`. Debounced search, add-to-list, removable chips, AND/OR toggle. AbortController on the search fetch.

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X, Loader2 } from 'lucide-react'

interface PickedCard {
  id: string
  name: string
}

interface CardListFilterProps {
  cards: PickedCard[]
  mode: 'and' | 'or'
  onChange: (cards: PickedCard[], mode: 'and' | 'or') => void
}

export default function CardListFilter({ cards, mode, onChange }: CardListFilterProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cards/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        if (res.ok) {
          const data = await res.json()
          setResults((data.cards ?? data ?? []).slice(0, 8))
        } else {
          setResults([])
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setResults([])
      }
      if (!controller.signal.aborted) setLoading(false)
    }, 300)
    return () => {
      clearTimeout(handle)
      controller.abort()
    }
  }, [query])

  const addCard = (c: { id: string; name: string }) => {
    if (cards.some((x) => x.id === c.id)) return
    onChange([...cards, { id: c.id, name: c.name }], mode)
    setQuery('')
    setResults([])
  }

  const removeCard = (id: string) => {
    onChange(cards.filter((x) => x.id !== id), mode)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-font-secondary">Contains</span>
        <div className="flex rounded-lg border border-border bg-bg-card p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onChange(cards, 'and')}
            className={`rounded-md px-2 py-1 ${mode === 'and' ? 'bg-bg-accent text-font-white' : 'text-font-secondary'}`}
          >
            ALL (and)
          </button>
          <button
            type="button"
            onClick={() => onChange(cards, 'or')}
            className={`rounded-md px-2 py-1 ${mode === 'or' ? 'bg-bg-accent text-font-white' : 'text-font-secondary'}`}
          >
            ANY (or)
          </button>
        </div>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-font-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add a card to the filter..."
          className="w-full rounded-lg border border-border bg-bg-card px-10 py-2 text-sm text-font-primary placeholder:text-font-muted focus:border-bg-accent focus:outline-none focus:ring-2 focus:ring-bg-accent/20"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-font-muted" />
        )}
        {results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-bg-card shadow-lg">
            {results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => addCard(c)}
                className="block w-full px-3 py-2 text-left text-sm text-font-primary hover:bg-bg-hover"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {cards.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {cards.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 rounded-md bg-bg-accent/15 px-2 py-1 text-xs text-font-primary"
            >
              {c.name}
              <button type="button" onClick={() => removeCard(c.id)} className="text-font-muted hover:text-font-primary">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Note:** verify the `/api/cards/search` response shape before finalizing — if it returns `{ cards: [...] }` use `data.cards`, if it returns an array use `data`. Read `src/app/api/cards/search/route.ts` during execution to confirm and adjust the `setResults` line.

- [ ] **Step 2: Type check + lint**

```bash
npx tsc --noEmit
npx eslint src/components/decks/CardListFilter.tsx
```

- [ ] **Step 3: Commit + push**

```bash
git add src/components/decks/CardListFilter.tsx
git commit -m "feat(decks): CardListFilter component for card-list AND/OR filter

Debounced card search via /api/cards/search, add-to-chip-list, removable
chips, AND/OR toggle. AbortController on search fetch. Used by Pub Decks
filter panel."
git push origin dev
```

---

### Task 5: `DeckFilters` — filter panel

**Files:**
- Create: `src/components/decks/DeckFilters.tsx`

**Interfaces:**
- Produces: controlled component receiving the full `FilterState` + `onChange`. Reuses `CardListFilter` (Task 4). `FilterState` type defined here and exported for the browser.

```ts
export interface FilterState {
  name: string
  creator: string
  commander: string
  colors: string[]      // W/U/B/R/G
  colorIdentity: string[]
  cards: { id: string; name: string }[]
  cardMode: 'and' | 'or'
  format: string
}
```

- [ ] **Step 1: Create the component**

```tsx
'use client'

import CardListFilter from './CardListFilter'

export interface FilterState {
  name: string
  creator: string
  commander: string
  colors: string[]
  colorIdentity: string[]
  cards: { id: string; name: string }[]
  cardMode: 'and' | 'or'
  format: string
}

export const EMPTY_FILTERS: FilterState = {
  name: '', creator: '', commander: '',
  colors: [], colorIdentity: [],
  cards: [], cardMode: 'and', format: '',
}

const COLORS: { code: string; label: string; cls: string }[] = [
  { code: 'W', label: 'W', cls: 'bg-bg-surface border-font-secondary' },
  { code: 'U', label: 'U', cls: 'bg-bg-surface border-blue-400' },
  { code: 'B', label: 'B', cls: 'bg-bg-surface border-zinc-700' },
  { code: 'R', label: 'R', cls: 'bg-bg-surface border-red-500' },
  { code: 'G', label: 'G', cls: 'bg-bg-surface border-green-500' },
]

const FORMATS = ['Commander', 'Standard', 'Modern', 'Legacy']

interface DeckFiltersProps {
  filters: FilterState
  onChange: (f: FilterState) => void
}

function ColorGroup({
  label, selected, onToggle,
}: { label: string; selected: string[]; onToggle: (c: string) => void }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-font-secondary">{label}</span>
      <div className="flex gap-1.5">
        {COLORS.map((c) => {
          const active = selected.includes(c.code)
          return (
            <button
              key={c.code}
              type="button"
              onClick={() => onToggle(c.code)}
              className={`h-8 w-8 rounded-md border-2 text-xs font-bold ${
                active ? `${c.cls} text-font-primary ring-2 ring-bg-accent` : `${c.cls} text-font-muted opacity-60`
              }`}
            >
              {c.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function DeckFilters({ filters, onChange }: DeckFiltersProps) {
  const toggle = (key: 'colors' | 'colorIdentity', code: string) => {
    const arr = filters[key]
    onChange({ ...filters, [key]: arr.includes(code) ? arr.filter((x) => x !== code) : [...arr, code] })
  }
  const set = <K extends keyof FilterState>(key: K, val: FilterState[K]) =>
    onChange({ ...filters, [key]: val })

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-font-secondary">Deck name</span>
          <input
            type="text"
            value={filters.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Search deck name..."
            className="rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-font-primary placeholder:text-font-muted focus:border-bg-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-font-secondary">Creator</span>
          <input
            type="text"
            value={filters.creator}
            onChange={(e) => set('creator', e.target.value)}
            placeholder="Username or name..."
            className="rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-font-primary placeholder:text-font-muted focus:border-bg-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-font-secondary">Commander</span>
          <input
            type="text"
            value={filters.commander}
            onChange={(e) => set('commander', e.target.value)}
            placeholder="Commander card name..."
            className="rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-font-primary placeholder:text-font-muted focus:border-bg-accent focus:outline-none"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ColorGroup label="Color (mana cost)" selected={filters.colors} onToggle={(c) => toggle('colors', c)} />
        <ColorGroup label="Color identity" selected={filters.colorIdentity} onToggle={(c) => toggle('colorIdentity', c)} />
      </div>

      <CardListFilter
        cards={filters.cards}
        mode={filters.cardMode}
        onChange={(cards, mode) => onChange({ ...filters, cards, cardMode: mode })}
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-font-secondary">Format</span>
          <select
            value={filters.format}
            onChange={(e) => set('format', e.target.value)}
            className="rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-font-primary focus:border-bg-accent focus:outline-none"
          >
            <option value="">Any</option>
            {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={() => onChange({ ...EMPTY_FILTERS })}
          className="rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-font-secondary hover:bg-bg-hover"
        >
          Clear filters
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type check + lint**

```bash
npx tsc --noEmit
npx eslint src/components/decks/DeckFilters.tsx
```

- [ ] **Step 3: Commit + push**

```bash
git add src/components/decks/DeckFilters.tsx
git commit -m "feat(decks): DeckFilters panel for Pub Decks

Controlled filter panel: name, creator, commander text inputs; WUBRG color
+ color-identity toggles; CardListFilter for card-list AND/OR; format select;
clear-filters. Exports FilterState + EMPTY_FILTERS."
git push origin dev
```

---

### Task 6: `PublicDeckBrowser` + `/decks/public` page

**Files:**
- Create: `src/components/decks/PublicDeckBrowser.tsx`
- Create: `src/app/(app)/decks/public/page.tsx`

**Interfaces:**
- Consumes: `GET /api/decks/public/search` (Task 2), `DeckFilters` + `FilterState` (Task 5), `PublicDeckResult` shape (Task 1 RPC).
- Produces: `/decks/public` page renders first 10 decks (server) + `<PublicDeckBrowser initialDecks={...} />` (client owns filters + pagination).

- [ ] **Step 1: Create the client browser**

```tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Loader2, Swords, Search } from 'lucide-react'
import DeckFilters, { EMPTY_FILTERS, type FilterState } from './DeckFilters'

const PAGE_SIZE = 10

export interface PublicDeck {
  id: string
  name: string
  description: string | null
  format: string | null
  card_count: number
  updated_at: string
  user_id: string
  creator_username: string | null
  creator_display_name: string | null
  commander_card_id: string | null
  commander_name: string | null
  cover_card_id: string | null
  cover_image_art_crop: string | null
  cover_image_normal: string | null
}

interface PublicDeckBrowserProps {
  initialDecks: PublicDeck[]
}

function buildQuery(f: FilterState, offset: number): string {
  const p = new URLSearchParams()
  if (f.name) p.set('name', f.name)
  if (f.creator) p.set('creator', f.creator)
  if (f.commander) p.set('commander', f.commander)
  if (f.colors.length) p.set('colors', f.colors.join(','))
  if (f.colorIdentity.length) p.set('ci', f.colorIdentity.join(','))
  if (f.cards.length) p.set('cards', f.cards.map((c) => c.id).join(','))
  p.set('cardMode', f.cardMode)
  if (f.format) p.set('format', f.format)
  p.set('offset', String(offset))
  return p.toString()
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

export default function PublicDeckBrowser({ initialDecks }: PublicDeckBrowserProps) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [decks, setDecks] = useState<PublicDeck[]>(initialDecks)
  const [hasMore, setHasMore] = useState(initialDecks.length === PAGE_SIZE)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const searchAbortRef = useRef<AbortController | null>(null)
  const loadMoreAbortRef = useRef<AbortController | null>(null)

  // Debounced filter search: reset to page 0, replace list.
  useEffect(() => {
    const handle = setTimeout(async () => {
      searchAbortRef.current?.abort()
      const controller = new AbortController()
      searchAbortRef.current = controller
      setLoading(true)
      try {
        const res = await fetch(`/api/decks/public/search?${buildQuery(filters, 0)}`, {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        if (res.ok) {
          const data = await res.json()
          const rows: PublicDeck[] = data.decks ?? []
          setDecks(rows)
          setHasMore(rows.length === PAGE_SIZE)
        } else {
          setDecks([])
          setHasMore(false)
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setDecks([])
          setHasMore(false)
        }
      }
      if (!searchAbortRef.current?.signal.aborted) setLoading(false)
    }, 350)
    return () => clearTimeout(handle)
  }, [filters])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    loadMoreAbortRef.current?.abort()
    const controller = new AbortController()
    loadMoreAbortRef.current = controller
    setLoadingMore(true)
    try {
      const offset = decks.length
      const res = await fetch(`/api/decks/public/search?${buildQuery(filters, offset)}`, {
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (res.ok) {
        const data = await res.json()
        const rows: PublicDeck[] = data.decks ?? []
        setDecks((prev) => [...prev, ...rows])
        setHasMore(rows.length === PAGE_SIZE)
      } else {
        setHasMore(false)
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setHasMore(false)
    }
    if (!loadMoreAbortRef.current?.signal.aborted) setLoadingMore(false)
  }, [loadingMore, hasMore, decks.length, filters])

  return (
    <div className="flex flex-col gap-6">
      <DeckFilters filters={filters} onChange={setFilters} />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-font-muted" />
        </div>
      ) : decks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-bg-card p-8 text-center">
          <p className="text-sm text-font-muted">No public decks match these filters.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {decks.map((d) => {
              const ownerName = d.creator_display_name || d.creator_username || 'Unknown'
              const cover = d.cover_image_art_crop ?? d.cover_image_normal
              return (
                <Link
                  key={d.id}
                  href={`/decks/${d.id}`}
                  className="group flex flex-col overflow-hidden rounded-xl border border-border bg-bg-card transition-colors hover:border-border-light hover:bg-bg-hover"
                >
                  <div className="relative aspect-[5/3] w-full overflow-hidden bg-bg-cell">
                    {cover ? (
                      <Image
                        src={cover}
                        alt={d.name}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1280px) 33vw, 20vw"
                        className="object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Swords className="h-8 w-8 text-font-muted" />
                      </div>
                    )}
                    {d.format && (
                      <span className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                        {d.format}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 p-3.5">
                    <p className="truncate text-sm font-medium text-font-primary">{d.name}</p>
                    <div className="flex items-center justify-between text-xs text-font-muted">
                      <span className="truncate">{ownerName}</span>
                      <span>{d.card_count != null ? `${d.card_count} cards` : ''}</span>
                    </div>
                    {d.commander_name && (
                      <p className="truncate text-[11px] text-font-muted">Cmdr: {d.commander_name}</p>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-bg-card py-2.5 text-sm font-medium text-font-primary transition-colors hover:border-border-light hover:bg-bg-hover disabled:opacity-60"
            >
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
              {loadingMore ? 'Caricamento...' : 'Carica altri'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create the server page**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/supabase/get-user'
import PublicDeckBrowser, { type PublicDeck } from '@/components/decks/PublicDeckBrowser'

export const metadata = {
  title: 'Public Decks - Adunata!!!',
  description: 'Browse public Magic: The Gathering decks',
}

export default async function PublicDecksPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('search_public_decks', {
    p_name: '',
    p_creator: '',
    p_commander: '',
    p_colors: '',
    p_color_identity: '',
    p_cards: '',
    p_card_mode: 'and',
    p_format: '',
    p_limit: 10,
    p_offset: 0,
  })

  if (error) console.error('public decks initial fetch failed:', error.message)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold text-font-primary">Public Decks</h1>
      <PublicDeckBrowser initialDecks={(data ?? []) as unknown as PublicDeck[]} />
    </div>
  )
}
```

- [ ] **Step 3: Type check + lint**

```bash
npx tsc --noEmit
npx eslint src/components/decks/PublicDeckBrowser.tsx "src/app/(app)/decks/public/page.tsx"
```

- [ ] **Step 4: Commit + push**

```bash
git add src/components/decks/PublicDeckBrowser.tsx "src/app/(app)/decks/public/page.tsx"
git commit -m "feat(decks): Pub Decks page /decks/public with filter search + carica-alcuni

Server page fetches first 10 public decks via search_public_decks RPC.
PublicDeckBrowser client owns FilterState, debounced search (350ms) on
filter change resets to page 0, Carica altri appends next 10. Result cards
show cover, name, creator, format, card_count, commander. Mirrors
Community/Cards pagination + AbortController patterns."
git push origin dev
```

---

### Task 7: Final verification + DECISIONS + push

- [ ] **Step 1: Full type check + lint**

```bash
npx tsc --noEmit
npx eslint src/components/decks src/app/api/decks/public src/app/\(app\)/decks/public src/components/Navbar.tsx
```
Expected: all clean.

- [ ] **Step 2: Verify RPC end-to-end via DB**

```bash
supabase db query --linked "select name, format, creator_username from search_public_decks(null,null,null,null,null,null,null,null,3,0);"
supabase db query --linked "select count(*) from search_public_decks(null,null,null,'W',null,null,null,null,100,0);"
```
Expected: 3 rows; color filter returns a count (may be 0 if no white decks — acceptable, just confirm no error).

- [ ] **Step 3: Append DECISIONS.md**

Add entry under `## 2026-06-22 — Pub Decks search (RPC + filter panel)` covering: visibility='public' only (unlisted excluded), single AND/OR card toggle, two nav entries, offset pagination (small dataset), color vs color-identity semantics, security invoker RLS.

- [ ] **Step 4: Commit + push**

```bash
git add DECISIONS.md
git commit -m "docs: DECISIONS entry for Pub Decks search design"
git push origin dev
```

- [ ] **Step 5: Report**

Report to user: dev pushed, Vercel preview deploying, list of filters implemented, manual test suggestion (`/decks/public`).

---

## Self-Review Notes

- **Spec coverage:** all filters from spec (name, creator, commander, color, color identity, card-list AND/OR, format) → Task 1 RPC + Task 5 panel. Pagination → Task 1/2/6. Navbar rename + Pub Decks entry → Task 3. Dashboard View all → Task 3. Page + browser → Task 6. ✓
- **Type consistency:** `FilterState` defined in Task 5, consumed in Task 6. `PublicDeck` defined in Task 6, matches RPC columns (Task 1). `PickedCard` (Task 4) matches `cards` in `FilterState` (`{id,name}`). PAGE_SIZE=10 consistent across RPC/API/browser. ✓
- **Placeholders:** none — every code step has full code. `<ts>` = the timestamp from `supabase migration new` (filled at execution). ✓
- **Risk:** `/api/cards/search` response shape (Task 4) — flag in-step to verify + adjust. RPC `security invoker` may hide decks if RLS on `decks`/`profiles` restricts — verified in Task 1 Step 4 (count check); if 0 unexpectedly, check RLS policies on `decks` for `visibility='public'`.
