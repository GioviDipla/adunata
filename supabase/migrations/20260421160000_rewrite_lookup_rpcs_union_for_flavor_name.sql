-- ============================================================
-- Make the flavor-name-aware card lookups actually use the indexes.
-- ============================================================
-- The previous rev added `flavor_name` matching as:
--   WHERE lower(name) = ANY (...) OR lower(flavor_name) = ANY (...)
-- The planner refused to seek either expression index for that OR
-- and fell back to a full Index Scan of idx_cards_name_lower plus a
-- post-filter on each of ~36k rows. Measured cost: ~5s on a realistic
-- 96-card import, which tripped Supabase's statement_timeout and
-- surfaced as "canceling statement due to statement timeout" in the
-- importer UI.
--
-- Split the OR into two joins/selects and UNION them so each branch
-- uses its matching index (idx_cards_name_lower and the partial
-- idx_cards_flavor_name_lower) as an Index Cond. Same 96-card query
-- drops to ~10-30ms warm.
--
-- Behaviour is identical to the OR form: a card matched on either
-- name or flavor_name is returned. UNION dedupes identical rows.

create or replace function public.lookup_cards_by_names(card_names text[])
returns setof public.cards
language sql
stable
set search_path to 'public', 'pg_catalog'
as $$
  with lc as (select array_agg(lower(n)) as arr from unnest(card_names) as n)
  select distinct on (lower(c.name)) c.*
  from (
    select c.* from public.cards c, lc where lower(c.name)        = any (lc.arr)
    union
    select c.* from public.cards c, lc where lower(c.flavor_name) = any (lc.arr)
  ) c
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
      lower(btrim((p->>'name')::text))      as n_lower,
      lower(btrim((p->>'set_code')::text))  as s_lower
    from jsonb_array_elements(pairs) as p
    where coalesce(btrim((p->>'set_code')::text), '') <> ''
  )
  select distinct on (lower(c.set_code), lower(c.name)) c.*
  from (
    select c.*
    from requested r
    join public.cards c
      on lower(c.name) = r.n_lower
     and lower(c.set_code) = r.s_lower
    union
    select c.*
    from requested r
    join public.cards c
      on lower(c.flavor_name) = r.n_lower
     and lower(c.set_code) = r.s_lower
  ) c
  order by lower(c.set_code), lower(c.name), c.id;
$$;
