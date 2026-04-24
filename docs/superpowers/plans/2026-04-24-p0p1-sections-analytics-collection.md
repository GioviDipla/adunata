# P0 Sections + P1 Analytics + P1 Collection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three backlog items from `IMPLEMENTATIONS.md` in priority order — deck sections & tags (P0), advanced deck analytics (P1), collection management + deck overlay (P1) — onto the live Adunata codebase.

**Architecture:**
- Phase 1 (P0 — Sections): new `deck_sections` table + augmented `deck_cards` (`section_id`, `tags[]`, `position_in_section`). Server routes mutate; DeckEditor / DeckView render grouped sections with drag-reorder (desktop) + bottom-sheet move (mobile); free-form tags with gin-index filters.
- Phase 2 (P1 — Analytics): extend the existing `DeckStats.tsx` (already rich, client-side) with mana-source count, color-source count, pip-vs-production balance score, rarity/set breakdowns, and a Monte Carlo Web Worker computing opening-hand keep %, turn-to-commander P50/P90, mana screw / flood. No external API deps, no functional-tag backfill (deferred — requires Scryfall Tagger ingestion separately).
- Phase 3 (P1 — Collection): new `user_cards` table + RLS, `/collection` page with virtualized grid, CSV import (Deckbox / Moxfield / Manabox parsers), deck overlay showing owned vs missing per card with a "complete for €X" summary and a shopping-list export.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS via MCP migrations), TypeScript, Tailwind CSS 4, Lucide icons. New deps: `@dnd-kit/core` + `@dnd-kit/sortable` (drag-reorder), `recharts` (analytics charts), `react-virtuoso` (collection virtualization), `papaparse` (CSV parsing).

**Verification approach:** Repo has no unit-test runner (documented in `DECISIONS.md` / CLAUDE.md). Each task uses runtime verification: `pnpm build` for type correctness + `mcp__plugin_supabase_supabase__execute_sql` for schema/data checks + manual browser walkthroughs where noted. `superpowers:verification-before-completion` applies at each commit.

**Git flow:** All work lands on `dev` per CLAUDE.md. Do not push `main` / `release` directly. Each task ends in a conventional commit via `caveman:caveman-commit`. After final phase verified, promote `dev → release → main` per GitFlow rules.

---

## Shared reminders (apply to every task)

- **Never `Read` or reproduce CLAUDE.md rules**; the active session already loads them. Just follow them.
- Every mutation route handler that changes data visible on a Server Component must call `revalidatePath` before returning.
- After every migration: **immediately** update `/src/types/supabase.ts` by hand (types file is hand-maintained in this repo — DECISIONS.md).
- Before writing any RPC with `RETURNS TABLE`: verify column types via `execute_sql` against `information_schema.columns` (CLAUDE.md lesson).
- Any insert to the global `cards` table (e.g., upserting a Scryfall row not yet cached) must use `createAdminClient()` — RLS blocks user-session inserts silently.
- Every new Realtime-subscribed table must be added to publication explicitly: `ALTER PUBLICATION supabase_realtime ADD TABLE public.<table>`.
- Every fetch in a new client component checks `res.ok` and rolls back optimistic state on failure.
- Every debounced fetch uses `AbortController`.
- Mobile-first always. Test bottom-sheet flows and touch targets.
- Use `next/image` only if the surrounding file already uses it; otherwise continue `<img loading="lazy" />` pattern.

---

# Phase 1 — P0: Deck sections + tags

**Phase goal:** Deckbuilder groups deck cards into functional sections (Ramp, Removal, Card Draw, …) and attaches free-form tags to individual cards. Per-section counts / total cost / avg CMC rendered inline. Drag-reorder desktop. Bottom-sheet move on mobile. Commander preset applied on-demand for any deck (existing or new).

---

### Task 1.1: Install @dnd-kit + add to package.json

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add dependency**

Run:
```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Verify install**

Run:
```bash
pnpm list @dnd-kit/core @dnd-kit/sortable
```

Expected: both resolve to a concrete version (≥6.x).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
```

Use `caveman:caveman-commit` to produce the subject. Body none — the "why" is covered by the plan reference.

---

### Task 1.2: Migration — `deck_sections` + augment `deck_cards`

**Files:**
- Create: `supabase/migrations/<TIMESTAMP>_deck_sections.sql`
- Modify: `src/types/supabase.ts`

- [ ] **Step 1: Compose migration SQL**

Use timestamp `date +%Y%m%d%H%M%S`. Filename pattern: `<TS>_deck_sections.sql`.

```sql
-- deck_sections table
create table public.deck_sections (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  color text,
  is_collapsed boolean not null default false,
  created_at timestamptz not null default now()
);

create index deck_sections_deck_position_idx
  on public.deck_sections (deck_id, position);

-- deck_cards augmentation
alter table public.deck_cards
  add column section_id uuid references public.deck_sections(id) on delete set null,
  add column tags text[] not null default '{}',
  add column position_in_section integer;

create index deck_cards_section_idx on public.deck_cards (section_id);
create index deck_cards_tags_gin_idx on public.deck_cards using gin (tags);

-- RLS
alter table public.deck_sections enable row level security;

create policy deck_sections_select_visible on public.deck_sections
  for select using (
    exists (
      select 1 from public.decks d
      where d.id = deck_sections.deck_id
        and (d.visibility = 'public' or d.user_id = auth.uid())
    )
  );

create policy deck_sections_mutate_owner on public.deck_sections
  for all using (
    exists (
      select 1 from public.decks d
      where d.id = deck_sections.deck_id and d.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.decks d
      where d.id = deck_sections.deck_id and d.user_id = auth.uid()
    )
  );
```

Note: we deliberately omit the `auto_rule` jsonb column from the `IMPLEMENTATIONS.md` spec. Auto-categorization depends on Scryfall Tagger functional_tags ingestion which is out of scope here. Ship sections + tags without the auto-apply rule; add the column in a follow-up when functional_tags arrive. The preset template (Task 1.6) still works without it.

- [ ] **Step 2: Apply via MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with `name = "deck_sections"` and the SQL above (no `BEGIN`/`COMMIT` — MCP wraps the migration itself).

- [ ] **Step 3: Verify schema**

Run via `mcp__plugin_supabase_supabase__execute_sql`:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name in ('deck_sections', 'deck_cards')
order by table_name, ordinal_position;
```

Expected: `deck_sections` has all 7 columns; `deck_cards` now lists `section_id`, `tags`, `position_in_section`.

Also verify policies:

```sql
select tablename, policyname, cmd
from pg_policies
where tablename = 'deck_sections';
```

Expected: rows for `deck_sections_select_visible` (SELECT) and `deck_sections_mutate_owner` (ALL).

- [ ] **Step 4: Update TypeScript types**

Edit `src/types/supabase.ts`:

1. Add a new `deck_sections` block in `Database['public']['Tables']` with `Row`, `Insert`, `Update` variants. Types:
   - `id: string`, `deck_id: string`, `name: string`, `position: number`, `color: string | null`, `is_collapsed: boolean`, `created_at: string`.
   - `Insert`: `id?`, `deck_id`, `name`, `position?`, `color?`, `is_collapsed?`, `created_at?`.
   - `Update`: all optional.
2. In the existing `deck_cards.Row`, add `section_id: string | null`, `tags: string[]`, `position_in_section: number | null`. Mirror in `Insert` (optional) and `Update` (optional).

- [ ] **Step 5: Typecheck**

Run:
```bash
pnpm build
```

Expected: `✓ Compiled successfully`. If TS errors reference `deck_cards` rows missing the new fields in any call site, widen the consumer's local type rather than touching the generated shape — most consumers spread the row or pick fields.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/<TS>_deck_sections.sql src/types/supabase.ts
```

Use `caveman:caveman-commit`.

---

### Task 1.3: API — sections CRUD + reorder

**Files:**
- Create: `src/app/api/decks/[id]/sections/route.ts`
- Create: `src/app/api/decks/[id]/sections/[sectionId]/route.ts`
- Create: `src/app/api/decks/[id]/sections/reorder/route.ts`

All routes are server-side Next.js App Router route handlers. Use `createClient()` from `@/lib/supabase/server` for cookie-auth (RLS enforces ownership). Admin client not needed — all mutations go through policies.

- [ ] **Step 1: POST create / GET list — `sections/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: deckId } = await params
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('deck_sections')
    .select('id, deck_id, name, position, color, is_collapsed, created_at')
    .eq('deck_id', deckId)
    .order('position', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sections: data ?? [] })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: deckId } = await params
  const body = await req.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const color = typeof body.color === 'string' ? body.color : null
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const supabase = await createClient()

  // Append at end — position = max(position) + 1
  const { data: existing } = await supabase
    .from('deck_sections')
    .select('position')
    .eq('deck_id', deckId)
    .order('position', { ascending: false })
    .limit(1)
  const nextPos = (existing?.[0]?.position ?? -1) + 1

  const { data, error } = await supabase
    .from('deck_sections')
    .insert({ deck_id: deckId, name, color, position: nextPos })
    .select('id, deck_id, name, position, color, is_collapsed, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath(`/decks/${deckId}`)
  return NextResponse.json({ section: data })
}
```

- [ ] **Step 2: PATCH / DELETE single — `[sectionId]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

interface Params { id: string; sectionId: string }

export async function PATCH(req: Request, { params }: { params: Promise<Params> }) {
  const { id: deckId, sectionId } = await params
  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  if (typeof body.name === 'string') patch.name = body.name.trim()
  if (typeof body.color === 'string' || body.color === null) patch.color = body.color
  if (typeof body.is_collapsed === 'boolean') patch.is_collapsed = body.is_collapsed
  if (typeof body.position === 'number') patch.position = body.position

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('deck_sections')
    .update(patch)
    .eq('id', sectionId)
    .eq('deck_id', deckId)
    .select('id, deck_id, name, position, color, is_collapsed, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath(`/decks/${deckId}`)
  return NextResponse.json({ section: data })
}

export async function DELETE(_req: Request, { params }: { params: Promise<Params> }) {
  const { id: deckId, sectionId } = await params
  const supabase = await createClient()
  const { error } = await supabase
    .from('deck_sections')
    .delete()
    .eq('id', sectionId)
    .eq('deck_id', deckId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // deck_cards.section_id → NULL is handled by FK `on delete set null`
  revalidatePath(`/decks/${deckId}`)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: POST reorder — `reorder/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: deckId } = await params
  const body = await req.json().catch(() => ({}))
  const items = Array.isArray(body.items) ? body.items : null
  if (!items) return NextResponse.json({ error: 'items required' }, { status: 400 })

  const supabase = await createClient()
  // Upsert is the simplest — all rows have known ids; update position in batch
  const results = await Promise.all(
    items.map((it: { id: string; position: number }) =>
      supabase
        .from('deck_sections')
        .update({ position: it.position })
        .eq('id', it.id)
        .eq('deck_id', deckId)
    )
  )
  const firstError = results.find((r) => r.error)
  if (firstError?.error) return NextResponse.json({ error: firstError.error.message }, { status: 500 })

  revalidatePath(`/decks/${deckId}`)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Runtime verification**

Start dev server in another terminal if needed. With a real session cookie present in the browser:

1. In the browser devtools network tab on an existing deck page, run:
   ```js
   await fetch(`/api/decks/${DECK_ID}/sections`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ramp' }) }).then(r => r.json())
   ```
   Expected: `{ section: { id: "...", name: "Ramp", position: 0, ... } }`.
2. `await fetch('/api/decks/${DECK_ID}/sections').then(r => r.json())` — expected list with the created section.
3. Verify DB row via `execute_sql`: `select * from deck_sections where deck_id = '<id>'`.
4. Delete it via `DELETE` endpoint; re-query DB expects empty.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/decks/\[id\]/sections
```

Use `caveman:caveman-commit`.

---

### Task 1.4: API — card section/tag updates + bulk-tag

**Files:**
- Modify: `src/app/api/decks/[id]/cards/route.ts` (if existing PATCH; otherwise add)
- Create: `src/app/api/decks/[id]/cards/[cardId]/route.ts`
- Create: `src/app/api/decks/[id]/cards/bulk-tag/route.ts`

The existing `deck_cards` row id is the mutation key (not `card_id`) because a deck can legitimately have the same printing in multiple boards.

- [ ] **Step 1: Read existing cards route to determine PATCH handler presence**

Read `src/app/api/decks/[id]/cards/route.ts`. If it already has a PATCH handler, split section/tag updates into a new `[cardId]/route.ts`. Otherwise, add a PATCH there. We will create the dedicated subroute for clarity.

- [ ] **Step 2: PATCH single deck_card — `[cardId]/route.ts`**

`[cardId]` here means `deck_card_id` (the row id). We reuse Next's param name `[cardId]` for URL ergonomics; the handler treats it as the `deck_cards.id`.

```ts
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

interface Params { id: string; cardId: string }

export async function PATCH(req: Request, { params }: { params: Promise<Params> }) {
  const { id: deckId, cardId: deckCardId } = await params
  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  if ('section_id' in body) patch.section_id = body.section_id || null
  if ('tags' in body && Array.isArray(body.tags)) {
    patch.tags = (body.tags as unknown[])
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && t.length <= 40)
      .slice(0, 20)
  }
  if ('position_in_section' in body && typeof body.position_in_section === 'number') {
    patch.position_in_section = body.position_in_section
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('deck_cards')
    .update(patch)
    .eq('id', deckCardId)
    .eq('deck_id', deckId)
    .select('id, deck_id, card_id, quantity, board, is_foil, section_id, tags, position_in_section, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath(`/decks/${deckId}`)
  return NextResponse.json({ card: data })
}
```

- [ ] **Step 3: POST bulk-tag — `bulk-tag/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Body shape:
// { deckCardIds: string[], addTags?: string[], removeTags?: string[], setTags?: string[] }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: deckId } = await params
  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.deckCardIds) ? body.deckCardIds.filter((s: unknown) => typeof s === 'string') : []
  if (ids.length === 0) return NextResponse.json({ error: 'deckCardIds required' }, { status: 400 })

  const sanitize = (v: unknown) =>
    (Array.isArray(v) ? v : [])
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && t.length <= 40)
      .slice(0, 20)

  const add = sanitize(body.addTags)
  const remove = sanitize(body.removeTags)
  const set = sanitize(body.setTags)

  const supabase = await createClient()

  if (set.length > 0 || (body.setTags !== undefined && Array.isArray(body.setTags))) {
    // Replace tags wholesale
    const { error } = await supabase
      .from('deck_cards')
      .update({ tags: set })
      .in('id', ids)
      .eq('deck_id', deckId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // add/remove — fetch current, merge, update one-by-one (deck_cards rows for one deck are bounded, ~200 max)
    const { data: current, error: fetchErr } = await supabase
      .from('deck_cards')
      .select('id, tags')
      .in('id', ids)
      .eq('deck_id', deckId)
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

    for (const row of current ?? []) {
      const existing = new Set<string>((row.tags as string[] | null) ?? [])
      for (const t of add) existing.add(t)
      for (const t of remove) existing.delete(t)
      const next = Array.from(existing).slice(0, 20)
      const { error } = await supabase.from('deck_cards').update({ tags: next }).eq('id', row.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  revalidatePath(`/decks/${deckId}`)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Runtime verification**

In the browser (authenticated, on a deck with at least one card):

```js
// Patch a single deck_card
const resp = await fetch(`/api/decks/${DECK_ID}/cards/${DECK_CARD_ID}`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ tags: ['tested', 'budget'] }),
}).then(r => r.json())
console.log(resp)
```

Expected: `{ card: { ..., tags: ["tested", "budget"] } }`.

Verify in DB:

```sql
select id, tags from deck_cards where id = '<deck_card_id>';
```

Expected: `tags = {tested,budget}`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/decks/\[id\]/cards
```

Use `caveman:caveman-commit`.

---

### Task 1.5: API — section auto-assign on card add (default section placement)

**Files:**
- Modify: `src/app/api/decks/[id]/cards/route.ts` (existing `POST`)
- Modify: `src/app/api/decks/[id]/cards/add-with-upsert/route.ts`
- Modify: `src/app/api/decks/[id]/cards/bulk-import/route.ts`

Goal: when a card is added to a deck that has at least one section, default the new `deck_cards.section_id` to `null` (becomes "Uncategorized" in UI). If the client wants a specific section, it passes `section_id` in the POST body.

- [ ] **Step 1: Extend POST body schema**

For each of the 3 existing card-add routes, extract body fields for `section_id` (optional string) and `tags` (optional string[]), sanitized the same way as Task 1.4. Include them in the `deck_cards` insert.

- [ ] **Step 2: Build — verify no type regressions**

```bash
pnpm build
```

- [ ] **Step 3: Smoke via curl / devtools — add a card with section_id**

```js
await fetch(`/api/decks/${DECK_ID}/cards`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ card_id: '<card>', quantity: 1, board: 'main', section_id: '<section>', tags: ['combo'] })
}).then(r => r.json())
```

Expected: response includes `section_id` and `tags: ['combo']`. Confirm row in DB.

- [ ] **Step 4: Commit**

Use `caveman:caveman-commit`.

---

### Task 1.6: Commander preset — seed sections on demand

**Files:**
- Create: `src/lib/deck/sectionPresets.ts`
- Create: `src/app/api/decks/[id]/sections/apply-preset/route.ts`

- [ ] **Step 1: Preset definition**

```ts
// src/lib/deck/sectionPresets.ts
export interface SectionPreset {
  name: string
  color: string
}

export const COMMANDER_PRESET: SectionPreset[] = [
  { name: 'Commander',   color: '#f59e0b' },
  { name: 'Ramp',        color: '#22c55e' },
  { name: 'Card Draw',   color: '#3b82f6' },
  { name: 'Removal',     color: '#ef4444' },
  { name: 'Tutors',      color: '#a855f7' },
  { name: 'Wincons',     color: '#eab308' },
  { name: 'Protection',  color: '#06b6d4' },
  { name: 'Utility',     color: '#64748b' },
  { name: 'Lands',       color: '#78716c' },
]

export const PRESETS = { commander: COMMANDER_PRESET } as const
export type PresetKey = keyof typeof PRESETS
```

- [ ] **Step 2: Apply-preset route**

```ts
// src/app/api/decks/[id]/sections/apply-preset/route.ts
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { PRESETS, type PresetKey } from '@/lib/deck/sectionPresets'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: deckId } = await params
  const body = await req.json().catch(() => ({}))
  const preset: PresetKey = body.preset === 'commander' ? 'commander' : 'commander'
  const rows = PRESETS[preset].map((p, idx) => ({
    deck_id: deckId,
    name: p.name,
    color: p.color,
    position: idx,
  }))

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('deck_sections')
    .insert(rows)
    .select('id, deck_id, name, position, color, is_collapsed, created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath(`/decks/${deckId}`)
  return NextResponse.json({ sections: data ?? [] })
}
```

Note: no dedup — applying preset twice creates duplicate sections. The UI calls this only when `deck_sections` is empty for the deck (checked via GET sections before POST).

- [ ] **Step 3: Verification**

In browser, on a deck with 0 sections:

```js
await fetch(`/api/decks/${DECK_ID}/sections/apply-preset`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ preset: 'commander' })
}).then(r => r.json())
```

Expected: 9 sections returned. Verify with `select count(*) from deck_sections where deck_id = '<id>'`.

- [ ] **Step 4: Commit**

Use `caveman:caveman-commit`.

---

### Task 1.7: Section-aware data fetch — deck detail page

**Files:**
- Modify: `src/app/(app)/decks/[id]/page.tsx`
- Modify: `src/components/deck/DeckView.tsx`
- Modify: `src/components/deck/DeckEditor.tsx`

Goal: server-component `page.tsx` fetches sections in parallel with cards and passes both down.

- [ ] **Step 1: Parallel fetch sections in `page.tsx`**

Locate where the page calls `supabase.from('decks').select(...)` and `supabase.from('deck_cards').select(...)`. Add a third `Promise.all` member:

```ts
const sectionsP = supabase
  .from('deck_sections')
  .select('id, name, position, color, is_collapsed')
  .eq('deck_id', params.id)
  .order('position', { ascending: true })
```

Destructure into `sections` alongside the existing results.

- [ ] **Step 2: Thread sections as prop**

Add `sections: Section[]` to the interface on `DeckEditor` / `DeckView`. Define `Section` locally or in `src/types/deck.ts` (create if missing) — stick to `id, name, position, color, is_collapsed`.

Make `DeckContent` accept an optional `sections` and `onSectionChange?: (deckCardId: string, sectionId: string | null) => void`. This is plumbing-only — Task 1.8 wires the UI.

- [ ] **Step 3: Ensure `deck_cards` select includes new fields**

Open `src/lib/supabase/columns.ts`. Update `DECK_CARD_COLUMNS`:

```ts
export const DECK_CARD_COLUMNS = 'id, deck_id, card_id, quantity, board, is_foil, section_id, tags, position_in_section, created_at'
```

Search repo for every `select(DECK_CARD_COLUMNS)` / literal `'id, deck_id, card_id, quantity, board, is_foil'` and confirm each consumer tolerates the added fields (they will because consumers pick fields off the row).

- [ ] **Step 4: Build**

```bash
pnpm build
```

Expected: pass.

- [ ] **Step 5: Commit**

Use `caveman:caveman-commit`.

---

### Task 1.8: UI — render grouped sections in DeckContent (list view only)

**Files:**
- Create: `src/components/deck/DeckSectionGroup.tsx`
- Modify: `src/components/deck/DeckContent.tsx`

Strategy: when `sortMode === 'section'` (new mode), group by `section_id`. When sections data is present but the user picks "Type" / "Name" / "CMC", keep existing behaviour (sections ignored). Add a sort option "Section".

- [ ] **Step 1: Section sort option**

In `DeckContent.tsx`:

- Extend `SortMode`: `'type' | 'name' | 'cmc' | 'price' | 'released' | 'section'`
- Extend `SORT_LABELS` with `section: 'Section'`
- Extend the sort dropdown render to include the new entry.

- [ ] **Step 2: Group-by-section branch in `groupedCards`**

Add at the top of the sort/group useMemo:

```ts
if (sortMode === 'section' && sections) {
  const byId = new Map<string, DeckCardEntry[]>()
  const uncategorized: DeckCardEntry[] = []
  for (const entry of visibleCards) {
    const sid = (entry as DeckCardEntry & { section_id?: string | null }).section_id ?? null
    if (!sid) uncategorized.push(entry)
    else {
      if (!byId.has(sid)) byId.set(sid, [])
      byId.get(sid)!.push(entry)
    }
  }
  const out: [string, DeckCardEntry[]][] = []
  for (const s of sections) {
    const entries = byId.get(s.id) ?? []
    // stable sort: position_in_section nulls-last, then name
    entries.sort((a, b) => {
      const pa = a.position_in_section ?? Number.POSITIVE_INFINITY
      const pb = b.position_in_section ?? Number.POSITIVE_INFINITY
      return pa - pb || a.card.name.localeCompare(b.card.name)
    })
    out.push([s.name, entries])
  }
  if (uncategorized.length > 0) {
    uncategorized.sort((a, b) => a.card.name.localeCompare(b.card.name))
    out.push(['Uncategorized', uncategorized])
  }
  return out
}
```

Add `section_id`, `position_in_section` to `DeckCardEntry` interface.

- [ ] **Step 3: Render per-section stats (count + total EUR + avg CMC)**

Extract the existing group-header rendering into a small helper or inline block. For each group display:
- Section name (with color dot if the section has one)
- `<count> cards · €<sum> · avg <cmc>.xx`

Compute inline using the entries array — no new helper needed if the render fn stays small.

- [ ] **Step 4: Build + browser spot-check**

```bash
pnpm build
```

In browser: open a deck, pick sort = Section. Expected: one group per section + "Uncategorized" if any card has `section_id = null`. If no sections exist, the dropdown still offers "Section" but renders a single Uncategorized group.

- [ ] **Step 5: Commit**

Use `caveman:caveman-commit`.

---

### Task 1.9: UI — section management panel in DeckEditor

**Files:**
- Create: `src/components/deck/DeckSectionsPanel.tsx`
- Modify: `src/components/deck/DeckEditor.tsx`

Goal: editor-mode side panel / toolbar entry that lets the owner:
- Apply Commander preset (disabled if sections already exist).
- Add a section (inline input).
- Rename / delete / pick color per section.
- Reorder via drag.

- [ ] **Step 1: Component scaffolding**

```tsx
'use client'

import { useState } from 'react'
import { Plus, Trash2, GripVertical } from 'lucide-react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export interface SectionRow {
  id: string
  name: string
  position: number
  color: string | null
}

interface Props {
  deckId: string
  sections: SectionRow[]
  onChange: (next: SectionRow[]) => void
}

export default function DeckSectionsPanel({ deckId, sections, onChange }: Props) {
  const [draftName, setDraftName] = useState('')
  const [busy, setBusy] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  async function addSection() {
    const name = draftName.trim()
    if (!name || busy) return
    setBusy(true)
    const prev = sections
    const tempId = `temp-${Date.now()}`
    onChange([...prev, { id: tempId, name, position: prev.length, color: null }])
    setDraftName('')
    try {
      const res = await fetch(`/api/decks/${deckId}/sections`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error(await res.text())
      const { section } = await res.json()
      onChange([...prev, section])
    } catch {
      onChange(prev) // rollback
    } finally {
      setBusy(false)
    }
  }

  async function applyPreset() {
    if (busy || sections.length > 0) return
    setBusy(true)
    try {
      const res = await fetch(`/api/decks/${deckId}/sections/apply-preset`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ preset: 'commander' }),
      })
      if (!res.ok) throw new Error(await res.text())
      const { sections: created } = await res.json()
      onChange(created)
    } finally {
      setBusy(false)
    }
  }

  async function removeSection(id: string) {
    const prev = sections
    onChange(prev.filter((s) => s.id !== id))
    const res = await fetch(`/api/decks/${deckId}/sections/${id}`, { method: 'DELETE' })
    if (!res.ok) onChange(prev)
  }

  async function renameSection(id: string, name: string) {
    const prev = sections
    onChange(prev.map((s) => (s.id === id ? { ...s, name } : s)))
    const res = await fetch(`/api/decks/${deckId}/sections/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) onChange(prev)
  }

  async function setColor(id: string, color: string | null) {
    const prev = sections
    onChange(prev.map((s) => (s.id === id ? { ...s, color } : s)))
    const res = await fetch(`/api/decks/${deckId}/sections/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ color }),
    })
    if (!res.ok) onChange(prev)
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = sections.findIndex((s) => s.id === active.id)
    const newIndex = sections.findIndex((s) => s.id === over.id)
    const next = arrayMove(sections, oldIndex, newIndex).map((s, i) => ({ ...s, position: i }))
    const prev = sections
    onChange(next)
    const res = await fetch(`/api/decks/${deckId}/sections/reorder`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: next.map((s) => ({ id: s.id, position: s.position })) }),
    })
    if (!res.ok) onChange(prev)
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg-cell p-3">
      <h3 className="text-sm font-semibold text-font-primary">Sections</h3>
      {sections.length === 0 && (
        <button
          onClick={applyPreset}
          disabled={busy}
          className="rounded-md border border-border bg-bg-dark px-3 py-2 text-xs text-font-secondary hover:bg-bg-cell disabled:opacity-50"
        >
          Apply Commander preset
        </button>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-1">
            {sections.map((s) => (
              <SortableSectionRow
                key={s.id}
                section={s}
                onRemove={() => removeSection(s.id)}
                onRename={(n) => renameSection(s.id, n)}
                onSetColor={(c) => setColor(s.id, c)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <div className="flex items-center gap-2">
        <input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addSection()}
          placeholder="New section…"
          className="flex-1 rounded border border-border bg-bg-dark px-2 py-1 text-sm text-font-primary placeholder:text-font-muted"
        />
        <button
          onClick={addSection}
          disabled={busy || !draftName.trim()}
          className="rounded bg-font-accent px-2 py-1 text-xs font-semibold text-bg-dark disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function SortableSectionRow({
  section, onRemove, onRename, onSetColor,
}: {
  section: SectionRow
  onRemove: () => void
  onRename: (n: string) => void
  onSetColor: (c: string | null) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: section.id })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(section.name)
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-2 rounded border border-border bg-bg-dark px-2 py-1">
      <button {...attributes} {...listeners} className="cursor-grab text-font-muted" aria-label="drag">
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="h-3 w-3 rounded-full" style={{ background: section.color ?? '#475569' }} />
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { setEditing(false); if (draft !== section.name) onRename(draft.trim() || section.name) }}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          className="flex-1 rounded border border-border bg-bg-dark px-1 text-sm text-font-primary"
        />
      ) : (
        <button onClick={() => setEditing(true)} className="flex-1 text-left text-sm text-font-primary">
          {section.name}
        </button>
      )}
      <input
        type="color"
        value={section.color ?? '#475569'}
        onChange={(e) => onSetColor(e.target.value)}
        className="h-6 w-6 cursor-pointer rounded border border-border bg-transparent"
        aria-label="section color"
      />
      <button onClick={onRemove} className="text-font-muted hover:text-font-danger" aria-label="delete">
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  )
}
```

- [ ] **Step 2: Wire into DeckEditor**

In `DeckEditor.tsx`:
- Accept new prop `initialSections: SectionRow[]` (threaded from `page.tsx` via Task 1.7).
- Local state `const [sections, setSections] = useState(initialSections)`.
- Render `<DeckSectionsPanel deckId={deck.id} sections={sections} onChange={setSections} />` in the sidebar (mobile: inside a collapsible drawer; desktop: under the existing AddCardSearch panel).
- Pass `sections={sections}` into `DeckContent`.

- [ ] **Step 3: Build + browser walk-through**

```bash
pnpm build
```

In the browser on an owned deck:
- Apply preset → 9 sections appear.
- Rename "Ramp" → "Mana".
- Color-pick changes the dot.
- Drag "Lands" to top → position persists after reload (`execute_sql: select id, name, position from deck_sections where deck_id = '<id>' order by position`).
- Delete "Tutors" → row disappears from DB.

- [ ] **Step 4: Commit**

Use `caveman:caveman-commit`.

---

### Task 1.10: UI — per-card section picker + tag editor (in `DeckCard`)

**Files:**
- Modify: `src/components/deck/DeckCard.tsx`
- Create: `src/components/deck/SectionPicker.tsx`
- Create: `src/components/deck/TagEditor.tsx`

- [ ] **Step 1: `SectionPicker.tsx`**

A dropdown showing sections (+ "Uncategorized") with a click handler that calls the PATCH route. Closes on outside click (use existing pattern from `CardContextMenu` if it has one; otherwise a simple on-document listener).

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Layers, Check } from 'lucide-react'

export interface SectionOption { id: string; name: string; color: string | null }

interface Props {
  deckId: string
  deckCardId: string
  currentSectionId: string | null
  sections: SectionOption[]
  onChange: (sectionId: string | null) => void
  compact?: boolean
}

export default function SectionPicker({ deckId, deckCardId, currentSectionId, sections, onChange, compact }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [open])

  async function pick(id: string | null) {
    setOpen(false)
    const prev = currentSectionId
    onChange(id)
    const res = await fetch(`/api/decks/${deckId}/cards/${deckCardId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ section_id: id }),
    })
    if (!res.ok) onChange(prev)
  }

  const current = sections.find((s) => s.id === currentSectionId)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        className={`flex items-center gap-1 rounded border border-border bg-bg-cell px-1.5 py-0.5 text-[10px] text-font-secondary hover:bg-bg-dark ${compact ? '' : 'text-xs'}`}
      >
        {current ? <span className="h-2 w-2 rounded-full" style={{ background: current.color ?? '#475569' }} /> : <Layers className="h-3 w-3" />}
        <span className="max-w-[7rem] truncate">{current?.name ?? 'Uncategorized'}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 min-w-[10rem] rounded-md border border-border bg-bg-cell shadow-lg">
          <ul className="max-h-60 overflow-auto py-1 text-xs">
            <li>
              <button onClick={() => pick(null)} className="flex w-full items-center gap-2 px-2 py-1 text-left text-font-secondary hover:bg-bg-dark">
                {currentSectionId == null && <Check className="h-3 w-3" />}
                <span>Uncategorized</span>
              </button>
            </li>
            {sections.map((s) => (
              <li key={s.id}>
                <button onClick={() => pick(s.id)} className="flex w-full items-center gap-2 px-2 py-1 text-left text-font-primary hover:bg-bg-dark">
                  {currentSectionId === s.id && <Check className="h-3 w-3" />}
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color ?? '#475569' }} />
                  <span className="truncate">{s.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: `TagEditor.tsx`**

Pill editor: reads existing `tags`, shows pills, input with add-on-Enter / remove-on-backspace-when-empty, autocompletes against the set of tags already used in the deck (pass in as prop).

```tsx
'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  deckId: string
  deckCardId: string
  initialTags: string[]
  suggestions: string[]
}

export default function TagEditor({ deckId, deckCardId, initialTags, suggestions }: Props) {
  const [tags, setTags] = useState<string[]>(initialTags)
  const [draft, setDraft] = useState('')
  const filtered = suggestions.filter(
    (s) => s.toLowerCase().includes(draft.toLowerCase()) && !tags.includes(s)
  ).slice(0, 6)

  async function persist(next: string[]) {
    const prev = tags
    setTags(next)
    const res = await fetch(`/api/decks/${deckId}/cards/${deckCardId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tags: next }),
    })
    if (!res.ok) setTags(prev)
  }

  function add(t: string) {
    const val = t.trim()
    if (!val || tags.includes(val) || tags.length >= 20) return
    persist([...tags, val])
    setDraft('')
  }

  function remove(t: string) {
    persist(tags.filter((x) => x !== t))
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((t) => (
        <span key={t} className="flex items-center gap-1 rounded-full bg-bg-dark px-2 py-0.5 text-[10px] text-font-secondary">
          {t}
          <button onClick={() => remove(t)} aria-label={`remove ${t}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <div className="relative">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(draft) }
            else if (e.key === 'Backspace' && !draft && tags.length > 0) remove(tags[tags.length - 1])
          }}
          placeholder="+ tag"
          className="w-20 rounded border border-border bg-bg-dark px-1 py-0.5 text-[10px] text-font-primary placeholder:text-font-muted"
        />
        {draft && filtered.length > 0 && (
          <ul className="absolute left-0 z-10 mt-0.5 min-w-full rounded border border-border bg-bg-cell text-[10px] shadow">
            {filtered.map((s) => (
              <li key={s}>
                <button onClick={() => add(s)} className="block w-full px-2 py-0.5 text-left text-font-secondary hover:bg-bg-dark">
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire into `DeckCard`**

`DeckCard` already receives an `entry: DeckCardEntry`. Add optional props `sections: SectionOption[]` and `tagSuggestions: string[]` + editing mode flag. When editing is on, render `<SectionPicker>` and `<TagEditor>` under the card (or on the right-hand meta column for list view).

Thread `sections` + `tagSuggestions` from `DeckContent` down. Compute `tagSuggestions` as `useMemo(() => Array.from(new Set(visibleCards.flatMap((c) => c.tags ?? []))).sort(), [visibleCards])`.

- [ ] **Step 4: Build + browser walkthrough**

```bash
pnpm build
```

Edit a card in an owned deck:
- Click section pill → pick "Ramp" → badge updates.
- Type "tested" + Enter → pill appears.
- Reload page → both persisted (verify DB row too).

- [ ] **Step 5: Commit**

Use `caveman:caveman-commit`.

---

### Task 1.11: Filter bar — filter by section + tag in DeckContent

**Files:**
- Modify: `src/components/deck/DeckContent.tsx`

- [ ] **Step 1: Add multi-select filter state**

```ts
const [sectionFilter, setSectionFilter] = useState<Set<string>>(new Set())
const [tagFilter, setTagFilter] = useState<Set<string>>(new Set())
```

Update the existing `showFilterPanel` block to include two new groups:

- "Sections" — one toggle chip per section in the deck + "Uncategorized" option (null sentinel stored as `''` in the set).
- "Tags" — chips for every tag used in the deck.

- [ ] **Step 2: Extend `visibleCards` filter**

```ts
const visibleCards = useMemo(() => {
  return cards.filter((c) => {
    if (typeFilter.size && !typeFilter.has(getCardTypeCategory(c.card?.type_line ?? ''))) return false
    if (sectionFilter.size) {
      const key = (c as { section_id?: string | null }).section_id ?? ''
      if (!sectionFilter.has(key)) return false
    }
    if (tagFilter.size) {
      const cardTags = (c as { tags?: string[] }).tags ?? []
      const matches = Array.from(tagFilter).every((t) => cardTags.includes(t))
      if (!matches) return false
    }
    return true
  })
}, [cards, typeFilter, sectionFilter, tagFilter])
```

- [ ] **Step 3: Build + browser spot-check**

Filter "Ramp" → only Ramp cards remain. Toggle off → all back.

- [ ] **Step 4: Commit**

Use `caveman:caveman-commit`.

---

### Task 1.12: Mobile — long-press bottom-sheet for move-to-section + edit tags

**Files:**
- Create: `src/components/deck/DeckCardActionSheet.tsx`
- Modify: `src/components/deck/DeckCard.tsx`

- [ ] **Step 1: Bottom sheet component**

Reuse the existing long-press hook `useLongPress`. On trigger, open a sheet anchored to the bottom with:
- Section picker (full-height list, radio selection)
- Tag editor
- "Move to Maybeboard" / "Move to Sideboard" / "Remove from deck"

Use Tailwind `fixed inset-x-0 bottom-0 max-h-[70vh] overflow-auto rounded-t-2xl bg-bg-cell border-t border-border` + backdrop `fixed inset-0 bg-black/60` with click-to-close.

- [ ] **Step 2: Trigger on `DeckCard`**

Mobile-only: wire `useLongPress` (already in repo) to open the sheet. Desktop keeps the existing inline pickers from Task 1.10.

Media query: use `matchMedia('(hover: none)')` at mount OR rely on existing mobile-detection utility if present.

- [ ] **Step 3: Build + mobile browser walk-through**

```bash
pnpm build
```

Chrome dev tools → mobile emulation. Long-press a card → sheet opens, pick section, close, card updates.

- [ ] **Step 4: Commit**

Use `caveman:caveman-commit`.

---

### Task 1.13: DECISIONS + MANUAL_STEPS update

**Files:**
- Modify: `DECISIONS.md`
- Modify: `MANUAL_STEPS.md` (if the file exists — otherwise create)

- [ ] **Step 1: Log decisions**

Append to `DECISIONS.md`:
```
2026-04-24 — Deck sections: opted for free-form sections (not fixed columns) + free-form tags (text[]+GIN). Deferred Scryfall Tagger auto_rule to a follow-up — functional_tags ingestion is out of scope.
2026-04-24 — Section preset only for Commander. Other formats hit "Add section" manually — no multi-format preset until we see usage data.
```

- [ ] **Step 2: No manual steps needed**

If `MANUAL_STEPS.md` already exists, leave untouched. Otherwise skip — nothing manual for this phase.

- [ ] **Step 3: Commit**

Use `caveman:caveman-commit`.

---

### Task 1.14: Push to `dev` — phase 1 done

**Files:** — (git)

- [ ] **Step 1: Verify clean working tree except untracked planning files**

```bash
git status
```

Expected: tracked files all committed; plan doc + checkpoint are fine.

- [ ] **Step 2: Push**

```bash
git push origin dev
```

- [ ] **Step 3: Confirm Vercel preview built**

Open the Vercel dashboard (user has reference), confirm latest `dev` preview deployed green. If not: inspect build log, fix, recommit, re-push.

- [ ] **Step 4: Update CHECKPOINT.md**

Add under "Feature attive → Gestione deck":
- `[x] Sezioni custom per deck + tag per carta (drag-reorder, preset Commander, filter per sezione/tag)`

Commit CHECKPOINT update. Push.

---

# Phase 2 — P1: Deck analytics advanced

**Phase goal:** Promote the existing CMC / color / type charts from the sidebar into a dedicated Stats tab on the deck page, plus Monte Carlo goldfish metrics (opening-hand keep %, turn-to-commander P50/P90, mana screw / flood). Everything client-side — zero DB schema changes, zero external API, zero new route handlers. Functional-tags-driven stats (ramp count, removal count…) are deferred — they depend on Scryfall Tagger ingestion which is its own plan.

---

### Task 2.1: Install recharts

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Add dep**

```bash
pnpm add recharts
```

- [ ] **Step 2: Verify**

```bash
pnpm list recharts
```

Expected: ≥3.0.

- [ ] **Step 3: Commit**

Use `caveman:caveman-commit`.

---

### Task 2.2: Extract stats computation into a hook

**Files:**
- Create: `src/lib/hooks/useDeckStats.ts`
- Modify: `src/components/deck/DeckStats.tsx`

- [ ] **Step 1: Move `stats` useMemo body into the hook**

Copy every computation out of `DeckStats.tsx`'s `useMemo` into a pure function `computeDeckStats(cards: DeckCardEntry[])`. Export a hook wrapper:

```ts
// src/lib/hooks/useDeckStats.ts
import { useMemo } from 'react'
import { computeDeckStats, type DeckCardEntry, type DeckStatsResult } from './deckStatsCompute'

export function useDeckStats(cards: DeckCardEntry[]): DeckStatsResult {
  return useMemo(() => computeDeckStats(cards), [cards])
}
```

And the plain fn in `src/lib/hooks/deckStatsCompute.ts`.

Replace the old useMemo in `DeckStats.tsx` with `const stats = useDeckStats(cards)`.

- [ ] **Step 2: Type the result**

Export `DeckStatsResult` interface matching the object currently returned (totalMain, avgCMC, manaCurve, colorCounts, typeCounts, totalValueEur, totalValueUsd, etc.).

- [ ] **Step 3: Build**

```bash
pnpm build
```

- [ ] **Step 4: Commit**

Use `caveman:caveman-commit`.

---

### Task 2.3: Add mana source + color source + rarity + set stats

**Files:**
- Modify: `src/lib/hooks/deckStatsCompute.ts`
- Modify: `src/components/deck/DeckStats.tsx`

- [ ] **Step 1: Extend compute fn**

Add to `DeckStatsResult`:

```ts
manaSourceCount: number          // lands + rocks + dorks (heuristic)
colorSourceCount: Record<'W'|'U'|'B'|'R'|'G', number>
rarityBreakdown: Record<'common'|'uncommon'|'rare'|'mythic'|'special', number>
setBreakdown: Array<{ code: string; name: string | null; count: number }>
topExpensive: Array<{ name: string; priceEur: number; priceUsd: number }>
```

Heuristic for `manaSourceCount`:

```ts
const isLand = (t: string) => t.toLowerCase().includes('land')
const isRockOrDork = (c: CardRow) => {
  const pm = (c.produced_mana as string[] | null) ?? []
  if (pm.length === 0) return false
  const t = (c.type_line ?? '').toLowerCase()
  return (t.includes('artifact') || t.includes('creature')) && !isLand(t)
}
```

`colorSourceCount`: for every main card, if `produced_mana` includes color C, accumulate `quantity`.

`topExpensive`: sort all main + sideboard rows by `max(prices_eur, prices_usd)` desc, slice 10.

- [ ] **Step 2: Render new panels in `DeckStats.tsx`**

Add sections below the existing curve:
- "Mana Sources" — single horizontal bar with color sources as colored segments; total number shown.
- "Rarity" — Recharts PieChart, radius 60.
- "Sets" — vertical list top-10 sets by count.
- "Top 10 Most Expensive" — simple list, name + €x.xx / $x.xx.

- [ ] **Step 3: Build + browser walkthrough**

```bash
pnpm build
```

Open stats on a deck with varied prices / rarities: confirm pie renders, sources total matches manual count (+/- heuristic), top-expensive list sorts correctly.

- [ ] **Step 4: Commit**

Use `caveman:caveman-commit`.

---

### Task 2.4: Monte Carlo simulator in a Web Worker

**Files:**
- Create: `src/lib/hooks/deckSimulatorWorker.ts` (the worker module)
- Create: `src/lib/hooks/useDeckSimulator.ts` (hook that spawns + queries the worker)

The repo already has a Goldfish engine — but for pure statistical sampling we don't need the full engine. We need a minimal engine: shuffle → draw 7 → mulligan heuristic → then simulate draws T1…T7 and check:

- `keepRate`: % of starting hands that pass the Karsten rule (≥2 lands and ≤5 lands in 7).
- `screwRate`: % of games where after draw step of T3 we have <2 lands in play.
- `floodRate`: % of games where after draw step of T7 we have >7 lands in play.
- `turnToCommander`: for decks with a designated commander (check the existing `commander` board tag), the expected turn we can cast it — P50 and P90. A card is castable on turn T if total lands in play + total mana rocks with CMC ≤ available lands ≥ commander CMC. This is a simplified "greedy best play" model.

- [ ] **Step 1: Worker module**

```ts
// src/lib/hooks/deckSimulatorWorker.ts
/// <reference lib="webworker" />

export interface SimInput {
  mainDeck: { cmc: number; is_land: boolean; is_rock: boolean }[]
  commanderCmc: number | null
  iterations: number
  seed?: number
}

export interface SimResult {
  keepRate: number
  screwRate: number
  floodRate: number
  turnToCommanderP50: number | null
  turnToCommanderP90: number | null
  samples: number
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Mulligan (London): if hand has <2 or >5 lands we mulligan (up to 3 times).
function londonMulligan(deck: SimInput['mainDeck'], rng: () => number) {
  for (let mull = 0; mull <= 3; mull++) {
    const shuffled = shuffle(deck, rng)
    const hand = shuffled.slice(0, 7)
    const lands = hand.filter((c) => c.is_land).length
    if (lands >= 2 && lands <= 5) return { hand, library: shuffled.slice(7), mull }
    if (mull === 3) return { hand, library: shuffled.slice(7), mull }
  }
  return null
}

function runOnce(input: SimInput, rng: () => number) {
  const res = londonMulligan(input.mainDeck, rng)
  if (!res) return { keep: false, screw: false, flood: false, tt: null as number | null }
  const { hand, library, mull } = res
  const keep = mull === 0
  // Play 7 turns, 1 land per turn if we have one in hand, draw 1 each turn (after T1 on draw).
  let landsInPlay = 0
  let rocksInPlay = 0
  const currentHand = hand.slice()
  const currentLib = library.slice()
  let castCommanderTurn: number | null = null
  for (let turn = 1; turn <= 10; turn++) {
    if (turn > 1) {
      const drawn = currentLib.shift()
      if (drawn) currentHand.push(drawn)
    }
    // Play a land if any
    const landIdx = currentHand.findIndex((c) => c.is_land)
    if (landIdx >= 0) {
      currentHand.splice(landIdx, 1)
      landsInPlay++
    }
    // Cast rocks greedy — if we have a rock of CMC ≤ lands in play
    let played = true
    while (played) {
      played = false
      const rockIdx = currentHand.findIndex((c) => c.is_rock && c.cmc <= landsInPlay + rocksInPlay)
      if (rockIdx >= 0) {
        currentHand.splice(rockIdx, 1)
        rocksInPlay++
        played = true
      }
    }
    // Commander castable?
    if (castCommanderTurn === null && input.commanderCmc != null && landsInPlay + rocksInPlay >= input.commanderCmc) {
      castCommanderTurn = turn
    }
  }
  // screw / flood evaluated against the *starting* hand or initial landsInPlay at T3 / T7:
  return { keep, screw: false, flood: false, tt: castCommanderTurn }
}

// Proper screw/flood: simulate explicitly up to T3 and T7 in a separate pass.
// To keep runtime tight we compute these in the same runOnce by tracking.

self.onmessage = (ev: MessageEvent<SimInput>) => {
  const input = ev.data
  const seed = input.seed ?? 0xC0FFEE
  let state = seed | 0
  const rng = () => { state = (state * 1664525 + 1013904223) | 0; return ((state >>> 0) / 0xFFFFFFFF) }

  let keepCount = 0
  let screwCount = 0
  let floodCount = 0
  const castTurns: number[] = []

  for (let i = 0; i < input.iterations; i++) {
    // Starting hand probe
    const shuffled = shuffle(input.mainDeck, rng)
    const hand = shuffled.slice(0, 7)
    const lands7 = hand.filter((c) => c.is_land).length
    if (lands7 >= 2 && lands7 <= 5) keepCount++

    // Full sim for cast turn
    const r = runOnce(input, rng)
    if (r.tt != null) castTurns.push(r.tt)

    // Screw: after T3 drawn cards, still <2 lands.
    // Flood: after T7 drawn cards, >7 lands in hand+play combined.
    // Re-run a compact pass:
    let lands = 0, landsInHand = lands7
    const lib = shuffled.slice(7)
    let handLands = lands7
    // T1: play land if any. T2,T3 draw then play.
    for (let t = 1; t <= 3; t++) {
      if (t > 1) {
        const d = lib.shift()
        if (d?.is_land) handLands++
      }
      if (handLands > 0) { handLands--; lands++ }
    }
    if (lands < 2) screwCount++

    let landsT7 = lands
    let inHand = handLands
    for (let t = 4; t <= 7; t++) {
      const d = lib.shift()
      if (d?.is_land) inHand++
      if (inHand > 0) { inHand--; landsT7++ }
    }
    if (landsT7 + inHand > 7) floodCount++
  }

  castTurns.sort((a, b) => a - b)
  const p = (pct: number) =>
    castTurns.length === 0 ? null : castTurns[Math.min(castTurns.length - 1, Math.floor(pct * castTurns.length))]

  const result: SimResult = {
    keepRate: keepCount / input.iterations,
    screwRate: screwCount / input.iterations,
    floodRate: floodCount / input.iterations,
    turnToCommanderP50: p(0.5),
    turnToCommanderP90: p(0.9),
    samples: input.iterations,
  }
  self.postMessage(result)
}
```

- [ ] **Step 2: Hook wrapper**

```ts
// src/lib/hooks/useDeckSimulator.ts
'use client'

import { useEffect, useRef, useState } from 'react'
import type { SimInput, SimResult } from './deckSimulatorWorker'

export function useDeckSimulator(input: SimInput | null): { result: SimResult | null; running: boolean } {
  const [result, setResult] = useState<SimResult | null>(null)
  const [running, setRunning] = useState(false)
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    if (!input) return
    setRunning(true)
    setResult(null)
    const w = new Worker(new URL('./deckSimulatorWorker.ts', import.meta.url), { type: 'module' })
    workerRef.current = w
    w.onmessage = (ev) => {
      setResult(ev.data as SimResult)
      setRunning(false)
      w.terminate()
    }
    w.postMessage(input)
    return () => {
      w.terminate()
      workerRef.current = null
    }
  }, [input])

  return { result, running }
}
```

- [ ] **Step 3: Next.js worker config check**

Next.js 16 Turbopack supports `new Worker(new URL(..., import.meta.url), { type: 'module' })` out of the box. If the build warns, add to `next.config.ts`:
```ts
experimental: { turbo: { rules: { '*.worker.ts': ['loader?type=module'] } } }
```
Skip unless needed — we confirm in the build step.

- [ ] **Step 4: Verification**

Add a one-off dev-only trigger on the deck page (we wire the real UI in Task 2.5): in browser console:

```js
// After page load on a deck with ~60 cards
```

Skip this ad-hoc test — Task 2.5 wires the UI.

- [ ] **Step 5: Commit**

Use `caveman:caveman-commit`.

---

### Task 2.5: Promote DeckStats to a full Stats tab + render simulator output

**Files:**
- Modify: `src/components/deck/DeckStats.tsx`
- Modify: `src/components/deck/DeckView.tsx`
- Modify: `src/components/deck/DeckEditor.tsx`

- [ ] **Step 1: Add simulator panel**

In `DeckStats.tsx`:

```tsx
import { useDeckSimulator } from '@/lib/hooks/useDeckSimulator'

// Inside component:
const simInput = useMemo(() => {
  const main = cards.filter((c) => c.board === 'main' || c.board === 'commander')
  const mainDeck = main.flatMap(({ card, quantity }) =>
    Array.from({ length: quantity }, () => ({
      cmc: card.cmc ?? 0,
      is_land: !!card.type_line?.toLowerCase().includes('land'),
      is_rock: ((card.produced_mana as string[] | null)?.length ?? 0) > 0 && !card.type_line?.toLowerCase().includes('land'),
    }))
  )
  const cmd = cards.find((c) => c.board === 'commander')
  return {
    mainDeck,
    commanderCmc: cmd ? cmd.card.cmc : null,
    iterations: 5000,
  }
}, [cards])

const { result: sim, running: simRunning } = useDeckSimulator(simInput)
```

Render below the curves:

```tsx
<div className="rounded-lg border border-border bg-bg-cell p-3">
  <h3 className="mb-2 text-sm font-semibold text-font-secondary">Goldfish Stats (5k sims)</h3>
  {simRunning && <div className="text-xs text-font-muted">Simulating…</div>}
  {sim && (
    <dl className="grid grid-cols-2 gap-2 text-xs">
      <StatRow label="Keep rate (2-5 lands)" value={`${(sim.keepRate * 100).toFixed(0)}%`} />
      <StatRow label="Mana screw @ T3" value={`${(sim.screwRate * 100).toFixed(0)}%`} />
      <StatRow label="Mana flood @ T7" value={`${(sim.floodRate * 100).toFixed(0)}%`} />
      {sim.turnToCommanderP50 != null && (
        <StatRow label="Turn to commander" value={`T${sim.turnToCommanderP50} / T${sim.turnToCommanderP90 ?? '?'}`} />
      )}
    </dl>
  )}
</div>
```

`StatRow` is an inline helper component — name/value dl pair.

- [ ] **Step 2: Make stats collapsible tab in DeckView / DeckEditor**

If DeckStats is already rendered in a side-panel, keep it. Additionally expose a "Stats" tab alongside Main / Sideboard / Maybeboard / Token that renders `DeckStats` as the full content on small screens. Add `stats` to whatever tab state lives in `DeckContent` or its parent.

- [ ] **Step 3: Build + browser verification**

```bash
pnpm build
```

Open a 60-card deck. Stats tab renders in <500ms (sim takes <300ms on desktop). Keep rate for a balanced deck (24 lands / 60) should be in the 85–92% range.

- [ ] **Step 4: Commit**

Use `caveman:caveman-commit`.

---

### Task 2.6: Push + CHECKPOINT update

**Files:**
- Modify: `CHECKPOINT.md`
- (git)

- [ ] **Step 1: Update CHECKPOINT**

Add under Gestione deck:
- `[x] Deck analytics v1 (Monte Carlo keep/screw/flood, turn-to-commander, sources, rarity, set, top expensive)`

- [ ] **Step 2: Commit + push**

Use `caveman:caveman-commit`. `git push origin dev`. Confirm Vercel preview green.

---

# Phase 3 — P1: Collection + deck overlay

**Phase goal:** user tracks owned cards. Collection page lists them filterable; import accepts Deckbox / Moxfield / Manabox CSV; deck view shows "owned/missing" badges per card and aggregate "completion" bar with shopping-list export.

---

### Task 3.1: Install deps

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Install**

```bash
pnpm add react-virtuoso papaparse
pnpm add -D @types/papaparse
```

- [ ] **Step 2: Verify**

```bash
pnpm list react-virtuoso papaparse
```

- [ ] **Step 3: Commit**

Use `caveman:caveman-commit`.

---

### Task 3.2: Migration — `user_cards`

**Files:**
- Create: `supabase/migrations/<TS>_user_cards.sql`
- Modify: `src/types/supabase.ts`

- [ ] **Step 1: Migration SQL**

```sql
create table public.user_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null references public.cards(id) on delete cascade,
  quantity integer not null default 1 check (quantity >= 0),
  foil boolean not null default false,
  language text not null default 'en',
  condition text check (condition in ('M','NM','LP','MP','HP','D')) default 'NM',
  acquired_at timestamptz default now(),
  acquired_price_eur numeric(10,2),
  notes text,
  unique (user_id, card_id, foil, language, condition)
);

create index user_cards_user_idx on public.user_cards (user_id);
create index user_cards_card_idx on public.user_cards (card_id);

alter table public.user_cards enable row level security;

create policy user_cards_select_own on public.user_cards
  for select using (user_id = auth.uid());
create policy user_cards_mutate_own on public.user_cards
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: Apply + verify**

Apply via MCP. Verify `information_schema.columns` + `pg_policies`.

- [ ] **Step 3: Update types**

Add `user_cards` block to `src/types/supabase.ts` (Row / Insert / Update).

- [ ] **Step 4: Build**

```bash
pnpm build
```

- [ ] **Step 5: Commit**

Use `caveman:caveman-commit`.

---

### Task 3.3: API — collection CRUD

**Files:**
- Create: `src/app/api/collection/route.ts`
- Create: `src/app/api/collection/[id]/route.ts`

- [ ] **Step 1: `route.ts` — GET (paginated list) + POST (add)**

```ts
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
  const offset = Number(url.searchParams.get('offset') ?? 0)

  const { data, error, count } = await supabase
    .from('user_cards')
    .select(
      `id, quantity, foil, language, condition, acquired_price_eur, notes,
       card:cards!card_id(id, name, name_it, mana_cost, type_line, image_small, image_normal, cmc, rarity, set_code, color_identity, prices_eur, prices_usd)`,
      { count: 'exact' }
    )
    .eq('user_id', user.id)
    .order('acquired_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Null-guard join (CLAUDE.md)
  const cards = (data ?? []).filter((r) => (r as { card: unknown }).card != null)
  return NextResponse.json({ items: cards, total: count ?? 0 })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const card_id = typeof body.card_id === 'string' ? body.card_id : null
  const quantity = Number(body.quantity ?? 1)
  const foil = !!body.foil
  const language = typeof body.language === 'string' ? body.language : 'en'
  const condition = typeof body.condition === 'string' ? body.condition : 'NM'
  const price_eur = typeof body.acquired_price_eur === 'number' ? body.acquired_price_eur : null
  const notes = typeof body.notes === 'string' ? body.notes : null
  if (!card_id || !Number.isFinite(quantity) || quantity < 1) {
    return NextResponse.json({ error: 'card_id and quantity required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Upsert (user, card, foil, language, condition) — bump quantity
  const { data: existing } = await supabase
    .from('user_cards')
    .select('id, quantity')
    .eq('user_id', user.id)
    .eq('card_id', card_id)
    .eq('foil', foil)
    .eq('language', language)
    .eq('condition', condition)
    .maybeSingle()

  let row
  if (existing) {
    const { data, error } = await supabase
      .from('user_cards')
      .update({ quantity: existing.quantity + quantity })
      .eq('id', existing.id)
      .select('id, quantity, foil, language, condition')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    row = data
  } else {
    const { data, error } = await supabase
      .from('user_cards')
      .insert({ user_id: user.id, card_id, quantity, foil, language, condition, acquired_price_eur: price_eur, notes })
      .select('id, quantity, foil, language, condition')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    row = data
  }

  revalidatePath('/collection')
  return NextResponse.json({ item: row })
}
```

- [ ] **Step 2: `[id]/route.ts` — PATCH quantity + DELETE**

```ts
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

interface Params { id: string }

export async function PATCH(req: Request, { params }: { params: Promise<Params> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  if (typeof body.quantity === 'number' && body.quantity >= 0) patch.quantity = body.quantity
  if (typeof body.notes === 'string' || body.notes === null) patch.notes = body.notes
  if (typeof body.acquired_price_eur === 'number' || body.acquired_price_eur === null) patch.acquired_price_eur = body.acquired_price_eur
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('user_cards')
    .update(patch)
    .eq('id', id)
    .select('id, quantity, notes, acquired_price_eur')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/collection')
  return NextResponse.json({ item: data })
}

export async function DELETE(_req: Request, { params }: { params: Promise<Params> }) {
  const { id } = await params
  const supabase = await createClient()
  const { error } = await supabase.from('user_cards').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidatePath('/collection')
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Runtime smoke**

In browser authenticated:
```js
await fetch('/api/collection', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ card_id: 'SCRYFALL_ID_OR_INTERNAL', quantity: 2 }) }).then(r => r.json())
await fetch('/api/collection?limit=10').then(r => r.json())
```
Verify with `select * from user_cards where user_id = auth.uid()`.

- [ ] **Step 4: Commit**

Use `caveman:caveman-commit`.

---

### Task 3.4: API — CSV bulk import

**Files:**
- Create: `src/app/api/collection/bulk-import/route.ts`
- Create: `src/lib/collection/csvParsers.ts`

- [ ] **Step 1: CSV parsers**

Support three flavours by sniffing column headers:

```ts
// src/lib/collection/csvParsers.ts
import Papa from 'papaparse'

export interface CollectionImportRow {
  name: string
  quantity: number
  set_code?: string | null
  collector_number?: string | null
  foil: boolean
  language: string
  condition: 'M'|'NM'|'LP'|'MP'|'HP'|'D'
}

type Flavor = 'deckbox' | 'moxfield' | 'manabox' | 'generic'

export function detectFlavor(headers: string[]): Flavor {
  const set = new Set(headers.map((h) => h.toLowerCase().trim()))
  if (set.has('edition') && set.has('card number')) return 'deckbox'
  if (set.has('scryfall id') || set.has('purchase price currency')) return 'manabox'
  if (set.has('tradelist count') && set.has('name')) return 'moxfield'
  return 'generic'
}

function toCondition(raw: string | undefined): CollectionImportRow['condition'] {
  const v = (raw ?? '').toUpperCase().replace(/\s+/g, '').trim()
  if (v.startsWith('MI') || v === 'M') return 'M'
  if (v.startsWith('NM') || v.includes('NEAR')) return 'NM'
  if (v.startsWith('LP') || v.includes('LIGHT')) return 'LP'
  if (v.startsWith('MP') || v.includes('MODERATE') || v.includes('PLAYED')) return 'MP'
  if (v.startsWith('HP') || v.includes('HEAVY')) return 'HP'
  if (v.startsWith('D') || v.includes('DAMAGE') || v.includes('POOR')) return 'D'
  return 'NM'
}

function toFoil(raw: string | undefined): boolean {
  const v = (raw ?? '').toLowerCase().trim()
  return v === 'foil' || v === 'yes' || v === 'true' || v === '1' || v === 'etched'
}

function toInt(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export function parseCsv(text: string): { flavor: Flavor; rows: CollectionImportRow[] } {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() })
  const headers = parsed.meta.fields ?? []
  const flavor = detectFlavor(headers)
  const rows: CollectionImportRow[] = []
  for (const r of parsed.data) {
    let name = ''
    let qty = 0
    let setCode: string | null = null
    let cn: string | null = null
    let foil = false
    let lang = 'en'
    let cond: CollectionImportRow['condition'] = 'NM'

    if (flavor === 'deckbox') {
      name = r['Name'] ?? ''
      qty = toInt(r['Count'])
      setCode = (r['Edition'] ?? '').trim() || null
      cn = (r['Card Number'] ?? '').trim() || null
      foil = toFoil(r['Foil'])
      lang = (r['Language'] ?? 'en').toLowerCase() || 'en'
      cond = toCondition(r['Condition'])
    } else if (flavor === 'moxfield') {
      name = r['Name'] ?? ''
      qty = toInt(r['Count']) || toInt(r['TradelistCount'])
      setCode = (r['Edition'] ?? r['Set'] ?? '').trim() || null
      cn = (r['CollectorNumber'] ?? r['Card Number'] ?? '').trim() || null
      foil = toFoil(r['Foil'])
      lang = (r['Language'] ?? 'en').toLowerCase() || 'en'
      cond = toCondition(r['Condition'])
    } else if (flavor === 'manabox') {
      name = r['Name'] ?? ''
      qty = toInt(r['Quantity'])
      setCode = (r['Set code'] ?? r['Set'] ?? '').toLowerCase().trim() || null
      cn = (r['Collector number'] ?? '').trim() || null
      foil = toFoil(r['Foil'])
      lang = (r['Language'] ?? 'en').toLowerCase() || 'en'
      cond = toCondition(r['Condition'])
    } else {
      name = r['Name'] ?? r['name'] ?? ''
      qty = toInt(r['Quantity'] ?? r['Count'] ?? r['count'] ?? r['quantity'])
    }

    if (name && qty > 0) {
      rows.push({ name: name.trim(), quantity: qty, set_code: setCode, collector_number: cn, foil, language: lang, condition: cond })
    }
  }
  return { flavor, rows }
}
```

- [ ] **Step 2: Bulk-import route**

```ts
// src/app/api/collection/bulk-import/route.ts
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { parseCsv } from '@/lib/collection/csvParsers'

export async function POST(req: Request) {
  const text = await req.text()
  if (!text.trim()) return NextResponse.json({ error: 'empty csv' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { flavor, rows } = parseCsv(text)
  if (rows.length === 0) return NextResponse.json({ error: 'no valid rows' }, { status: 400 })

  // Resolve names → card_id via existing bulk-lookup RPC.
  // Pattern mirrors /api/decks/[id]/cards/bulk-import.
  // We send (name, set_code, collector_number) tuples to the existing RPC.
  const lookups = rows.map((r) => ({ name: r.name, set_code: r.set_code, collector_number: r.collector_number }))
  const { data: resolved, error: rpcErr } = await supabase.rpc('lookup_cards_with_collector_number' as never, {
    lookups: lookups as never,
  })
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })

  // Build (name → card_id) map; fall back to first hit if no set-match.
  const resolvedMap = new Map<string, string>()
  for (const row of (resolved as { name: string; card_id: string }[] | null) ?? []) {
    if (!resolvedMap.has(row.name.toLowerCase())) resolvedMap.set(row.name.toLowerCase(), row.card_id)
  }

  // Upsert rows one-by-one. For typical imports (~1000 cards) this is acceptable;
  // optimise later with a single batch upsert RPC if profiling shows pain.
  let inserted = 0
  let skipped = 0
  for (const r of rows) {
    const cardId = resolvedMap.get(r.name.toLowerCase())
    if (!cardId) { skipped++; continue }

    const { data: existing } = await supabase
      .from('user_cards')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('card_id', cardId)
      .eq('foil', r.foil)
      .eq('language', r.language)
      .eq('condition', r.condition)
      .maybeSingle()
    if (existing) {
      await supabase.from('user_cards').update({ quantity: existing.quantity + r.quantity }).eq('id', existing.id)
    } else {
      await supabase.from('user_cards').insert({
        user_id: user.id,
        card_id: cardId,
        quantity: r.quantity,
        foil: r.foil,
        language: r.language,
        condition: r.condition,
      })
    }
    inserted++
  }

  revalidatePath('/collection')
  return NextResponse.json({ flavor, inserted, skipped, total: rows.length })
}
```

Note on RPC name: the actual RPC is `lookup_cards_with_collector_number` (per the most recent migration `20260421180000_lookup_cards_with_collector_number.sql`). If its signature doesn't match this shape, check with `execute_sql`:

```sql
select proname, pg_get_function_arguments(oid)
from pg_proc where proname like 'lookup_cards%';
```

and adapt the call. Do NOT invent a new RPC — use whatever the deck bulk-import route already uses.

- [ ] **Step 3: Verification**

Small Moxfield CSV (3 rows) → POST → response shows `inserted: 3, skipped: 0`. `select count(*) from user_cards` increases.

- [ ] **Step 4: Commit**

Use `caveman:caveman-commit`.

---

### Task 3.5: Collection page — `/collection`

**Files:**
- Create: `src/app/(app)/collection/page.tsx`
- Create: `src/app/(app)/collection/loading.tsx`
- Create: `src/components/collection/CollectionView.tsx`
- Create: `src/components/collection/CollectionImportModal.tsx`

- [ ] **Step 1: `page.tsx` (Server Component)**

Auth-protected; fetches first page of items; streams to the client component.

```tsx
// src/app/(app)/collection/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CollectionView from '@/components/collection/CollectionView'

export default async function CollectionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, count } = await supabase
    .from('user_cards')
    .select(
      `id, quantity, foil, language, condition, acquired_price_eur,
       card:cards!card_id(id, name, name_it, mana_cost, type_line, image_small, image_normal, cmc, rarity, set_code, color_identity, prices_eur, prices_usd)`,
      { count: 'exact' }
    )
    .eq('user_id', user.id)
    .order('acquired_at', { ascending: false })
    .range(0, 49)

  const initial = (data ?? []).filter((r) => (r as { card: unknown }).card != null)
  return <CollectionView initialItems={initial as never} total={count ?? 0} />
}
```

- [ ] **Step 2: `loading.tsx`**

Reuse existing skeleton pattern from other routes.

- [ ] **Step 3: `CollectionView.tsx`**

`'use client'`. Uses `react-virtuoso`'s `VirtuosoGrid` (for grid view) with infinite loader fetching `/api/collection?offset=N`. Support filters: color, rarity, set, name search. Reuse `CardItem` / `CardGrid` primitives from `src/components/cards/` (Explore survey confirms they exist).

Outline:

```tsx
'use client'

import { useCallback, useMemo, useState } from 'react'
import { VirtuosoGrid } from 'react-virtuoso'
import CollectionImportModal from './CollectionImportModal'
// … your card tile of choice, e.g. reuse CardItem

export default function CollectionView({ initialItems, total }: { initialItems: Item[]; total: number }) {
  const [items, setItems] = useState<Item[]>(initialItems)
  const [importOpen, setImportOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [colorSet, setColorSet] = useState<Set<string>>(new Set())
  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (query && !it.card.name.toLowerCase().includes(query.toLowerCase())) return false
      if (colorSet.size) {
        const ci = (it.card.color_identity as string[] | null) ?? []
        if (![...colorSet].every((c) => ci.includes(c))) return false
      }
      return true
    })
  }, [items, query, colorSet])

  const loadMore = useCallback(async () => {
    if (items.length >= total) return
    const res = await fetch(`/api/collection?limit=50&offset=${items.length}`)
    if (!res.ok) return
    const { items: next } = await res.json()
    setItems((p) => [...p, ...next])
  }, [items.length, total])

  return (
    <div className="flex flex-col gap-3 p-3">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-font-primary">Collection ({total})</h1>
        <button onClick={() => setImportOpen(true)} className="rounded bg-font-accent px-3 py-1.5 text-xs font-semibold text-bg-dark">
          Import CSV
        </button>
      </header>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name…"
        className="rounded border border-border bg-bg-dark px-3 py-2 text-sm text-font-primary"
      />
      {/* colour-filter chips — omitted for brevity, reuse existing UI tokens */}
      <VirtuosoGrid
        style={{ height: '70vh' }}
        data={filtered}
        endReached={loadMore}
        listClassName="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6"
        itemContent={(_, it) => <CollectionTile item={it} onDelta={(delta) => patchQty(it.id, delta)} />}
      />
      {importOpen && <CollectionImportModal onClose={() => setImportOpen(false)} onImported={(summary) => { /* re-fetch first page */ setImportOpen(false) }} />}
    </div>
  )
}
```

`CollectionTile`: reuse existing `CardItem` with an overlay quantity badge + `+` / `−` buttons that call `/api/collection/:id`.

- [ ] **Step 4: `CollectionImportModal.tsx`**

File upload, parses client-side via `papaparse` for preview (count only), POSTs raw text to `/api/collection/bulk-import`.

```tsx
'use client'

import { useRef, useState } from 'react'

interface Props { onClose: () => void; onImported: (summary: { inserted: number; skipped: number }) => void }

export default function CollectionImportModal({ onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const f = fileRef.current?.files?.[0]
    if (!f) return
    setBusy(true); setError(null)
    const text = await f.text()
    const res = await fetch('/api/collection/bulk-import', { method: 'POST', headers: { 'content-type': 'text/csv' }, body: text })
    if (!res.ok) { setError(await res.text()); setBusy(false); return }
    const summary = await res.json()
    onImported(summary)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-border bg-bg-cell p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 text-lg font-semibold text-font-primary">Import collection</h2>
        <p className="mb-3 text-xs text-font-muted">
          Supported formats: Deckbox, Moxfield, Manabox CSV exports.
        </p>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="mb-3 block w-full text-sm text-font-secondary" />
        {error && <div className="mb-2 text-xs text-font-danger">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-border px-3 py-1.5 text-xs text-font-secondary">Cancel</button>
          <button onClick={submit} disabled={busy} className="rounded bg-font-accent px-3 py-1.5 text-xs font-semibold text-bg-dark disabled:opacity-50">
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Sidebar link**

Add "Collection" nav entry to wherever the sidebar lives (Explore survey: `SidebarContext`). Find the sidebar component and append a link matching existing style (icon from Lucide — `Library` works).

- [ ] **Step 6: Build + browser walkthrough**

```bash
pnpm build
```

Log in, click Collection. Empty state shows import CTA. Drop a Moxfield export → rows appear.

- [ ] **Step 7: Commit**

Use `caveman:caveman-commit`.

---

### Task 3.6: API + UI — deck overlay (owned / missing)

**Files:**
- Create: `src/app/api/decks/[id]/overlay/route.ts`
- Modify: `src/components/deck/DeckContent.tsx` (badge rendering)
- Modify: `src/components/deck/DeckView.tsx` or `DeckEditor.tsx` (summary bar + toggle)

- [ ] **Step 1: Overlay route**

```ts
// src/app/api/decks/[id]/overlay/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: deckId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // 1) All deck_cards for the deck (card_id + quantity, excluding sideboard? include all; caller decides)
  const { data: deckCards, error: e1 } = await supabase
    .from('deck_cards')
    .select('card_id, quantity, board')
    .eq('deck_id', deckId)
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

  // 2) Sum of owned (ignore foil / language / condition splits — total owned per card)
  const cardIds = Array.from(new Set((deckCards ?? []).map((d) => d.card_id)))
  if (cardIds.length === 0) return NextResponse.json({ overlay: [], owned: 0, needed: 0, missingEur: 0 })

  const { data: owned, error: e2 } = await supabase
    .from('user_cards')
    .select('card_id, quantity')
    .eq('user_id', user.id)
    .in('card_id', cardIds)
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  const ownedMap = new Map<string, number>()
  for (const row of owned ?? []) {
    ownedMap.set(row.card_id, (ownedMap.get(row.card_id) ?? 0) + row.quantity)
  }

  // 3) Prices for missing calc
  const { data: cards } = await supabase
    .from('cards')
    .select('id, prices_eur, prices_usd, name')
    .in('id', cardIds)
  const priceMap = new Map((cards ?? []).map((c) => [c.id, { eur: c.prices_eur ?? 0, usd: c.prices_usd ?? 0, name: c.name }]))

  type OverlayRow = { card_id: string; needed: number; owned: number; missing: number; missing_eur: number; missing_usd: number; name: string }
  const overlay: OverlayRow[] = []
  let totalOwned = 0
  let totalNeeded = 0
  let missingEur = 0
  let missingUsd = 0
  const perCardNeed = new Map<string, number>()
  for (const dc of deckCards ?? []) {
    perCardNeed.set(dc.card_id, (perCardNeed.get(dc.card_id) ?? 0) + dc.quantity)
  }
  for (const [cardId, need] of perCardNeed) {
    const have = ownedMap.get(cardId) ?? 0
    const missing = Math.max(0, need - have)
    const p = priceMap.get(cardId) ?? { eur: 0, usd: 0, name: '' }
    totalOwned += Math.min(have, need)
    totalNeeded += need
    missingEur += missing * p.eur
    missingUsd += missing * p.usd
    overlay.push({
      card_id: cardId,
      needed: need,
      owned: have,
      missing,
      missing_eur: missing * p.eur,
      missing_usd: missing * p.usd,
      name: p.name,
    })
  }
  return NextResponse.json({ overlay, owned: totalOwned, needed: totalNeeded, missingEur, missingUsd })
}
```

- [ ] **Step 2: Client-side hook**

```ts
// src/lib/hooks/useDeckOverlay.ts
'use client'
import { useEffect, useState } from 'react'

interface OverlayRow { card_id: string; needed: number; owned: number; missing: number; missing_eur: number; missing_usd: number; name: string }
interface OverlayData { overlay: OverlayRow[]; owned: number; needed: number; missingEur: number; missingUsd: number }

export function useDeckOverlay(deckId: string, enabled: boolean): OverlayData | null {
  const [data, setData] = useState<OverlayData | null>(null)
  useEffect(() => {
    if (!enabled) return
    const ctrl = new AbortController()
    fetch(`/api/decks/${deckId}/overlay`, { signal: ctrl.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d && !ctrl.signal.aborted) setData(d) })
      .catch(() => {})
    return () => ctrl.abort()
  }, [deckId, enabled])
  return data
}
```

Remember the `AbortController` rule from CLAUDE.md.

- [ ] **Step 3: Summary bar + per-card badges**

In `DeckView` / `DeckEditor`, add a toggle "Show collection overlay" (default off; persist in localStorage). When on:

- Render a summary strip above `DeckContent`: `owned / needed · missing for €X (Cardmarket)` with a button "Export shopping list".
- Pass an `overlayByCardId: Map<string, { owned: number; needed: number; missing: number }>` down to `DeckContent` / `DeckCard`. Render a small badge on each tile: green dot + "Owned" if missing==0, amber if 1 missing, red "Missing N" otherwise.

- [ ] **Step 4: Shopping list export**

Button on the summary strip triggers:

```ts
function exportShoppingList(overlay: OverlayRow[]) {
  const missing = overlay.filter((r) => r.missing > 0)
  const lines = missing.map((r) => `${r.missing} ${r.name}`).join('\n')
  navigator.clipboard.writeText(lines)
  alert(`Copied ${missing.length} missing cards to clipboard.`)
}
```

Cardmarket deep link (bonus from spec) — optional link after the textarea that runs `window.open('https://www.cardmarket.com/en/Magic/Products/Search?searchString=' + encodeURIComponent(r.name))` per row. Skip if the UI becomes cluttered.

- [ ] **Step 5: Build + browser walkthrough**

```bash
pnpm build
```

Import a Moxfield CSV with some of a deck's cards. Open the deck with overlay on → badges match; summary totals reconcile.

- [ ] **Step 6: Commit**

Use `caveman:caveman-commit`.

---

### Task 3.7: Update DECISIONS, CHECKPOINT, push

**Files:**
- Modify: `DECISIONS.md`
- Modify: `CHECKPOINT.md`
- (git)

- [ ] **Step 1: DECISIONS**

Append:
```
2026-04-24 — Collection overlay uses per-card totals (owned vs needed) ignoring foil/language/condition splits. Users typically don't care about matching condition/lang when the question is "do I own this card?". Keep foil/condition data for future features (collection valuation, tradelist) but the overlay aggregates.
2026-04-24 — CSV import skips unresolved rows silently (returns `skipped` count). No fuzzy-match fallback — users need clean data; otherwise surface skips for remediation UI in a follow-up.
```

- [ ] **Step 2: CHECKPOINT**

Add:
- `[x] Collection management (owned cards, CSV import Deckbox/Moxfield/Manabox, owned/missing deck overlay)`

- [ ] **Step 3: Commit + push**

Use `caveman:caveman-commit`. `git push origin dev`. Verify Vercel preview green.

---

# Post-phase: promote to release / main

Not part of the plan execution unless the user explicitly requests. Per CLAUDE.md, promotion to release/main requires "promuovi a release" / "deploya in produzione" cue. Stay on `dev` and surface the state.

---

# Self-review (2026-04-24)

**Spec coverage:**
- P0 sections: ✅ all core spec covered (sections, tags, filter bar, drag reorder, mobile sheet, preset). Deferred only: `auto_rule` / Scryfall Tagger auto-apply (explicitly called out and documented).
- P1 analytics: ✅ core stats (already present) + mana sources, color sources, rarity, sets, top expensive, Monte Carlo keep/screw/flood/turn-to-commander. Deferred: functional-tag-driven (ramp count, removal count, tutor count) — depends on Scryfall Tagger ingestion.
- P1 collection: ✅ schema, CRUD, CSV parsers (Deckbox, Moxfield, Manabox), overlay route + UI, shopping list. Deferred: price alerts (Upstash queue), wishlists.

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `DeckCardEntry` augmented with `section_id`, `position_in_section`, `tags` — used consistently across DeckContent, DeckCard, SectionPicker, TagEditor. `SectionRow` / `SectionOption` are the two shapes (SectionsPanel vs SectionPicker) — both have `id, name, color`; Picker adds no extra fields, Panel adds `position, is_collapsed`.

**Known gaps / assumptions:**
1. Exact column name for lookup RPC: plan instructs to verify against `pg_proc` before coding — hedge for CLAUDE.md "verify schema" rule.
2. Sidebar component path: not confirmed by survey. Subagent executing Task 3.5 Step 5 must grep for sidebar nav array (likely `src/components/` — check for a `Sidebar.tsx` or references to `/decks` nav entry).
3. `cards.id` is `text` (Scryfall ID) per actual DB (DECISIONS.md) even though hand-maintained types say otherwise — migrations use `text` for `card_id` FKs, consistent.
