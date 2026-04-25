-- Materialized view of distinct sets for fast set-filter dropdown.
-- The previous `get_distinct_sets()` RPC did a full GROUP BY on the
-- 36k-row cards table on every page load (~6-8s cold, frequently
-- timed out at the Supabase REST gateway). The MV caches the
-- aggregate; a wrapper RPC refreshes it from the daily-sync cron.

create materialized view if not exists public.mv_cards_sets as
  select
    c.set_code,
    max(c.set_name) as set_name,
    max(c.released_at) as latest_release
  from public.cards c
  where c.set_code is not null and c.set_name is not null
  group by c.set_code
  order by max(c.released_at) desc nulls last;

create unique index if not exists mv_cards_sets_set_code_idx
  on public.mv_cards_sets (set_code);

create or replace function public.refresh_mv_cards_sets()
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_catalog
as $$
begin
  refresh materialized view concurrently public.mv_cards_sets;
end;
$$;

-- Replace the slow RPC with a fast pull from the MV.
create or replace function public.get_distinct_sets()
  returns table(set_code text, set_name text, latest_release date)
  language sql
  stable
  set search_path = public, pg_catalog
as $$
  select set_code, set_name, latest_release
  from public.mv_cards_sets
  order by latest_release desc nulls last
$$;

grant select on public.mv_cards_sets to anon, authenticated, service_role;
grant execute on function public.refresh_mv_cards_sets() to service_role;
