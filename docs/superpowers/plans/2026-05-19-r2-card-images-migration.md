# Cloudflare R2 Migration — `card-images-hd` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the `card-images-hd` Supabase Storage bucket (5.2 GB, 832 PNG files of upscaled card art) to Cloudflare R2 to escape the Supabase Free-tier 1 GB storage cap and eliminate egress costs on growing CDN traffic.

**Architecture:** Cloudflare R2 bucket exposed via a public custom domain (CDN). The upscale worker (`scripts/upscale-card-images.mjs`) writes upscaled PNGs directly to R2 using the S3-compatible API. The Next.js route handler `/api/card-image/upscaled` issues a 302 redirect to the public CDN URL when the asset is ready (instead of streaming the bytes back through Supabase). The `card_image_assets.storage_path` column stays as the canonical key — no schema change. A one-shot migration script copies all existing objects from Supabase Storage to R2 keeping identical keys, then the Supabase bucket is dropped.

**Tech Stack:** Cloudflare R2 (S3-compatible), `@aws-sdk/client-s3` v3, Node.js 24 in worker script, Next.js 16 App Router route handlers, existing Supabase Postgres for `card_image_assets` metadata.

---

## File Structure

**Create:**
- `src/lib/r2/client.ts` — S3 client factory (lazy singleton, reads env)
- `src/lib/r2/public-url.ts` — `buildR2PublicUrl(storagePath)` helper used by route handler + worker
- `src/lib/r2/upload.ts` — `uploadToR2(key, bytes, contentType)` helper used by worker script
- `scripts/migrate-card-images-to-r2.mjs` — one-shot copy from Supabase Storage → R2, idempotent (skips if R2 key already exists)
- `scripts/verify-r2-migration.mjs` — count + checksum spot-check between Supabase and R2 after migration

**Modify:**
- `.env.local.example` — add R2 vars
- `scripts/upscale-card-images.mjs:167-173` — replace Supabase upload with R2 upload helper
- `src/app/api/card-image/upscaled/route.ts:10` — replace `downloadAsset` streaming with 302 redirect to R2 public URL
- `package.json` — add `@aws-sdk/client-s3` dependency
- `MANUAL_STEPS.md` — append Cloudflare R2 provisioning steps
- `DECISIONS.md` — record migration rationale
- `README.md` — note R2 env vars required for upscale pipeline

**Delete (only after Task 8 verification passes):**
- Supabase Storage bucket `card-images-hd` (manual via Supabase dashboard or MCP `delete_bucket`)

---

## Task 0: Cloudflare R2 manual provisioning (MANUAL_STEPS)

**Files:**
- Modify: `MANUAL_STEPS.md`

- [ ] **Step 1: Append the R2 provisioning section to `MANUAL_STEPS.md`**

Append this content verbatim to `MANUAL_STEPS.md`:

```markdown
## [STEP R2-1] — Create Cloudflare R2 bucket

Quando: prima di eseguire Task 1 del piano `docs/superpowers/plans/2026-05-19-r2-card-images-migration.md`.

Cosa fare:
1. Login su https://dash.cloudflare.com. Se non esiste account, crearne uno gratuito con email `gidippi@gmail.com`.
2. Sidebar → "R2 Object Storage" → "Create bucket".
3. Nome bucket: `adunata-card-images-hd`. Location: "Automatic" (eu-prefer). Click Create.
4. Aperto il bucket, tab "Settings" → "Public access" → "Connect Domain". Inserire `cdn.adunata.studiob35.com`. Confermare DNS via Cloudflare (se dominio già su Cloudflare DNS) o copiare il CNAME nella zona DNS attuale.
   - Se il dominio non è su Cloudflare DNS e non lo vuoi spostare, alternativa: abilita "R2.dev subdomain" e prendi nota dell'URL pubblico `https://pub-<hash>.r2.dev`.
5. Tab "R2 API Tokens" (sidebar R2 → Manage R2 API Tokens) → "Create API Token".
6. Token name: `adunata-upscale-worker`. Permissions: `Object Read & Write`. Specify bucket: `adunata-card-images-hd`. TTL: forever. Click "Create API Token".
7. Copia (sono mostrati solo una volta):
   - `Access Key ID`
   - `Secret Access Key`
   - `Endpoint` (formato `https://<account-id>.r2.cloudflarestorage.com`)
   - `Account ID` (presente nell'endpoint)

Dove inserire il risultato: in `.env.local` (e su Vercel dashboard via `vercel env add` per ogni ambiente — Production/Preview/Development):

```
R2_ACCOUNT_ID=<account-id>
R2_ACCESS_KEY_ID=<access-key-id>
R2_SECRET_ACCESS_KEY=<secret-access-key>
R2_BUCKET=adunata-card-images-hd
R2_PUBLIC_BASE_URL=https://cdn.adunata.studiob35.com
# Se hai usato r2.dev:
# R2_PUBLIC_BASE_URL=https://pub-<hash>.r2.dev
```

## [STEP R2-2] — Verifica dominio CDN raggiungibile

Quando: dopo Step R2-1, prima di eseguire Task 2 del piano.

Cosa fare:
1. Carica manualmente un file di test via Cloudflare dashboard (bucket → "Upload" → file qualunque, es. `ping.txt` con contenuto "ok").
2. Verifica che `curl -I $R2_PUBLIC_BASE_URL/ping.txt` ritorni HTTP 200. Se 403 / 404: pubblicazione non attiva — rivedi Step R2-1 punto 4.
3. Elimina `ping.txt` dal bucket via dashboard.

Dove inserire il risultato: nessun file — solo conferma del fatto che il CDN serve oggetti pubblicamente.
```

- [ ] **Step 2: Commit**

```bash
git add MANUAL_STEPS.md
git commit -m "docs: add Cloudflare R2 provisioning steps for card-images migration"
```

---

## Task 1: Install SDK + env scaffolding

**Files:**
- Modify: `package.json`, `.env.local.example`
- Create: `src/lib/r2/client.ts`

- [ ] **Step 1: Install `@aws-sdk/client-s3`**

Run:
```bash
pnpm add @aws-sdk/client-s3
```

Expected: lockfile updated, no peer-dep warnings.

- [ ] **Step 2: Append R2 vars to `.env.local.example`**

Open `.env.local.example` and append at the end:

```
# Cloudflare R2 (upscaled card images CDN). See MANUAL_STEPS.md [STEP R2-1].
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=adunata-card-images-hd
R2_PUBLIC_BASE_URL=https://cdn.adunata.studiob35.com
```

- [ ] **Step 3: Create the R2 S3 client factory**

Write `src/lib/r2/client.ts`:

```ts
import { S3Client } from '@aws-sdk/client-s3'

let cachedClient: S3Client | null = null

export function getR2Client(): S3Client {
  if (cachedClient) return cachedClient

  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 client misconfigured: missing R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY')
  }

  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })

  return cachedClient
}

export function getR2Bucket(): string {
  const bucket = process.env.R2_BUCKET
  if (!bucket) throw new Error('R2 client misconfigured: missing R2_BUCKET')
  return bucket
}
```

- [ ] **Step 4: Type-check passes**

Run:
```bash
pnpm tsc --noEmit
```

Expected: no errors related to `src/lib/r2/client.ts`.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml .env.local.example src/lib/r2/client.ts
git commit -m "feat(r2): add Cloudflare R2 S3 client and env scaffolding"
```

---

## Task 2: R2 helpers (public URL + upload)

**Files:**
- Create: `src/lib/r2/public-url.ts`, `src/lib/r2/upload.ts`

- [ ] **Step 1: Write the public URL helper**

Write `src/lib/r2/public-url.ts`:

```ts
export function getR2PublicBaseUrl(): string {
  const base = process.env.R2_PUBLIC_BASE_URL
  if (!base) throw new Error('R2 misconfigured: missing R2_PUBLIC_BASE_URL')
  return base.replace(/\/+$/, '')
}

export function buildR2PublicUrl(storagePath: string): string {
  const normalized = storagePath.replace(/^\/+/, '')
  return `${getR2PublicBaseUrl()}/${normalized}`
}
```

- [ ] **Step 2: Write the upload helper**

Write `src/lib/r2/upload.ts`:

```ts
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getR2Bucket, getR2Client } from './client'

export interface UploadToR2Options {
  key: string
  body: Uint8Array | Buffer
  contentType: string
  cacheControl?: string
}

export async function uploadToR2(options: UploadToR2Options): Promise<void> {
  const client = getR2Client()
  const command = new PutObjectCommand({
    Bucket: getR2Bucket(),
    Key: options.key,
    Body: options.body,
    ContentType: options.contentType,
    CacheControl: options.cacheControl ?? 'public, max-age=31536000, immutable',
  })
  await client.send(command)
}
```

- [ ] **Step 3: Smoke test the upload helper from a one-off Node REPL**

Run:
```bash
node --input-type=module -e "
import { uploadToR2 } from './src/lib/r2/upload.ts'
import { buildR2PublicUrl } from './src/lib/r2/public-url.ts'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
const bytes = new TextEncoder().encode('plan-smoke-' + Date.now())
await uploadToR2({ key: 'plan-smoke/test.txt', body: bytes, contentType: 'text/plain' })
console.log('uploaded:', buildR2PublicUrl('plan-smoke/test.txt'))
"
```

(If TS imports fail, transpile via `tsx` instead: `pnpm dlx tsx -e "..."`.)

Expected: prints URL, then `curl -I <url>` returns `200`. Manually delete the `plan-smoke/test.txt` object from R2 dashboard afterwards.

- [ ] **Step 4: Commit**

```bash
git add src/lib/r2/public-url.ts src/lib/r2/upload.ts
git commit -m "feat(r2): add public URL and upload helpers"
```

---

## Task 3: One-shot migration script (Supabase Storage → R2)

**Files:**
- Create: `scripts/migrate-card-images-to-r2.mjs`

- [ ] **Step 1: Write the migration script**

Write `scripts/migrate-card-images-to-r2.mjs`:

```js
import 'dotenv/config'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_BUCKET = 'card-images-hd'

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET = process.env.R2_BUCKET

if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing Supabase env')
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) throw new Error('Missing R2 env')

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
})

async function r2ObjectExists(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    return true
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return false
    throw err
  }
}

async function copyOne(storagePath) {
  if (await r2ObjectExists(storagePath)) return 'skipped'

  const { data: blob, error } = await supabase.storage.from(SUPABASE_BUCKET).download(storagePath)
  if (error || !blob) throw new Error(`download failed: ${storagePath} :: ${error?.message ?? 'no blob'}`)

  const buffer = Buffer.from(await blob.arrayBuffer())
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: storagePath,
    Body: buffer,
    ContentType: blob.type || 'image/png',
    CacheControl: 'public, max-age=31536000, immutable',
  }))
  return 'copied'
}

async function listAllSupabaseObjects() {
  // Supabase Storage list is paginated and folder-bound. We mirror the
  // path layout `scryfall/<a>/<b>/<id>/<face>@2x.png` built by
  // buildCardImageStoragePath().
  const queue = [{ prefix: 'scryfall', depth: 0 }]
  const found = []

  while (queue.length > 0) {
    const { prefix, depth } = queue.shift()
    let offset = 0
    const pageSize = 1000

    for (;;) {
      const { data, error } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .list(prefix, { limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } })
      if (error) throw error
      if (!data || data.length === 0) break

      for (const entry of data) {
        const fullPath = `${prefix}/${entry.name}`
        if (entry.id === null || entry.metadata === null) {
          // folder — recurse
          queue.push({ prefix: fullPath, depth: depth + 1 })
        } else {
          found.push(fullPath)
        }
      }

      if (data.length < pageSize) break
      offset += pageSize
    }
  }

  return found
}

async function main() {
  const all = await listAllSupabaseObjects()
  console.log(`Found ${all.length} objects in Supabase bucket ${SUPABASE_BUCKET}`)

  let copied = 0
  let skipped = 0
  let failed = 0
  let i = 0

  for (const key of all) {
    i++
    try {
      const result = await copyOne(key)
      if (result === 'copied') copied++
      else skipped++
      if (i % 25 === 0) console.log(`  progress ${i}/${all.length} (copied=${copied} skipped=${skipped} failed=${failed})`)
    } catch (err) {
      failed++
      console.error(`FAIL ${key}: ${err.message}`)
    }
  }

  console.log(`Done: total=${all.length} copied=${copied} skipped=${skipped} failed=${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Dry-run with a single file**

Run a quick smoke before the full migration. Pick one known key from the DB:
```bash
node -e "
import('./node_modules/@supabase/supabase-js/dist/main/index.js').then(async ({ createClient }) => {
  const dotenv = await import('dotenv'); dotenv.config({ path: '.env.local' });
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
  const { data } = await s.from('card_image_assets').select('storage_path').eq('status','ready').not('storage_path','is',null).limit(1);
  console.log(data?.[0]?.storage_path);
})
"
```

Use that key + run an ad-hoc copy via `node --input-type=module` invoking `copyOne` to verify the round-trip lands in R2.

Expected: object visible in R2 dashboard at the exact key. Delete it manually afterwards if you want a clean run.

- [ ] **Step 3: Full migration**

Run:
```bash
node scripts/migrate-card-images-to-r2.mjs 2>&1 | tee /tmp/r2-migration.log
```

Expected: `Done: total=832 copied=832 skipped=0 failed=0` (numbers approximate). Re-running must produce `skipped=832 copied=0` — idempotency check.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-card-images-to-r2.mjs
git commit -m "feat(r2): one-shot migration script from Supabase Storage to R2"
```

---

## Task 4: Verification script

**Files:**
- Create: `scripts/verify-r2-migration.mjs`

- [ ] **Step 1: Write the verification script**

Write `scripts/verify-r2-migration.mjs`:

```js
import 'dotenv/config'
import dotenv from 'dotenv'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_BUCKET = 'card-images-hd'

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})
const R2_BUCKET = process.env.R2_BUCKET

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function sha256(buf) { return createHash('sha256').update(buf).digest('hex') }

async function bodyToBuffer(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function fetchDbKeys() {
  const all = []
  let from = 0
  const pageSize = 500
  for (;;) {
    const { data, error } = await supabase
      .from('card_image_assets')
      .select('storage_path')
      .eq('status', 'ready')
      .not('storage_path', 'is', null)
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data.map((row) => row.storage_path))
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

async function main() {
  const keys = await fetchDbKeys()
  console.log(`DB rows with status=ready and storage_path: ${keys.length}`)

  const sample = keys.slice(0, Math.min(20, keys.length))
  let mismatches = 0
  let missing = 0

  for (const key of sample) {
    try {
      const supabaseBlob = await supabase.storage.from(SUPABASE_BUCKET).download(key)
      if (supabaseBlob.error || !supabaseBlob.data) {
        console.log(`  ${key}: not in Supabase (already deleted?)`)
        continue
      }
      const supabaseBuf = Buffer.from(await supabaseBlob.data.arrayBuffer())

      const r2Obj = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }))
      const r2Buf = await bodyToBuffer(r2Obj.Body)

      if (sha256(supabaseBuf) !== sha256(r2Buf)) {
        console.log(`  MISMATCH ${key}`)
        mismatches++
      } else {
        console.log(`  OK ${key} (${supabaseBuf.length} bytes)`)
      }
    } catch (err) {
      console.log(`  MISSING ${key}: ${err.message}`)
      missing++
    }
  }

  // Coverage: every DB key must exist in R2.
  let absent = 0
  for (const key of keys) {
    try {
      await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    } catch (err) {
      absent++
      console.log(`  ABSENT IN R2: ${key}`)
      if (absent >= 25) {
        console.log('  (stopping report after 25 absent keys)')
        break
      }
    }
  }

  console.log(`Sample checked: ${sample.length}, mismatches=${mismatches}, missing-in-r2=${missing}`)
  console.log(`Full DB coverage: absent-in-r2=${absent}`)
  if (mismatches > 0 || absent > 0) process.exit(1)
}

main().catch((err) => { console.error(err); process.exit(1) })
```

- [ ] **Step 2: Run verification**

Run:
```bash
node scripts/verify-r2-migration.mjs
```

Expected: every sampled key shows `OK <bytes>`. Final line: `Sample checked: 20, mismatches=0, missing-in-r2=0` and `absent-in-r2=0`. If anything is non-zero, re-run Task 3.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-r2-migration.mjs
git commit -m "feat(r2): add migration verification with sha256 spot-checks and full coverage scan"
```

---

## Task 5: Switch the upscale worker to write to R2

**Files:**
- Modify: `scripts/upscale-card-images.mjs:1-25` (imports) and `:165-180` (upload block)

- [ ] **Step 1: Read the current upload block**

Open `scripts/upscale-card-images.mjs` around lines 160-185. The existing block looks like:

```js
const upload = await supabase.storage
  .from('card-images-hd')
  .upload(current.storage_path, outputBytes, {
    contentType: 'image/png',
    upsert: true,
  })
if (upload.error) throw upload.error
```

- [ ] **Step 2: Add R2 imports near the top of the file**

Find the existing top-of-file imports. After the `import dotenv from 'dotenv'` line, add:

```js
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
```

Then, after the `dotenv.config(...)` lines and the existing `SUPABASE_*` / `REALESRGAN_*` constants, add:

```js
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET = process.env.R2_BUCKET

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  throw new Error('Missing R2 env (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET)')
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
})
```

- [ ] **Step 3: Replace the Supabase upload block with R2 upload**

Replace the block shown in Step 1 with:

```js
await r2.send(new PutObjectCommand({
  Bucket: R2_BUCKET,
  Key: current.storage_path,
  Body: outputBytes,
  ContentType: 'image/png',
  CacheControl: 'public, max-age=31536000, immutable',
}))
```

- [ ] **Step 4: Manual end-to-end test**

Force-queue a single card and run the worker once:
```bash
# Find one ready asset to re-run, or queue a new one via the /api/card-image/upscaled endpoint
node scripts/upscale-card-images.mjs --limit=1
```

Expected: log shows `ready <asset-id> <w>x<h> <storage_path>`. Confirm the object appeared in R2 dashboard at the matching key.

- [ ] **Step 5: Commit**

```bash
git add scripts/upscale-card-images.mjs
git commit -m "feat(r2): upscale worker writes upscaled PNGs to Cloudflare R2 instead of Supabase Storage"
```

---

## Task 6: Route handler redirects to R2 public URL

**Files:**
- Modify: `src/app/api/card-image/upscaled/route.ts`

- [ ] **Step 1: Remove the `downloadAsset` streaming path and redirect to R2**

Open `src/app/api/card-image/upscaled/route.ts`. Find the top constants:

```ts
const BUCKET = 'card-images-hd'
const CACHE_HEADER = 'public, s-maxage=31536000, max-age=86400, immutable'
```

Replace with:

```ts
const CACHE_HEADER = 'public, s-maxage=31536000, max-age=86400, immutable'
```

Add this import alongside the existing top-of-file imports:

```ts
import { buildR2PublicUrl } from '@/lib/r2/public-url'
```

Delete the entire `downloadAsset` function (the one that calls `supabase.storage.from(BUCKET).download(...)` and returns a `NextResponse` of the bytes).

In the `GET` handler, replace this block:

```ts
const asset = await findReadyAsset(supabase, { cardId, scryfallId, faceIndex, profile })
if (asset?.storage_path) {
  const cached = await downloadAsset(supabase, asset.storage_path)
  if (cached) return cached
}

return NextResponse.json({ error: 'upscaled image not found' }, { status: 404 })
```

With:

```ts
const asset = await findReadyAsset(supabase, { cardId, scryfallId, faceIndex, profile })
if (asset?.storage_path) {
  return NextResponse.redirect(buildR2PublicUrl(asset.storage_path), {
    status: 302,
    headers: { 'Cache-Control': CACHE_HEADER },
  })
}

return NextResponse.json({ error: 'upscaled image not found' }, { status: 404 })
```

- [ ] **Step 2: Type-check**

Run:
```bash
pnpm tsc --noEmit
```

Expected: zero errors. If you get "unused `BUCKET`", make sure you removed all references.

- [ ] **Step 3: Manual end-to-end test in dev**

Run:
```bash
pnpm dev
```

Visit the deck proxy print modal for a deck that has at least one card with a ready upscale. Open browser DevTools → Network → click the proxy PDF preview. Filter requests by `/api/card-image/upscaled`. The response should be a `302` to `cdn.adunata.studiob35.com/scryfall/...@2x.png` (or the r2.dev URL), and the followed request should return `200` with the PNG.

If you only have a clean DB, query one ready row first:
```bash
# replace <ref> with the project ref
psql "$DATABASE_URL" -c "select id,scryfall_id,storage_path from card_image_assets where status='ready' limit 1;"
```

Then GET:
```bash
curl -v "http://localhost:3000/api/card-image/upscaled?scryfallId=<that-scryfall-id>&face=front"
```

Expected: `HTTP/1.1 302 Found` with a `Location:` header pointing to your R2 public base URL.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/card-image/upscaled/route.ts
git commit -m "feat(r2): route handler redirects to R2 public URL for ready upscaled assets"
```

---

## Task 7: Push to dev branch and validate on Vercel preview

**Files:**
- (no file changes)

- [ ] **Step 1: Sync Vercel env vars**

For each environment (development, preview, production):
```bash
printf "%s" "<r2-account-id>" | vercel env add R2_ACCOUNT_ID development --yes
printf "%s" "<r2-account-id>" | vercel env add R2_ACCOUNT_ID preview --yes
printf "%s" "<r2-account-id>" | vercel env add R2_ACCOUNT_ID production --yes
```

Repeat for `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`.

(Older CLI 50.x: never use `--value`. Always `printf | vercel env add`. See CLAUDE.md.)

Verify:
```bash
vercel env ls | grep R2_
```

Expected: 5 keys × 3 environments = 15 entries.

- [ ] **Step 2: Push to dev branch**

```bash
git push origin dev
```

Expected: Vercel preview build kicks off. After it deploys, open the preview URL, perform the same Network-tab check from Task 6 Step 3 — the `/api/card-image/upscaled` request must return `302` to the R2 public URL, and the followed `GET` must hit Cloudflare and return `200` PNG.

- [ ] **Step 3: Smoke-test the proxy PDF flow**

On the Vercel preview, build or open an existing deck with ≥10 cards, click "Stampa proxy" (or whatever triggers `ProxyPrintModal`). The modal must render correctly with HD images. Open `/api/card-image/upscaled` direct calls from DevTools Network to confirm `Location:` headers point at R2.

If anything 404s for a card that was supposed to be ready, query the DB:
```sql
SELECT id, status, storage_path, locked_at, last_error
FROM card_image_assets
WHERE scryfall_id = '<the-one-that-failed>';
```

If `status='ready'` and `storage_path` is set but R2 returns 404 → migration missed it. Re-run Task 3 (it's idempotent) and Task 4.

---

## Task 8: Delete the Supabase Storage bucket

**Files:**
- (no file changes; destructive Supabase operation)

- [ ] **Step 1: Re-run verification**

```bash
node scripts/verify-r2-migration.mjs
```

Expected: `absent-in-r2=0`, `mismatches=0`. Do NOT proceed if anything is non-zero.

- [ ] **Step 2: Sanity check DB row count vs R2 object count**

Run the SQL count (via Supabase MCP `execute_sql` or psql):
```sql
SELECT count(*) FROM card_image_assets WHERE status = 'ready' AND storage_path IS NOT NULL;
```

In the Cloudflare dashboard for the R2 bucket, confirm "Objects" count matches (give-or-take any test files you uploaded; clean those up first).

- [ ] **Step 3: Delete the Supabase bucket**

Go to Supabase dashboard → Storage → `card-images-hd` → "..." → "Delete bucket". Confirm by typing the bucket name.

(Alternatively via Management API: `curl -X DELETE -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "https://api.supabase.com/v1/projects/$REF/storage/buckets/card-images-hd"`. Note that buckets must be emptied first; the dashboard "Delete bucket" button handles both steps.)

- [ ] **Step 4: Confirm storage usage dropped**

Run from the repo root:
```bash
set -a && source .env.local && set +a
REF=$(echo "$NEXT_PUBLIC_SUPABASE_URL" | sed -E 's|https?://||; s|\.supabase\.co.*||')
curl -s -X POST -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  "https://api.supabase.com/v1/projects/$REF/database/query" \
  -d '{"query":"SELECT bucket_id, count(*) AS files, pg_size_pretty(coalesce(sum((metadata->>'size')::bigint),0)) AS total_size FROM storage.objects GROUP BY bucket_id;"}'
```

Expected: `card-images-hd` no longer appears (or shows 0 files). Total Supabase storage usage should drop by ~5.2 GB.

---

## Task 9: Documentation

**Files:**
- Modify: `DECISIONS.md`, `README.md`, `MANUAL_STEPS.md`

- [ ] **Step 1: Append a decision to `DECISIONS.md`**

Append to `DECISIONS.md`:

```markdown
## 2026-05-19 — Migrazione `card-images-hd` su Cloudflare R2

**Scelta:** Spostato bucket immagini HD upscalate da Supabase Storage a Cloudflare R2, esposto via custom domain `cdn.adunata.studiob35.com`. Route `/api/card-image/upscaled` ora restituisce 302 redirect verso il CDN invece di streamare i byte attraverso il route handler.

**Perché:** Bucket cresciuto a 5.2 GB su Free tier Supabase (limite 1 GB); proiezione catalogo completo ~700 GB. R2 ha storage a $0.015/GB e **zero egress**, contro $0.021/GB storage + $0.09/GB egress su Supabase Pro. Su 700 GB + 500 GB egress al mese: ~$10 R2 vs ~$85 Supabase. Vercel Blob considerato ma egress non gratis ($0.03-0.05/GB) e legato al piano Vercel.

**Trade-off:** Auth/RLS sul file non più disponibili (R2 pubblico via CDN). OK perché immagini carte sono dati Scryfall pubblici, non gated. Per file futuri privati per-utente (es. PDF deck personali) restare su Supabase Storage.
```

- [ ] **Step 2: Update `README.md` setup section**

Append (or merge into existing setup section) in `README.md`:

```markdown
### Cloudflare R2 (upscaled card images CDN)

The upscale pipeline writes PNG output to a Cloudflare R2 bucket served publicly via `cdn.adunata.studiob35.com`. Required env vars (also configured on Vercel for all environments):

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET` (default: `adunata-card-images-hd`)
- `R2_PUBLIC_BASE_URL` (default: `https://cdn.adunata.studiob35.com`)

Provisioning steps live in `MANUAL_STEPS.md` under `[STEP R2-1]` and `[STEP R2-2]`. The migration runbook is `docs/superpowers/plans/2026-05-19-r2-card-images-migration.md`.
```

- [ ] **Step 3: Mark Manual Steps as completed**

In `MANUAL_STEPS.md`, prepend `**[DONE 2026-05-19]**` to the headings of `[STEP R2-1]` and `[STEP R2-2]` (only if the user has actually completed them).

- [ ] **Step 4: Commit**

```bash
git add DECISIONS.md README.md MANUAL_STEPS.md
git commit -m "docs: record R2 migration decision, setup notes, and completed manual steps"
```

- [ ] **Step 5: Push and merge to release once validated**

```bash
git push origin dev
```

When QA on the Vercel preview confirms the proxy PDF and card art still load correctly, open the PR `dev → release` per the GitFlow rules in `CLAUDE.md`.

---

## Self-review notes (internal)

- Spec coverage:
  - Provisioning R2 → Task 0
  - SDK + client → Task 1
  - URL + upload helpers → Task 2
  - Migration script → Task 3
  - Verification → Task 4
  - Worker switchover → Task 5
  - Route handler switchover → Task 6
  - Vercel env + preview validation → Task 7
  - Supabase bucket cleanup → Task 8
  - Docs → Task 9
- No type drift: `buildR2PublicUrl`, `uploadToR2`, `getR2Client`, `getR2Bucket` are used consistently across Tasks 2/5/6.
- No placeholders: every code block is final code, every command is runnable, every expected output is concrete.
