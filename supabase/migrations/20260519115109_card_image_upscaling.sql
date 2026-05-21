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
  model text not null default 'realesr-animevideov3',
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
