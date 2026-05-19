# Card Image Upscaling — Design Spec

## Status

Implementation started. Schema, helper utilities, local queue script, and sequential worker are in place; admin UI is still pending.

Latest implementation note:

- `hd-2x` uses `realesr-animevideov3 -s 2`.
- `hd-2x` assets are stored in the private `card-images-hd` bucket and tracked by `card_image_assets`.
- First sample completed for Karn, Legacy Reforged MAT at `1490x2080`.
- Ultra raster now prepares missing `hd-2x` assets in one batch for the whole proxy list before PDF generation, stores them, and reuses them on later PDF generations.
- `hd-4x` remains on-demand only for Epic raster and is not stored.
- SOS `layout=prepare` cards use one combined front image; back-face assets must not be queued unless the stored face has explicit `image_uris`.

## Goal

Generate and store HD upscaled PNG images for card printings already present in the local database, primarily for higher-quality proxy printing. The first implementation focuses on generation and storage only. Public serving APIs, CDN strategy, and third-party proxy-provider integrations are deferred, but storage paths and metadata should remain compatible with those future use cases.

## Current Proxy Image Flow

The existing proxy PDF flow already:

- reads deck cards and quantities from local app data;
- derives image candidates from existing card records, including `card_faces`, `scryfall_id`, and `image_normal`;
- prefers higher-quality Scryfall image URLs when available;
- proxies Scryfall image downloads through `/api/card-image` for same-origin cached fetches;
- rasterizes images client-side for PDF generation;
- supports A4 sheet and direct poker-card output modes.

The upscaling feature should not replace this flow initially. It should create a reusable HD image cache that later PDF generation and public APIs can consume.

## Scope

### In Scope

- Admin-only page for selecting cards and creating upscale batches.
- Supabase Auth admin gating based on manually assigned `app_metadata.role = "admin"`.
- Queue tables for batches and per-card/per-face upscale jobs.
- Local worker script that runs on the developer/admin machine.
- Local upscaling with Real-ESRGAN/NCNN or equivalent local binary.
- Supabase Storage upload for generated PNG assets.
- Metadata tracking for status, dimensions, model/profile, bytes, checksum, attempts, and errors.
- Resumable processing and retry of failed jobs.

### Out of Scope for MVP

- Public API for external consumers.
- CDN/egress optimization.
- External AI/provider integration.
- Automatic PDF use of HD assets.
- Full catalog automatic generation.
- Admin role-management UI.

## Admin Authorization

Admin access is assigned manually in Supabase Dashboard using Auth app metadata:

```json
{
  "role": "admin"
}
```

The app must not use `user_metadata` for authorization because users can edit their own user metadata. Admin checks should be performed server-side for both the admin page and all admin mutation APIs.

Expected behavior:

- If the current user is not authenticated, deny access.
- If `user.app_metadata.role !== "admin"`, return `notFound()` or redirect away from admin routes.
- All API routes that create/retry/delete upscale jobs must repeat the same server-side check.

## Data Model

### `card_image_batches`

Represents an admin-created generation batch.

Proposed fields:

- `id uuid primary key default gen_random_uuid()`
- `created_by uuid not null references auth.users(id) on delete restrict`
- `label text`
- `status text not null default 'queued'`
- `target_profile text not null default 'hd-2x'`
- `total_jobs integer not null default 0`
- `completed_jobs integer not null default 0`
- `failed_jobs integer not null default 0`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

The batch exists to group work for progress reporting, retries, and future auditability.

Batch status constraint:

```sql
check (status in ('queued', 'processing', 'completed', 'completed_with_errors', 'failed', 'cancelled'))
```

Useful indexes:

```sql
create index idx_card_image_batches_created_at on public.card_image_batches (created_at desc);
create index idx_card_image_batches_status on public.card_image_batches (status);
create index idx_card_image_batches_created_by on public.card_image_batches (created_by);
```

### `card_image_assets`

Represents one generated or pending HD image asset. This is one row per card printing and face.

Proposed fields:

- `id uuid primary key default gen_random_uuid()`
- `batch_id uuid references public.card_image_batches(id) on delete set null`
- `card_id uuid not null references public.cards(id) on delete cascade`
- `scryfall_id text not null`
- `face_index integer not null default 0`
- `source_url text not null`
- `storage_path text not null`
- `status text not null default 'queued'`
- `target_profile text not null default 'hd-2x'`
- `model text not null default 'realesrgan-x4plus'`
- `scale integer not null default 2`
- `target_dpi integer not null default 600`
- `width_px integer`
- `height_px integer`
- `bytes bigint`
- `mime_type text`
- `checksum text`
- `attempts integer not null default 0`
- `last_error text`
- `locked_at timestamptz`
- `locked_by text`
- `completed_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Status values:

```text
queued -> processing -> ready
queued/processing -> failed
failed -> queued
```

Asset constraints:

```sql
check (status in ('queued', 'processing', 'ready', 'failed', 'cancelled'))
check (face_index >= 0)
check (scale > 0)
check (target_dpi > 0)
check (attempts >= 0)
unique (card_id, face_index, target_profile)
unique (storage_path)
```

Useful indexes:

```sql
create index idx_card_image_assets_status_locked on public.card_image_assets (status, locked_at);
create index idx_card_image_assets_batch_id on public.card_image_assets (batch_id);
create index idx_card_image_assets_card_id on public.card_image_assets (card_id);
create index idx_card_image_assets_scryfall_id on public.card_image_assets (scryfall_id);
create index idx_card_image_assets_ready_profile on public.card_image_assets (target_profile, status) where status = 'ready';
```

The worker should be idempotent. If the target file already exists and metadata validates, it can mark the row `ready` without regenerating.

`card_image_assets` intentionally represents the durable generated asset, not an append-only job log. There should be at most one asset row per `card_id + face_index + target_profile`. If an admin creates a new batch containing an already queued/failed asset, the existing row is re-associated with the latest batch and requeued if needed. If an asset is already `ready`, it is counted as already available and is not regenerated by default.

If future audit requirements become stricter, add a separate append-only `card_image_job_events` table instead of duplicating asset rows.

### RLS and Admin Policies

Enable RLS on both tables:

```sql
alter table public.card_image_batches enable row level security;
alter table public.card_image_assets enable row level security;
```

Use a helper function for admin checks:

```sql
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;
```

Policies:

```sql
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
```

The service role used by the worker bypasses RLS. The app should still perform server-side admin checks with `supabase.auth.getUser()` before calling admin APIs. The RLS policies are defense in depth for accidental client-side access.

Because `app_metadata` claims in JWTs are not always refreshed immediately, changing a user's admin role may require the user to sign out/in or refresh their session before the admin page reflects the new role.

## Storage

Use Supabase Storage for the generated files.

Bucket:

```text
card-images-hd
```

Stable object path pattern:

```text
scryfall/{first_char}/{second_char}/{scryfall_id}/front@2x.png
scryfall/{first_char}/{second_char}/{scryfall_id}/back@2x.png
```

For single-faced cards, only `front@2x.png` is generated. For double-faced cards, `front@2x.png` and `back@2x.png` can be queued independently.

The path pattern is intentionally compatible with a future public image API.

For the MVP, start the bucket as private. The local worker uses the service/secret key to upload, and the admin UI can use server-side signed URLs if it needs to preview generated files. Public serving can later be added with a controlled API route or a CDN-backed public bucket decision. Starting private avoids accidentally publishing a large card-image corpus before the legal, attribution, and egress questions are resolved.

Create the bucket through Supabase Storage as private:

```text
bucket id: card-images-hd
public: false
allowed mime types: image/png
file size limit: start at 25 MB, adjust after real samples
```

For the MVP, do not expose direct client storage upload policies. Uploads happen through the local worker with the service/secret key. Admin previews, if needed, should be generated by a server route that creates short-lived signed URLs.

## Source Image Resolution

The worker must not call the Scryfall API to discover cards. Cards already exist in the local Supabase database, so source selection is based on stored card data.

Source priority for a face:

1. `card_faces[face_index].image_uris.png`, when present.
2. Derived Scryfall PNG URL from `scryfall_id`, when the card is single-faced or the requested face is front:
   `https://cards.scryfall.io/png/front/{id[0]}/{id[1]}/{scryfall_id}.png`
3. `card_faces[face_index].image_uris.large`, when present.
4. Derived Scryfall large JPG URL from `scryfall_id`, when applicable:
   `https://cards.scryfall.io/large/front/{id[0]}/{id[1]}/{scryfall_id}.jpg`
5. `card_faces[face_index].image_uris.normal`, when present.
6. `cards.image_normal`.

For double-faced cards, prefer explicit `card_faces[n].image_uris.*` URLs. Do not derive a back-face URL unless verified against the stored face data, because Scryfall face path conventions are easy to get subtly wrong and the stored `card_faces` object is the safer source of truth.

The selected `source_url` is written to `card_image_assets` when the job is created, so each job is reproducible even if the card row changes later.

## Admin Page

Route:

```text
/admin/proxy-images
```

Proposed files:

```text
src/app/(app)/admin/proxy-images/page.tsx
src/components/admin/CardImageUpscaleAdmin.tsx
src/components/admin/CardImageBatchList.tsx
src/components/admin/CardImageAssetTable.tsx
src/lib/admin/is-admin.ts
src/lib/card-images/source-url.ts
src/lib/card-images/storage-path.ts
```

`page.tsx` should be a server component that gates access before rendering the client admin surface. `src/lib/admin/is-admin.ts` should expose a small helper that uses `supabase.auth.getUser()` and checks `user.app_metadata.role === 'admin'`.

MVP capabilities:

- Search cards already present in the local DB.
- Filter by name, set, collector number, and `scryfall_id`.
- Filter by HD asset status: missing, queued, processing, ready, failed.
- Select individual cards or all current results.
- Create an upscale batch from selected cards.
- Show recent batches with progress counters.
- Show batch detail with job status, dimensions when ready, and errors when failed.
- Retry failed jobs.

The UI does not need advanced before/after comparison for the MVP. Thumbnail source image, status, and generated dimensions are enough.

### Admin UI Layout

Use a dense operational layout, not a marketing-style page.

Top controls:

- search input;
- status filter;
- set code filter;
- target profile display, fixed to `hd-2x` for MVP;
- selected count;
- primary action: `Create upscale batch`.

Main content:

- left/primary table: cards and asset status;
- right/secondary panel or lower section: recent batches;
- batch detail opens inline or in a route-level detail view, whichever fits existing app conventions during implementation.

Card table columns:

- checkbox;
- thumbnail;
- name;
- set code and collector number;
- `scryfall_id`;
- faces to queue;
- HD status;
- output dimensions/bytes if ready;
- last error if failed.

Batch list columns:

- label;
- created date;
- status;
- profile;
- totals;
- completed;
- failed;
- action to open detail.

Batch detail:

- progress summary;
- asset rows;
- retry failed;
- cancel queued;
- signed URL/open generated file for ready rows.

The UI should support batch creation from selected table rows first. Bulk operations such as "queue all missing results" can be added after the first version works.

### Admin API Routes

All admin routes must check admin access server-side before doing work.

Proposed routes:

```text
GET  /api/admin/card-images/cards
POST /api/admin/card-images/batches
GET  /api/admin/card-images/batches
GET  /api/admin/card-images/batches/[id]
POST /api/admin/card-images/assets/retry
POST /api/admin/card-images/assets/cancel
GET  /api/admin/card-images/assets/[id]/signed-url
```

Route responsibilities:

- `GET /cards`: paginated search across existing `cards`, joined with current asset status for `target_profile`.
- `POST /batches`: accepts selected `card_id`s plus options, resolves source URLs and storage paths, upserts `card_image_assets`, creates a batch, and queues/requeues missing or failed assets.
- `GET /batches`: returns recent batches and counters.
- `GET /batches/[id]`: returns batch detail and asset rows.
- `POST /assets/retry`: requeues selected failed/cancelled assets.
- `POST /assets/cancel`: cancels selected queued/failed assets; processing assets should not be force-cancelled in the MVP.
- `GET /assets/[id]/signed-url`: creates a short-lived signed URL for ready assets so the admin can inspect output from a private bucket.

Batch creation rules:

- The request accepts `target_profile`, defaulting to `hd-2x`.
- The API resolves each selected card into one or more face jobs.
- For double-faced cards, queue one asset per face when source URLs exist.
- If an asset is already `ready`, count it as available and do not requeue.
- If an asset is `queued` or `processing`, associate it with the new batch for reporting but do not duplicate it.
- If an asset is `failed` or `cancelled`, requeue it and reset `last_error` only when the admin explicitly chooses retry/requeue.
- If no source URL can be resolved, return that card in a `skipped` list instead of creating a broken asset row.

Pagination/search:

- Default page size: 50 cards.
- Maximum page size: 200 cards.
- Search should initially use `name ilike`, exact `scryfall_id`, `set_code`, and `collector_number`.
- Avoid large unbounded table scans from the admin route.

## Local Worker

Script:

```text
scripts/upscale-card-images.mjs
```

Responsibilities:

- Load `.env.local`.
- Use Supabase server-side credentials.
- Claim a limited number of `queued` jobs.
- Mark claimed jobs as `processing` with `locked_by`.
- Download the `source_url` already stored/derived from DB data.
- Write temporary input/output files outside git-tracked paths.
- Call a local Real-ESRGAN/NCNN/Upscayl-compatible binary.
- Validate PNG output.
- Compute dimensions, bytes, and checksum.
- Upload output to Supabase Storage.
- Update asset row as `ready`.
- On failure, update `failed`, increment `attempts`, and store `last_error`.

Locking and retry rules:

- Worker claims queued jobs in small batches and sets `status = 'processing'`, `locked_at = now()`, and `locked_by = <worker id>`.
- A processing job whose `locked_at` is older than 30 minutes is considered stale and can be reclaimed.
- `attempts` increments once per processing attempt.
- Jobs fail permanently only after 3 attempts by default; before that, admin can retry by setting status back to `queued`.
- `last_error` stores a concise error string suitable for the admin UI. Full verbose logs stay in the worker console/log file.
- The worker should process one job transactionally enough that an interrupted upload does not leave a false `ready` row. Mark `ready` only after the file is uploaded and validated.

Example command:

```bash
node scripts/upscale-card-images.mjs --limit=50 --concurrency=1 --profile=hd-2x
```

CLI options:

```text
--limit=<n>              maximum jobs to process in this run; default 25
--concurrency=<n>        parallel upscale processes; default 1
--profile=<name>         target profile; default hd-2x
--asset-id=<uuid>        process one specific asset
--dry-run                print selected work and commands without claiming jobs
--keep-temp              keep temporary input/output files for inspection
--worker-id=<name>       stable worker id; default hostname + pid
--stale-after-min=<n>    reclaim stale processing jobs; default 30
--max-attempts=<n>       mark failed after this many attempts; default 3
```

Worker proposed files:

```text
scripts/upscale-card-images.mjs
src/lib/card-images/source-url.ts
src/lib/card-images/storage-path.ts
src/lib/card-images/image-metadata.ts
```

The worker can import shared pure helpers for source URL selection and storage path generation. The actual script should stay Node-oriented and not import browser/Next-only modules.

Temporary files:

```text
.tmp/upscale-card-images/{asset_id}/source
.tmp/upscale-card-images/{asset_id}/output.png
```

`.tmp/` should be ignored by git.

Real-ESRGAN command shape should be generated from env and profile config, not hard-coded inside the worker loop. Example conceptual command:

```bash
"$REALESRGAN_BIN" \
  -i source.png \
  -o output.png \
  -m "$REALESRGAN_MODEL_PATH" \
  -n "$REALESRGAN_MODEL" \
  -s 2 \
  -t "${REALESRGAN_TILE_SIZE:-1024}" \
  -j 1:1:1 \
  -f png
```

The worker should capture exit code, stderr, and stdout. Store only concise failure text in `last_error`; verbose logs stay local.

Initial MacBook Pro M1 Max guidance:

- Start with `--concurrency=1`.
- Test `--concurrency=2` only after measuring runtime, memory, and thermals.
- Keep processing resumable so long runs can be stopped and restarted safely.

Environment variables:

```env
REALESRGAN_BIN=/path/to/realesrgan-ncnn-vulkan
REALESRGAN_MODEL_PATH=/path/to/realesrgan-ncnn-vulkan/models
REALESRGAN_MODEL=realesrgan-x4plus
REALESRGAN_TILE_SIZE=1024
```

### Local Real-ESRGAN Setup

Use the portable `realesrgan-ncnn-vulkan` binary as the first supported local upscaler. It avoids a Python/PyTorch setup and exposes the simple CLI shape the worker needs.

Setup expectations:

1. Download a macOS build of `realesrgan-ncnn-vulkan` or build it locally if the available binary does not run on the current Apple Silicon/macOS setup.
2. Store the binary outside the repo or under an ignored tools directory.
3. Configure `.env.local`:

```env
REALESRGAN_BIN=/absolute/path/to/realesrgan-ncnn-vulkan
REALESRGAN_MODEL_PATH=/absolute/path/to/realesrgan-ncnn-vulkan/models
REALESRGAN_MODEL=realesrgan-x4plus
REALESRGAN_TILE_SIZE=1024
```

4. Verify manually with one source image before using the app queue:

```bash
"$REALESRGAN_BIN" \
  -i /tmp/source.png \
  -o /tmp/output.png \
  -m "$REALESRGAN_MODEL_PATH" \
  -n "$REALESRGAN_MODEL" \
  -s 2 \
  -t "${REALESRGAN_TILE_SIZE:-1024}" \
  -j 1:1:1 \
  -f png \
  -v
```

Direct 2x output should not be produced by downscaling a generated 4x file. The current test evidence is:

- `realesrgan-x4plus -s 4` produces the best-looking result, but the output is too large for the initial profile.
- `realesrgan-x4plus -s 2` can produce visible tile/stitch artifacts with auto tiling, and forcing `-t 1024` avoids the puzzle effect but still does not match the visual quality of the 4x run.
- Next direct-2x candidate is the native 2x model path exposed by the package: `realesr-animevideov3 -s 2`, tested with the same default runtime settings as the successful 4x command.

Proxy PDF raster usage:

- `Ultra` should prefer the stored `hd-2x`/upscaled2x asset when a ready row exists in `card_image_assets`.
- `Epic` should generate a 4x image on demand for the current PDF build and must not store the generated 4x image in the database or Storage.
- If Epic 4x generation fails or is unavailable, the image candidate order falls back to the stored `hd-2x` asset, then to the normal Scryfall image candidates.
- The UI should warn that Epic requires significantly more time and suggest switching to Ultra when 4x detail is not needed.

If the NCNN/Vulkan build is not stable on the M1 Max environment, keep the worker abstraction and swap the command adapter later. The database/storage design does not depend on the exact upscaler binary.

References:

- Real-ESRGAN project: https://github.com/xinntao/Real-ESRGAN
- Real-ESRGAN NCNN/Vulkan implementation: https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan

## Upscale Target

For a standard MTG card at 63×88 mm:

- 600 dpi is approximately `1488×2079 px`.
- 1200 dpi is approximately `2976×4157 px`.

If the source is a Scryfall large image around `672×936`, a 2x upscale lands around `1344×1872`, which is a lighter print asset than the previous 4x target while still improving source sharpness. The MVP target profile is therefore:

```text
hd-2x
```

with PNG output and metadata storing actual pixel dimensions. The system should store real dimensions instead of relying only on a DPI label.

### Target Profiles

The MVP supports one target profile:

```text
hd-2x
```

Profile definition:

```json
{
  "name": "hd-2x",
  "model": "realesrgan-x4plus",
  "scale": 2,
  "target_dpi": 600,
  "output_mime_type": "image/png"
}
```

Keep the profile name in both batch and asset rows. Future profiles can be added without changing the storage model, for example:

```text
hd-4x
anime-2x
print-clean-2x
```

Do not add multiple profiles in the MVP UI. One profile is enough until real samples prove the need for another model.

## Output Format and Derivatives

The MVP generates and stores PNG only:

```text
front@2x.png
back@2x.png
```

Reasons:

- PNG is lossless and appropriate as the canonical generated asset.
- Future print/PDF pipelines can decide whether to downsample or encode as JPEG.
- Keeping one canonical output avoids premature storage and cache complexity.

Do not generate JPEG/WebP derivatives in the MVP. Add them later only if measured PDF size, download time, or public API egress require it.

Future derivative examples:

```text
front@2x.print.jpg
front@2x.preview.webp
```

If derivatives are added later, keep `card_image_assets` as the canonical asset row and add either:

- derivative metadata columns if the set stays very small; or
- a separate `card_image_derivatives` table if multiple output variants become public API products.

## Verification and QA

The MVP needs functional verification and visual QA.

Worker validation per asset:

- Output file exists.
- Output MIME type is `image/png`.
- Output dimensions are read from the generated image, not assumed.
- Width and height are greater than source dimensions.
- Expected 2x output is roughly source dimensions multiplied by 2, allowing a small tolerance if the tool pads/crops.
- File size is non-zero and below the Storage limit.
- SHA-256 checksum is stored in `checksum`.
- Storage upload succeeds before `status` becomes `ready`.

Admin QA workflow:

- Generate a small batch first, ideally 5-10 representative cards:
  - normal single-faced card;
  - double-faced card front and back;
  - token;
  - showcase/borderless frame;
  - text-heavy card.
- Check generated dimensions and bytes in the admin page.
- Download/open a few PNGs locally before running large batches.
- Create a test proxy PDF manually after the first sample batch once PDF integration is added later.

Worker dry-run mode:

```bash
node scripts/upscale-card-images.mjs --limit=5 --dry-run
```

Dry run should claim no jobs and upload nothing. It should report which jobs would be selected, source URLs, destination paths, and the command that would be executed.

Worker sample mode:

```bash
node scripts/upscale-card-images.mjs --asset-id=<uuid> --keep-temp
```

`--keep-temp` keeps source/output files locally for inspection. Temporary files should be written under an ignored directory such as `.tmp/upscale-card-images/`.

## Failure Modes

Expected failure categories:

- Missing source URL: do not create an asset row; report skipped card in batch creation response.
- Source download fails: mark asset `failed`, include HTTP status or network error in `last_error`.
- Source decode fails: mark `failed`; keep temp source with `--keep-temp` for diagnosis.
- Real-ESRGAN command fails: mark `failed` with command exit code and a short stderr excerpt.
- Output missing or invalid PNG: mark `failed`.
- Output dimensions too small: mark `failed`, because this indicates model/tool misconfiguration.
- Storage upload fails: mark `failed`; do not mark ready.
- Worker interrupted: any `processing` jobs become reclaimable after stale timeout.
- Duplicate batch request: upsert/reuse existing asset rows rather than creating duplicates.

The admin UI should make failed rows visible and retryable, but it does not need a complex log viewer in the MVP.

## Operational Safety

- `.env.local` must hold `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` for the worker.
- Service/secret keys must never be exposed through `NEXT_PUBLIC_` variables or browser bundles.
- Worker logs must not print full secret keys.
- The admin page must not expose the Storage service key; signed URLs are generated server-side only.
- Large batches should be created intentionally from the admin page; no automatic full-catalog queueing in MVP.
- The worker should default to small limits and `concurrency=1` to avoid accidental long runs.
- The worker should be safe to stop with Ctrl-C between assets. It does not need graceful cancellation mid-upscale for MVP.

## Implementation Slices

Recommended implementation order:

1. Migration and Storage setup:
   - create tables, constraints, indexes, RLS policies, `public.is_admin()`;
   - create private `card-images-hd` bucket;
   - update hand-maintained Supabase TypeScript types.
2. Shared helpers:
   - admin role helper;
   - source URL resolver;
   - storage path builder;
   - image metadata/checksum helpers.
3. Admin APIs:
   - search cards with asset status;
   - create batch/upsert asset rows;
   - list batches/detail;
   - retry/cancel;
   - signed URL route.
4. Admin UI:
   - gated page;
   - search/filter/select;
   - create batch;
   - batch list/detail;
   - retry failed.
5. Worker:
   - dry-run selection;
   - claim/reclaim jobs;
   - source download;
   - Real-ESRGAN command execution;
   - output validation;
   - Storage upload and row update.
6. Verification:
   - unit tests for pure helpers;
   - route-level smoke checks where practical;
   - manual sample batch of 5-10 cards;
   - confirm Storage object and DB metadata for ready rows.

Do not integrate HD assets into proxy PDF generation until after the generation pipeline is proven with real samples.

## Testing Strategy

Unit tests:

- `source-url` helper:
  - single-faced card with `card_faces[0].image_uris.png`;
  - single-faced fallback to derived PNG;
  - fallback to `image_normal`;
  - double-faced front/back explicit URLs;
  - no source URL returns a skipped result.
- `storage-path` helper:
  - front path;
  - back path;
  - stable path for same `scryfall_id`;
  - invalid/missing `scryfall_id` rejected.
- image metadata helper:
  - reads PNG dimensions from a fixture;
  - computes SHA-256 checksum.

Route/API checks:

- non-admin cannot access admin API routes;
- admin can search cards;
- batch creation upserts assets instead of duplicating ready/queued rows;
- retry changes failed assets back to queued.

Worker checks:

- dry-run does not mutate DB;
- `--asset-id` selects exactly one row;
- failed command stores a concise `last_error`;
- successful run uploads object and marks row ready.

Manual verification:

- create a 5-10 card sample batch;
- run worker with `--limit=1 --keep-temp` first;
- inspect local output;
- run remaining sample batch;
- confirm Supabase Storage object exists;
- confirm DB metadata matches actual PNG dimensions and bytes.

## Legal and Product Notes

This design is for private generation and storage first. Public serving of upscaled Magic card images is intentionally deferred. Before exposing a Scryfall-like image API, separately review:

- Wizards of the Coast/Magic image rights and fan content policies;
- Scryfall image and attribution expectations;
- acceptable use, rate limiting, and attribution on any public API;
- egress cost controls.

These concerns should not block private generation MVP work, but they should block public API launch until addressed.

## Future API Constraint

The future public API is deferred, but this design should not block it. The later API may expose:

- direct image endpoints, such as `/api/card-images/{scryfall_id}.png`;
- JSON metadata endpoints with `image_uris.hd_png`;
- CORS-friendly downloads for proxy providers.

The current MVP only needs stable storage paths and complete metadata.

## Resolved MVP Decisions

- Admin role assignment is manual through Supabase Dashboard `app_metadata`.
- MVP is generation/storage only; public API serving is deferred.
- Storage starts private.
- Canonical generated format is PNG only.
- Initial profile is `hd-2x`.
- Local worker uses a command adapter around `realesrgan-ncnn-vulkan` first.
- No full-catalog automatic generation in MVP.
- No sample seed helper in the first implementation; use admin search/select to create the initial sample batch.
