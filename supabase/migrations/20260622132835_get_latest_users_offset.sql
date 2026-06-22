-- Extend get_latest_users with p_offset for "carica altri" pagination on the
-- Community page. Backward compatible: existing callers using the named param
-- p_limit (default 10) keep working; p_offset defaults to 0.
--
-- Signature changes (int) -> (int, int), so we drop + create (create or replace
-- cannot change the param list). Grant + search_path hardening re-applied.
--
-- Offset pagination (not keyset cursor) is fine here: the profiles table is
-- small (beta) and low-churn. Cards uses cursor pagination because it pages
-- over 34k rows; users does not need that complexity.

drop function if exists public.get_latest_users(int);

create or replace function public.get_latest_users(
  p_limit int default 10,
  p_offset int default 0
)
returns table (
  id uuid,
  username text,
  display_name text,
  public_deck_count int
)
language sql stable security invoker as $$
  select
    p.id, p.username, p.display_name,
    (select count(*)::int from public.decks d
     where d.user_id = p.id and d.visibility = 'public') as public_deck_count
  from public.profiles p
  order by p.created_at desc
  limit p_limit offset p_offset;
$$;

grant execute on function public.get_latest_users(int, int) to authenticated;

alter function public.get_latest_users(int, int) set search_path = public, pg_catalog;
