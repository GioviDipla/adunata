-- Case-insensitive expression index for name lookups.
create index if not exists idx_cards_name_lower on public.cards (lower(name));

-- RPC for batch case-insensitive card lookup by name.
-- Returns at most one row per input name (deduplicated by lowercase name).
create or replace function public.lookup_cards_by_names(card_names text[])
returns setof public.cards
language sql
stable
as $$
  select distinct on (lower(c.name)) c.*
  from public.cards c
  where lower(c.name) = any (select lower(unnest(card_names)))
  order by lower(c.name), c.id;
$$;

grant execute on function public.lookup_cards_by_names(text[]) to anon, authenticated, service_role;
