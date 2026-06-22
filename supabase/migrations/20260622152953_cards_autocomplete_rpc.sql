-- Card autocomplete for the Pub Decks filter dropdowns (commander + card-list).
-- DB-first with relevance ordering — unlike /api/cards/search (which discards
-- DB matches when < 5 and falls back to Scryfall, and limits 10 unordered),
-- this ALWAYS returns DB matches ranked: exact > prefix > shorter name >
-- alphabetical. Fixes "Ashling, the Limitless" not surfacing (21 Ashling
-- cards, unordered limit-10 dropped it; full-name query had 1 DB match
-- discarded by the < 5 threshold).
--
-- Matches English `name` or Italian `name_it`; returns the English canonical
-- name (what the commander filter compares against).

create or replace function public.search_cards_autocomplete(
  p_query text,
  p_limit int default 10
)
returns table (
  id uuid,
  name text,
  name_it text,
  image_small text,
  image_normal text,
  type_line text,
  mana_cost text,
  has_upscaled_2x boolean
)
language sql stable security invoker as $$
  -- One row per card name (latest printing) so the dropdown doesn't show
  -- duplicate printings of the same card. Then rank by relevance.
  select * from (
    select distinct on (c.name)
      c.id, c.name, c.name_it, c.image_small, c.image_normal,
      c.type_line, c.mana_cost, c.has_upscaled_2x
    from public.cards c
    where p_query <> ''
      and (
        c.name ilike '%' || p_query || '%'
        or c.name_it ilike '%' || p_query || '%'
      )
    order by c.name, c.released_at desc nulls last
  ) s
  order by
    (name ilike p_query || '%') desc,   -- prefix match first
    (name = p_query) desc,              -- exact full match
    length(name) asc,                   -- shorter (more canonical) first
    name asc
  limit p_limit;
$$;

grant execute on function public.search_cards_autocomplete(text, int) to authenticated;

alter function public.search_cards_autocomplete(text, int) set search_path = public, pg_catalog;
