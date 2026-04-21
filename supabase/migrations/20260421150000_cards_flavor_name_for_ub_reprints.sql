-- ============================================================
-- Persist Universes Beyond flavor names so the local lookup catches
-- them on second-and-subsequent imports.
-- ============================================================
-- UB reprints like "Paradise Chocobo" (FIC 483, canonical "Birds of
-- Paradise") and "Balin's Tomb" (LTC 357, canonical "Ancient Tomb")
-- carry the thematic skin under Scryfall's `flavor_name`. Without a
-- dedicated column we store only the oracle `name`, so every future
-- import paste of the flavor name falls off the local RPCs and hits
-- /cards/named on Scryfall — fine once, wasteful forever.
--
-- Add `cards.flavor_name` and extend both name-lookup RPCs to match
-- on either form. The bulk-import flow writes `flavor_name` on
-- upsert so the second import of the same UB card stays fully local.

alter table public.cards
  add column if not exists flavor_name text;

create index if not exists idx_cards_flavor_name_lower
  on public.cards (lower(flavor_name))
  where flavor_name is not null;

create or replace function public.lookup_cards_by_names(card_names text[])
returns setof public.cards
language sql
stable
set search_path to 'public', 'pg_catalog'
as $$
  select distinct on (lower(c.name)) c.*
  from public.cards c
  where lower(c.name)        = any (select lower(unnest(card_names)))
     or lower(c.flavor_name) = any (select lower(unnest(card_names)))
  order by lower(c.name), c.id;
$$;

create or replace function public.lookup_cards_by_name_and_set(pairs jsonb)
returns setof public.cards
language sql
stable
set search_path to 'public', 'pg_catalog'
as $$
  with requested as (
    select
      lower(btrim((p->>'name')::text))      as name_lower,
      lower(btrim((p->>'set_code')::text))  as set_code_lower
    from jsonb_array_elements(pairs) as p
    where coalesce(btrim((p->>'set_code')::text), '') <> ''
  )
  select distinct on (r.name_lower, r.set_code_lower) c.*
  from requested r
  join public.cards c
    on (lower(c.name) = r.name_lower or lower(c.flavor_name) = r.name_lower)
   and lower(c.set_code) = r.set_code_lower
  order by r.name_lower, r.set_code_lower, c.id;
$$;
