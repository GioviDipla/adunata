# Card Image Upscaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-only pipeline that queues, locally generates, validates, and stores HD upscaled PNG card images in Supabase Storage.

**Architecture:** The app owns the admin UI and queue metadata in Supabase. A local Node worker claims queued assets, calls a local Real-ESRGAN-compatible binary, uploads PNG output to a private Supabase Storage bucket, and updates asset metadata. Public image serving and proxy PDF consumption are intentionally deferred.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase Auth/Postgres/Storage, node:test for pure helper tests, Node ESM worker script, local `realesrgan-ncnn-vulkan`.

---

## Implementation Progress

- 2026-05-19: Added `card_image_batches`, `card_image_assets`, and private `card-images-hd` bucket migration. `supabase db push` is currently blocked by pre-existing remote migration history drift, so the SQL was applied to the linked database with `supabase db query --linked -f ...`.
- 2026-05-19: Added pure helper modules and tests for source URL resolution, Storage path generation, profile config, PNG dimensions, and checksums.
- 2026-05-19: Added `queue:card-images` for controlled sections and `upscale:card-images` for sequential resumable local processing.
- 2026-05-19: Queued and processed the Karn, Legacy Reforged MAT sample. Output `1490x2080`, stored at `scryfall/4/2/4219b5ea-a252-4d76-a60a-9674340e8ed3/front@2x.png`.
- 2026-05-19: Verified `npm run test:card-images`, `npm run test:proxy-pdf`, and `npm run build`.
- 2026-05-19: Adjusted Ultra generation to batch-preflight the whole proxy list. `POST /api/card-image/upscaled` now receives all selected card faces, generates any missing `hd-2x` assets, stores them in `card-images-hd`, and then PDF generation reads the cached images with `GET /api/card-image/upscaled`. The GET path is cache-only; if an asset is still missing, PDF generation falls back to the next image candidate.
- 2026-05-19: Investigated SOS failures. All failed assets were invalid derived back-face URLs for `layout=prepare` cards, where Scryfall stores one combined front image and `card_faces` have no `image_uris`. The source resolver and queue script now only derive fallback URLs for the front face; existing invalid back-face assets were marked `cancelled`.
- 2026-05-19: Switched Ultra missing-asset handling to queued async for production. `POST /api/card-image/upscaled` now reads ready assets and queues missing `hd-2x` rows instead of running Real-ESRGAN inside Vercel. Set `CARD_IMAGE_UPSCALE_QUEUE_ON_DEMAND=false` to disable automatic queueing. Run `npm run upscale:card-images:watch -- --limit=<n>` on a local worker machine to consume queued assets.
- 2026-05-19: Added a denormalized `cards.has_upscaled_2x` flag maintained from ready `card_image_assets`, plus tiny `2x` badges on card thumbnails in Cards, Deckbuilder, and Deckviewer. Cards search can now filter to only printings with a ready `hd-2x` asset.

Immediate sectioned commands:

```bash
npm run queue:card-images -- --q="Karn, Legacy Reforged" --limit=5 --dry-run
npm run queue:card-images -- --scryfall-id=4219b5ea-a252-4d76-a60a-9674340e8ed3 --limit=1
npm run upscale:card-images -- --limit=1 --keep-temp
```

For larger sections, increase `--limit` on `queue:card-images`, verify with `--dry-run`, then process with `upscale:card-images -- --limit=<n>`. Keep `concurrency=1` until runtime/thermal behavior is measured.

Available `queue:card-images` filters:

- `--set=<code>`
- `--collector-number=<number>`
- `--q=<name fragment>`
- `--scryfall-id=<uuid>`
- `--card-id=<uuid>`
- `--limit=<n>`
- `--offset=<n>`
- `--include-basic-lands`
- `--dry-run`

Available `upscale:card-images` filters/options:

- `--limit=<n>`
- `--asset-id=<uuid>`
- `--profile=hd-2x`
- `--dry-run`
- `--keep-temp`
- `--watch`
- `--poll-interval-sec=<seconds>`
- `--worker-id=<name>`
- `--stale-after-min=<minutes>`
- `--max-attempts=<n>`

---

## File Structure

Create:

- `supabase/migrations/<timestamp>_card_image_upscaling.sql` — tables, constraints, indexes, RLS policies, Storage bucket.
- `src/lib/admin/is-admin.ts` — server-side admin check helper.
- `src/lib/card-images/source-url.ts` — pure source URL resolver.
- `src/lib/card-images/storage-path.ts` — pure Storage object path builder.
- `src/lib/card-images/image-metadata.ts` — Node image metadata and checksum helpers.
- `src/lib/card-images/profiles.ts` — target profile config.
- `src/app/(app)/admin/proxy-images/page.tsx` — gated admin page.
- `src/components/admin/CardImageUpscaleAdmin.tsx` — client admin shell.
- `src/components/admin/CardImageBatchList.tsx` — recent batch list.
- `src/components/admin/CardImageAssetTable.tsx` — card/asset table.
- `src/app/api/admin/card-images/cards/route.ts` — admin card search.
- `src/app/api/admin/card-images/batches/route.ts` — create/list batches.
- `src/app/api/admin/card-images/batches/[id]/route.ts` — batch detail.
- `src/app/api/admin/card-images/assets/retry/route.ts` — retry assets.
- `src/app/api/admin/card-images/assets/cancel/route.ts` — cancel queued/failed assets.
- `src/app/api/admin/card-images/assets/[id]/signed-url/route.ts` — signed URL for ready asset.
- `scripts/upscale-card-images.mjs` — local worker.
- `tests/card-images/source-url.test.mjs` — pure source URL tests.
- `tests/card-images/storage-path.test.mjs` — storage path tests.
- `tests/card-images/image-metadata.test.mjs` — metadata/checksum tests.

Modify:

- `.env.local.example` — document `REALESRGAN_BIN`, `REALESRGAN_MODEL_PATH`, `REALESRGAN_MODEL`, `REALESRGAN_TILE_SIZE`.
- `package.json` — add focused test and worker scripts.
- `src/types/supabase.ts` — update hand-maintained types after migration.

Do not modify proxy PDF generation in this implementation.

---

### Task 1: Database Migration and Storage Bucket

**Files:**
- Create: `supabase/migrations/<timestamp>_card_image_upscaling.sql`
- Modify: `src/types/supabase.ts`

- [ ] **Step 1: Create migration with Supabase CLI**

Run:

```bash
supabase migration new card_image_upscaling
```

Expected: a new file under `supabase/migrations/` with a timestamped name.

- [ ] **Step 2: Add migration SQL**

Write this SQL into the new migration file:

```sql
-- Card image upscaling queue and asset cache.

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

create table public.card_image_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  label text,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
  target_profile text not null default 'hd-2x',
  total_jobs integer not null default 0 check (total_jobs >= 0),
  completed_jobs integer not null default 0 check (completed_jobs >= 0),
  failed_jobs integer not null default 0 check (failed_jobs >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_card_image_batches_updated_at
  before update on public.card_image_batches
  for each row execute function public.handle_updated_at();

create index idx_card_image_batches_created_at on public.card_image_batches (created_at desc);
create index idx_card_image_batches_status on public.card_image_batches (status);
create index idx_card_image_batches_created_by on public.card_image_batches (created_by);

create table public.card_image_assets (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.card_image_batches(id) on delete set null,
  card_id uuid not null references public.cards(id) on delete cascade,
  scryfall_id text not null,
  face_index integer not null default 0 check (face_index >= 0),
  source_url text not null,
  storage_path text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'ready', 'failed', 'cancelled')),
  target_profile text not null default 'hd-2x',
  model text not null default 'realesrgan-x4plus',
  scale integer not null default 2 check (scale > 0),
  target_dpi integer not null default 600 check (target_dpi > 0),
  width_px integer check (width_px is null or width_px > 0),
  height_px integer check (height_px is null or height_px > 0),
  bytes bigint check (bytes is null or bytes > 0),
  mime_type text,
  checksum text,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (card_id, face_index, target_profile),
  unique (storage_path)
);

create trigger trg_card_image_assets_updated_at
  before update on public.card_image_assets
  for each row execute function public.handle_updated_at();

create index idx_card_image_assets_status_locked on public.card_image_assets (status, locked_at);
create index idx_card_image_assets_batch_id on public.card_image_assets (batch_id);
create index idx_card_image_assets_card_id on public.card_image_assets (card_id);
create index idx_card_image_assets_scryfall_id on public.card_image_assets (scryfall_id);
create index idx_card_image_assets_ready_profile
  on public.card_image_assets (target_profile, status)
  where status = 'ready';

alter table public.card_image_batches enable row level security;
alter table public.card_image_assets enable row level security;

create policy card_image_batches_admin_all
  on public.card_image_batches
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy card_image_assets_admin_all
  on public.card_image_assets
  for all
  using (public.is_admin())
  with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-images-hd', 'card-images-hd', false, 26214400, array['image/png'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
```

- [ ] **Step 3: Apply migration**

Run the project’s normal Supabase migration workflow. If using the linked remote DB:

```bash
supabase db push
```

Expected: migration applies without SQL errors.

- [ ] **Step 4: Update `src/types/supabase.ts`**

Add `card_image_batches` and `card_image_assets` table definitions under `Database['public']['Tables']`. Include `Row`, `Insert`, and `Update` shapes matching the SQL above. Use `string` for UUID/timestamptz/text, `number` for integer/bigint, and nullable types for nullable columns.

Add this status union near the table entries if the file already uses local helpers, otherwise inline the literal union:

```ts
type CardImageBatchStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'cancelled'

type CardImageAssetStatus =
  | 'queued'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'cancelled'
```

- [ ] **Step 5: Build**

Run:

```bash
npm run build
```

Expected: PASS. The existing Next.js `middleware` deprecation warning is acceptable.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations src/types/supabase.ts
git commit -m "feat: add card image upscale schema"
```

---

### Task 2: Pure Card Image Helpers

**Files:**
- Create: `src/lib/card-images/source-url.ts`
- Create: `src/lib/card-images/storage-path.ts`
- Create: `src/lib/card-images/profiles.ts`
- Test: `tests/card-images/source-url.test.mjs`
- Test: `tests/card-images/storage-path.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add test script**

In `package.json`, add:

```json
"test:card-images": "node --test tests/card-images/*.test.mjs"
```

Expected placement: inside `"scripts"`, after existing test scripts.

- [ ] **Step 2: Write source URL tests**

Create `tests/card-images/source-url.test.mjs`:

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import ts from 'typescript'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function loadTsModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      strict: true,
    },
  }).outputText
  const compiledModule = { exports: {} }
  vm.runInNewContext(output, { exports: compiledModule.exports, module: compiledModule, require }, { filename: filePath })
  return compiledModule.exports
}

const { resolveCardImageSources } = loadTsModule(path.resolve('src/lib/card-images/source-url.ts'))

const scryfallId = 'abcdef12-3456-7890-abcd-ef1234567890'

test('prefers explicit face PNG', () => {
  const sources = resolveCardImageSources({
    id: 'card-1',
    scryfall_id: scryfallId,
    image_normal: 'https://cards.scryfall.io/normal/front/a/b/fallback.jpg',
    card_faces: [
      { image_uris: { png: 'https://cards.scryfall.io/png/front/a/b/face.png' } },
    ],
  })
  assert.equal(sources[0].sourceUrl, 'https://cards.scryfall.io/png/front/a/b/face.png')
  assert.equal(sources[0].faceIndex, 0)
  assert.equal(sources[0].faceName, 'front')
})

test('derives front PNG for single-faced card', () => {
  const sources = resolveCardImageSources({
    id: 'card-1',
    scryfall_id: scryfallId,
    image_normal: 'https://cards.scryfall.io/normal/front/a/b/fallback.jpg',
    card_faces: null,
  })
  assert.equal(sources[0].sourceUrl, `https://cards.scryfall.io/png/front/a/b/${scryfallId}.png`)
})

test('resolves explicit double-faced front and back URLs', () => {
  const sources = resolveCardImageSources({
    id: 'card-1',
    scryfall_id: scryfallId,
    image_normal: null,
    card_faces: [
      { image_uris: { png: 'https://cards.scryfall.io/png/front/a/b/front.png' } },
      { image_uris: { png: 'https://cards.scryfall.io/png/back/a/b/back.png' } },
    ],
  })
  assert.deepEqual(sources.map((s) => [s.faceIndex, s.faceName, s.sourceUrl]), [
    [0, 'front', 'https://cards.scryfall.io/png/front/a/b/front.png'],
    [1, 'back', 'https://cards.scryfall.io/png/back/a/b/back.png'],
  ])
})

test('falls back to image_normal when no better source exists', () => {
  const sources = resolveCardImageSources({
    id: 'card-1',
    scryfall_id: '',
    image_normal: 'https://cards.scryfall.io/normal/front/a/b/fallback.jpg',
    card_faces: null,
  })
  assert.equal(sources[0].sourceUrl, 'https://cards.scryfall.io/normal/front/a/b/fallback.jpg')
})

test('returns no source when no usable image exists', () => {
  const sources = resolveCardImageSources({
    id: 'card-1',
    scryfall_id: '',
    image_normal: null,
    card_faces: null,
  })
  assert.deepEqual(sources, [])
})
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
npm run test:card-images
```

Expected: FAIL because `src/lib/card-images/source-url.ts` does not exist yet.

- [ ] **Step 4: Implement `source-url.ts`**

Create `src/lib/card-images/source-url.ts`:

```ts
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export interface CardImageSourceCard {
  id: string
  scryfall_id: string | null
  image_normal: string | null
  card_faces: JsonValue
}

export interface ResolvedCardImageSource {
  cardId: string
  scryfallId: string
  faceIndex: number
  faceName: 'front' | 'back'
  sourceUrl: string
}

function getFaceImageUri(face: unknown, key: 'png' | 'large' | 'normal'): string | null {
  if (!face || typeof face !== 'object' || Array.isArray(face)) return null
  const imageUris = (face as { image_uris?: unknown }).image_uris
  if (!imageUris || typeof imageUris !== 'object' || Array.isArray(imageUris)) return null
  const value = (imageUris as Record<string, unknown>)[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function derivedScryfallUrl(scryfallId: string, size: 'png' | 'large'): string | null {
  if (scryfallId.length < 2) return null
  const ext = size === 'png' ? 'png' : 'jpg'
  return `https://cards.scryfall.io/${size}/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.${ext}`
}

function firstString(values: Array<string | null | undefined>): string | null {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0) ?? null
}

export function resolveCardImageSources(card: CardImageSourceCard): ResolvedCardImageSource[] {
  const scryfallId = card.scryfall_id ?? ''
  const faces = Array.isArray(card.card_faces) ? card.card_faces : []

  if (faces.length > 0) {
    return faces
      .map((face, index) => {
        const sourceUrl = firstString([
          getFaceImageUri(face, 'png'),
          getFaceImageUri(face, 'large'),
          getFaceImageUri(face, 'normal'),
          index === 0 ? card.image_normal : null,
        ])
        if (!sourceUrl) return null
        return {
          cardId: card.id,
          scryfallId,
          faceIndex: index,
          faceName: index === 0 ? 'front' as const : 'back' as const,
          sourceUrl,
        }
      })
      .filter((source): source is ResolvedCardImageSource => source != null)
  }

  const sourceUrl = firstString([
    derivedScryfallUrl(scryfallId, 'png'),
    derivedScryfallUrl(scryfallId, 'large'),
    card.image_normal,
  ])
  if (!sourceUrl) return []

  return [{
    cardId: card.id,
    scryfallId,
    faceIndex: 0,
    faceName: 'front',
    sourceUrl,
  }]
}
```

- [ ] **Step 5: Write storage path tests**

Create `tests/card-images/storage-path.test.mjs`:

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import ts from 'typescript'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function loadTsModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, strict: true },
  }).outputText
  const compiledModule = { exports: {} }
  vm.runInNewContext(output, { exports: compiledModule.exports, module: compiledModule, require }, { filename: filePath })
  return compiledModule.exports
}

const { buildCardImageStoragePath } = loadTsModule(path.resolve('src/lib/card-images/storage-path.ts'))

test('builds stable front path', () => {
  assert.equal(
    buildCardImageStoragePath({ scryfallId: 'abcdef', faceName: 'front', profile: 'hd-2x' }),
    'scryfall/a/b/abcdef/front@2x.png',
  )
})

test('builds stable back path', () => {
  assert.equal(
    buildCardImageStoragePath({ scryfallId: 'abcdef', faceName: 'back', profile: 'hd-2x' }),
    'scryfall/a/b/abcdef/back@2x.png',
  )
})

test('rejects missing scryfall id', () => {
  assert.throws(
    () => buildCardImageStoragePath({ scryfallId: '', faceName: 'front', profile: 'hd-2x' }),
    /scryfall_id/,
  )
})
```

- [ ] **Step 6: Implement `storage-path.ts` and `profiles.ts`**

Create `src/lib/card-images/profiles.ts`:

```ts
export interface CardImageProfile {
  name: 'hd-2x'
  model: string
  scale: number
  targetDpi: number
  outputMimeType: 'image/png'
}

export const CARD_IMAGE_PROFILES: Record<CardImageProfile['name'], CardImageProfile> = {
  'hd-2x': {
    name: 'hd-2x',
    model: 'realesrgan-x4plus',
    scale: 2,
    targetDpi: 600,
    outputMimeType: 'image/png',
  },
}

export function getCardImageProfile(name = 'hd-2x'): CardImageProfile {
  const profile = CARD_IMAGE_PROFILES[name as CardImageProfile['name']]
  if (!profile) throw new Error(`Unsupported card image profile: ${name}`)
  return profile
}
```

Create `src/lib/card-images/storage-path.ts`:

```ts
export interface CardImageStoragePathOptions {
  scryfallId: string
  faceName: 'front' | 'back'
  profile: 'hd-2x'
}

export function buildCardImageStoragePath(options: CardImageStoragePathOptions): string {
  const id = options.scryfallId
  if (!id || id.length < 2) throw new Error('scryfall_id is required to build card image storage path')

  const scaleSuffix = options.profile === 'hd-2x' ? '2x' : options.profile
  return `scryfall/${id[0]}/${id[1]}/${id}/${options.faceName}@${scaleSuffix}.png`
}
```

- [ ] **Step 7: Run tests**

Run:

```bash
npm run test:card-images
```

Expected: PASS for source URL and storage path tests.

- [ ] **Step 8: Build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add package.json tests/card-images src/lib/card-images
git commit -m "feat: add card image helper utilities"
```

---

### Task 3: Admin Auth Helper

**Files:**
- Create: `src/lib/admin/is-admin.ts`

- [ ] **Step 1: Implement admin helper**

Create `src/lib/admin/is-admin.ts`:

```ts
import { createClient } from '@/lib/supabase/server'

export interface AdminCheckResult {
  isAdmin: boolean
  userId: string | null
}

export async function checkCurrentUserIsAdmin(): Promise<AdminCheckResult> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) return { isAdmin: false, userId: null }
  const role = (user.app_metadata as { role?: unknown } | null)?.role
  return { isAdmin: role === 'admin', userId: user.id }
}
```

- [ ] **Step 2: Build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/admin/is-admin.ts
git commit -m "feat: add admin role helper"
```

---

### Task 4: Admin Card Image API Routes

**Files:**
- Create: `src/app/api/admin/card-images/cards/route.ts`
- Create: `src/app/api/admin/card-images/batches/route.ts`
- Create: `src/app/api/admin/card-images/batches/[id]/route.ts`
- Create: `src/app/api/admin/card-images/assets/retry/route.ts`
- Create: `src/app/api/admin/card-images/assets/cancel/route.ts`
- Create: `src/app/api/admin/card-images/assets/[id]/signed-url/route.ts`
- Modify: `src/types/supabase.ts` only if route typing exposes gaps from Task 1.

- [ ] **Step 1: Create shared route guard pattern**

Each route should start with this pattern:

```ts
import { NextResponse } from 'next/server'
import { checkCurrentUserIsAdmin } from '@/lib/admin/is-admin'

async function requireAdmin() {
  const admin = await checkCurrentUserIsAdmin()
  if (!admin.isAdmin || !admin.userId) {
    return { admin, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { admin, response: null }
}
```

Use the helper inside every handler:

```ts
const { admin, response } = await requireAdmin()
if (response) return response
```

- [ ] **Step 2: Implement `GET /cards`**

Create `src/app/api/admin/card-images/cards/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { checkCurrentUserIsAdmin } from '@/lib/admin/is-admin'
import { createAdminClient } from '@/lib/supabase/admin'

const CARD_SELECT = `
  id, scryfall_id, name, set_code, collector_number, image_small, image_normal, card_faces,
  card_image_assets(id, face_index, status, target_profile, width_px, height_px, bytes, last_error, storage_path)
`

export async function GET(req: Request) {
  const admin = await checkCurrentUserIsAdmin()
  if (!admin.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim() ?? ''
  const setCode = url.searchParams.get('set')?.trim().toLowerCase() ?? ''
  const status = url.searchParams.get('status')?.trim() ?? ''
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50), 1), 200)
  const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0)

  const supabase = createAdminClient()
  let query = supabase
    .from('cards')
    .select(CARD_SELECT, { count: 'exact' })
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1)

  if (q) {
    query = query.or(`name.ilike.%${q.replaceAll(',', ' ')}%,scryfall_id.eq.${q},collector_number.eq.${q}`)
  }
  if (setCode) query = query.eq('set_code', setCode)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const cards = (data ?? []).map((card) => {
    const assets = ((card as { card_image_assets?: unknown }).card_image_assets as Array<{ status?: string }> | null) ?? []
    return {
      ...card,
      card_image_assets: status ? assets.filter((asset) => asset.status === status) : assets,
    }
  })

  return NextResponse.json({ cards, total: count ?? 0 })
}
```

- [ ] **Step 3: Implement batch creation/list**

Create `src/app/api/admin/card-images/batches/route.ts`. Use the helper utilities from Task 2. Keep this route conservative and explicit:

```ts
import { NextResponse } from 'next/server'
import { checkCurrentUserIsAdmin } from '@/lib/admin/is-admin'
import { resolveCardImageSources } from '@/lib/card-images/source-url'
import { buildCardImageStoragePath } from '@/lib/card-images/storage-path'
import { getCardImageProfile } from '@/lib/card-images/profiles'
import { createAdminClient } from '@/lib/supabase/admin'

const CARD_SELECT = 'id, scryfall_id, image_normal, card_faces'

export async function GET() {
  const admin = await checkCurrentUserIsAdmin()
  if (!admin.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('card_image_batches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ batches: data ?? [] })
}

export async function POST(req: Request) {
  const admin = await checkCurrentUserIsAdmin()
  if (!admin.isAdmin || !admin.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const cardIds = Array.isArray(body.cardIds) ? body.cardIds.filter((id): id is string => typeof id === 'string') : []
  const label = typeof body.label === 'string' ? body.label : null
  const profile = getCardImageProfile(typeof body.targetProfile === 'string' ? body.targetProfile : 'hd-2x')

  if (cardIds.length === 0) {
    return NextResponse.json({ error: 'cardIds required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: cards, error: cardsError } = await supabase
    .from('cards')
    .select(CARD_SELECT)
    .in('id', cardIds)

  if (cardsError) return NextResponse.json({ error: cardsError.message }, { status: 500 })

  const { data: batch, error: batchError } = await supabase
    .from('card_image_batches')
    .insert({
      created_by: admin.userId,
      label,
      status: 'queued',
      target_profile: profile.name,
    })
    .select('*')
    .single()

  if (batchError) return NextResponse.json({ error: batchError.message }, { status: 500 })

  const skipped: Array<{ card_id: string; reason: string }> = []
  const rows = []

  for (const card of cards ?? []) {
    const sources = resolveCardImageSources({
      id: card.id,
      scryfall_id: card.scryfall_id,
      image_normal: card.image_normal,
      card_faces: card.card_faces,
    })
    if (sources.length === 0) skipped.push({ card_id: card.id, reason: 'missing_source_url' })
    for (const source of sources) {
      rows.push({
        batch_id: batch.id,
        card_id: source.cardId,
        scryfall_id: source.scryfallId,
        face_index: source.faceIndex,
        source_url: source.sourceUrl,
        storage_path: buildCardImageStoragePath({
          scryfallId: source.scryfallId,
          faceName: source.faceName,
          profile: profile.name,
        }),
        status: 'queued',
        target_profile: profile.name,
        model: profile.model,
        scale: profile.scale,
        target_dpi: profile.targetDpi,
        last_error: null,
      })
    }
  }

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from('card_image_assets')
      .upsert(rows, { onConflict: 'card_id,face_index,target_profile' })

    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  await supabase
    .from('card_image_batches')
    .update({ total_jobs: rows.length })
    .eq('id', batch.id)

  return NextResponse.json({ batch: { ...batch, total_jobs: rows.length }, queued: rows.length, skipped })
}
```

- [ ] **Step 4: Implement detail/retry/cancel/signed-url routes**

Use direct Supabase calls:

```ts
// GET /api/admin/card-images/batches/[id]
supabase.from('card_image_batches').select('*').eq('id', id).single()
supabase.from('card_image_assets').select('*, card:cards(id, name, image_small, set_code, collector_number)').eq('batch_id', id).order('created_at')

// POST /assets/retry
supabase.from('card_image_assets').update({ status: 'queued', last_error: null, locked_at: null, locked_by: null }).in('id', assetIds).in('status', ['failed', 'cancelled'])

// POST /assets/cancel
supabase.from('card_image_assets').update({ status: 'cancelled', locked_at: null, locked_by: null }).in('id', assetIds).in('status', ['queued', 'failed'])

// GET /assets/[id]/signed-url
const { data: asset } = await supabase.from('card_image_assets').select('storage_path,status').eq('id', id).single()
if (asset.status !== 'ready') return NextResponse.json({ error: 'asset not ready' }, { status: 409 })
const { data, error } = await supabase.storage.from('card-images-hd').createSignedUrl(asset.storage_path, 60 * 5)
```

Return JSON errors with `400`, `401`, `404`, `409`, or `500` as appropriate. Keep response bodies small and consistent: `{ error: string }` on failure.

- [ ] **Step 5: Build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin src/types/supabase.ts
git commit -m "feat: add card image admin APIs"
```

---

### Task 5: Admin Page and UI

**Files:**
- Create: `src/app/(app)/admin/proxy-images/page.tsx`
- Create: `src/components/admin/CardImageUpscaleAdmin.tsx`
- Create: `src/components/admin/CardImageBatchList.tsx`
- Create: `src/components/admin/CardImageAssetTable.tsx`

- [ ] **Step 1: Create gated page**

Create `src/app/(app)/admin/proxy-images/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { checkCurrentUserIsAdmin } from '@/lib/admin/is-admin'
import CardImageUpscaleAdmin from '@/components/admin/CardImageUpscaleAdmin'

export default async function AdminProxyImagesPage() {
  const admin = await checkCurrentUserIsAdmin()
  if (!admin.isAdmin) notFound()

  return <CardImageUpscaleAdmin />
}
```

- [ ] **Step 2: Create admin shell**

Create `src/components/admin/CardImageUpscaleAdmin.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Search, WandSparkles } from 'lucide-react'
import CardImageBatchList from './CardImageBatchList'
import CardImageAssetTable from './CardImageAssetTable'

export interface AdminCardImageAsset {
  id: string
  face_index: number
  status: string
  width_px: number | null
  height_px: number | null
  bytes: number | null
  last_error: string | null
}

export interface AdminCardImageCard {
  id: string
  scryfall_id: string
  name: string
  set_code: string | null
  collector_number: string | null
  image_small: string | null
  card_image_assets?: AdminCardImageAsset[]
}

export default function CardImageUpscaleAdmin() {
  const [query, setQuery] = useState('')
  const [cards, setCards] = useState<AdminCardImageCard[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  async function loadCards(nextQuery = query) {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/card-images/cards?q=${encodeURIComponent(nextQuery)}&limit=50`)
      const data = await res.json()
      setCards(data.cards ?? [])
    } finally {
      setLoading(false)
    }
  }

  async function createBatch() {
    const cardIds = [...selected]
    if (cardIds.length === 0) return
    const res = await fetch('/api/admin/card-images/batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardIds, targetProfile: 'hd-2x', label: `Manual batch ${new Date().toISOString()}` }),
    })
    if (res.ok) {
      setSelected(new Set())
      await loadCards()
    }
  }

  useEffect(() => {
    void loadCards('')
  }, [])

  return (
    <main className="min-h-screen bg-bg-dark px-4 py-6 text-font-primary">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold">Proxy Image Upscaling</h1>
            <p className="text-sm text-font-muted">Queue local HD PNG generation for existing card printings.</p>
          </div>
          <button
            onClick={createBatch}
            disabled={selected.size === 0}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-bg-accent px-4 py-2 text-sm font-bold text-font-white disabled:opacity-40"
          >
            <WandSparkles size={16} />
            Create upscale batch ({selected.size})
          </button>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-font-muted" size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void loadCards()
              }}
              placeholder="Search by name, collector number, or Scryfall ID"
              className="w-full rounded-lg border border-border bg-bg-card py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <button onClick={() => loadCards()} className="rounded-lg border border-border px-4 py-2 text-sm">
            Search
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <CardImageAssetTable cards={cards} selected={selected} onSelectedChange={setSelected} loading={loading} />
          <CardImageBatchList />
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Create table and batch components**

Create `CardImageAssetTable.tsx` with rows for thumbnail, name, set/collector, status, dimensions, error. Create `CardImageBatchList.tsx` that fetches `/api/admin/card-images/batches` on mount and renders recent batch counters.

Use compact classes matching existing app colors: `bg-bg-card`, `border-border`, `text-font-muted`, `text-font-primary`.

- [ ] **Step 4: Build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Manual access check**

Run dev server:

```bash
npm run dev
```

Visit `/admin/proxy-images`:

- non-admin user: 404;
- admin user with `app_metadata.role = "admin"`: page renders.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/admin" src/components/admin
git commit -m "feat: add card image admin page"
```

---

### Task 6: Image Metadata Helpers

**Files:**
- Create: `src/lib/card-images/image-metadata.ts`
- Test: `tests/card-images/image-metadata.test.mjs`

- [ ] **Step 1: Write metadata test**

Create `tests/card-images/image-metadata.test.mjs` with an embedded 1x1 PNG buffer:

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import ts from 'typescript'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function loadTsModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, strict: true },
  }).outputText
  const compiledModule = { exports: {} }
  vm.runInNewContext(output, { exports: compiledModule.exports, module: compiledModule, require, Buffer }, { filename: filePath })
  return compiledModule.exports
}

const { readPngDimensions, sha256Hex } = loadTsModule(path.resolve('src/lib/card-images/image-metadata.ts'))

const oneByOnePng = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfab0000000049454e44ae426082',
  'hex',
)

test('reads PNG dimensions', () => {
  assert.deepEqual(readPngDimensions(oneByOnePng), { width: 1, height: 1 })
})

test('computes sha256 hex', () => {
  assert.equal(sha256Hex(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})
```

- [ ] **Step 2: Implement metadata helper**

Create `src/lib/card-images/image-metadata.ts`:

```ts
import { createHash } from 'node:crypto'

export interface ImageDimensions {
  width: number
  height: number
}

export function readPngDimensions(bytes: Uint8Array | Buffer): ImageDimensions {
  const buffer = Buffer.from(bytes)
  const signature = buffer.subarray(0, 8).toString('hex')
  if (signature !== '89504e470d0a1a0a') throw new Error('Invalid PNG signature')
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

export function sha256Hex(bytes: Uint8Array | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}
```

- [ ] **Step 3: Run tests**

Run:

```bash
npm run test:card-images
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/card-images/image-metadata.ts tests/card-images/image-metadata.test.mjs
git commit -m "feat: add card image metadata helpers"
```

---

### Task 7: Local Upscale Worker

**Files:**
- Create: `scripts/upscale-card-images.mjs`
- Modify: `.env.local.example`
- Modify: `package.json`

- [ ] **Step 1: Update env example and scripts**

Add to `.env.local.example`:

```env
REALESRGAN_BIN=/absolute/path/to/realesrgan-ncnn-vulkan
REALESRGAN_MODEL_PATH=/absolute/path/to/realesrgan-ncnn-vulkan/models
REALESRGAN_MODEL=realesrgan-x4plus
REALESRGAN_TILE_SIZE=1024
```

Before locking the worker defaults, validate direct 2x quality. The `realesrgan-x4plus` model is natively 4x; `-s 2` did not match the successful 4x visual result in the Karn test. Test `realesr-animevideov3 -s 2` as the native direct-2x candidate, without downsampling from a generated 4x image.

Proxy PDF raster integration:

- Add an `Ultra` image candidate endpoint that reads the ready `hd-2x` asset from `card_image_assets` + `card-images-hd` when available.
- Add an `Epic` image candidate endpoint that runs `realesrgan-x4plus -s 4` on demand and returns the PNG without writing any `hd-4x` row or Storage object.
- Build proxy image candidate lists in this order: Epic on-demand 4x, stored Ultra 2x, Scryfall fallback.
- Show a warning when Epic is selected: the process can take a long time and Ultra is the recommended fallback.

Add to `package.json` scripts:

```json
"upscale:card-images": "node scripts/upscale-card-images.mjs"
```

- [ ] **Step 2: Implement worker**

Create `scripts/upscale-card-images.mjs`. Keep it ESM, use `dotenv/config`, `@supabase/supabase-js`, `node:child_process`, `node:fs/promises`, `node:os`, `node:path`.

Core structure:

```js
import 'dotenv/config'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const REALESRGAN_BIN = process.env.REALESRGAN_BIN
const REALESRGAN_MODEL_PATH = process.env.REALESRGAN_MODEL_PATH
const REALESRGAN_MODEL = process.env.REALESRGAN_MODEL ?? 'realesrgan-x4plus'
const REALESRGAN_TILE_SIZE = process.env.REALESRGAN_TILE_SIZE ?? '1024'

if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing Supabase env')
if (!REALESRGAN_BIN) throw new Error('Missing REALESRGAN_BIN')
if (!REALESRGAN_MODEL_PATH) throw new Error('Missing REALESRGAN_MODEL_PATH')

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function readPngDimensions(bytes) {
  const buffer = Buffer.from(bytes)
  const signature = buffer.subarray(0, 8).toString('hex')
  if (signature !== '89504e470d0a1a0a') throw new Error('Invalid PNG signature')
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function parseArgs(argv) {
  const args = new Map()
  for (const arg of argv) {
    if (arg.startsWith('--') && arg.includes('=')) {
      const [key, value] = arg.slice(2).split(/=(.*)/s)
      args.set(key, value)
    } else if (arg.startsWith('--')) {
      args.set(arg.slice(2), true)
    }
  }
  return {
    limit: Number(args.get('limit') ?? 25),
    concurrency: Number(args.get('concurrency') ?? 1),
    profile: String(args.get('profile') ?? 'hd-2x'),
    assetId: args.get('asset-id') ? String(args.get('asset-id')) : null,
    dryRun: args.get('dry-run') === true,
    keepTemp: args.get('keep-temp') === true,
    workerId: String(args.get('worker-id') ?? `${os.hostname()}-${process.pid}`),
    staleAfterMin: Number(args.get('stale-after-min') ?? 30),
    maxAttempts: Number(args.get('max-attempts') ?? 3),
  }
}
```

Implement functions:

```js
async function selectAssets(options) {
  const staleCutoff = new Date(Date.now() - options.staleAfterMin * 60_000).toISOString()
  let query = supabase
    .from('card_image_assets')
    .select('*')
    .eq('target_profile', options.profile)
    .lt('attempts', options.maxAttempts)
    .order('created_at', { ascending: true })
    .limit(options.limit)

  if (options.assetId) query = query.eq('id', options.assetId)
  else query = query.or(`status.eq.queued,and(status.eq.processing,locked_at.lt.${staleCutoff})`)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

async function markProcessing(asset, options) {
  const { data, error } = await supabase
    .from('card_image_assets')
    .update({
      status: 'processing',
      locked_at: new Date().toISOString(),
      locked_by: options.workerId,
      attempts: asset.attempts + 1,
      last_error: null,
    })
    .eq('id', asset.id)
    .in('status', ['queued', 'processing'])
    .select('*')
    .single()
  if (error) throw error
  return data
}

async function downloadSource(asset, filePath) {
  const res = await fetch(asset.source_url)
  if (!res.ok) throw new Error(`source download failed: HTTP ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  await writeFile(filePath, bytes)
}

function runUpscale(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(REALESRGAN_BIN, [
      '-i', inputPath,
      '-o', outputPath,
      '-m', REALESRGAN_MODEL_PATH,
      '-n', REALESRGAN_MODEL,
      '-s', '2',
      '-t', REALESRGAN_TILE_SIZE,
      '-j', '1:1:1',
      '-f', 'png',
    ])
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`realesrgan exited ${code}: ${stderr.slice(0, 500)}`))
    })
  })
}
```

Finalize each asset:

```js
async function processAsset(asset, options) {
  const workDir = path.resolve('.tmp/upscale-card-images', asset.id)
  const inputPath = path.join(workDir, 'source')
  const outputPath = path.join(workDir, 'output.png')
  await mkdir(workDir, { recursive: true })

  try {
    const current = await markProcessing(asset, options)
    await downloadSource(current, inputPath)
    await runUpscale(inputPath, outputPath)
    const outputBytes = await readFile(outputPath)
    const dimensions = readPngDimensions(outputBytes)
    const checksum = sha256Hex(outputBytes)

    const upload = await supabase.storage
      .from('card-images-hd')
      .upload(current.storage_path, outputBytes, {
        contentType: 'image/png',
        upsert: true,
      })
    if (upload.error) throw upload.error

    const { error: updateError } = await supabase
      .from('card_image_assets')
      .update({
        status: 'ready',
        width_px: dimensions.width,
        height_px: dimensions.height,
        bytes: outputBytes.byteLength,
        mime_type: 'image/png',
        checksum,
        completed_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
      })
      .eq('id', current.id)

    if (updateError) throw updateError
    console.log(`ready ${current.id} ${dimensions.width}x${dimensions.height}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await supabase
      .from('card_image_assets')
      .update({ status: 'failed', last_error: message.slice(0, 1000), locked_at: null, locked_by: null })
      .eq('id', asset.id)
    console.error(`failed ${asset.id}: ${message}`)
  } finally {
    if (!options.keepTemp) await rm(workDir, { recursive: true, force: true })
  }
}
```

Main:

```js
const options = parseArgs(process.argv.slice(2))
const assets = await selectAssets(options)
if (options.dryRun) {
  for (const asset of assets) console.log(JSON.stringify({ id: asset.id, source_url: asset.source_url, storage_path: asset.storage_path }))
  process.exit(0)
}

for (const asset of assets) {
  await processAsset(asset, options)
}
```

Keep `concurrency` parsed but process sequentially in the first implementation. Add real parallelism only after the single-worker path is proven.

- [ ] **Step 3: Dry-run**

Run:

```bash
npm run upscale:card-images -- --limit=5 --dry-run
```

Expected: prints zero or more selected asset JSON rows; does not mutate DB.

- [ ] **Step 4: Build and tests**

Run:

```bash
npm run test:card-images
npm run build
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/upscale-card-images.mjs .env.local.example package.json
git commit -m "feat: add local card image upscale worker"
```

---

### Task 8: End-to-End Sample Run

**Files:**
- Modify only if bugs are found in prior task files.

- [ ] **Step 1: Assign admin role**

In Supabase Dashboard, set the current user Auth `app_metadata`:

```json
{
  "role": "admin"
}
```

Sign out/in if the admin page does not reflect the new role.

- [ ] **Step 2: Start dev server**

Run:

```bash
npm run dev
```

Expected: app serves locally.

- [ ] **Step 3: Create a small batch**

Visit:

```text
/admin/proxy-images
```

Search for and select 5 representative cards:

- one normal single-faced card;
- one double-faced card;
- one token;
- one showcase/borderless card;
- one text-heavy card.

Click `Create upscale batch`.

Expected: batch appears with queued assets.

- [ ] **Step 4: Process one asset with temp output kept**

Run:

```bash
npm run upscale:card-images -- --limit=1 --keep-temp
```

Expected:

- worker logs `ready <asset-id> <width>x<height>`;
- `.tmp/upscale-card-images/<asset-id>/output.png` exists;
- admin page shows one ready asset.

- [ ] **Step 5: Process the rest of the sample**

Run:

```bash
npm run upscale:card-images -- --limit=20
```

Expected: sample assets become `ready` or visible `failed` with actionable errors.

- [ ] **Step 6: Verify Storage and metadata**

For a ready asset:

- click signed URL/open action in admin UI;
- confirm PNG opens;
- confirm DB dimensions match the PNG dimensions;
- confirm Storage path follows `scryfall/{a}/{b}/{id}/front@2x.png` or `back@2x.png`.

- [ ] **Step 7: Commit fixes if needed**

If sample run required code changes:

```bash
git add <changed-files>
git commit -m "fix: stabilize card image upscale sample run"
```

---

### Task 9: Final Verification

**Files:**
- No planned file changes.

- [ ] **Step 1: Run focused tests**

```bash
npm run test:card-images
```

Expected: PASS.

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: PASS with only known Next.js middleware deprecation warning.

- [ ] **Step 3: Review git diff**

```bash
git status --short
git log --oneline -5
```

Expected:

- no uncommitted implementation changes except intentional local config;
- recent commits correspond to this plan’s tasks.

- [ ] **Step 4: Document local Real-ESRGAN path**

Do not commit `.env.local`. Confirm local config contains:

```env
REALESRGAN_BIN=/absolute/path/to/realesrgan-ncnn-vulkan
REALESRGAN_MODEL_PATH=/absolute/path/to/realesrgan-ncnn-vulkan/models
REALESRGAN_MODEL=realesrgan-x4plus
REALESRGAN_TILE_SIZE=1024
```

- [ ] **Step 5: Stop dev server**

Stop any `npm run dev` session started for manual testing.

---

## Self-Review

Spec coverage:

- Admin-only role via Supabase `app_metadata`: Task 1 RLS, Task 3 helper, Task 5 page gate.
- Queue tables and private Storage bucket: Task 1.
- Source URL resolver without Scryfall API calls: Task 2.
- Admin search/batch/retry/signed-url routes: Task 4.
- Admin dashboard: Task 5.
- Local Real-ESRGAN worker: Task 7.
- PNG-only canonical asset and metadata validation: Tasks 6 and 7.
- Sample QA workflow: Task 8.
- Public API and PDF integration deferred: explicitly excluded from file structure and tasks.

No placeholders remain. Type names and route paths are consistent across tasks.
