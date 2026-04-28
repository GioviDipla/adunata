-- Search + price correctness hardening.
--
-- The app searches with `ilike('%query%')` on `cards.name` and `cards.name_it`,
-- so btree indexes are not enough. Trigram GIN indexes keep browser/deck
-- autocomplete responsive as the catalog grows.
--
-- `price_sort` gives PostgREST a stable order key for "best available price":
-- EUR/Cardmarket first, USD/TCGPlayer fallback when EUR is unavailable.

create extension if not exists pg_trgm;

alter table public.cards
  add column if not exists name_it text,
  add column if not exists prices_eur numeric,
  add column if not exists prices_eur_foil numeric,
  add column if not exists released_at date,
  add column if not exists last_price_update timestamptz;

alter table public.cards
  add column if not exists price_sort numeric
    generated always as (coalesce(prices_eur, prices_usd)) stored;

create index if not exists idx_cards_name_trgm
  on public.cards using gin (name gin_trgm_ops);

create index if not exists idx_cards_name_it_trgm
  on public.cards using gin (name_it gin_trgm_ops)
  where name_it is not null;

create index if not exists idx_cards_price_sort
  on public.cards (price_sort);

create index if not exists idx_cards_released_id_desc
  on public.cards (released_at desc nulls last, id desc);

create index if not exists idx_cards_last_price_update
  on public.cards (last_price_update asc nulls first, id asc);
