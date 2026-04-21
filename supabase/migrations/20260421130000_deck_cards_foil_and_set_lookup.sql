-- ============================================================
-- Deck import fidelity — preserve foil flag + pin to the right printing
-- ============================================================
-- Problem: bulk import resolved cards by name only, so `Lightning Bolt (STA)`
-- landed on whichever printing PostgREST returned first (usually unrelated to
-- the user's intent). The foil / etched markers that Moxfield, ManaBox and
-- Archidekt exports carry (`*F*`, `*E*`, trailing ` F`/` E`) were stripped
-- by the parser but never persisted.
--
-- Fix has two halves:
--   1. `deck_cards.is_foil` column — persists the foil intent so the same
--      printing can live as both foil and non-foil rows in one deck and
--      exports round-trip the marker.
--   2. `lookup_cards_by_name_and_set(pairs jsonb)` RPC — resolves entries
--      that carry a set code to the exact printing. Name-only fallback stays
--      in the existing `lookup_cards_by_names` RPC, orchestrated in Node.

alter table public.deck_cards
  add column if not exists is_foil boolean not null default false;

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
    on lower(c.name) = r.name_lower
   and lower(c.set_code) = r.set_code_lower
  order by r.name_lower, r.set_code_lower, c.id;
$$;
