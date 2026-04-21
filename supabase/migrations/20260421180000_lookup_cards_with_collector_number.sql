-- ============================================================
-- Honour the collector_number from the paste on set-pinned imports.
-- ============================================================
-- Previously lookup_cards_by_name_and_set joined only on (name, set),
-- and DISTINCT ON picked one row arbitrarily when the same (name, set)
-- had multiple printings. That meant Arcane Signet (CMR) 689 from the
-- paste resolved to the first CMR Arcane Signet row in the table,
-- which could be 297. Same pattern for anything with multiple variants
-- inside a single set (Secret Lairs, surge foils, showcase frames).
--
-- Extend the RPC so each pair may carry an optional collector_number:
-- when present we filter on it exact (case-insensitive); when absent
-- the old set-only behaviour is preserved. DISTINCT ON now includes
-- the collector so two rows with the same (name, set) both survive
-- into the result set and the Node layer picks by the triple key.

create or replace function public.lookup_cards_by_name_and_set(pairs jsonb)
returns setof public.cards
language sql
stable
set search_path to 'public', 'pg_catalog'
as $$
  with requested as (
    select
      lower(btrim((p->>'name')::text))                         as n_lower,
      lower(btrim((p->>'set_code')::text))                     as s_lower,
      nullif(lower(btrim((p->>'collector_number')::text)), '') as c_lower
    from jsonb_array_elements(pairs) as p
    where coalesce(btrim((p->>'set_code')::text), '') <> ''
  )
  select distinct on (
    lower(c.set_code),
    lower(c.name),
    coalesce(lower(c.collector_number), '')
  ) c.*
  from (
    select c.*
    from requested r
    join public.cards c
      on lower(c.name) = r.n_lower
     and lower(c.set_code) = r.s_lower
     and (r.c_lower is null or lower(c.collector_number) = r.c_lower)
    union
    select c.*
    from requested r
    join public.cards c
      on lower(c.flavor_name) = r.n_lower
     and lower(c.set_code) = r.s_lower
     and (r.c_lower is null or lower(c.collector_number) = r.c_lower)
  ) c
  order by
    lower(c.set_code),
    lower(c.name),
    coalesce(lower(c.collector_number), ''),
    c.id;
$$;
